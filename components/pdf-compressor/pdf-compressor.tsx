"use client"

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react"
import {
  IconAlertCircle,
  IconArrowsMinimize,
  IconBook2,
  IconChartBar,
  IconCircleCheck,
  IconDownload,
  IconEyeCheck,
  IconFilePlus,
  IconFileTypePdf,
  IconInfoCircle,
  IconLock,
  IconPhotoDown,
  IconPlayerStop,
  IconTextSize,
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
import { sizeLabel } from "@/lib/image-compressor/formats"
import { PdfClient } from "@/lib/pdf-merger/client"
import type { FileFacts } from "@/lib/pdf-merger/files"
import {
  desktopLimits,
  looksLikePdf,
  megabytes,
} from "@/lib/pdf-merger/settings"
import type { Audit } from "@/lib/pdf-compressor/mupdf-audit"
import type { CompressReport } from "@/lib/pdf-compressor/mupdf-compress"
import {
  alreadySmall,
  changeLines,
  checkLine,
  fileNotes,
  pixelLimit,
  stagePercent,
  stageText,
  type Stage,
} from "@/lib/pdf-compressor/report"
import {
  defaultSettings,
  levelChoices,
  outcome,
  resultName,
  settingsKey,
  type Level,
} from "@/lib/pdf-compressor/settings"
import { fileProblem } from "@/lib/pdf-splitter/settings"
import { cn } from "cn"
import { AuditCard } from "./audit-card"
import { CompareView } from "./compare-view"

const INPUT_ID = "compress-file"
const ACCEPT = "application/pdf,.pdf"
const SAMPLE = "keepsimp-brochure.pdf"
/** Results opened in the worker to be compared begin with this. */
const AFTER_ID = "after-"

/** The file being compressed. */
interface Item {
  id: string
  file: File
  name: string
  size: number
  status: "reading" | "locked" | "ready" | "error"
  wrongPassword?: boolean
  error?: string
  facts?: FileFacts
  /** The password that opened it, kept only while the file is here. */
  password?: string
}

interface Result {
  /** What it was made from; another file or level makes it out of date. */
  key: string
  level: Level
  report: CompressReport
  /** Null when the file came out no smaller. */
  data: ArrayBuffer | null
  url: string | null
  name: string
  /** The name the result goes by in the worker, where it is opened to be compared. */
  opening: string | null
  /** That name again, once the worker has the result open. */
  after: string | null
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

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

export function PdfCompressor() {
  const [item, setItem] = useState<Item | null>(null)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [level, setLevel] = useState<Level>(defaultSettings.level)
  const [progress, setProgress] = useState<{
    stage: Stage
    done: number
    total: number
  } | null>(null)
  /** A result for each level tried, by what it was made from. */
  const [results, setResults] = useState<Readonly<Record<string, Result>>>({})
  const [page, setPage] = useState(0)
  const [notice, setNotice] = useState("")
  const [failure, setFailure] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const [over, setOver] = useState(false)
  const limits = useDeviceLimits()

  const client = useRef<PdfClient | null>(null)
  const counter = useRef(0)
  const cancel = useRef<(() => void) | null>(null)
  /** What is here now, for answers that arrive later. */
  const now = useRef<{
    item: Item | null
    results: Readonly<Record<string, Result>>
  }>({ item: null, results: {} })
  useEffect(() => {
    now.current = { item, results }
  })
  const reader = usePdfReader(client)
  const { pictures, need, forget } = usePagePictures(client)
  const { claims, forget: forgetLayout, readFile, readResult } = reader

  useEffect(() => {
    const instance = new PdfClient((event) => {
      if (claims(event)) return
      if (event.id.startsWith(AFTER_ID)) {
        // The result is open in the worker: it can be compared now.
        if (event.type === "opened")
          setResults((before) =>
            Object.fromEntries(
              Object.entries(before).map(([made, result]) => [
                made,
                result.opening === event.id
                  ? { ...result, after: event.id }
                  : result,
              ])
            )
          )
        return
      }
      if (event.id !== now.current.item?.id) return
      if (event.type === "opened") {
        setItem(
          (before) =>
            before && { ...before, status: "ready", facts: event.facts }
        )
        void instance.audit(event.id, now.current.item.size).then((found) => {
          if (now.current.item?.id === event.id) setAudit(found)
        })
      } else if (event.type === "locked")
        setItem(
          (before) =>
            before && {
              ...before,
              status: "locked",
              wrongPassword: event.wrong,
            }
        )
      else
        setItem(
          (before) =>
            before && { ...before, status: "error", error: event.message }
        )
    })
    client.current = instance
    return () => {
      instance.dispose()
      client.current = null
      for (const made of Object.values(now.current.results))
        if (made.url) URL.revokeObjectURL(made.url)
    }
  }, [claims])

  /** Let go of a result, or with no key of all of them: its address, and its copy in the worker. */
  const dropResult = useCallback(
    (made?: string) => {
      const kept: Record<string, Result> = {}
      for (const [entry, old] of Object.entries(now.current.results)) {
        if (made !== undefined && entry !== made) {
          kept[entry] = old
          continue
        }
        if (old.url) URL.revokeObjectURL(old.url)
        if (old.opening) {
          client.current?.close(old.opening)
          forgetLayout(old.opening)
        }
      }
      now.current.results = kept
      setResults(kept)
    },
    [forgetLayout]
  )

  const removeFile = useCallback(() => {
    cancel.current?.()
    const old = now.current.item
    if (old) {
      client.current?.close(old.id)
      forget(old.id)
      forgetLayout(old.id)
    }
    dropResult()
    setPage(0)
    setItem(null)
    setAudit(null)
    setFailure("")
  }, [dropResult, forget, forgetLayout])

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const [file] = incoming
      if (!file) return
      const pdf = looksLikePdf(
        new Uint8Array(await file.slice(0, 2048).arrayBuffer())
      )
      const problem = fileProblem(file, pdf, limits)
      if (problem) {
        setNotice(problem)
        return
      }
      removeFile()
      setNotice(
        incoming.length > 1
          ? `One file at a time: ${file.name} was taken, the others were left out.`
          : ""
      )
      const id = `compress-${++counter.current}`
      setItem({
        id,
        file,
        name: file.name,
        size: file.size,
        status: "reading",
      })
      // The handler looks here for the file an answer belongs to.
      now.current.item = {
        id,
        file,
        name: file.name,
        size: file.size,
        status: "reading",
      }
      client.current?.open(id, file)
    },
    [limits, removeFile]
  )

  function unlock(password: string) {
    if (!item) return
    setItem({ ...item, status: "reading", wrongPassword: false, password })
    client.current?.open(item.id, item.file, { password })
  }

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const pasted = Array.from(event.clipboardData?.files ?? [])
      if (!pasted.length) return
      event.preventDefault()
      void addFiles(pasted)
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [addFiles])

  async function loadSample() {
    try {
      const response = await fetch(`/samples/${SAMPLE}`)
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      await addFiles([new File([blob], SAMPLE, { type: "application/pdf" })])
    } catch {
      setNotice("The sample could not be loaded. Add a file of your own.")
    }
  }

  const ready = item?.status === "ready"
  const itemId = item?.id
  useEffect(() => {
    if (ready && itemId) need(itemId, 0)
  }, [ready, itemId, need])

  const key = item ? `${item.id}:${settingsKey({ level })}` : ""
  const current = results[key] ?? null
  const compressing = progress !== null

  async function start() {
    if (!item || !ready || compressing) return
    const instance = client.current
    if (!instance) return
    dropResult(key)
    setFailure("")
    setProgress({ stage: "reading", done: 0, total: 1 })
    setAnnouncement("Compressing.")
    const made = key
    const run = instance.compress(
      item.id,
      item.file,
      {
        level,
        password: item.password,
        maxPixels: pixelLimit(limits.fileBytes < desktopLimits.fileBytes),
      },
      (stage, done, total) => setProgress({ stage, done, total })
    )
    cancel.current = run.cancel
    try {
      const out = await run.promise
      if (!out) {
        setAnnouncement("Compression cancelled.")
        return
      }
      // The file was removed or swapped while this ran.
      if (now.current.item?.id !== item.id) return
      const gain = outcome(out.report.before, out.report.after)
      let opening: string | null = null
      if (out.bytes) {
        // Open the result in the worker too, so pages can be compared.
        opening = `${AFTER_ID}${++counter.current}`
        instance.open(opening, new Blob([out.bytes]), {
          password: item.password,
        })
      }
      const next: Result = {
        key: made,
        level,
        report: out.report,
        data: out.bytes,
        url: out.bytes
          ? URL.createObjectURL(
              new Blob([out.bytes], { type: "application/pdf" })
            )
          : null,
        name: resultName(item.name),
        opening,
        // The handler above fills this in once the worker has it open.
        after: null,
      }
      setResults((before) => ({ ...before, [made]: next }))
      setPage(out.report.check.low[0]?.page ?? 0)
      setAnnouncement(
        out.bytes
          ? `Done. ${gain.percent}% smaller: ${sizeLabel(out.report.after)}.`
          : "Done. The file is already as small as this level can make it."
      )
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      cancel.current = null
      setProgress(null)
    }
  }

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
      void addFiles(Array.from(event.dataTransfer.files))
    },
  }

  if (!item)
    return (
      <div className="grid gap-6 lg:grid-cols-5" data-testid="pdf-compressor">
        <div className="space-y-3 lg:col-span-3">
          <DropZone
            onFiles={(files) => void addFiles(files)}
            onSample={() => void loadSample()}
            busy={false}
            inputId={INPUT_ID}
            copy={{
              heading: "Drop a PDF to compress",
              dropping: "Drop to open this file",
              body: "Add a PDF to see what makes it big, then make it smaller. You can also paste with ⌘V or Ctrl+V.",
              inputLabel: "Choose a PDF file",
              action: "Choose file",
              limits: `Stays on your device · up to ${megabytes(limits.fileBytes)}`,
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
                  icon: IconChartBar,
                  title: "See what makes it big",
                  text: "Pictures, fonts, hidden data: the file's size is shown part by part before anything is changed.",
                },
                {
                  icon: IconPhotoDown,
                  title: "Smaller pictures that look the same",
                  text: "Each picture is brought down to the size it is shown at, and saved at a quality found by measuring.",
                },
                {
                  icon: IconTextSize,
                  title: "Pages stay pages",
                  text: "Text stays sharp and can still be selected and searched. Links, bookmarks and forms are untouched.",
                },
                {
                  icon: IconEyeCheck,
                  title: "Checked before you download",
                  text: "Pages are drawn before and after and compared. You can look at any page both ways yourself.",
                },
              ].map((entry) => (
                <li key={entry.title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <entry.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-medium">{entry.title}</span>
                    <span className="text-muted-foreground">{entry.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )

  const pages = item.facts?.pages ?? 0
  const percent = progress
    ? stagePercent(progress.stage, progress.done, progress.total)
    : 0
  const gain = current
    ? outcome(current.report.before, current.report.after)
    : null
  const check = current?.data ? checkLine(current.report.check) : null
  const others = !current && ready && Object.keys(results).length > 0
  const note = levelChoices.find((choice) => choice.value === level)!.note
  const notes = item.facts ? fileNotes(item.facts, Boolean(audit?.archive)) : []

  return (
    <div
      // On a phone the level and the result come straight after the file;
      // beside it on a wide screen, with the pictures and breakdowns below.
      className="grid gap-6 lg:grid-cols-5 lg:grid-rows-[auto_1fr]"
      data-testid="pdf-compressor"
      data-ready={ready && audit ? "true" : undefined}
      data-compressed={current ? "true" : undefined}
      data-settled={
        item.status !== "reading" && !compressing ? "true" : undefined
      }
      {...dropHandlers}
    >
      <div
        className={cn(
          "min-w-0 space-y-4 rounded-xl lg:col-span-3",
          over && "outline-2 outline-offset-4 outline-primary outline-dashed"
        )}
      >
        <div
          data-testid="file-row"
          data-status={item.status}
          className={cn(
            "flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3",
            item.status === "error" && "border-destructive/40"
          )}
        >
          {ready ? (
            <button
              type="button"
              aria-label={`Read ${item.name}`}
              onClick={(event) =>
                void readFile(
                  {
                    id: item.id,
                    name: item.name,
                    subtitle: `${plural(pages, "page")} · ${sizeLabel(item.size)}`,
                  },
                  event.currentTarget
                )
              }
              className="flex size-16 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border bg-muted outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Thumbnail bitmap={pictures[`${item.id}/0`]} />
            </button>
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted" />
          )}
          <div className="min-w-0 flex-1 basis-48">
            <p className="truncate text-sm font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {item.status === "reading" && "Reading…"}
              {ready && `${plural(pages, "page")} · ${sizeLabel(item.size)}`}
              {item.status === "locked" && (
                <span className="inline-flex items-center gap-1">
                  <IconLock className="size-3.5" aria-hidden="true" />
                  Locked · {sizeLabel(item.size)}
                </span>
              )}
            </p>
            {item.status === "error" && (
              <p
                role="alert"
                className="mt-1 flex items-start gap-1.5 text-xs text-destructive"
              >
                <IconAlertCircle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {item.error}
              </p>
            )}
            {item.status === "locked" && (
              <PasswordRow
                name={item.name}
                wrong={Boolean(item.wrongPassword)}
                onUnlock={unlock}
              />
            )}
            {notes.map((line) => (
              <p
                key={line}
                data-testid="file-note"
                className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <IconInfoCircle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {line}
              </p>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div>
              <FileInput
                onFiles={(files) => void addFiles(files)}
                disabled={compressing}
                label="Choose another PDF file"
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
                <IconFilePlus aria-hidden="true" /> Choose another
              </label>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${item.name}`}
              title="Remove"
              disabled={compressing}
              onClick={removeFile}
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
      </div>

      <div className="space-y-4 lg:col-span-2 lg:row-span-2">
        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <ChoiceChips
            label="How much to compress"
            value={level}
            onValueChange={setLevel}
            options={levelChoices.map(({ value, label }) => ({ value, label }))}
            hint={note}
            disabled={compressing}
          />
        </section>

        <section
          className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
          aria-labelledby="compress-result"
        >
          <h2 id="compress-result" className="section-title">
            Result
          </h2>
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>

          {compressing ? (
            <div className="space-y-3" data-testid="compress-progress">
              <div
                role="progressbar"
                aria-label="Compressing"
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
                <p className="min-w-0 text-sm text-muted-foreground">
                  {stageText(progress.stage, progress.done, progress.total)}
                </p>
                <Button variant="outline" onClick={() => cancel.current?.()}>
                  <IconPlayerStop aria-hidden="true" /> Cancel
                </Button>
              </div>
            </div>
          ) : current && gain ? (
            current.data && current.url ? (
              <div className="space-y-4" data-testid="result">
                <div>
                  <p
                    className="font-heading text-3xl font-medium tracking-tight"
                    data-testid="saving"
                  >
                    {gain.percent}% smaller
                  </p>
                  <p
                    className="mt-1 text-sm text-muted-foreground"
                    data-testid="result-facts"
                  >
                    {sizeLabel(current.report.before)} →{" "}
                    <span className="font-medium text-foreground">
                      {sizeLabel(current.report.after)}
                    </span>
                  </p>
                </div>
                {check && (
                  <p
                    data-testid="check"
                    data-passed={check.passed}
                    className={cn(
                      "flex items-start gap-2 text-sm",
                      !check.passed && "text-destructive"
                    )}
                  >
                    {check.passed ? (
                      <IconCircleCheck
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <IconAlertCircle
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    {check.text}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={current.url}
                    download={current.name}
                    className={buttonVariants({ size: "lg" })}
                  >
                    <IconDownload aria-hidden="true" /> Download PDF
                  </a>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={(event) =>
                      void readResult(
                        new Blob([current.data!], { type: "application/pdf" }),
                        {
                          title: current.name,
                          subtitle: `${plural(pages, "page")} · ${sizeLabel(current.report.after)} · not yet downloaded`,
                          password: item.password,
                          label: (number) =>
                            `Page ${number} of ${current.name}`,
                          failure:
                            "The result could not be shown. You can still download it.",
                        },
                        event.currentTarget
                      )
                    }
                  >
                    <IconBook2 aria-hidden="true" /> Read the result
                  </Button>
                </div>
                <ul
                  className="space-y-1 text-xs text-muted-foreground"
                  data-testid="changes"
                >
                  {changeLines(current.report).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p
                className="flex items-start gap-2 text-sm"
                data-testid="already-small"
              >
                <IconInfoCircle
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {alreadySmall(current.level)}
              </p>
            )
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground" data-testid="plan">
                {item.status === "reading"
                  ? "Reading your file…"
                  : ready
                    ? `${plural(pages, "page")} · ${sizeLabel(item.size)}`
                    : "Nothing to compress yet."}
              </p>
              <Button size="lg" disabled={!ready} onClick={() => void start()}>
                <IconArrowsMinimize aria-hidden="true" /> Compress PDF
              </Button>
              {others && (
                <p className="text-xs text-muted-foreground">
                  Not compressed at this level yet. The results at other levels
                  are kept, so you can go back to them.
                </p>
              )}
            </div>
          )}

          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            The file is compressed on your device and is not uploaded.
          </p>
        </section>
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-3">
        {current?.data && current.after && (
          <CompareView
            client={client}
            before={item.id}
            after={current.after}
            pages={pages}
            page={Math.min(page, Math.max(pages - 1, 0))}
            onPage={setPage}
            flagged={current.report.check.low.map((entry) => entry.page)}
            beforeLabel={`Original · ${sizeLabel(item.size)}`}
            afterLabel={`Compressed · ${sizeLabel(current.report.after)}`}
          />
        )}

        {ready && (
          <AuditCard
            title="What makes it big"
            audit={audit}
            testId="audit-before"
          />
        )}
        {current?.report.audit && (
          <AuditCard
            title="What is in the result"
            audit={current.report.audit}
            testId="audit-after"
          />
        )}
      </div>

      <PdfReader
        reading={reader.reading}
        source={reader.source}
        onClose={reader.close}
        returnTo={reader.opener}
      />
    </div>
  )
}
