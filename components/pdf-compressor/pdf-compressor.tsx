"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
} from "react"
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
  IconFileZip,
  IconInfoCircle,
  IconLock,
  IconPhotoDown,
  IconPlayerStop,
  IconTextSize,
  IconTrash,
} from "@tabler/icons-react"
import { DropZone, FileInput } from "@/components/image-compressor/drop-zone"
import { Section, SettingsCard } from "@/components/image-batch/controls"
import { useDeviceLimits } from "@/components/pdf/use-device-limits"
import { usePagePictures } from "@/components/pdf/use-page-pictures"
import { usePdfReader } from "@/components/pdf/use-pdf-reader"
import { PdfReader } from "@/components/pdf-reader/pdf-reader"
import { Button, buttonVariants } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { uniqueNames } from "@/lib/image-resizer/naming"
import { createZip } from "@/lib/image-resizer/zip"
import { PdfClient } from "@/lib/pdf-merger/client"
import {
  desktopLimits,
  looksLikePdf,
  megabytes,
} from "@/lib/pdf-merger/settings"
import {
  admitFiles,
  compressReducer,
  noFiles,
  refusalNotice,
} from "@/lib/pdf-compressor/files"
import type { CompressReport } from "@/lib/pdf-compressor/mupdf-compress"
import {
  defaultExtras,
  extrasKey,
  extrasProblem,
  lockOf,
  removalOf,
  removesAnything,
  type Extras,
} from "@/lib/pdf-compressor/options"
import {
  alreadySmall,
  batchLine,
  changeLines,
  checkLine,
  pixelLimit,
  rowSummary,
  stagePercent,
  stageText,
  targetLine,
  type Stage,
} from "@/lib/pdf-compressor/report"
import {
  defaultSettings,
  outcome,
  resultName,
  scansFor,
  settingsKey,
  settingsProblem,
  type CompressSettings,
  type Mode,
  type ScanChoice,
} from "@/lib/pdf-compressor/settings"
import {
  EXTRAS_GROUPS,
  levelChanged,
  levelSummary,
} from "@/lib/pdf-compressor/summary"
import { mostWrites, stepCount } from "@/lib/pdf-compressor/target"
import { changedGroups, resetAll } from "@/lib/settings-groups"
import { limitBytes, type SizeUnit } from "@/lib/pdf-splitter/size"
import { cn } from "cn"
import { AuditCard } from "./audit-card"
import { CompareView } from "./compare-view"
import { FileRows, type RowResult } from "./file-rows"
import { CUSTOM_SIZE, LevelPanel, type SizeChoice } from "./level-panel"
import { OptionsPanel } from "./options-panel"

const INPUT_ID = "compress-file"
const ACCEPT = "application/pdf,.pdf"
const SAMPLE = "keepsimp-brochure.pdf"
const SCAN_SAMPLE = "keepsimp-scan.pdf"
const ZIP_NAME = "compressed-pdfs.zip"
/** A size of one's own, as the field starts. */
const SIZE_TEXT = "300"
const SIZE_UNIT: SizeUnit = "KB"
/** Results opened in the worker to be compared begin with this. */
const AFTER_ID = "after-"

interface Result {
  file: string
  mode: Mode
  report: CompressReport
  /** Null when the file came out no smaller. */
  data: ArrayBuffer | null
  url: string | null
  name: string
  /** The password that opens the result, when it has one. */
  password?: string
  /** The name the result goes by in the worker, where it is opened to be compared. */
  opening: string | null
  /** That name again, once the worker has the result open. */
  after: string | null
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

/** Where a file's result at some settings is kept. */
const slot = (file: string, key: string) => `${file}:${key}`

export function PdfCompressor() {
  const [state, dispatch] = useReducer(compressReducer, noFiles)
  const [mode, setMode] = useState<Mode>(defaultSettings.mode)
  const [size, setSize] = useState<SizeChoice>(String(defaultSettings.target))
  const [sizeText, setSizeText] = useState(SIZE_TEXT)
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>(SIZE_UNIT)
  const [further, setFurther] = useState(defaultSettings.further)
  const [scans, setScans] = useState<ScanChoice>(defaultSettings.scans)
  const [custom, setCustom] = useState(defaultSettings.custom)
  const [extras, setExtras] = useState<Extras>(defaultExtras)
  const updateExtras = useCallback(
    (change: Partial<Extras>) =>
      setExtras((before) => ({ ...before, ...change })),
    []
  )
  const [progress, setProgress] = useState<{
    /** Which file is being compressed, from 1, of how many. */
    file: number
    files: number
    stage: Stage
    done: number
    total: number
    attempt?: number
  } | null>(null)
  /** A result for each file at each setting tried, by `slot`. */
  const [results, setResults] = useState<Readonly<Record<string, Result>>>({})
  /** What went wrong with a file at some settings, by `slot`. */
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({})
  const [page, setPage] = useState(0)
  const [notice, setNotice] = useState("")
  const [failure, setFailure] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const [zipping, setZipping] = useState(false)
  const [over, setOver] = useState(false)
  const limits = useDeviceLimits()

  const client = useRef<PdfClient | null>(null)
  const counter = useRef(0)
  const cancel = useRef<(() => void) | null>(null)
  /** What is here now, for answers that arrive later. */
  const live = useRef({ state, results })
  useEffect(() => {
    live.current = { state, results }
  })
  const reader = usePdfReader(client)
  const { pictures, need, forget } = usePagePictures(client)
  const { claims, forget: forgetLayout, readFile, readResult } = reader

  useEffect(() => {
    const instance = new PdfClient((event) => {
      if (claims(event)) return
      if (event.id.startsWith(AFTER_ID)) {
        // A result is open in the worker: it can be compared now.
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
      if (event.type === "opened") {
        dispatch({ type: "opened", id: event.id, facts: event.facts })
        const bytes =
          live.current.state.files.find((file) => file.id === event.id)?.size ??
          0
        void instance
          .audit(event.id, bytes)
          .then((audit) => dispatch({ type: "audit", id: event.id, audit }))
      } else if (event.type === "locked")
        dispatch({ type: "locked", id: event.id, wrong: event.wrong })
      else dispatch({ type: "failed", id: event.id, message: event.message })
    })
    client.current = instance
    return () => {
      instance.dispose()
      client.current = null
      for (const made of Object.values(live.current.results))
        if (made.url) URL.revokeObjectURL(made.url)
    }
  }, [claims])

  /** Let go of results: their addresses, and their copies in the worker. */
  const dropResults = useCallback(
    (which: (made: string, result: Result) => boolean) => {
      const kept: Record<string, Result> = {}
      for (const [made, old] of Object.entries(live.current.results)) {
        if (!which(made, old)) {
          kept[made] = old
          continue
        }
        if (old.url) URL.revokeObjectURL(old.url)
        if (old.opening) {
          client.current?.close(old.opening)
          forgetLayout(old.opening)
        }
      }
      live.current.results = kept
      setResults(kept)
    },
    [forgetLayout]
  )

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const sniffed = await Promise.all(
        incoming.map(async (file) => ({
          file,
          name: file.name,
          size: file.size,
          pdf: looksLikePdf(
            new Uint8Array(await file.slice(0, 2048).arrayBuffer())
          ),
        }))
      )
      const verdicts = admitFiles(live.current.state.files, sniffed, limits)
      setNotice(refusalNotice(verdicts))
      const items = sniffed.flatMap(({ file, name, size }, index) =>
        verdicts[index]
          ? []
          : [{ id: `compress-${++counter.current}`, file, name, size }]
      )
      if (!items.length) return
      dispatch({ type: "add", items })
      for (const item of items) client.current?.open(item.id, item.file)
    },
    [limits]
  )

  const letGo = useCallback(
    (id: string) => {
      client.current?.close(id)
      forget(id)
      forgetLayout(id)
      dropResults((_made, result) => result.file === id)
      setFailures((before) =>
        Object.fromEntries(
          Object.entries(before).filter(([made]) => !made.startsWith(`${id}:`))
        )
      )
    },
    [dropResults, forget, forgetLayout]
  )

  const removeFile = useCallback(
    (id: string) => {
      letGo(id)
      setPage(0)
      dispatch({ type: "remove", id })
    },
    [letGo]
  )

  function clearAll() {
    cancel.current?.()
    for (const file of state.files) letGo(file.id)
    dispatch({ type: "clear" })
    setNotice("")
    setFailure("")
    setPage(0)
  }

  const unlock = useCallback((id: string, password: string) => {
    const file = live.current.state.files.find((entry) => entry.id === id)
    if (!file) return
    dispatch({ type: "unlocking", id, password })
    client.current?.open(id, file.file, { password })
  }, [])

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

  async function loadSample(name = SAMPLE) {
    try {
      const response = await fetch(`/samples/${name}`)
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      await addFiles([new File([blob], name, { type: "application/pdf" })])
    } catch {
      setNotice("The sample could not be loaded. Add a file of your own.")
    }
  }

  // The first page of every file is drawn for its row.
  useEffect(() => {
    for (const file of state.files)
      if (file.status === "ready") need(file.id, 0)
  }, [state.files, need])

  const settings = useMemo<CompressSettings>(
    () => ({
      mode,
      target:
        size === CUSTOM_SIZE ? limitBytes(sizeText, sizeUnit) : Number(size),
      further,
      scans,
      custom,
    }),
    [mode, size, sizeText, sizeUnit, further, scans, custom]
  )
  // What is taken out and locked is part of what a result was made from.
  const taken = extrasKey(extras)
  const key = `${settingsKey(settings)}|${taken}`
  const problem = settingsProblem(settings) ?? extrasProblem(extras)
  const several = state.files.length > 1
  const shown =
    state.files.find((file) => file.id === state.active) ?? state.files[0]
  const ready = state.files.filter((file) => file.status === "ready")
  /** Files that have no result yet at what is chosen now. */
  const waiting = ready.filter(
    (file) => !results[slot(file.id, key)] && !failures[slot(file.id, key)]
  )
  const done = ready.flatMap((file) => {
    const result = results[slot(file.id, key)]
    return result ? [{ file, result }] : []
  })
  const current = shown ? (results[slot(shown.id, key)] ?? null) : null
  const compressing = progress !== null
  const reading = state.files.some((file) => file.status === "reading")

  const readSource = useCallback(
    (id: string, from: HTMLElement) => {
      const file = live.current.state.files.find((entry) => entry.id === id)
      if (!file) return
      void readFile(
        {
          id,
          name: file.name,
          subtitle: `${plural(file.facts?.pages ?? 0, "page")} · ${sizeLabel(file.size)}`,
        },
        from
      )
    },
    [readFile]
  )
  const show = useCallback((id: string) => {
    dispatch({ type: "activate", id })
    setPage(0)
  }, [])

  async function start() {
    const instance = client.current
    if (!instance || compressing || problem || !waiting.length) return
    const todo = waiting
    const made = key
    const how =
      settings.mode === "size"
        ? { target: settings.target!, further: settings.further }
        : settings.mode === "custom"
          ? { custom: settings.custom }
          : settings.mode
    const removal = removalOf(extras)
    const lock = lockOf(extras, () => crypto.randomUUID())
    // A result is opened with the password it was given, or the file's own.
    const opens = (file: { password?: string }) =>
      lock ? lock.password : file.password
    let stopped = false
    /** Files that came back with a result, smaller or not. */
    let resulted = 0
    setFailure("")
    setAnnouncement(
      todo.length > 1 ? `Compressing ${todo.length} files.` : "Compressing."
    )
    try {
      for (const [index, file] of todo.entries()) {
        if (stopped) break
        setProgress({
          file: index + 1,
          files: todo.length,
          stage: "reading",
          done: 0,
          total: 1,
        })
        const run = instance.compress(
          file.id,
          file.file,
          {
            how,
            scans: scansFor(settings),
            remove: removesAnything(removal) ? removal : null,
            lock,
            password: file.password,
            maxPixels: pixelLimit(limits.fileBytes < desktopLimits.fileBytes),
          },
          (stage, finished, total, attempt) =>
            setProgress({
              file: index + 1,
              files: todo.length,
              stage,
              done: finished,
              total,
              attempt,
            })
        )
        cancel.current = () => {
          stopped = true
          run.cancel()
        }
        let out
        try {
          out = await run.promise
        } catch (error) {
          // One file that fails does not stop the others.
          const message = (error as Error).message
          setFailures((before) => ({
            ...before,
            [slot(file.id, made)]: message,
          }))
          continue
        }
        if (!out) {
          setAnnouncement("Compression cancelled.")
          break
        }
        // The file was removed while it was being compressed.
        if (!live.current.state.files.some((entry) => entry.id === file.id))
          continue
        let opening: string | null = null
        if (out.bytes) {
          // Open the result in the worker too, so pages can be compared.
          opening = `${AFTER_ID}${++counter.current}`
          instance.open(opening, new Blob([out.bytes]), {
            password: opens(file),
          })
        }
        const next: Result = {
          file: file.id,
          mode: settings.mode,
          report: out.report,
          data: out.bytes,
          url: out.bytes
            ? URL.createObjectURL(
                new Blob([out.bytes], { type: "application/pdf" })
              )
            : null,
          name: resultName(file.name),
          password: opens(file),
          opening,
          // The handler above fills this in once the worker has it open.
          after: null,
        }
        setResults((before) => ({ ...before, [slot(file.id, made)]: next }))
        if (file.id === live.current.state.active)
          setPage(out.report.check.low[0]?.page ?? 0)
        resulted++
        if (todo.length === 1) {
          const gain = outcome(out.report.before, out.report.after)
          setAnnouncement(
            out.bytes
              ? `Done. ${gain.percent}% smaller: ${sizeLabel(out.report.after)}.`
              : "Done. The file could not be made smaller."
          )
          if (out.bytes)
            toast.success("Your PDF is ready", {
              description: `${gain.percent}% smaller: ${sizeLabel(out.report.after)}`,
            })
          else toast.info("The file could not be made smaller")
        }
      }
      if (todo.length > 1 && !stopped) {
        setAnnouncement(`Done. ${todo.length} files compressed.`)
        if (resulted > 0) toast.success(`${plural(resulted, "PDF")} ready`)
      }
    } finally {
      cancel.current = null
      setProgress(null)
    }
  }

  /** Every file as one ZIP: compressed where that made it smaller, as it was otherwise. */
  async function downloadAll() {
    setZipping(true)
    try {
      // Let "Making the ZIP…" be shown before the work begins.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const names = uniqueNames(
        done.map(({ file, result }) => (result.data ? result.name : file.name))
      )
      const zip = createZip(
        await Promise.all(
          done.map(async ({ file, result }, index) => ({
            name: names[index],
            data: new Uint8Array(
              result.data ?? (await file.file.arrayBuffer())
            ),
          }))
        )
      )
      const url = URL.createObjectURL(
        new Blob([zip], { type: "application/zip" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = ZIP_NAME
      link.click()
      toast.info("Download started", { description: ZIP_NAME })
      // The browser has taken the file by the time this runs.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setFailure("The ZIP could not be made. Download the files one at a time.")
    } finally {
      setZipping(false)
    }
  }

  const rows = useMemo(() => {
    const chosen = `${settingsKey(settings)}|${extrasKey(extras)}`
    const out: Record<string, RowResult> = {}
    for (const file of state.files) {
      const result = results[slot(file.id, chosen)]
      const failed = failures[slot(file.id, chosen)]
      if (failed) out[file.id] = { text: failed, problem: true }
      else if (result)
        out[file.id] = {
          text: rowSummary(result.report),
          problem: Boolean(result.report.target && !result.report.target.met),
          download: result.url
            ? { url: result.url, name: result.name }
            : undefined,
        }
    }
    return out
  }, [state.files, results, failures, settings, extras])

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

  if (!state.files.length)
    return (
      <div className="grid gap-6 lg:grid-cols-5" data-testid="pdf-compressor">
        <div className="space-y-3 lg:col-span-3">
          <DropZone
            onFiles={(files) => void addFiles(files)}
            onSample={() => void loadSample()}
            busy={false}
            inputId={INPUT_ID}
            copy={{
              heading: "Drop PDFs to compress",
              dropping: "Drop to open these files",
              body: "Add one PDF or several to see what makes them big, then make them smaller. You can also paste with ⌘V or Ctrl+V.",
              inputLabel: "Choose PDF files",
              action: "Choose files",
              limits: `Stays on your device · up to ${limits.files} files, ${megabytes(limits.totalBytes)} together`,
            }}
            formats={["PDF"]}
            accept={ACCEPT}
            icon={IconFileTypePdf}
          />
          <p className="text-sm text-muted-foreground">
            No scan at hand?{" "}
            <Button
              variant="link"
              className="px-0"
              onClick={() => void loadSample(SCAN_SAMPLE)}
            >
              Try a scanned page
            </Button>
          </p>
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
                  title: "Reach a size",
                  text: "Name the size a form or an email allows, such as 200 KB, and get the best quality that fits.",
                },
                {
                  icon: IconEyeCheck,
                  title: "Checked before you download",
                  text: "Pages stay pages, with text you can select. They are drawn before and after and compared.",
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

  const pages = shown?.facts?.pages ?? 0
  const percent = progress
    ? stagePercent(
        progress.stage,
        progress.done,
        progress.total,
        progress.attempt,
        // A size is found by writing the file several times. At a level,
        // a second writing only follows a first that was held back.
        progress.attempt
          ? settings.mode === "size"
            ? mostWrites(stepCount(further))
            : 2
          : 1
      )
    : 0
  const gain = current
    ? outcome(current.report.before, current.report.after)
    : null
  // Pages made grey or black and white are compared, but not called the same.
  const remade = Boolean(
    current &&
    ((current.report.scans && current.report.scans.how !== "layers") ||
      (current.mode === "custom" && custom.grey))
  )
  const check = current?.data ? checkLine(current.report.check, remade) : null
  const target =
    current?.report.target && current.data && current.report.audit
      ? targetLine(
          current.report.target,
          current.report.after,
          current.report.after -
            (current.report.audit.breakdown.parts.find(
              (part) => part.kind === "pictures"
            )?.bytes ?? 0),
          further
        )
      : null
  const together =
    several && done.length
      ? batchLine(
          done.map(({ result }) => ({
            before: result.report.before,
            after: result.report.after,
          }))
        )
      : null
  const changedCount =
    (levelChanged(settings) ? 1 : 0) +
    changedGroups(extras, defaultExtras, EXTRAS_GROUPS).length
  /** Puts the level back, with the size and the settings of one's own. */
  const resetLevel = () => {
    setMode(defaultSettings.mode)
    setSize(String(defaultSettings.target))
    setSizeText(SIZE_TEXT)
    setSizeUnit(SIZE_UNIT)
    setFurther(defaultSettings.further)
    setScans(defaultSettings.scans)
    setCustom(defaultSettings.custom)
  }
  const resetAllSettings = () => {
    resetLevel()
    updateExtras(resetAll(defaultExtras, EXTRAS_GROUPS))
    toast.info("Settings put back to the usual")
  }
  const others =
    waiting.length > 0 &&
    Object.values(results).some((result) =>
      waiting.some((file) => file.id === result.file)
    )

  return (
    <div
      // On a phone the level and the result come straight after the files;
      // beside them on a wide screen, with the pictures and breakdowns below.
      className="grid gap-6 lg:grid-cols-5 lg:grid-rows-[auto_1fr]"
      data-testid="pdf-compressor"
      data-ready={
        !reading && ready.length > 0 && ready.every((file) => "audit" in file)
          ? "true"
          : undefined
      }
      data-compressed={
        !compressing && ready.length > 0 && !waiting.length ? "true" : undefined
      }
      data-settled={!reading && !compressing ? "true" : undefined}
      {...dropHandlers}
    >
      <div
        className={cn(
          "min-w-0 space-y-4 rounded-xl lg:col-span-3",
          over && "outline-2 outline-offset-4 outline-primary outline-dashed"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">
            {plural(state.files.length, "file")}
          </h2>
          <div className="flex items-center gap-2">
            <div>
              <FileInput
                onFiles={(files) => void addFiles(files)}
                disabled={compressing}
                label="Add PDF files"
                id={INPUT_ID}
                multiple
                accept={ACCEPT}
              />
              <label
                htmlFor={INPUT_ID}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50"
                )}
              >
                <IconFilePlus aria-hidden="true" /> Add files
              </label>
            </div>
            <Button variant="ghost" onClick={clearAll}>
              <IconTrash aria-hidden="true" /> Clear all
            </Button>
          </div>
        </div>

        <FileRows
          files={state.files}
          active={state.active}
          pictures={pictures}
          results={rows}
          onShow={show}
          onRead={readSource}
          onRemove={removeFile}
          onUnlock={unlock}
          disabled={compressing}
        />

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
        <section
          className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
          aria-labelledby="compress-result"
          data-testid="result-card"
        >
          <h2 id="compress-result" className="section-title">
            {several ? "Results" : "Result"}
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
                  {progress.files > 1 &&
                    `File ${progress.file} of ${progress.files} · `}
                  {stageText(
                    progress.stage,
                    progress.done,
                    progress.total,
                    progress.attempt
                  )}
                </p>
                <Button variant="outline" onClick={() => cancel.current?.()}>
                  <IconPlayerStop aria-hidden="true" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {together && (
                <div className="space-y-3" data-testid="batch">
                  <div>
                    <p
                      className="font-heading text-3xl font-medium tracking-tight"
                      data-testid="batch-saving"
                    >
                      {together.percent}% smaller
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {together.text}
                    </p>
                  </div>
                  <Button
                    size="lg"
                    disabled={zipping}
                    onClick={() => void downloadAll()}
                  >
                    <IconFileZip aria-hidden="true" />
                    {zipping ? "Making the ZIP…" : "Download all (.zip)"}
                  </Button>
                </div>
              )}

              {waiting.length > 0 || !ready.length ? (
                <div className="space-y-2">
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="plan"
                  >
                    {reading
                      ? "Reading your files…"
                      : !ready.length
                        ? "Nothing to compress yet."
                        : several
                          ? `${plural(waiting.length, "file")} to compress`
                          : `${plural(pages, "page")} · ${sizeLabel(shown?.size ?? 0)}`}
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
                  <Button
                    size="lg"
                    disabled={!waiting.length || Boolean(problem)}
                    onClick={() => void start()}
                  >
                    <IconArrowsMinimize aria-hidden="true" />
                    {waiting.length > 1
                      ? `Compress ${plural(waiting.length, "file")}`
                      : "Compress PDF"}
                  </Button>
                  {others && (
                    <p className="text-xs text-muted-foreground">
                      Not compressed this way yet. Earlier results are kept, so
                      you can go back to them.
                    </p>
                  )}
                </div>
              ) : null}

              {current &&
                gain &&
                shown &&
                (current.data && current.url ? (
                  <div
                    className={cn("space-y-4", several && "border-t pt-4")}
                    data-testid="result"
                  >
                    {several ? (
                      <h3 className="text-sm font-medium">
                        <span className="break-all">{shown.name}</span>
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {sizeLabel(current.report.before)} →{" "}
                          {sizeLabel(current.report.after)}
                        </span>
                      </h3>
                    ) : (
                      <div>
                        <p
                          className="font-heading text-3xl font-medium tracking-tight"
                          data-testid="saving"
                        >
                          {gain.smaller ? `${gain.percent}% smaller` : "Ready"}
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
                    )}
                    {target && (
                      <div data-testid="target" data-met={target.met}>
                        <p
                          className={cn(
                            "flex items-start gap-2 text-sm",
                            !target.met && "text-destructive"
                          )}
                        >
                          {target.met ? (
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
                          {target.text}
                        </p>
                        {target.advice.length > 0 && (
                          <ul className="mt-2 list-disc space-y-1 pl-6 text-xs text-muted-foreground">
                            {target.advice.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
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
                        onClick={() =>
                          toast.info("Download started", {
                            description: current.name,
                          })
                        }
                        // Merged, so the outline's border wins over the base's clear one.
                        className={cn(
                          buttonVariants({
                            size: "lg",
                            variant: several ? "outline" : "default",
                          })
                        )}
                      >
                        <IconDownload aria-hidden="true" /> Download PDF
                      </a>
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={(event) =>
                          void readResult(
                            new Blob([current.data!], {
                              type: "application/pdf",
                            }),
                            {
                              title: current.name,
                              subtitle: `${plural(pages, "page")} · ${sizeLabel(current.report.after)} · not yet downloaded`,
                              password: current.password,
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
                    className={cn(
                      "flex items-start gap-2 text-sm",
                      several && "border-t pt-4"
                    )}
                    data-testid="already-small"
                  >
                    <IconInfoCircle
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>
                      {several && (
                        <span className="font-medium break-all">
                          {shown.name}:{" "}
                        </span>
                      )}
                      {alreadySmall(current.mode, current.report.target)}
                    </span>
                  </p>
                ))}
            </>
          )}

          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Files are compressed on your device and are not uploaded.
          </p>
        </section>

        <SettingsCard
          state={
            compressing
              ? "pending"
              : ready.length > 0 && !waiting.length
                ? "done"
                : "idle"
          }
          pendingText="Compressing…"
          doneText="Compressed with these settings"
          changed={changedCount}
          onResetAll={compressing ? undefined : resetAllSettings}
          sticky={false}
        >
          <Section
            title="How much to compress"
            summary={levelSummary(settings)}
            changed={levelChanged(settings)}
            onReset={compressing ? undefined : resetLevel}
          >
            <LevelPanel
              mode={mode}
              onMode={setMode}
              size={size}
              onSize={setSize}
              sizeText={sizeText}
              onSizeText={setSizeText}
              sizeUnit={sizeUnit}
              onSizeUnit={setSizeUnit}
              sizeWrong={mode === "size" && settings.target === null}
              further={further}
              onFurther={setFurther}
              scans={scans}
              onScans={setScans}
              custom={custom}
              onCustom={(change) =>
                setCustom((before) => ({ ...before, ...change }))
              }
              disabled={compressing}
            />
          </Section>
          {ready.length > 0 && (
            <OptionsPanel extras={extras} update={updateExtras} />
          )}
        </SettingsCard>
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-3">
        {shown && current?.data && current.after && (
          <CompareView
            client={client}
            before={shown.id}
            after={current.after}
            pages={pages}
            page={Math.min(page, Math.max(pages - 1, 0))}
            onPage={setPage}
            flagged={current.report.check.low.map((entry) => entry.page)}
            beforeLabel={`Original · ${sizeLabel(shown.size)}`}
            afterLabel={`Compressed · ${sizeLabel(current.report.after)}`}
          />
        )}
        {shown?.status === "ready" && (
          <AuditCard
            title={
              several ? `What makes ${shown.name} big` : "What makes it big"
            }
            audit={shown.audit ?? null}
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
