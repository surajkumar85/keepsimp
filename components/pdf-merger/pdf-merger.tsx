"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
} from "react"
import {
  IconAlertCircle,
  IconArrowsShuffle,
  IconArrowsSort,
  IconBook2,
  IconBookmarks,
  IconDownload,
  IconExternalLink,
  IconFilePlus,
  IconFiles,
  IconFileTypePdf,
  IconInfoCircle,
  IconLayoutGrid,
  IconLock,
  IconLockOpen,
  IconPlayerStop,
  IconTrash,
} from "@tabler/icons-react"
import { DropZone, FileInput } from "@/components/image-compressor/drop-zone"
import {
  Section,
  SettingsCard,
  ToggleRow,
} from "@/components/image-batch/controls"
import { toast } from "@/components/ui/toast"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import { sizeLabel, sniffFormat } from "@/lib/image-compressor/formats"
import { usePdfReader } from "@/components/pdf/use-pdf-reader"
import { PdfReader } from "@/components/pdf-reader/pdf-reader"
import { PdfClient } from "@/lib/pdf-merger/client"
import {
  filesReducer,
  lockedProblem,
  mergeStatus,
  noFiles,
  pagesProblem,
  type FilesAction,
  type SortOrder,
} from "@/lib/pdf-merger/files"
import {
  alternatePages,
  appendFile,
  derivePages,
  dropFile,
  record,
  redo,
  rewrite,
  startHistory,
  undo,
  type History,
  type PageEntry,
} from "@/lib/pdf-merger/pages"
import type { PictureMargin, PicturePage } from "@/lib/pdf-merger/picture"
import {
  admit,
  defaultSettings,
  describeSize,
  desktopLimits,
  entryName,
  limitsFor,
  limitsReaders,
  looksLikePdf,
  megabytes,
  outputName,
  permissionBits,
  refusal,
  settingsKey,
  settingsProblem,
  type Limits,
  type MergeSettings,
} from "@/lib/pdf-merger/settings"
import { MERGE_GROUPS, pictureSummary } from "@/lib/pdf-merger/summary"
import { changedGroups, resetAll } from "@/lib/settings-groups"
import { FileList } from "./file-list"
import { OutputPanel } from "./output-panel"
import { PageGrid, type GridFile } from "./page-grid"
import { PrintPanel } from "./print-panel"
import { StructurePanel } from "./structure-panel"
import { useHandedFiles } from "@/hooks/use-handed-files"

const INPUT_ID = "pdf-file"
const ACCEPT = "application/pdf,.pdf,image/*,.heic,.heif,.jxl"
const THUMBNAIL_EDGE = 192
/** Pictures of pages kept at once; older ones are let go and drawn again when needed. */
const MAX_THUMBNAILS = 300
const SAMPLES = ["keepsimp-report.pdf", "keepsimp-appendix.pdf"]

const copy = (limits: Limits) => ({
  heading: "Drop PDFs to merge",
  dropping: "Drop to add these files",
  body: "Add PDF files and pictures, put them in order and choose the pages you want. You can also paste with ⌘V or Ctrl+V.",
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
  /** The result asks for a password when opened. */
  locked: boolean
}

/** How pictures become pages, unless chosen otherwise. */
const PICTURES = { page: "previous", margin: "small" } as const

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

export function PdfMerger() {
  const ids = useId()
  const [state, dispatchState] = useReducer(filesReducer, noFiles)
  const [settings, setSettings] = useState<MergeSettings>(defaultSettings)
  const update = useCallback(
    (change: Partial<MergeSettings>) =>
      setSettings((current) => ({ ...current, ...change })),
    []
  )
  const [thumbnails, setThumbnails] = useState<Record<string, ImageBitmap>>({})
  const [view, setView] = useState<"files" | "pages">("files")
  /** The pages as arranged by hand; null while they follow the file list. */
  const [arranged, setArranged] = useState<History<PageEntry[]> | null>(null)
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [picturePage, setPicturePage] = useState<PicturePage>(PICTURES.page)
  const [pictureMargin, setPictureMargin] = useState<PictureMargin>(
    PICTURES.margin
  )
  const [alternating, setAlternating] = useState(false)
  const [reverseLast, setReverseLast] = useState(false)
  const [resetting, setResetting] = useState(false)
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
  const reader = usePdfReader(client)
  const { claims, forget: forgetLayout } = reader
  /** Pictures of pages asked for, oldest first. */
  const asked = useRef<string[]>([])
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
      // The merged file, opened only to be read, is not one of the files to merge.
      if (claims(event)) return
      if (event.type === "opened") {
        dispatch({ type: "opened", id: event.id, facts: event.facts })
        // While pages are arranged by hand, a new file's pages join at the end.
        setArranged(
          (current) =>
            current &&
            rewrite(current, (list) =>
              list.some(
                (entry) => entry.kind === "page" && entry.file === event.id
              )
                ? list
                : appendFile(list, { id: event.id, pages: event.facts.pages })
            )
        )
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
  }, [dispatch, claims])

  /** Ask for the picture of a page, unless it is already there or on its way. */
  const needThumbnail = useCallback((file: string, page: number) => {
    const key = `${file}/${page}`
    if (asked.current.includes(key)) return
    asked.current.push(key)
    // The oldest picture goes first, but never a file's first page: the file list shows those.
    const oldest =
      asked.current.length > MAX_THUMBNAILS
        ? asked.current.findIndex((entry) => !entry.endsWith("/0"))
        : -1
    const evicted = oldest >= 0 ? asked.current.splice(oldest, 1)[0] : undefined
    if (evicted)
      setThumbnails((current) => {
        const { [evicted]: gone, ...rest } = current
        gone?.close()
        return rest
      })
    void client.current
      ?.thumbnail(file, page, THUMBNAIL_EDGE)
      .then((bitmap) => {
        if (!bitmap) return
        // The file may have been removed, or the picture let go, meanwhile.
        if (
          !asked.current.includes(key) ||
          !live.current.files.some((entry) => entry.id === file)
        ) {
          bitmap.close()
          return
        }
        setThumbnails((current) => {
          current[key]?.close()
          return { ...current, [key]: bitmap }
        })
      })
  }, [])

  const forgetThumbnails = useCallback(
    (file?: string) => {
      const mine = (key: string) =>
        file === undefined || key.startsWith(`${file}/`)
      asked.current = asked.current.filter((key) => !mine(key))
      forgetLayout(file)
      setThumbnails((current) => {
        const rest: Record<string, ImageBitmap> = {}
        for (const [key, bitmap] of Object.entries(current))
          if (mine(key)) bitmap.close()
          else rest[key] = bitmap
        return rest
      })
    },
    [forgetLayout]
  )

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const refused: string[] = []
      const pdfs: File[] = []
      const pictures = new Set<File>()
      for (const file of incoming) {
        const head = new Uint8Array(await file.slice(0, 2048).arrayBuffer())
        // An empty file gets its own message below.
        if (file.size === 0 || looksLikePdf(head)) pdfs.push(file)
        else if (sniffFormat(head) === "svg")
          refused.push(
            `${file.name}: SVG cannot be added as a page. Convert it to PNG first.`
          )
        else if (sniffFormat(head)) {
          pdfs.push(file)
          pictures.add(file)
        } else refused.push(refusal(file.name))
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
            picture: pictures.has(file),
          },
        ]
      })
      setNotice(
        refused.length > 3
          ? `${refused.length} files were left out: they are not PDFs or pictures, or are too large.`
          : refused.join(" ")
      )
      if (!items.length) return
      dispatch({ type: "add", items })
      for (const item of items)
        client.current?.open(item.id, item.file, { picture: item.picture })
    },
    [dispatch, limits]
  )
  useHandedFiles((files) => void addFiles(files))

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
    forgetThumbnails(id)
    setArranged(
      (current) => current && rewrite(current, (list) => dropFile(list, id))
    )
    setSelection(new Set())
  }

  function backToFiles() {
    setArranged(null)
    setSelection(new Set())
    setResetting(false)
    setView("files")
  }

  function clearAll() {
    cancel.current?.()
    for (const file of state.files) client.current?.close(file.id)
    dispatch({ type: "clear" })
    forgetThumbnails()
    backToFiles()
    setAlternating(false)
    setResult((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    setNotice("")
    setFailure("")
    // A fresh start: nothing typed for the last result, a password least of all, stays behind.
    setSettings(defaultSettings)
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
  const names = useMemo(
    () =>
      Object.fromEntries(
        state.files.map((file) => [file.id, entryName(file.name)])
      ),
    [state.files]
  )
  // The first page of every file that has been read is drawn for the list.
  useEffect(() => {
    for (const file of state.files)
      if (file.status === "ready") needThumbnail(file.id, 0)
  }, [state.files, needThumbnail])

  const derived = useMemo(
    () => derivePages(state.files, settings.duplex),
    [state.files, settings.duplex]
  )
  const usable = useMemo(
    () =>
      new Set(
        state.files
          .filter((file) => file.status === "ready")
          .map((file) => file.id)
      ),
    [state.files]
  )
  /** The pages of the result: as arranged by hand, or as the file list gives them. */
  const entries = useMemo(
    () =>
      arranged
        ? arranged.present.filter(
            (entry) => entry.kind === "blank" || usable.has(entry.file)
          )
        : derived,
    [arranged, derived, usable]
  )
  const problem =
    (arranged
      ? (lockedProblem(state.files) ??
        pagesProblem(entries.length, limits.pages))
      : status.problem) ?? settingsProblem(settings)
  const usedFiles = new Set(
    entries.flatMap((entry) => (entry.kind === "page" ? [entry.file] : []))
  )
  const hasPictures = state.files.some((file) => file.picture)
  const key = JSON.stringify([
    entries.map((entry) =>
      entry.kind === "blank"
        ? [entry.width, entry.height]
        : [entry.file, entry.page, entry.rotation]
    ),
    [...usedFiles].map((id) => names[id]),
    settingsKey(settings),
    hasPictures && [picturePage, pictureMargin],
  ])
  const current = result?.key === key ? result : null
  const merging = progress !== null
  const canMerge = !merging && !status.reading && !problem && entries.length > 0

  function startMerge() {
    if (!client.current || !canMerge) return
    setFailure("")
    setProgress({ done: 0, total: entries.length })
    const forKey = key
    // The sizes can only be compared when every file went in whole.
    const whole =
      !arranged &&
      status.parts.every((part) => {
        const file = state.files.find((entry) => entry.id === part.id)
        return file?.facts?.pages === part.pages.length && !file.range.trim()
      })
    const input = whole ? status.bytes : null
    const locked = settings.protect
    // Without a second password, limits get a random one that nobody keeps;
    // with no limits, the one password opens everything.
    const random = () =>
      Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("")
    const job = client.current.merge(
      {
        pages: entries.map((entry) =>
          entry.kind === "blank"
            ? { blank: { width: entry.width, height: entry.height } }
            : { file: entry.file, page: entry.page, rotation: entry.rotation }
        ),
        names,
        bookmarks: settings.bookmarks,
        picturePage,
        pictureMargin,
        contents: settings.contents,
        cover: settings.cover,
        forms: settings.forms,
        labels: settings.labels,
        attachments: settings.attachments,
        details: {
          title: settings.title,
          author: settings.author,
          subject: settings.subject,
          keywords: settings.keywords,
        },
        print: {
          duplex: settings.duplex,
          sheet: settings.sheet,
          enlarge: settings.enlarge,
          footerName: settings.footerName,
          numbers: settings.numbers,
          numbersAt: settings.numbersAt,
          numbersFrom: settings.numbersFrom,
        },
        lock: locked
          ? {
              password: settings.password,
              ownerPassword:
                settings.ownerPassword ||
                (limitsReaders(settings) ? random() : settings.password),
              permissions: permissionBits(settings),
            }
          : null,
      },
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
            locked,
          }
        })
        setAnnouncement(
          `Merged ${plural(merged.pages, "page")} into one PDF. It is ready to download.`
        )
        toast.success("Your PDF is ready", {
          description: `${plural(merged.pages, "page")} · ${sizeLabel(blob.size)}`,
        })
      })
      .catch((error: Error) => setFailure(error.message))
      .finally(() => {
        cancel.current = null
        setProgress(null)
      })
  }

  /** A change made in the Pages view; from the first one, pages are arranged by hand. */
  function changePages(next: PageEntry[], announce: string) {
    setArranged((history) => record(history ?? startHistory(derived), next))
    setSelection(
      (chosen) =>
        new Set(
          next.flatMap((entry) => (chosen.has(entry.key) ? [entry.key] : []))
        )
    )
    setAnnouncement(announce)
  }

  function alternate() {
    const groups = [...usable]
      .map((id) =>
        derived.filter((entry) => entry.kind === "page" && entry.file === id)
      )
      .filter((group) => group.length)
    // Files keep the order of the list, not of the set.
    groups.sort((a, b) => derived.indexOf(a[0]) - derived.indexOf(b[0]))
    setArranged(
      record(startHistory(derived), alternatePages(groups, reverseLast))
    )
    setAlternating(false)
    setView("pages")
    setAnnouncement(
      `The pages of ${plural(groups.length, "file")} now take turns. Check them in the Pages view.`
    )
  }

  const gridFiles = useMemo(
    () =>
      Object.fromEntries(
        state.files.flatMap((file) =>
          file.facts
            ? [
                [
                  file.id,
                  {
                    name: file.name,
                    picture: Boolean(file.facts.picture),
                    width: file.facts.width,
                    height: file.facts.height,
                  } satisfies GridFile,
                ],
              ]
            : []
        )
      ),
    [state.files]
  )
  const describe = (entry: PageEntry) =>
    entry.kind === "blank"
      ? "Blank page"
      : gridFiles[entry.file]?.picture
        ? gridFiles[entry.file].name
        : `${gridFiles[entry.file]?.name ?? "A file"}, page ${entry.page + 1}`
  /** Read one file from its first page to its last, as it stands in the list. */
  function readFile(id: string, from: HTMLElement) {
    const file = state.files.find((entry) => entry.id === id)
    if (!file || file.status !== "ready" || !file.facts) return
    void reader.readFile(
      {
        id,
        name: file.name,
        subtitle: file.picture
          ? `Picture · ${sizeLabel(file.size)}`
          : `${plural(file.facts.pages, "page")} · ${sizeLabel(file.size)}`,
        rotation: file.rotation,
        picture: file.picture,
      },
      from
    )
  }

  /** Read the pages as they will be merged, starting at one of them. */
  function readPages(startKey: string) {
    void reader.readPages(
      "The merged pages, as arranged",
      entries.map((entry) =>
        entry.kind === "blank"
          ? {
              key: entry.key,
              blank: { width: entry.width, height: entry.height },
            }
          : {
              key: entry.key,
              file: entry.file,
              page: entry.page,
              rotation: entry.rotation,
              label: describe(entry),
            }
      ),
      startKey,
      // The page's tile has focus, whether it was clicked or reached with the keys.
      document.activeElement as HTMLElement | null
    )
  }

  /** Read the merged file itself, before it is downloaded. */
  async function readResult(from: HTMLElement) {
    if (!current) return
    const merged = current
    const blob = await (await fetch(merged.url)).blob()
    void reader.readResult(
      blob,
      {
        title: outputName(settings.name),
        subtitle: `${plural(merged.pages, "page")} · ${sizeLabel(merged.bytes)} · not yet downloaded`,
        // The result is current, so the password is the one in the settings.
        password: merged.locked ? settings.password : undefined,
        label: (page) => `Page ${page} of the merged file`,
        failure:
          "The merged file could not be shown. You can still download it.",
      },
      from
    )
  }

  /** The details of the first file that has any, to take over with one press. */
  const firstFacts = state.files.find(
    (file) =>
      file.facts &&
      (file.facts.title ||
        file.facts.author ||
        file.facts.subject ||
        file.facts.keywords)
  )?.facts
  const firstDetails = firstFacts
    ? {
        title: firstFacts.title,
        author: firstFacts.author,
        subject: firstFacts.subject,
        keywords: firstFacts.keywords,
      }
    : null

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
            formats={[
              "PDF",
              "Locked PDF",
              "JPG",
              "PNG",
              "WebP",
              "HEIC",
              "AVIF",
              "TIFF",
            ]}
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
                  title: "Arrange single pages",
                  text: "Type pages such as 1-3, 7 for each file, or open the Pages view to drag, turn, copy and remove single pages.",
                },
                {
                  icon: IconLockOpen,
                  title: "Locked files, damaged files and pictures",
                  text: "Enter a locked file's password to merge it. Damaged files are repaired where possible, and pictures become pages.",
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

  const used = usedFiles.size
  const picturesChanged =
    picturePage !== PICTURES.page || pictureMargin !== PICTURES.margin
  const changedCount =
    changedGroups(settings, defaultSettings, MERGE_GROUPS).length +
    (hasPictures && picturesChanged ? 1 : 0)
  // The file name is not a setting of the result's content, so it stays as typed.
  const resetAllSettings = () => {
    update(resetAll(defaultSettings, MERGE_GROUPS))
    setPicturePage(PICTURES.page)
    setPictureMargin(PICTURES.margin)
    toast.info("Settings put back to the usual")
  }
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
      data-settled={!status.reading && !merging ? "true" : undefined}
      data-view={view}
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

        <ChoiceChips
          label="View"
          hideLabel
          value={view}
          onValueChange={(next: "files" | "pages") => {
            setView(next)
            setAlternating(false)
            setResetting(false)
          }}
          options={[
            {
              value: "files",
              label: "Files",
              icon: <IconFiles aria-hidden="true" />,
            },
            {
              value: "pages",
              label: `Pages${entries.length ? ` (${entries.length.toLocaleString("en")})` : ""}`,
              icon: <IconLayoutGrid aria-hidden="true" />,
              disabled: entries.length === 0,
            },
          ]}
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

        {arranged && (
          <div
            className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm"
            data-testid="arranged-note"
          >
            <p className="flex items-start gap-2">
              <IconInfoCircle
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span>
                Pages are in your own order, set in the Pages view.
                {view === "files" &&
                  " The files below show where they come from; their order and page fields no longer change the result."}
              </span>
            </p>
            {resetting ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>This puts every file&apos;s pages back together.</span>
                <Button variant="outline" onClick={backToFiles}>
                  Discard my page order
                </Button>
                <Button variant="ghost" onClick={() => setResetting(false)}>
                  Keep it
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setResetting(true)}>
                Start again from the files
              </Button>
            )}
          </div>
        )}

        {view === "files" && !arranged && state.files.length > 1 && (
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

        {view === "files" && !arranged && usable.size > 1 && (
          <div className="space-y-3">
            {alternating ? (
              <div
                className="space-y-3 rounded-lg border bg-card p-3"
                data-testid="alternate"
              >
                <p className="text-sm">
                  Takes the first page of each file, then the second of each,
                  and so on. Use it to join the fronts and backs of pages that
                  were scanned as two files.
                </p>
                <ToggleRow
                  label="The last file is in reverse order"
                  hint="As it is when a stack is turned over to scan the backs."
                  checked={reverseLast}
                  onCheckedChange={setReverseLast}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={alternate}>Alternate the pages</Button>
                  <Button variant="ghost" onClick={() => setAlternating(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setAlternating(true)}>
                <IconArrowsShuffle aria-hidden="true" /> Alternate pages
              </Button>
            )}
          </div>
        )}

        {view === "files" ? (
          <FileList
            files={state.files}
            thumbnails={thumbnails}
            arranged={arranged !== null}
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
              client.current?.open(newId, file.file, { picture: file.picture })
            }}
            onRemove={remove}
            onRead={readFile}
            onUnlock={(id, password) => {
              const file = state.files.find((entry) => entry.id === id)
              if (!file) return
              dispatch({ type: "unlocking", id })
              client.current?.open(id, file.file, { password })
            }}
          />
        ) : (
          <PageGrid
            entries={entries}
            files={gridFiles}
            thumbs={thumbnails}
            onNeed={needThumbnail}
            selection={selection}
            onSelection={setSelection}
            onChange={changePages}
            onPreview={readPages}
            onUndo={() => {
              // Undoing the first change leaves the pages as the files give
              // them, so the file list sets the result again.
              setArranged((history) => {
                const back = history && undo(history)
                return back?.past.length ? back : null
              })
              setAnnouncement("Undone.")
            }}
            onRedo={() => {
              setArranged((history) => history && redo(history))
              setAnnouncement("Done again.")
            }}
            canUndo={Boolean(arranged?.past.length)}
            canRedo={Boolean(arranged?.future.length)}
            newKey={() => `made-${++counter.current}`}
          />
        )}
        <PdfReader
          reading={reader.reading}
          source={reader.source}
          onClose={reader.close}
          returnTo={reader.opener}
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
            {entries.length > 0
              ? `${plural(entries.length, "page")} from ${plural(used, "file")}${arranged ? ", in your own order" : ` · ${sizeLabel(status.bytes)} together`}`
              : status.reading
                ? "Reading your files…"
                : "No pages to merge yet."}
            {status.leftOut > 0 &&
              ` · ${plural(status.leftOut, "file")} left out`}
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
                  {current.locked && " · locked with your password"}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={current.url}
                  download={outputName(settings.name)}
                  className={buttonVariants({ size: "lg" })}
                  onClick={() =>
                    toast.info("Download started", {
                      description: outputName(settings.name),
                    })
                  }
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
                <Button
                  variant="outline"
                  size="lg"
                  onClick={(event) => void readResult(event.currentTarget)}
                >
                  <IconBook2 aria-hidden="true" /> Read it here
                </Button>
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
              value={settings.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder={defaultSettings.name}
              spellCheck={false}
              aria-describedby={`${ids}-name-hint`}
            />
            <p
              id={`${ids}-name-hint`}
              className="mt-2 text-xs text-muted-foreground"
            >
              Saved as{" "}
              <span className="font-mono break-all">
                {outputName(settings.name)}
              </span>
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Files are merged on your device and are not uploaded.
          </p>
        </section>

        <SettingsCard
          state={merging ? "pending" : current ? "done" : "idle"}
          pendingText="Merging your PDF…"
          doneText="Merged with these settings"
          changed={changedCount}
          onResetAll={merging ? undefined : resetAllSettings}
          sticky={false}
        >
          <StructurePanel
            settings={settings}
            update={update}
            forms={state.files.some((file) => file.facts?.forms)}
            attachments={state.files.reduce(
              (sum, file) => sum + (file.facts?.attachments ?? 0),
              0
            )}
          />

          {hasPictures && (
            <div
              className="border-t first:border-t-0"
              data-testid="picture-options"
            >
              <Section
                title="Pictures as pages"
                summary={pictureSummary(picturePage, pictureMargin)}
                changed={picturesChanged}
                onReset={() => {
                  setPicturePage(PICTURES.page)
                  setPictureMargin(PICTURES.margin)
                }}
              >
                <ChoiceChips
                  label="Page size"
                  value={picturePage}
                  onValueChange={setPicturePage}
                  options={[
                    { value: "previous", label: "Like the page before" },
                    { value: "fit", label: "Fit the picture" },
                    { value: "a4", label: "A4" },
                    { value: "letter", label: "Letter" },
                  ]}
                  hint={
                    picturePage === "previous"
                      ? "A picture takes the size of the page before it, or A4 when none comes before. The sheet is turned to suit the picture."
                      : picturePage === "fit"
                        ? "The page is exactly as large as the picture, at 150 pixels to the inch."
                        : "The sheet is turned to suit the picture."
                  }
                />
                {picturePage !== "fit" && (
                  <ChoiceChips
                    label="Margin"
                    value={pictureMargin}
                    onValueChange={setPictureMargin}
                    options={[
                      { value: "none", label: "None" },
                      { value: "small", label: "Small" },
                      { value: "normal", label: "Normal" },
                    ]}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  JPEG photographs go in as they are, without being compressed
                  again. See-through parts of other pictures become white.
                </p>
              </Section>
            </div>
          )}

          <PrintPanel
            settings={settings}
            update={update}
            arranged={arranged !== null}
          />

          <OutputPanel
            settings={settings}
            update={update}
            first={firstDetails}
          />

          <Section
            title="What is kept"
            summary="Pages, links, notes, fields and layers"
            defaultOpen={false}
          >
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Every page as it is: text, pictures, fonts and page sizes.
              </li>
              <li>Links, notes, fillable fields and layers.</li>
              <li>Bookmarks, organised the way you choose above.</li>
              <li>
                Fonts and pictures that files share are stored once, so the
                result is often smaller than the files together.
              </li>
            </ul>
          </Section>
        </SettingsCard>
      </div>
    </div>
  )
}
