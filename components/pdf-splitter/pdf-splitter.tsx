"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react"
import {
  IconAlertCircle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBook2,
  IconBookmarks,
  IconDownload,
  IconFileTypePdf,
  IconFileZip,
  IconInfoCircle,
  IconLock,
  IconPlayerStop,
  IconRefresh,
  IconScissors,
  IconStack2,
  IconX,
} from "@tabler/icons-react"
import { DropZone, FileInput } from "@/components/image-compressor/drop-zone"
import { PasswordRow } from "@/components/pdf/password-row"
import { useDeviceLimits } from "@/components/pdf/use-device-limits"
import { usePagePictures } from "@/components/pdf/use-page-pictures"
import { usePdfReader } from "@/components/pdf/use-pdf-reader"
import { PdfReader } from "@/components/pdf-reader/pdf-reader"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { createZip } from "@/lib/image-resizer/zip"
import { PdfClient } from "@/lib/pdf-merger/client"
import type { FileFacts } from "@/lib/pdf-merger/files"
import {
  record,
  redo,
  startHistory,
  undo,
  type History,
} from "@/lib/pdf-merger/pages"
import { parseRanges } from "@/lib/pdf-merger/ranges"
import { looksLikePdf, megabytes } from "@/lib/pdf-merger/settings"
import {
  nameTokens,
  partNames,
  patternProblem,
  zipName,
} from "@/lib/pdf-splitter/naming"
import {
  cutsEqual,
  cutsEvery,
  partsOfPages,
  selectionText,
  selectSpan,
  toggleCut,
  toggleSelected,
  type SplitMode,
} from "@/lib/pdf-splitter/parts"
import {
  fileProblem,
  givesOneFile,
  nothingToWrite,
  pagesProblem,
  patternFor,
  planFor,
  splitKey,
  typedCount,
  withOverrides,
} from "@/lib/pdf-splitter/settings"
import { PageBoard } from "./page-board"
import { MOST_ROWS, PartsList, type WrittenPart } from "./parts-list"

const INPUT_ID = "split-file"
const ACCEPT = "application/pdf,.pdf"
const SAMPLE = "keepsimp-report.pdf"

interface SplitFile {
  id: string
  file: Blob
  name: string
  size: number
  status: "reading" | "locked" | "ready" | "error"
  /** A password was tried and did not open the file. */
  wrongPassword?: boolean
  error?: string
  facts?: FileFacts
}

interface Result {
  /** What was split; a different plan makes the result out of date. */
  key: string
  parts: (WrittenPart & { number: number; data: ArrayBuffer })[]
  /** Every part has arrived. */
  complete: boolean
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

/** What the page says about a file it has read, beyond its size. */
function notesFor(facts: FileFacts | undefined) {
  if (!facts) return []
  return [
    facts.repaired && "This file was damaged and has been repaired.",
    facts.unlocked && "Unlocked. The parts have no password.",
    facts.restricted &&
      "Its author restricted changes. Make sure you have the right to split it.",
    facts.signed &&
      "Its digital signature cannot stay valid in the parts. The signature's picture is kept.",
    facts.tagged && "Its accessibility tags are not carried over.",
  ].filter((note): note is string => Boolean(note))
}

function Thumbnail({ bitmap }: { bitmap: ImageBitmap | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const target = canvas.current
    if (!target || !bitmap) return
    target.width = bitmap.width
    target.height = bitmap.height
    target.getContext("2d")?.drawImage(bitmap, 0, 0)
  }, [bitmap])
  return bitmap ? (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="max-h-full max-w-full bg-background shadow-sm"
    />
  ) : null
}

const MODES: { value: SplitMode; label: string; hint: string }[] = [
  {
    value: "cuts",
    label: "Cut into parts",
    hint: "Press between two pages to cut there, or let a rule place the cuts.",
  },
  {
    value: "ranges",
    label: "Page ranges",
    hint: "Type the pages of each part. Parts may overlap.",
  },
  {
    value: "oddeven",
    label: "Odd and even",
    hint: "Odd pages go into one file and even pages into another.",
  },
  {
    value: "extract",
    label: "Extract pages",
    hint: "The pages you select become one new file.",
  },
  {
    value: "remove",
    label: "Remove pages",
    hint: "The pages you select are left out of one new file.",
  },
]

export function PdfSplitter() {
  const ids = useId()
  const [file, setFile] = useState<SplitFile | null>(null)
  const [mode, setMode] = useState<SplitMode>("cuts")
  const [cuts, setCuts] = useState<History<number[]>>(() => startHistory([]))
  const [every, setEvery] = useState("2")
  const [equal, setEqual] = useState("2")
  const [ranges, setRanges] = useState("")
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  /** The pages field while it is being typed in; null when it follows the selection. */
  const [typedPages, setTypedPages] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set())
  const [pattern, setPattern] = useState("")
  const [notice, setNotice] = useState("")
  const [progress, setProgress] = useState<{
    done: number
    total: number
    /** Parts that have arrived. */
    parts: number
  } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [failure, setFailure] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const [zipping, setZipping] = useState(false)
  const [over, setOver] = useState(false)
  /** The reader is showing the file being split, where a cut can be placed while reading. */
  const [readingSource, setReadingSource] = useState(false)
  const limits = useDeviceLimits()

  const client = useRef<PdfClient | null>(null)
  const counter = useRef(0)
  const cancel = useRef<(() => void) | null>(null)
  /** Where a Shift-click selection started. */
  const anchor = useRef(0)
  /** The page that has the keyboard on the board, counted from 0. */
  const focused = useRef(0)
  const onFocused = useCallback((page: number) => {
    focused.current = page
  }, [])
  /** The file that is open, for code that runs outside a render. */
  const openId = useRef<string | null>(null)
  /** Addresses made for parts, to be given back when the parts go. */
  const urls = useRef<string[]>([])
  const reader = usePdfReader(client)
  const { pictures, need, forget } = usePagePictures(client)
  const { claims, forget: forgetLayout } = reader

  useEffect(() => {
    const instance = new PdfClient((event) => {
      // A part opened only to be read is not the file being split.
      if (claims(event)) return
      setFile((current) => {
        if (!current || current.id !== event.id) return current
        if (event.type === "opened")
          return {
            ...current,
            status: "ready",
            facts: event.facts,
            wrongPassword: false,
          }
        if (event.type === "locked")
          return { ...current, status: "locked", wrongPassword: event.wrong }
        return { ...current, status: "error", error: event.message }
      })
    })
    client.current = instance
    const made = urls.current
    return () => {
      instance.dispose()
      client.current = null
      for (const url of made) URL.revokeObjectURL(url)
    }
  }, [claims])

  const dropResult = useCallback(() => {
    for (const url of urls.current.splice(0)) URL.revokeObjectURL(url)
    setResult(null)
  }, [])

  /** Let go of the file and everything chosen for it. */
  const clear = useCallback(() => {
    cancel.current?.()
    if (openId.current) {
      client.current?.close(openId.current)
      forgetLayout(openId.current)
    }
    openId.current = null
    forget()
    dropResult()
    setFile(null)
    setMode("cuts")
    setCuts(startHistory([]))
    setRanges("")
    setSelected(new Set())
    setTypedPages(null)
    setNames({})
    setSkipped(new Set())
    focused.current = 0
    setFailure("")
  }, [dropResult, forget, forgetLayout])

  const choose = useCallback(
    async (incoming: File[]) => {
      const picked = incoming[0]
      if (!picked) return
      const head = new Uint8Array(await picked.slice(0, 2048).arrayBuffer())
      const problem = fileProblem(picked, looksLikePdf(head), limits)
      if (problem) {
        setNotice(problem)
        return
      }
      clear()
      setNotice(
        incoming.length > 1
          ? `One file is split at a time, so ${picked.name} was taken.`
          : ""
      )
      const id = `split-${++counter.current}`
      openId.current = id
      setFile({
        id,
        file: picked,
        name: picked.name,
        size: picked.size,
        status: "reading",
      })
      client.current?.open(id, picked)
    },
    [clear, limits]
  )

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const pasted = Array.from(event.clipboardData?.files ?? [])
      if (!pasted.length) return
      event.preventDefault()
      void choose(pasted)
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [choose])

  async function loadSample() {
    try {
      const response = await fetch(`/samples/${SAMPLE}`)
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      await choose([new File([blob], SAMPLE, { type: "application/pdf" })])
    } catch {
      setNotice("The sample could not be loaded. Add a file of your own.")
    }
  }

  const count = file?.status === "ready" ? (file.facts?.pages ?? 0) : 0
  useEffect(() => {
    if (file?.status === "ready") need(file.id, 0)
  }, [file?.status, file?.id, need])
  const needPage = useCallback(
    (page: number) => {
      if (openId.current) need(openId.current, page)
    },
    [need]
  )

  const plan = useMemo(
    () => planFor({ mode, cuts: cuts.present, ranges, selected }, count),
    [mode, cuts.present, ranges, selected, count]
  )
  const parts = useMemo(
    () =>
      "parts" in plan ? withOverrides(mode, plan.parts, names, skipped) : [],
    [plan, mode, names, skipped]
  )
  const usedPattern = pattern.trim() || patternFor(mode)
  const partFiles = useMemo(
    () =>
      partNames(
        parts,
        usedPattern,
        file?.name ?? "",
        count,
        parts.map((part) => part.typed)
      ),
    [parts, usedPattern, file?.name, count]
  )
  const membership = useMemo(() => partsOfPages(parts, count), [parts, count])
  const leftOut = useMemo(
    () =>
      new Set(parts.flatMap((part, index) => (part.skipped ? [index] : []))),
    [parts]
  )
  const toWrite = useMemo(
    () =>
      parts.flatMap((part, index) =>
        part.skipped ? [] : [{ ...part, name: partFiles[index] }]
      ),
    [parts, partFiles]
  )
  const pagesField = typedPages ?? selectionText(selected)
  const pagesRead =
    typedPages !== null && typedPages.trim()
      ? parseRanges(typedPages, Math.max(count, 1))
      : null
  const problem =
    file?.status !== "ready"
      ? null
      : (pagesProblem(count, limits.pages) ??
        ("problem" in plan ? plan.problem : null) ??
        nothingToWrite(parts) ??
        patternProblem(pattern))
  const fileId = file?.id
  const key = useMemo(
    () =>
      fileId
        ? splitKey(
            fileId,
            parts,
            toWrite.map((part) => part.name)
          )
        : "",
    [fileId, parts, toWrite]
  )
  const current = result?.complete && result.key === key ? result : null
  const splitting = progress !== null
  const canSplit =
    !splitting && file?.status === "ready" && !problem && toWrite.length > 0
  const written = useMemo(
    () => new Map((current?.parts ?? []).map((part) => [part.number, part])),
    [current]
  )

  function startSplit() {
    const instance = client.current
    if (!instance || !file || !canSplit) return
    const forKey = key
    const list = toWrite
    const total = list.reduce((sum, part) => sum + part.pages.length, 0)
    setFailure("")
    dropResult()
    setProgress({ done: 0, total, parts: 0 })
    // Parts are gathered here and shown together: thousands of small parts
    // would otherwise redraw the page thousands of times.
    const arrived: Result["parts"] = []
    const job = instance.split(
      file.id,
      list.map((part) => part.pages),
      (part) => {
        const planned = list[part.index]
        arrived.push({
          number: planned.number,
          name: planned.name,
          data: part.bytes,
          // An address is made below, and only for parts that get a row.
          url: "",
          bytes: part.bytes.byteLength,
          pages: part.pages,
        })
      },
      (done, all) => setProgress({ done, total: all, parts: arrived.length })
    )
    cancel.current = job.cancel
    job.promise
      .then((finished) => {
        if (!finished) {
          dropResult()
          setAnnouncement("Stopped. Nothing was kept.")
          return
        }
        // Making an address for a file costs a browser real time, so only the
        // parts that are listed get one; the rest are in the ZIP.
        for (const part of arrived.slice(0, MOST_ROWS)) {
          part.url = URL.createObjectURL(
            new Blob([part.data], { type: "application/pdf" })
          )
          urls.current.push(part.url)
        }
        setResult({ key: forKey, parts: arrived, complete: true })
        setAnnouncement(
          list.length === 1
            ? "The new file is ready to download."
            : `Split into ${plural(list.length, "part")}. They are ready to download.`
        )
      })
      .catch((error: Error) => {
        dropResult()
        setFailure(error.message)
      })
      .finally(() => {
        cancel.current = null
        setProgress(null)
      })
  }

  async function downloadAll() {
    if (!current || !file) return
    setZipping(true)
    try {
      // Let "Making the ZIP…" be shown before the work begins.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const zip = createZip(
        current.parts.map((part) => ({
          name: part.name,
          data: new Uint8Array(part.data),
        }))
      )
      const url = URL.createObjectURL(
        new Blob([zip], { type: "application/zip" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = zipName(file.name)
      link.click()
      // The browser has taken the file by the time this runs.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setFailure("The ZIP could not be made. Download the parts one at a time.")
    } finally {
      setZipping(false)
    }
  }

  /** The cuts and the page count as they are now, for handlers that must not change. */
  const live = useRef({ cuts: cuts.present, count })
  useEffect(() => {
    live.current = { cuts: cuts.present, count }
  })
  const changeCuts = useCallback((next: number[], say: string) => {
    setCuts((history) => record(history, next))
    setAnnouncement(say)
  }, [])
  const cut = useCallback(
    (after: number) => {
      const next = toggleCut(live.current.cuts, after, live.current.count)
      changeCuts(
        next,
        `${next.includes(after) ? "Cut" : "Removed the cut"} after page ${after + 1}. ${plural(next.length + 1, "part")}.`
      )
    },
    [changeCuts]
  )
  const select = useCallback((page: number, span: boolean) => {
    // Read now: by the time the selection is worked out, the anchor has moved on.
    const from = anchor.current
    setSelected((before) =>
      span ? selectSpan(before, from, page) : toggleSelected(before, page)
    )
    anchor.current = page
    setTypedPages(null)
  }, [])
  const nameTyped = useCallback(
    (partKey: string, name: string) =>
      setNames((before) => ({ ...before, [partKey]: name })),
    []
  )
  const skip = useCallback(
    (partKey: string, leave: boolean) =>
      setSkipped((before) => {
        const next = new Set(before)
        if (leave) next.add(partKey)
        else next.delete(partKey)
        return next
      }),
    []
  )

  const { readFile, readResult } = reader
  const readSource = useCallback(
    (page: number, from: HTMLElement | null) => {
      if (!file || file.status !== "ready") return
      setReadingSource(true)
      void readFile(
        {
          id: file.id,
          name: file.name,
          subtitle: `${plural(count, "page")} · ${sizeLabel(file.size)}`,
        },
        from,
        page
      )
    },
    [file, count, readFile]
  )
  const readPart = useCallback(
    (number: number, from: HTMLElement) => {
      const part = written.get(number)
      if (!part) return
      setReadingSource(false)
      void readResult(
        new Blob([part.data], { type: "application/pdf" }),
        {
          title: part.name,
          subtitle: `${plural(part.pages, "page")} · ${sizeLabel(part.bytes)} · not yet downloaded`,
          label: (page) => `Page ${page} of ${part.name}`,
          failure: "This part could not be shown. You can still download it.",
        },
        from
      )
    },
    [written, readResult]
  )

  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (event.dataTransfer.types.includes("Files")) setOver(true)
    },
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault()
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setOver(false)
    },
    onDrop: (event: DragEvent) => {
      if (!event.dataTransfer.files.length) return
      event.preventDefault()
      setOver(false)
      void choose(Array.from(event.dataTransfer.files))
    },
  }

  if (!file)
    return (
      <div className="grid gap-6 lg:grid-cols-5" data-testid="pdf-splitter">
        <div className="space-y-3 lg:col-span-3">
          <DropZone
            onFiles={(files) => void choose(files)}
            onSample={() => void loadSample()}
            busy={false}
            inputId={INPUT_ID}
            copy={{
              heading: "Drop a PDF to split",
              dropping: "Drop to open this file",
              body: "Add a PDF, then cut it into parts, take pages out or remove them. You can also paste with ⌘V or Ctrl+V.",
              inputLabel: "Choose a PDF file",
              action: "Choose a file",
              limits: `Stays on your device · up to ${megabytes(limits.fileBytes)} and ${limits.pages.toLocaleString("en")} pages`,
            }}
            formats={["PDF"]}
            accept={ACCEPT}
            icon={IconFileTypePdf}
          />
          {notice && (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          )}
        </div>
        <div className="lg:col-span-2">
          <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="section-title">What you can do</h2>
            <ul className="space-y-3 text-sm">
              {[
                {
                  icon: IconScissors,
                  title: "Cut where you can see",
                  text: "Every page is shown. Press between two pages to cut there, or cut every few pages or into equal parts.",
                },
                {
                  icon: IconStack2,
                  title: "Take pages out, or leave them out",
                  text: "Select pages to save them as one new file, or to remove them from the file.",
                },
                {
                  icon: IconBook2,
                  title: "Read before you cut",
                  text: "Open the file in the reader to find the right place, search it, and cut after the page you are on.",
                },
                {
                  icon: IconBookmarks,
                  title: "Small parts, nothing lost",
                  text: "Each part carries only its own fonts and pictures, and keeps its links, bookmarks, notes and fields.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-medium">{item.title}</span>
                    <span className="text-muted-foreground">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )

  const percent = progress
    ? Math.round((progress.done / Math.max(progress.total, 1)) * 100)
    : 0
  const one = givesOneFile(mode)
  const notes = notesFor(file.facts)
  const everyCount = typedCount(every, Math.max(count - 1, 1))
  const equalCount = typedCount(equal, Math.max(count, 1))
  const hint = MODES.find((entry) => entry.value === mode)!.hint

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="pdf-splitter"
      data-ready={file.status !== "reading" ? "true" : undefined}
      data-split={current ? "true" : undefined}
      data-parts={parts.length}
      {...dropHandlers}
    >
      <div
        className={cn(
          "min-w-0 space-y-4 rounded-xl lg:col-span-3",
          over && "outline-2 outline-offset-4 outline-primary outline-dashed"
        )}
      >
        <div
          data-testid="file-bar"
          data-status={file.status}
          className={cn(
            "flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3",
            file.status === "error" && "border-destructive/40"
          )}
        >
          {file.status === "ready" ? (
            <button
              type="button"
              aria-label={`Read ${file.name}`}
              onClick={(event) => readSource(0, event.currentTarget)}
              className="flex size-16 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border bg-muted outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Thumbnail bitmap={pictures[`${file.id}/0`]} />
            </button>
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted" />
          )}
          <div className="min-w-0 flex-1 basis-48">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {file.status === "reading" && "Reading…"}
              {file.status === "ready" &&
                `${plural(count, "page")} · ${sizeLabel(file.size)}`}
              {file.status === "locked" && (
                <span className="inline-flex items-center gap-1">
                  <IconLock className="size-3.5" aria-hidden="true" />
                  Locked · {sizeLabel(file.size)}
                </span>
              )}
            </p>
            {file.status === "error" && (
              <p
                role="alert"
                className="mt-1 flex items-start gap-1.5 text-xs text-destructive"
              >
                <IconAlertCircle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {file.error}
              </p>
            )}
            {file.status === "locked" && (
              <PasswordRow
                name={file.name}
                wrong={Boolean(file.wrongPassword)}
                onUnlock={(password) => {
                  setFile({ ...file, status: "reading" })
                  client.current?.open(file.id, file.file, { password })
                }}
              />
            )}
            {notes.map((note) => (
              <p
                key={note}
                className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <IconInfoCircle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {note}
              </p>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Open ${file.name} in the reader`}
              title="Open in the reader"
              disabled={file.status !== "ready"}
              onClick={(event) =>
                readSource(focused.current, event.currentTarget)
              }
            >
              <IconBook2 aria-hidden="true" />
            </Button>
            <FileInput
              onFiles={(files) => void choose(files)}
              disabled={splitting}
              label="Choose another PDF"
              id={INPUT_ID}
              accept={ACCEPT}
            />
            <label
              htmlFor={INPUT_ID}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50"
              )}
            >
              <IconRefresh aria-hidden="true" />
              <span className="hidden sm:inline">Replace</span>
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove the file"
              title="Remove the file"
              onClick={() => {
                clear()
                setNotice("")
              }}
            >
              <IconX aria-hidden="true" />
            </Button>
          </div>
        </div>

        {notice && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <IconAlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {notice}
          </p>
        )}

        {file.status === "ready" && (
          <>
            <ChoiceChips
              label="How to split"
              value={mode}
              onValueChange={(next: SplitMode) => {
                setMode(next)
                setTypedPages(null)
              }}
              options={MODES.map(({ value, label }) => ({ value, label }))}
              hint={hint}
            />

            <div
              className="space-y-3 rounded-lg border bg-card p-3"
              data-testid="split-rules"
            >
              {mode === "cuts" && (
                <>
                  <form
                    className="flex flex-wrap items-center gap-2 text-sm"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (everyCount)
                        changeCuts(
                          cutsEvery(count, everyCount),
                          `Cut after every ${plural(everyCount, "page")}. ${plural(cutsEvery(count, everyCount).length + 1, "part")}.`
                        )
                    }}
                  >
                    <label htmlFor={`${ids}-every`}>Cut after every</label>
                    <Input
                      id={`${ids}-every`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={every}
                      onChange={(event) => setEvery(event.target.value)}
                      aria-invalid={everyCount === null || undefined}
                      className="w-16 text-center font-mono"
                    />
                    <span>pages</span>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={everyCount === null}
                    >
                      Place the cuts
                    </Button>
                  </form>
                  <form
                    className="flex flex-wrap items-center gap-2 text-sm"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (equalCount)
                        changeCuts(
                          cutsEqual(count, equalCount),
                          `Cut into ${plural(equalCount, "equal part")}.`
                        )
                    }}
                  >
                    <label htmlFor={`${ids}-equal`}>Cut into</label>
                    <Input
                      id={`${ids}-equal`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={equal}
                      onChange={(event) => setEqual(event.target.value)}
                      aria-invalid={equalCount === null || undefined}
                      className="w-16 text-center font-mono"
                    />
                    <span>equal parts</span>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={equalCount === null}
                    >
                      Place the cuts
                    </Button>
                  </form>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      disabled={count < 2}
                      onClick={() =>
                        changeCuts(
                          cutsEvery(count, 1),
                          `Every page is a part of its own. ${plural(count, "part")}.`
                        )
                      }
                    >
                      Every page on its own
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!cuts.present.length}
                      onClick={() => changeCuts([], "Removed every cut.")}
                    >
                      Remove all cuts
                    </Button>
                    <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Undo"
                      title="Undo"
                      disabled={!cuts.past.length}
                      onClick={() => {
                        setCuts(undo)
                        setAnnouncement("Undone.")
                      }}
                    >
                      <IconArrowBackUp aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Redo"
                      title="Redo"
                      disabled={!cuts.future.length}
                      onClick={() => {
                        setCuts(redo)
                        setAnnouncement("Done again.")
                      }}
                    >
                      <IconArrowForwardUp aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    On the keyboard: move between pages with the arrow keys,
                    press S to cut after a page and Enter to read from it.
                  </p>
                </>
              )}
              {mode === "ranges" && (
                <div>
                  <label
                    htmlFor={`${ids}-ranges`}
                    className="mb-1 block text-sm font-medium"
                  >
                    Pages of each part
                  </label>
                  <Input
                    id={`${ids}-ranges`}
                    value={ranges}
                    onChange={(event) => setRanges(event.target.value)}
                    placeholder="1-3, 4-10, 11-"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={
                      ranges.trim() && "problem" in plan ? true : undefined
                    }
                    aria-describedby={`${ids}-ranges-hint`}
                    className="font-mono"
                  />
                  <p
                    id={`${ids}-ranges-hint`}
                    className="mt-1 text-xs text-muted-foreground"
                  >
                    A comma starts a new part. An open range such as 11- runs to
                    the last page. Join ranges into one part with a plus sign:
                    1-3 + 7.
                  </p>
                </div>
              )}
              {mode === "oddeven" && (
                <p className="text-sm">
                  Pages 1, 3, 5 and so on become one file, and pages 2, 4, 6 and
                  so on another. Use it to part the fronts from the backs of a
                  double-sided scan.
                </p>
              )}
              {one && (
                <div>
                  <label
                    htmlFor={`${ids}-pages`}
                    className="mb-1 block text-sm font-medium"
                  >
                    {mode === "extract"
                      ? "Pages to take out"
                      : "Pages to remove"}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id={`${ids}-pages`}
                      value={pagesField}
                      onChange={(event) => {
                        const text = event.target.value
                        setTypedPages(text)
                        if (!text.trim()) setSelected(new Set())
                        else {
                          const read = parseRanges(text, count)
                          if ("pages" in read) setSelected(new Set(read.pages))
                        }
                      }}
                      onBlur={() => {
                        if (!pagesRead || "pages" in pagesRead)
                          setTypedPages(null)
                      }}
                      placeholder="1-3, 7"
                      spellCheck={false}
                      autoComplete="off"
                      aria-invalid={
                        pagesRead && "problem" in pagesRead ? true : undefined
                      }
                      aria-describedby={`${ids}-pages-hint`}
                      className="min-w-0 flex-1 basis-40 font-mono"
                    />
                    <Button
                      variant="outline"
                      disabled={selected.size === count}
                      onClick={() => {
                        setSelected(
                          new Set(Array.from({ length: count }, (_, at) => at))
                        )
                        setTypedPages(null)
                      }}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!selected.size}
                      onClick={() => {
                        setSelected(new Set())
                        setTypedPages(null)
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  <p
                    id={`${ids}-pages-hint`}
                    role={
                      pagesRead && "problem" in pagesRead ? "alert" : undefined
                    }
                    className={cn(
                      "mt-1 text-xs",
                      pagesRead && "problem" in pagesRead
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {pagesRead && "problem" in pagesRead
                      ? pagesRead.problem
                      : `Type pages, or press them below. Shift-click selects everything between two pages. ${plural(selected.size, "page")} selected.`}
                  </p>
                </div>
              )}
            </div>

            <PageBoard
              file={file.id}
              count={count}
              pictures={pictures}
              onNeed={needPage}
              mode={mode}
              cuts={cuts.present}
              onCut={cut}
              selected={selected}
              onSelect={select}
              membership={membership}
              leftOut={leftOut}
              onRead={readSource}
              onFocused={onFocused}
            />
          </>
        )}
        <PdfReader
          reading={reader.reading}
          source={reader.source}
          onClose={reader.close}
          returnTo={reader.opener}
          action={
            readingSource && mode === "cuts"
              ? (page) =>
                  page < count - 1
                    ? {
                        label: cuts.present.includes(page)
                          ? `Remove the cut after page ${page + 1}`
                          : `Cut after page ${page + 1}`,
                        pressed: cuts.present.includes(page),
                        icon: <IconScissors aria-hidden="true" />,
                        onPress: () => cut(page),
                      }
                    : null
              : undefined
          }
        />
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-2">
        <section
          className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
          aria-labelledby={`${ids}-result`}
          data-testid="result"
        >
          <h2
            id={`${ids}-result`}
            className="font-heading text-base font-medium"
          >
            {one ? "New PDF" : "Parts"}
          </h2>
          <p className="text-sm text-muted-foreground" data-testid="plan">
            {file.status === "reading"
              ? "Reading your file…"
              : file.status !== "ready"
                ? "Nothing to split yet."
                : toWrite.length
                  ? one
                    ? `One file with ${plural(toWrite[0].pages.length, "page")} of ${count.toLocaleString("en")}`
                    : `${plural(toWrite.length, "part")} from ${plural(count, "page")}${parts.length > toWrite.length ? ` · ${plural(parts.length - toWrite.length, "part")} left out` : ""}`
                  : "Nothing to split yet."}
          </p>

          {problem && (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-destructive"
            >
              <IconAlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {problem}
            </p>
          )}

          {splitting ? (
            <div className="space-y-3" data-testid="split-progress">
              <div
                role="progressbar"
                aria-label="Splitting"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {one
                    ? `Page ${progress.done.toLocaleString("en")} of ${progress.total.toLocaleString("en")}`
                    : `Part ${Math.min(progress.parts + 1, toWrite.length).toLocaleString("en")} of ${toWrite.length.toLocaleString("en")}`}
                </p>
                <Button variant="outline" onClick={() => cancel.current?.()}>
                  <IconPlayerStop aria-hidden="true" /> Cancel
                </Button>
              </div>
            </div>
          ) : current ? (
            <div className="space-y-3">
              <p className="text-sm" data-testid="result-facts">
                <span className="font-medium">
                  {current.parts.length === 1
                    ? `${plural(current.parts[0].pages, "page")} · ${sizeLabel(current.parts[0].bytes)}`
                    : `${plural(current.parts.length, "file")} · ${sizeLabel(current.parts.reduce((sum, part) => sum + part.bytes, 0))} together`}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · the original is {sizeLabel(file.size)}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {current.parts.length === 1 ? (
                  <a
                    href={current.parts[0].url}
                    download={current.parts[0].name}
                    className={buttonVariants({ size: "lg" })}
                  >
                    <IconDownload aria-hidden="true" /> Download PDF
                  </a>
                ) : (
                  <Button
                    size="lg"
                    disabled={zipping}
                    onClick={() => void downloadAll()}
                  >
                    <IconFileZip aria-hidden="true" />
                    {zipping ? "Making the ZIP…" : "Download all (.zip)"}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button size="lg" disabled={!canSplit} onClick={startSplit}>
                <IconScissors aria-hidden="true" />
                {one ? "Make the PDF" : "Split PDF"}
              </Button>
              {result?.complete && (
                <p className="text-xs text-muted-foreground">
                  Something changed since the last split. Split again to include
                  the changes.
                </p>
              )}
            </div>
          )}

          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}

          {parts.length > 0 && (
            <PartsList
              parts={parts}
              names={partFiles}
              written={written}
              onName={nameTyped}
              onSkip={skip}
              onRead={readPart}
              disabled={splitting}
            />
          )}

          <div>
            <label
              htmlFor={`${ids}-pattern`}
              className="mb-2 block text-sm font-medium"
            >
              {one ? "File name" : "Names of the parts"}
            </label>
            <Input
              id={`${ids}-pattern`}
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder={patternFor(mode)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={patternProblem(pattern) ? true : undefined}
              aria-describedby={`${ids}-pattern-hint`}
              className="font-mono"
            />
            <p
              id={`${ids}-pattern-hint`}
              className="mt-2 text-xs text-muted-foreground"
            >
              Placeholders: {nameTokens.map((token) => `{${token}}`).join(", ")}
              .
              {partFiles[0] && (
                <>
                  {" "}
                  The first is saved as{" "}
                  <span className="font-mono break-all">{partFiles[0]}</span>.
                </>
              )}
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            The file is split on your device and is not uploaded.
          </p>
        </section>
      </div>
    </div>
  )
}
