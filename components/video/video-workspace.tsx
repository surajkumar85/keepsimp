"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  IconAlertCircle,
  IconInfoCircle,
  IconMovie,
  IconVideoPlus,
} from "@tabler/icons-react"
import { QueueList, type QueueRow } from "@/components/image-batch/queue-list"
import { SummaryBar } from "@/components/image-batch/summary-bar"
import {
  DropZone,
  type DropZoneCopy,
} from "@/components/image-compressor/drop-zone"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { uniqueNames } from "@/lib/image-resizer/naming"
import { VideoPool } from "@/lib/video/client"
import {
  ACCEPT,
  containerProblem,
  SNIFF_BYTES,
  sniffContainer,
} from "@/lib/video/formats"
import type { VideoJob, VideoResponse } from "@/lib/video/protocol"
import {
  factsLine,
  itemMessage,
  itemState,
  nextVideoJob,
  outputName,
  planKey,
  videoTotals,
  writable,
  dropped,
  type VideoItem,
} from "@/lib/video/queue"
import { clearScratch, removeScratch } from "@/lib/video/scratch"
import {
  defaultSettings,
  planFor,
  settingsProblem,
  type CanEncode,
  type Plan,
  type SoundCodec,
  type VideoSettings,
} from "@/lib/video/settings"
import { zipBlobs } from "@/lib/video/zip-blobs"
import { convertJob, readJob } from "@/lib/video/jobs"
import { browserAsker } from "@/lib/video/probe"
import { SettingsPanel } from "./settings-panel"

/** What the workspace is opened for: everything, or one job through a door. */
export type VideoMode = "editor" | "converter"

export const MAX_FILES = 20
const INPUT_ID = "video-file"
/** Settings are taken up this long after the last change, so a run of choices starts one job. */
const SETTLE_MS = 600

const COPY: Record<VideoMode, DropZoneCopy> = {
  editor: {
    heading: "Drop video files",
    dropping: "Drop to add these videos",
    body: "Convert them to MP4, WebM, MOV or MKV, make them smaller, turn them or take the sound out. Many at once, on your device.",
    inputLabel: "Choose video files",
    action: "Choose videos",
    limits: `Stays on your device · up to ${MAX_FILES} videos at once · any length`,
  },
  converter: {
    heading: "Drop videos to convert",
    dropping: "Drop to convert these videos",
    body: "MP4, MOV, WebM, MKV and MPEG-TS in; MP4, WebM, MOV or MKV out. Copied as they are wherever nothing has to change.",
    inputLabel: "Choose video files to convert",
    action: "Choose videos",
    limits: `Stays on your device · up to ${MAX_FILES} videos at once · any length`,
  },
}

const SAMPLE = { name: "keepsimp-clip.mp4", type: "video/mp4" }

let counter = 0
const nextId = () => `video-${++counter}`

/** The page's own folder for results being written (scratch.ts). */
const folderName = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `page-${Math.random().toString(36).slice(2)}`

export function VideoWorkspace({ mode }: { mode: VideoMode }) {
  const [items, setItems] = useState<VideoItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settings, setSettings] = useState<VideoSettings>(defaultSettings)
  const [applied, setApplied] = useState<VideoSettings>(defaultSettings)
  const [encodes, setEncodes] = useState<ReadonlyMap<string, boolean>>(
    new Map()
  )
  const [sounds, setSounds] = useState<ReadonlyMap<SoundCodec, boolean>>(
    new Map()
  )
  const [showing, setShowing] = useState<"original" | "result">("original")
  const [zipping, setZipping] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [folder] = useState(folderName)

  // Settings settle before they are taken up.
  useEffect(() => {
    if (settingsProblem(settings)) return
    const timer = setTimeout(() => setApplied(settings), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [settings])

  const canEncode = useCallback<CanEncode>(
    (codec, width, height) =>
      encodes.get(`${codec}@${width}x${height}`) ?? null,
    [encodes]
  )
  const canEncodeSound = useCallback(
    (codec: SoundCodec) =>
      codec === "aac" ? true : (sounds.get(codec) ?? null),
    [sounds]
  )
  const plans = useMemo(
    () =>
      new Map(
        items.map((item) => [
          item.id,
          item.facts
            ? planFor(item.facts, applied, canEncode, canEncodeSound)
            : null,
        ])
      ),
    [items, applied, canEncode, canEncodeSound]
  )
  const planOf = useCallback(
    (item: VideoItem) => plans.get(item.id) ?? null,
    [plans]
  )

  // Ask the browser what it can write, once for each codec and size.
  const asking = useRef(new Set<string>())
  useEffect(() => {
    for (const plan of plans.values()) {
      for (const { codec, width, height } of plan?.pending ?? []) {
        const key = `${codec}@${width}x${height}`
        if (asking.current.has(key)) continue
        asking.current.add(key)
        void browserAsker
          .video(codec, width, height)
          .then((can) => setEncodes((known) => new Map(known).set(key, can)))
      }
      if (plan?.audio.action === "encode" || plan?.container === "webm")
        for (const codec of ["opus", "vorbis"] as const) {
          if (asking.current.has(codec)) continue
          asking.current.add(codec)
          void browserAsker
            .sound(codec)
            .then((can) => setSounds((known) => new Map(known).set(codec, can)))
        }
    }
  }, [plans])

  // The newest state, for the pool's callbacks, which outlive renders.
  const live = useRef({ items, plans, selectedId })
  useEffect(() => {
    live.current = { items: live.current.items, plans, selectedId }
  })

  /**
   * Change the list from the list as it stands. The pool asks for its next
   * job as soon as a worker answers, before the page draws again, so it
   * sees each change at once.
   */
  const change = useCallback((make: (current: VideoItem[]) => VideoItem[]) => {
    live.current.items = make(live.current.items)
    setItems(live.current.items)
  }, [])

  // Results let go of are released: their links, and their files on disk.
  const previous = useRef<VideoItem[]>([])
  useEffect(() => {
    const gone = dropped(previous.current, items)
    for (const url of gone.urls) URL.revokeObjectURL(url)
    for (const name of gone.scratch) void removeScratch(folder, name)
    previous.current = items
  }, [items, folder])

  const listen = useCallback(
    (message: VideoResponse) =>
      change((current) =>
        current.map((item) => {
          if (item.id !== message.id) return item
          if (message.type === "open-error")
            return { ...item, status: "error", message: message.message }
          if (message.type === "progress")
            return {
              ...item,
              progress: { key: message.key, fraction: message.fraction },
            }
          if (message.type === "error")
            return {
              ...item,
              progress: null,
              result: {
                key: message.key,
                file: null,
                url: null,
                downloadUrl: null,
                scratch: null,
                written: null,
                problems: [],
                index: null,
                error: message.message,
              },
            }
          if (message.type !== "done") return item
          if (message.job === "read")
            return {
              ...item,
              status: "ready",
              facts: message.facts,
              poster: message.poster,
            }
          return {
            ...item,
            progress: null,
            result: {
              key: message.key,
              file: message.file,
              url: URL.createObjectURL(message.file),
              downloadUrl: URL.createObjectURL(
                new Blob([message.file], { type: "application/octet-stream" })
              ),
              scratch: message.scratch,
              written: message.written,
              problems: message.problems,
              index: message.index,
              error: null,
            },
          }
        })
      ),
    [change]
  )

  const pool = useRef<VideoPool | null>(null)
  useEffect(() => {
    void clearScratch(null)
    const made = new VideoPool(listen, () => {
      const next = nextVideoJob(
        live.current.items,
        (item) => live.current.plans.get(item.id) ?? null,
        made.inFlight(),
        live.current.selectedId
      )
      if (!next) return null
      const { item, plan } = next
      const job: VideoJob =
        next.job === "read"
          ? { ...readJob(item.file, item.container), id: item.id }
          : {
              ...convertJob(
                item.file,
                item.container,
                item.facts!,
                plan!,
                folder
              ),
              id: item.id,
            }
      return job
    })
    pool.current = made
    const leave = () => void clearScratch(folder)
    window.addEventListener("pagehide", leave)
    return () => {
      window.removeEventListener("pagehide", leave)
      made.dispose()
      pool.current = null
      for (const item of live.current.items)
        for (const url of [item.result?.url, item.result?.downloadUrl])
          if (url) URL.revokeObjectURL(url)
      void clearScratch(folder)
    }
  }, [folder, listen])

  // New settings outdate the file being written; then the next job starts.
  const firstApply = useRef(true)
  useEffect(() => {
    if (firstApply.current) {
      firstApply.current = false
      return
    }
    pool.current?.supersede()
  }, [applied])
  useEffect(() => {
    pool.current?.kick()
  }, [items, plans, selectedId])

  const addFiles = useCallback(
    async (added: File[]) => {
      const room = MAX_FILES - live.current.items.length
      const taken = added.slice(0, Math.max(0, room))
      setNotice(
        added.length > taken.length
          ? `Up to ${MAX_FILES} videos at once: ${added.length - taken.length} ${added.length - taken.length === 1 ? "was" : "were"} left out.`
          : null
      )
      const made: VideoItem[] = []
      for (const file of taken) {
        const head = new Uint8Array(
          await file.slice(0, SNIFF_BYTES).arrayBuffer()
        )
        const container = sniffContainer(head)
        const problem = containerProblem(container)
        made.push({
          id: nextId(),
          file,
          name: file.name,
          container: container ?? "mp4",
          status: problem ? "error" : "reading",
          facts: null,
          poster: null,
          message: problem,
          progress: null,
          result: null,
        })
      }
      if (!made.length) return
      change((current) => [...current, ...made])
      setSelectedId((current) => current ?? made[0].id)
    },
    [change]
  )

  const loadSample = useCallback(async () => {
    const response = await fetch(`/samples/${SAMPLE.name}`)
    const blob = await response.blob()
    await addFiles([new File([blob], SAMPLE.name, { type: SAMPLE.type })])
  }, [addFiles])

  const remove = useCallback(
    (id: string) => {
      pool.current?.forget(id)
      change((current) => current.filter((item) => item.id !== id))
      const left = live.current.items
      setSelectedId((selected) =>
        selected === id ? (left[0]?.id ?? null) : selected
      )
    },
    [change]
  )

  const clearAll = useCallback(() => {
    for (const item of live.current.items) pool.current?.forget(item.id)
    change(() => [])
    setSelectedId(null)
    setNotice(null)
  }, [change])

  const totals = useMemo(() => videoTotals(items, planOf), [items, planOf])
  const finished = items.filter(
    (item) => itemState(item, planOf(item)) === "done"
  )
  const names = uniqueNames(
    finished.map((item) => outputName(item.name, planOf(item)!))
  )

  const downloadZip = useCallback(async () => {
    setZipping(true)
    try {
      const zip = await zipBlobs(
        finished.map((item, index) => ({
          name: names[index],
          blob: item.result!.file!,
        }))
      )
      const url = URL.createObjectURL(
        new Blob([zip], { type: "application/octet-stream" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = "keepsimp-videos.zip"
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } finally {
      setZipping(false)
    }
  }, [finished, names])

  const problem = settingsProblem(settings)
  const selected = items.find((item) => item.id === selectedId) ?? null
  const update = (change: Partial<VideoSettings>) =>
    setSettings((current) => ({ ...current, ...change }))

  if (!items.length)
    return (
      <div className="grid gap-6 lg:grid-cols-5" data-testid="video-workspace">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <DropZone
            onFiles={(added) => void addFiles(added)}
            onSample={() => void loadSample()}
            busy={false}
            copy={COPY[mode]}
            inputId={INPUT_ID}
            formats={["MP4", "MOV", "WebM", "MKV", "MPEG-TS"]}
            accept={ACCEPT}
            icon={IconMovie}
          />
          {mode !== "editor" && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="video-focused"
            >
              This page is the{" "}
              <Link
                href="/dashboard/video-editor/"
                prefetch={false}
                className="underline"
              >
                Video editor
              </Link>
              , opened for converting.
            </p>
          )}
        </div>
        <div className="min-w-0 lg:col-span-2">
          <div className="rounded-xl border bg-card p-4">
            <SettingsPanel
              settings={settings}
              update={update}
              problem={problem}
            />
          </div>
        </div>
      </div>
    )

  const current = (item: VideoItem, plan: Plan | null) => {
    const ready = writable(plan)
    return ready && item.result?.file && item.result.key === planKey(ready)
      ? item.result
      : null
  }
  const rows: QueueRow[] = items.map((item) => {
    const plan = planOf(item)
    const result = current(item, plan)
    return {
      id: item.id,
      name: item.name,
      thumbnail: item.poster,
      state: itemState(item, plan),
      details: item.facts
        ? `${factsLine(item.facts)} · ${sizeLabel(item.file.size)}`
        : sizeLabel(item.file.size),
      message: itemMessage(item, plan),
      outputs:
        result?.downloadUrl && plan
          ? [
              {
                name: outputName(item.name, plan),
                url: result.downloadUrl,
                width: plan.width,
                height: plan.height,
                bytes: result.file!.size,
                label: sizeLabel(result.file!.size),
              },
            ]
          : [],
    }
  })

  const single =
    finished.length === 1 && items.length === 1
      ? { url: finished[0].result!.downloadUrl!, name: names[0] }
      : null

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="video-workspace"
      data-settled={(totals.settled && !zipping) || undefined}
    >
      <div className="min-w-0 space-y-4 lg:col-span-3">
        {selected && (
          <Selected
            item={selected}
            plan={planOf(selected)}
            result={current(selected, planOf(selected))}
            showing={showing}
            onShow={setShowing}
          />
        )}
        {notice && (
          <p
            role="status"
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <IconInfoCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {notice}
          </p>
        )}
        <SummaryBar
          totals={totals}
          single={single}
          singleLabel="Download video"
          zipping={zipping}
          onZip={() => void downloadZip()}
          onFiles={(added) => void addFiles(added)}
          onClear={clearAll}
          inputId={INPUT_ID}
          verb="Converting"
          noun="video"
          accept={ACCEPT}
          addIcon={IconVideoPlus}
        />
        <QueueList
          rows={rows}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            setShowing("original")
          }}
          onRemove={remove}
          label="Videos"
        />
      </div>
      <div className="min-w-0 lg:col-span-2">
        <div className="rounded-xl border bg-card p-4">
          <SettingsPanel
            settings={settings}
            update={update}
            problem={problem}
          />
        </div>
      </div>
    </div>
  )
}

const INDEX_NOTES: Record<string, string> = {
  large:
    "Its index is very large, so it stays at the end of the file: players read it fine, and some sites prefer it at the start.",
  offsets:
    "Its index stays at the end of the file, as this file is too long to move it: players read it fine.",
  unreadable: "Its index stays at the end of the file: players read it fine.",
}

/** The selected file: what it is, how it will be written, and a player for the original and the result. */
function Selected({
  item,
  plan,
  result,
  showing,
  onShow,
}: {
  item: VideoItem
  plan: Plan | null
  result: VideoItem["result"]
  showing: "original" | "result"
  onShow: (showing: "original" | "result") => void
}) {
  const original = useMemo(() => URL.createObjectURL(item.file), [item.file])
  useEffect(() => () => URL.revokeObjectURL(original), [original])
  const show = result?.url ? showing : "original"
  const source = show === "result" ? result!.url! : original
  return (
    <section
      aria-label={item.name}
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid="video-selected"
    >
      <h2 className="truncate font-heading text-base font-medium">
        {item.name}
      </h2>
      {item.status === "error" ? (
        <p
          role="alert"
          className="flex items-start gap-2 text-sm text-destructive"
        >
          <IconAlertCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          {item.message}
        </p>
      ) : !item.facts ? (
        <p role="status" className="text-sm text-muted-foreground">
          Reading the file…
        </p>
      ) : (
        <>
          <video
            key={source}
            src={source}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-lg bg-black"
            aria-label={show === "result" ? "The result" : "The original"}
            data-testid="video-player"
          />
          {result?.url && (
            <ChoiceChips
              label="Play"
              hideLabel
              value={show}
              onValueChange={onShow}
              options={[
                { value: "original", label: "Original" },
                { value: "result", label: "Result" },
              ]}
            />
          )}
          <dl
            className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]"
            data-testid="video-facts"
          >
            <dt className="font-medium">Original</dt>
            <dd className="text-muted-foreground">
              {factsLine(item.facts)} · {sizeLabel(item.file.size)}
            </dd>
            {result?.written && (
              <>
                <dt className="font-medium">Result</dt>
                <dd
                  className="text-muted-foreground"
                  data-testid="video-result"
                >
                  {factsLine(result.written)} · {sizeLabel(result.file!.size)}
                </dd>
              </>
            )}
          </dl>
          {plan && (
            <div
              className="space-y-1 text-sm text-muted-foreground"
              data-testid="video-plan"
            >
              {plan.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
              {!plan.problem && (
                <p>
                  {result
                    ? `Written and checked: ${sizeLabel(result.file!.size)}.`
                    : `About ${sizeLabel(plan.estimate)}.`}
                </p>
              )}
              {result?.index && INDEX_NOTES[result.index] && (
                <p>{INDEX_NOTES[result.index]}</p>
              )}
              {result?.problems.map((problem) => (
                <p key={problem} role="alert" className="text-destructive">
                  {problem}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
