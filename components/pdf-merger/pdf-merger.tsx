"use client"

import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type DragEvent,
} from "react"
import {
  IconAlertCircle,
  IconArrowsSort,
  IconBookmarks,
  IconDownload,
  IconExternalLink,
  IconFilePlus,
  IconFiles,
  IconFileTypePdf,
  IconLock,
  IconLockOpen,
  IconPlayerStop,
  IconTrash,
} from "@tabler/icons-react"
import { DropZone, FileInput } from "@/components/image-compressor/drop-zone"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { PdfClient } from "@/lib/pdf-merger/client"
import {
  filesReducer,
  mergeStatus,
  noFiles,
  type FilesAction,
  type SortOrder,
} from "@/lib/pdf-merger/files"
import {
  admit,
  defaultSettings,
  describeSize,
  desktopLimits,
  entryName,
  limitsFor,
  looksLikePdf,
  megabytes,
  outputName,
  type Limits,
} from "@/lib/pdf-merger/settings"
import { FileList } from "./file-list"

const INPUT_ID = "pdf-file"
const ACCEPT = "application/pdf,.pdf"
const THUMBNAIL_EDGE = 192
const SAMPLES = ["keepsimp-report.pdf", "keepsimp-appendix.pdf"]

const copy = (limits: Limits) => ({
  heading: "Drop PDFs to merge",
  dropping: "Drop to add these files",
  body: "Add two or more PDF files, put them in order and choose the pages you want. You can also paste with ⌘V or Ctrl+V.",
  inputLabel: "Choose PDF files",
  action: "Choose files",
  limits: `Stays on your device · up to ${limits.files} files, ${megabytes(limits.totalBytes)} together`,
})

interface Result {
  /** What was merged; a different list or setting makes the result out of date. */
  key: string
  url: string
  bytes: number
  pages: number
  bookmarks: number
  /** Bytes of the files that went in, when all of their pages were used; otherwise null. */
  input: number | null
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

export function PdfMerger() {
  const ids = useId()
  const [state, dispatchState] = useReducer(filesReducer, noFiles)
  const [name, setName] = useState(defaultSettings.name)
  const [thumbnails, setThumbnails] = useState<Record<string, ImageBitmap>>({})
  const [notice, setNotice] = useState("")
  const [progress, setProgress] = useState<{
    done: number
    total: number | null
  } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [failure, setFailure] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const [over, setOver] = useState(false)
  // Phones get smaller limits; which device this is, is known once the page runs.
  const [limits, setLimits] = useState(desktopLimits)
  useEffect(() => {
    setLimits(
      limitsFor({
        memory: (navigator as { deviceMemory?: number }).deviceMemory,
        touch: matchMedia("(pointer: coarse)").matches,
      })
    )
  }, [])

  const client = useRef<PdfClient | null>(null)
  const live = useRef(state)
  const counter = useRef(0)
  const cancel = useRef<(() => void) | null>(null)
  const held = useRef({ thumbnails, result })
  useEffect(() => {
    live.current = state
    held.current = { thumbnails, result }
  }, [state, thumbnails, result])

  const dispatch = useCallback((action: FilesAction) => {
    dispatchState(action)
  }, [])

  useEffect(() => {
    const instance = new PdfClient((event) => {
      if (event.type === "opened") {
        dispatch({ type: "opened", id: event.id, facts: event.facts })
        void instance.thumbnail(event.id, 0, THUMBNAIL_EDGE).then((bitmap) => {
          if (!bitmap) return
          // The file may have been removed while its first page was drawn.
          if (!live.current.files.some((file) => file.id === event.id)) {
            bitmap.close()
            return
          }
          setThumbnails((current) => {
            current[event.id]?.close()
            return { ...current, [event.id]: bitmap }
          })
        })
      } else if (event.type === "locked")
        dispatch({ type: "locked", id: event.id, wrong: event.wrong })
      else dispatch({ type: "failed", id: event.id, message: event.message })
    })
    client.current = instance
    return () => {
      instance.dispose()
      client.current = null
      for (const bitmap of Object.values(held.current.thumbnails))
        bitmap.close()
      if (held.current.result) URL.revokeObjectURL(held.current.result.url)
    }
  }, [dispatch])

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const refused: string[] = []
      const pdfs: File[] = []
      for (const file of incoming) {
        const head = new Uint8Array(await file.slice(0, 2048).arrayBuffer())
        // An empty file gets its own message below.
        if (file.size === 0 || looksLikePdf(head)) pdfs.push(file)
        else refused.push(`${file.name} is not a PDF.`)
      }
      const verdicts = admit(live.current.files, pdfs, limits)
      const items = pdfs.flatMap((file, index) => {
        const reason = verdicts[index]
        if (reason) {
          refused.push(`${file.name}: ${reason}`)
          return []
        }
        return [
          {
            id: `pdf-${++counter.current}`,
            file,
            name: file.name,
            size: file.size,
            modified: file.lastModified,
          },
        ]
      })
      setNotice(
        refused.length > 3
          ? `${refused.length} files were left out: they are not PDFs, or are too large.`
          : refused.join(" ")
      )
      if (!items.length) return
      dispatch({ type: "add", items })
      for (const item of items) client.current?.open(item.id, item.file)
    },
    [dispatch, limits]
  )

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

  async function loadSamples() {
    try {
      const files = await Promise.all(
        SAMPLES.map(async (sample) => {
          const response = await fetch(`/samples/${sample}`)
          if (!response.ok) throw new Error("missing")
          return new File([await response.blob()], sample, {
            type: "application/pdf",
          })
        })
      )
      await addFiles(files)
    } catch {
      setNotice("The samples could not be loaded. Add your own PDFs instead.")
    }
  }

  function remove(id: string) {
    dispatch({ type: "remove", id })
    client.current?.close(id)
    setThumbnails((current) => {
      const { [id]: gone, ...rest } = current
      gone?.close()
      return rest
    })
  }

  function clearAll() {
    cancel.current?.()
    for (const file of state.files) client.current?.close(file.id)
    dispatch({ type: "clear" })
    setThumbnails((current) => {
      for (const bitmap of Object.values(current)) bitmap.close()
      return {}
    })
    setResult((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    setNotice("")
    setFailure("")
  }

  function move(id: string, to: number) {
    const file = state.files.find((entry) => entry.id === id)
    dispatch({ type: "move", id, to })
    if (file)
      setAnnouncement(
        `${file.name} is now number ${Math.max(0, Math.min(state.files.length - 1, to)) + 1} of ${state.files.length}.`
      )
  }

  const status = mergeStatus(state.files, limits.pages)
  const names = Object.fromEntries(
    state.files.map((file) => [file.id, entryName(file.name)])
  )
  const key = JSON.stringify([
    status.parts,
    status.parts.map((part) => names[part.id]),
    defaultSettings.bookmarks,
  ])
  const current = result?.key === key ? result : null
  const merging = progress !== null
  const canMerge =
    !merging && !status.reading && !status.problem && status.pages > 0

  function startMerge() {
    if (!client.current || !canMerge) return
    setFailure("")
    setProgress({ done: 0, total: status.pages })
    const forKey = key
    // The sizes can only be compared when every file went in whole.
    const whole = status.parts.every((part) => {
      const file = state.files.find((entry) => entry.id === part.id)
      return file?.facts?.pages === part.pages.length && !file.range.trim()
    })
    const input = whole ? status.bytes : null
    const job = client.current.merge(
      status.parts.map((part) => ({ ...part, name: names[part.id] })),
      defaultSettings.bookmarks,
      (done, total) => setProgress({ done, total })
    )
    cancel.current = job.cancel
    job.promise
      .then((merged) => {
        if (!merged) return
        const blob = new Blob([merged.bytes], { type: "application/pdf" })
        setResult((previous) => {
          if (previous) URL.revokeObjectURL(previous.url)
          return {
            key: forKey,
            url: URL.createObjectURL(blob),
            bytes: blob.size,
            pages: merged.pages,
            bookmarks: merged.bookmarks,
            input,
          }
        })
        setAnnouncement(
          `Merged ${plural(merged.pages, "page")} into one PDF. It is ready to download.`
        )
      })
      .catch((error: Error) => setFailure(error.message))
      .finally(() => {
        cancel.current = null
        setProgress(null)
      })
  }

  const dropHandlers = {
    // Only files from outside count; dragging a row to reorder it does not.
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
      <div className="grid gap-6 lg:grid-cols-5" data-testid="pdf-merger">
        <div className="space-y-3 lg:col-span-3">
          <DropZone
            onFiles={(files) => void addFiles(files)}
            onSample={() => void loadSamples()}
            busy={false}
            copy={copy(limits)}
            inputId={INPUT_ID}
            formats={["PDF", "Locked PDF", "Damaged PDF"]}
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
                  icon: IconFiles,
                  title: "Put files in any order",
                  text: "Drag them, use the arrow buttons, or sort by name or date. Numbers in names sort the way you expect.",
                },
                {
                  icon: IconArrowsSort,
                  title: "Take only the pages you need",
                  text: "Type pages such as 1-3, 7 for each file, turn them, or use the same file twice.",
                },
                {
                  icon: IconLockOpen,
                  title: "Locked and damaged files",
                  text: "Enter a locked file's password to merge it. Damaged files are repaired where possible.",
                },
                {
                  icon: IconBookmarks,
                  title: "Nothing lost on the way",
                  text: "Links, bookmarks, notes, fillable fields and layers are carried into the merged file.",
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

  const used = status.parts.length
  const percent =
    progress && progress.total
      ? Math.round((progress.done / progress.total) * 100)
      : null

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="pdf-merger"
      data-ready={!status.reading || undefined}
      data-merged={current ? "true" : undefined}
    >
      <div
        {...dropHandlers}
        className={cn(
          "min-w-0 space-y-4 rounded-xl lg:col-span-3",
          over && "outline-2 outline-offset-4 outline-primary outline-dashed"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-medium">
            {plural(state.files.length, "file")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <FileInput
                onFiles={(files) => void addFiles(files)}
                label="Add PDF files"
                id={INPUT_ID}
                multiple
                accept={ACCEPT}
              />
              <label
                htmlFor={INPUT_ID}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
                )}
              >
                <IconFilePlus aria-hidden="true" /> Add files
              </label>
            </div>
            <Button variant="outline" onClick={clearAll}>
              <IconTrash aria-hidden="true" /> Clear all
            </Button>
          </div>
        </div>

        {state.files.length > 1 && (
          <ChoiceChips
            label="Sort"
            value={state.order}
            onValueChange={(order: SortOrder | "custom") => {
              if (order !== "custom") dispatch({ type: "sort", order })
            }}
            options={[
              { value: "added", label: "As added" },
              { value: "name", label: "Name A–Z" },
              { value: "name-desc", label: "Name Z–A" },
              { value: "oldest", label: "Oldest first" },
              { value: "newest", label: "Newest first" },
            ]}
            hint={
              state.order === "custom"
                ? "In your own order. Drag a file, or use its arrows, to move it."
                : "Drag a file, or use its arrows, to move it."
            }
          />
        )}

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

        <FileList
          files={state.files}
          thumbnails={thumbnails}
          onMove={move}
          onRange={(id, text) => dispatch({ type: "range", id, text })}
          onRotate={(id) =>
            dispatch({ type: "rotate", id, direction: "right" })
          }
          onAgain={(id) => {
            const file = state.files.find((entry) => entry.id === id)
            if (!file) return
            const reason = admit(state.files, [file], limits)[0]
            if (reason) {
              setNotice(`${file.name}: ${reason}`)
              return
            }
            const newId = `pdf-${++counter.current}`
            dispatch({ type: "again", id, newId })
            client.current?.open(newId, file.file)
          }}
          onRemove={remove}
          onUnlock={(id, password) => {
            const file = state.files.find((entry) => entry.id === id)
            if (!file) return
            dispatch({ type: "unlocking", id })
            client.current?.open(id, file.file, password)
          }}
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
            Merged PDF
          </h2>
          <p className="text-sm text-muted-foreground" data-testid="plan">
            {status.pages > 0
              ? `${plural(status.pages, "page")} from ${plural(used, "file")} · ${sizeLabel(status.bytes)} together`
              : status.reading
                ? "Reading your files…"
                : "No pages to merge yet."}
            {status.leftOut > 0 &&
              ` · ${plural(status.leftOut, "file")} left out`}
          </p>

          {status.problem && (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-destructive"
            >
              <IconAlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {status.problem}
            </p>
          )}

          {merging ? (
            <div className="space-y-3" data-testid="merge-progress">
              <div
                role="progressbar"
                aria-label="Merging"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-[width] duration-150 motion-reduce:transition-none",
                    percent === null &&
                      "animate-pulse motion-reduce:animate-none"
                  )}
                  style={{ width: `${percent ?? 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {progress.total === null
                    ? "Writing the file…"
                    : `Page ${progress.done.toLocaleString("en")} of ${progress.total.toLocaleString("en")}`}
                </p>
                <Button
                  variant="outline"
                  disabled={progress.total === null}
                  onClick={() => cancel.current?.()}
                >
                  <IconPlayerStop aria-hidden="true" /> Cancel
                </Button>
              </div>
            </div>
          ) : current ? (
            <div className="space-y-3">
              <p className="text-sm" data-testid="result-facts">
                <span className="font-medium">
                  {plural(current.pages, "page")} · {sizeLabel(current.bytes)}
                </span>
                <span className="text-muted-foreground">
                  {current.input !== null &&
                    ` · ${describeSize(current.input, current.bytes)}`}
                  {current.bookmarks > 0 &&
                    ` · ${plural(current.bookmarks, "bookmark")}`}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={current.url}
                  download={outputName(name)}
                  className={buttonVariants({ size: "lg" })}
                >
                  <IconDownload aria-hidden="true" /> Download PDF
                </a>
                <a
                  href={current.url}
                  target="_blank"
                  rel="noopener"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  <IconExternalLink aria-hidden="true" /> Open in a new tab
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button size="lg" disabled={!canMerge} onClick={startMerge}>
                <IconFileTypePdf aria-hidden="true" /> Merge PDF
              </Button>
              {result && (
                <p className="text-xs text-muted-foreground">
                  The list changed since the last merge. Merge again to include
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

          <div>
            <label
              htmlFor={`${ids}-name`}
              className="mb-2 block text-sm font-medium"
            >
              File name
            </label>
            <Input
              id={`${ids}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={defaultSettings.name}
              spellCheck={false}
              aria-describedby={`${ids}-name-hint`}
            />
            <p
              id={`${ids}-name-hint`}
              className="mt-2 text-xs text-muted-foreground"
            >
              Saved as{" "}
              <span className="font-mono break-all">{outputName(name)}</span>
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Files are merged on your device and are not uploaded.
          </p>
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4 text-sm sm:p-5">
          <h2 className="font-heading text-base font-medium">What is kept</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Every page as it is: text, pictures, fonts and page sizes.</li>
            <li>Links, notes, fillable fields and layers.</li>
            <li>
              Bookmarks, grouped under each file&apos;s name when there are
              several files.
            </li>
            <li>
              Fonts and pictures that files share are stored once, so the result
              is often smaller than the files together.
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
