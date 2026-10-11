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
  IconBook2,
  IconBookmarks,
  IconDownload,
  IconFilePlus,
  IconFileTypePdf,
  IconFileZip,
  IconLock,
  IconPlayerStop,
  IconScissors,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react"
import { DropZone, FileInput } from "@/components/image-compressor/drop-zone"
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
import { parseRanges } from "@/lib/pdf-merger/ranges"
import { looksLikePdf, megabytes } from "@/lib/pdf-merger/settings"
import {
  deepestLevel,
  headingsAt,
  headingsOf,
  type FrontChoice,
} from "@/lib/pdf-splitter/bookmarks"
import { noFiles, splitReducer, type SplitFile } from "@/lib/pdf-splitter/files"
import {
  folderNames,
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
  type Part,
  type SplitMode,
} from "@/lib/pdf-splitter/parts"
import {
  admitFiles,
  givesOneFile,
  nothingToWrite,
  pagesProblem,
  patternFor,
  planFor,
  sizeKey,
  splitKey,
  typedCount,
  withOverrides,
  type PlannedPart,
} from "@/lib/pdf-splitter/settings"
import { limitBytes, UNIT_BYTES, type SizeUnit } from "@/lib/pdf-splitter/size"
import { FileRows, type FileSummary } from "./file-rows"
import { PageBoard } from "./page-board"
import { MOST_ROWS, PartsList, type WrittenPart } from "./parts-list"
import { RulesPanel, type SizeChoice } from "./rules-panel"

const INPUT_ID = "split-file"
const ACCEPT = "application/pdf,.pdf"
const SAMPLE = "keepsimp-report.pdf"

interface Result {
  /** What was split; a different plan makes the result out of date. */
  key: string
  parts: (WrittenPart & { number: number; data: ArrayBuffer })[]
  /** For a split by size: the pages each part came to hold. */
  sized?: Part[]
}

/** A file with everything that follows from what is chosen for it. */
interface FileView {
  file: SplitFile
  /** Its pages, once it has been read. */
  count: number
  parts: PlannedPart[]
  /** The file name of each part, by its place in `parts`. */
  names: string[]
  /** Why it cannot be split as things stand; null when it can. */
  problem: string | null
  key: string
  /** Its result, when that was made from what is chosen now. */
  current: Result | null
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

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
    value: "bookmarks",
    label: "By bookmarks",
    hint: "Each bookmark of a level starts a part, named after it.",
  },
  {
    value: "size",
    label: "By size",
    hint: "Parts that each stay under a size, for email and uploads.",
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
  const [state, dispatch] = useReducer(splitReducer, noFiles)
  const [mode, setMode] = useState<SplitMode>("cuts")
  const [every, setEvery] = useState("2")
  const [equal, setEqual] = useState("2")
  const [ranges, setRanges] = useState("")
  /** The pages field while it is being typed in; null when it follows the selection. */
  const [typedPages, setTypedPages] = useState<string | null>(null)
  const [level, setLevel] = useState(1)
  const [filter, setFilter] = useState("")
  const [front, setFront] = useState<FrontChoice>("own")
  const [size, setSize] = useState<SizeChoice>("10")
  const [sizeText, setSizeText] = useState("15")
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("MB")
  const [pattern, setPattern] = useState("")
  const [notice, setNotice] = useState("")
  const [progress, setProgress] = useState<{
    /** Which file is being split, from 1, of how many. */
    file: number
    files: number
    name: string
    done: number
    total: number
    /** Parts of this file that have arrived. */
    parts: number
    /** How many parts this file will have; null when that is not yet known. */
    of: number | null
  } | null>(null)
  const [results, setResults] = useState<Readonly<Record<string, Result>>>({})
  const [failure, setFailure] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const [zipping, setZipping] = useState(false)
  const [over, setOver] = useState(false)
  /** The file the reader is showing, where a cut can be placed while reading. */
  const [readingSource, setReadingSource] = useState<string | null>(null)
  const limits = useDeviceLimits()

  const client = useRef<PdfClient | null>(null)
  const counter = useRef(0)
  const cancel = useRef<(() => void) | null>(null)
  /** Where a Shift-click selection started. */
  const anchor = useRef(0)
  /** The page that has the keyboard on the board, counted from 0. */
  const focused = useRef(0)
  /** Addresses made for parts, by file, to be given back when the parts go. */
  const urls = useRef(new Map<string, string[]>())
  /** Files whose bookmarks have been asked for. */
  const asked = useRef(new Set<string>())
  const reader = usePdfReader(client)
  const { pictures, need, forget } = usePagePictures(client)
  const { claims, forget: forgetLayout, readFile, readResult } = reader

  const onFocused = useCallback((page: number) => {
    focused.current = page
  }, [])

  useEffect(() => {
    const instance = new PdfClient((event) => {
      // A part opened only to be read is not a file to split.
      if (claims(event)) return
      if (event.type === "opened")
        dispatch({ type: "opened", id: event.id, facts: event.facts })
      else if (event.type === "locked")
        dispatch({ type: "locked", id: event.id, wrong: event.wrong })
      else dispatch({ type: "failed", id: event.id, message: event.message })
    })
    client.current = instance
    const made = urls.current
    return () => {
      instance.dispose()
      client.current = null
      for (const list of made.values())
        for (const url of list) URL.revokeObjectURL(url)
    }
  }, [claims])

  /** Let go of a file's result; with no file, of every result. */
  const dropResult = useCallback((id?: string) => {
    for (const [file, list] of urls.current) {
      if (id !== undefined && file !== id) continue
      for (const url of list) URL.revokeObjectURL(url)
      urls.current.delete(file)
    }
    setResults((before) => {
      if (id === undefined) return {}
      const { [id]: gone, ...rest } = before
      return gone ? rest : before
    })
  }, [])

  const live = useRef(state)
  useEffect(() => {
    live.current = state
  })

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
      const verdicts = admitFiles(live.current.files, sniffed, limits)
      const refused = verdicts.filter((verdict) => verdict !== null)
      setNotice(
        refused.length > 3
          ? `${refused.length} files were left out: they are not PDFs, or are too large.`
          : refused.join(" ")
      )
      const items = sniffed.flatMap(({ file, name, size }, index) =>
        verdicts[index]
          ? []
          : [{ id: `split-${++counter.current}`, file, name, size }]
      )
      if (!items.length) return
      dispatch({ type: "add", items })
      for (const item of items) client.current?.open(item.id, item.file)
    },
    [limits]
  )

  const removeFile = useCallback(
    (id: string) => {
      client.current?.close(id)
      forget(id)
      forgetLayout(id)
      asked.current.delete(id)
      dropResult(id)
      dispatch({ type: "remove", id })
    },
    [dropResult, forget, forgetLayout]
  )

  function clearAll() {
    cancel.current?.()
    for (const file of state.files) {
      client.current?.close(file.id)
      forgetLayout(file.id)
    }
    asked.current.clear()
    forget()
    dropResult()
    dispatch({ type: "clear" })
    setRanges("")
    setTypedPages(null)
    setFilter("")
    setNotice("")
    setFailure("")
    focused.current = 0
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

  // The first page of every file is drawn for its row, and its bookmarks are read.
  useEffect(() => {
    for (const file of state.files) {
      if (file.status !== "ready") continue
      need(file.id, 0)
      if (asked.current.has(file.id)) continue
      asked.current.add(file.id)
      void client.current?.layout(file.id).then((layout) => {
        if (layout)
          dispatch({
            type: "headings",
            id: file.id,
            headings: headingsOf(layout.bookmarks),
          })
      })
    }
  }, [state.files, need])

  const limit =
    size === "custom"
      ? limitBytes(sizeText, sizeUnit)
      : Number(size) * UNIT_BYTES.MB
  const usedPattern = pattern.trim() || patternFor(mode)

  const views = useMemo<FileView[]>(
    () =>
      state.files.map((file) => {
        const count = file.status === "ready" ? (file.facts?.pages ?? 0) : 0
        const key = mode === "size" ? sizeKey(file.id, limit ?? 0) : null
        const sized =
          key && results[file.id]?.key === key
            ? results[file.id].sized
            : undefined
        const plan = planFor(
          {
            mode,
            cuts: file.cuts.present,
            ranges,
            selected: file.selected,
            headings: file.headings,
            level,
            filter,
            front,
            unticked: file.unticked,
            sized,
          },
          count
        )
        const parts =
          "parts" in plan
            ? withOverrides(mode, plan.parts, file.names, file.skipped)
            : []
        const problem =
          file.status !== "ready"
            ? null
            : (pagesProblem(count, limits.pages) ??
              ("problem" in plan ? plan.problem : null) ??
              (mode === "size"
                ? limit === null
                  ? "Type a size of at least 10 KB."
                  : null
                : nothingToWrite(parts)))
        const ownKey = key ?? splitKey(file.id, parts)
        return {
          file,
          count,
          parts,
          names: partNames(
            parts,
            usedPattern,
            file.name,
            count,
            parts.map((part) => part.typed)
          ),
          problem,
          key: ownKey,
          current: results[file.id]?.key === ownKey ? results[file.id] : null,
        }
      }),
    [
      state.files,
      mode,
      ranges,
      level,
      filter,
      front,
      limit,
      limits.pages,
      usedPattern,
      results,
    ]
  )

  const shown = views.find((view) => view.file.id === state.active) ?? null
  const several = state.files.length > 1
  const reading = state.files.some((file) => file.status === "reading")
  /** Files that can be split as things stand. */
  const workable = views.filter(
    (view) => view.file.status === "ready" && !view.problem
  )
  const wrongPattern = patternProblem(pattern)
  const splitting = progress !== null
  const done = workable.length > 0 && workable.every((view) => view.current)
  const canSplit =
    !splitting && !reading && workable.length > 0 && !wrongPattern
  const one = givesOneFile(mode)

  /** Every part that is written and up to date, with the name it has now. */
  const finished = useMemo(
    () =>
      views.flatMap((view) =>
        (view.current && !view.problem ? view.current.parts : []).map(
          (part) => ({
            ...part,
            file: view.file.id,
            name: view.names[part.number - 1] ?? `part-${part.number}.pdf`,
          })
        )
      ),
    [views]
  )

  const summaries = useMemo(() => {
    const found: Record<string, FileSummary> = {}
    for (const view of views)
      found[view.file.id] = view.problem
        ? { text: `${view.problem} It is left out.`, problem: true }
        : {
            text:
              mode === "size" && !view.current
                ? "Parts are worked out when it is split"
                : one
                  ? "One new file"
                  : plural(
                      view.parts.filter((part) => !part.skipped).length,
                      "part"
                    ),
            problem: false,
          }
    return found
  }, [views, mode, one])

  async function startSplit() {
    const instance = client.current
    if (!instance || !canSplit) return
    const jobs = workable.filter((view) => !view.current)
    const failures: string[] = []
    let stopped = false
    let made = 0
    setFailure("")
    for (const [index, view] of jobs.entries()) {
      const { file } = view
      dropResult(file.id)
      const list = view.parts.filter((part) => !part.skipped)
      const total =
        mode === "size"
          ? view.count
          : list.reduce((sum, part) => sum + part.pages.length, 0)
      const about = {
        file: index + 1,
        files: jobs.length,
        name: file.name,
        of: mode === "size" ? null : list.length,
      }
      setProgress({ ...about, done: 0, total, parts: 0 })
      // Parts are gathered here and shown together: thousands of small parts
      // would otherwise redraw the page thousands of times.
      const arrived: Result["parts"] = []
      const sized: Part[] = []
      const onProgress = (pages: number, all: number) =>
        setProgress({
          ...about,
          done: pages,
          total: all,
          parts: arrived.length,
        })
      const job =
        mode === "size"
          ? instance.splitBySize(
              file.id,
              limit!,
              (part) => {
                sized.push({
                  pages: Array.from(
                    { length: part.pages },
                    (_, at) => part.start! + at
                  ),
                })
                arrived.push({
                  number: part.index + 1,
                  data: part.bytes,
                  url: "",
                  bytes: part.bytes.byteLength,
                  pages: part.pages,
                  over: part.over,
                })
              },
              onProgress
            )
          : instance.split(
              file.id,
              list.map((part) => part.pages),
              (part) =>
                arrived.push({
                  number: list[part.index].number,
                  data: part.bytes,
                  // An address is made below, and only for parts that get a row.
                  url: "",
                  bytes: part.bytes.byteLength,
                  pages: part.pages,
                }),
              onProgress
            )
      cancel.current = () => {
        stopped = true
        job.cancel()
      }
      let complete = false
      try {
        complete = await job.promise
      } catch (error) {
        failures.push(
          jobs.length > 1
            ? `${file.name}: ${(error as Error).message}`
            : (error as Error).message
        )
        continue
      }
      if (!complete || stopped) break
      // Making an address for a file costs a browser real time, so only the
      // parts that are listed get one; the rest are in the ZIP.
      const mine: string[] = []
      for (const part of arrived.slice(0, MOST_ROWS)) {
        part.url = URL.createObjectURL(
          new Blob([part.data], { type: "application/pdf" })
        )
        mine.push(part.url)
      }
      urls.current.set(file.id, mine)
      setResults((before) => ({
        ...before,
        [file.id]: {
          key: view.key,
          parts: arrived,
          sized: mode === "size" ? sized : undefined,
        },
      }))
      made += arrived.length
    }
    cancel.current = null
    setProgress(null)
    setFailure(failures.join(" "))
    setAnnouncement(
      stopped
        ? jobs.length > 1
          ? "Stopped. The file being split was not kept."
          : "Stopped. Nothing was kept."
        : failures.length && !made
          ? ""
          : made === 1
            ? "The new file is ready to download."
            : `Split into ${plural(made, "part")}. They are ready to download.`
    )
  }

  async function downloadAll() {
    setZipping(true)
    try {
      // Let "Making the ZIP…" be shown before the work begins.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const sources = views.filter((view) => view.current && !view.problem)
      const folders = folderNames(sources.map((view) => view.file.name))
      const folderOf = new Map(
        sources.map((view, index) => [view.file.id, folders[index]])
      )
      const zip = createZip(
        finished.map((part) => ({
          name:
            sources.length > 1
              ? `${folderOf.get(part.file)}/${part.name}`
              : part.name,
          data: new Uint8Array(part.data),
        }))
      )
      const url = URL.createObjectURL(
        new Blob([zip], { type: "application/zip" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = zipName(sources.map((view) => view.file.name))
      link.click()
      // The browser has taken the file by the time this runs.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setFailure("The ZIP could not be made. Download the parts one at a time.")
    } finally {
      setZipping(false)
    }
  }

  /** The file that is shown, as it is now, for handlers that must not change. */
  const now = useRef({
    id: shown?.file.id ?? null,
    cuts: shown?.file.cuts.present ?? [],
    selected: shown?.file.selected ?? new Set<number>(),
    count: shown?.count ?? 0,
  })
  useEffect(() => {
    now.current = {
      id: shown?.file.id ?? null,
      cuts: shown?.file.cuts.present ?? [],
      selected: shown?.file.selected ?? new Set<number>(),
      count: shown?.count ?? 0,
    }
  })

  const cutIn = useCallback((id: string, after: number) => {
    const file = live.current.files.find((entry) => entry.id === id)
    const count = file?.facts?.pages ?? 0
    if (!file) return
    const next = toggleCut(file.cuts.present, after, count)
    dispatch({ type: "cut", id, cuts: next })
    setAnnouncement(
      `${next.includes(after) ? "Cut" : "Removed the cut"} after page ${after + 1}. ${plural(next.length + 1, "part")}.`
    )
  }, [])
  const cut = useCallback(
    (after: number) => {
      if (now.current.id) cutIn(now.current.id, after)
    },
    [cutIn]
  )
  const select = useCallback((page: number, span: boolean) => {
    const { id, selected } = now.current
    if (!id) return
    dispatch({
      type: "select",
      id,
      selected: span
        ? selectSpan(selected, anchor.current, page)
        : toggleSelected(selected, page),
    })
    anchor.current = page
    setTypedPages(null)
  }, [])
  const nameTyped = useCallback((key: string, name: string) => {
    if (now.current.id)
      dispatch({ type: "name", id: now.current.id, key, name })
  }, [])
  const skip = useCallback((key: string, skipped: boolean) => {
    if (now.current.id)
      dispatch({ type: "skip", id: now.current.id, key, skipped })
  }, [])
  const needPage = useCallback(
    (page: number) => {
      if (now.current.id) need(now.current.id, page)
    },
    [need]
  )

  /** Open a file in the reader, and show its pages on the board as well. */
  const readSource = useCallback(
    (id: string, page: number, from: HTMLElement | null) => {
      const file = live.current.files.find((entry) => entry.id === id)
      if (!file || file.status !== "ready" || !file.facts) return
      dispatch({ type: "activate", id })
      setReadingSource(id)
      void readFile(
        {
          id,
          name: file.name,
          subtitle: `${plural(file.facts.pages, "page")} · ${sizeLabel(file.size)}`,
        },
        from,
        page
      )
    },
    [readFile]
  )
  const readRow = useCallback(
    (id: string, from: HTMLElement) =>
      readSource(id, id === now.current.id ? focused.current : 0, from),
    [readSource]
  )
  const readPage = useCallback(
    (page: number, from: HTMLElement) => {
      if (now.current.id) readSource(now.current.id, page, from)
    },
    [readSource]
  )
  const written = useMemo(
    () =>
      new Map(
        (shown?.current && !shown.problem ? shown.current.parts : []).map(
          (part) => [part.number, part]
        )
      ),
    [shown]
  )
  const shownNames = shown?.names
  const readPart = useCallback(
    (number: number, from: HTMLElement) => {
      const part = written.get(number)
      const name = shownNames?.[number - 1]
      if (!part || !name) return
      setReadingSource(null)
      void readResult(
        new Blob([part.data], { type: "application/pdf" }),
        {
          title: name,
          subtitle: `${plural(part.pages, "page")} · ${sizeLabel(part.bytes)} · not yet downloaded`,
          label: (page) => `Page ${page} of ${name}`,
          failure: "This part could not be shown. You can still download it.",
        },
        from
      )
    },
    [written, shownNames, readResult]
  )
  const show = useCallback((id: string) => {
    dispatch({ type: "activate", id })
    focused.current = 0
    anchor.current = 0
    setTypedPages(null)
  }, [])
  const unlock = useCallback((id: string, password: string) => {
    const file = live.current.files.find((entry) => entry.id === id)
    if (!file) return
    dispatch({ type: "unlocking", id })
    client.current?.open(id, file.file, { password })
  }, [])

  const membership = useMemo(
    () => partsOfPages(shown?.parts ?? [], shown?.count ?? 0),
    [shown]
  )
  const leftOut = useMemo(
    () =>
      new Set(
        (shown?.parts ?? []).flatMap((part, index) =>
          part.skipped ? [index] : []
        )
      ),
    [shown]
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
      void addFiles(Array.from(event.dataTransfer.files))
    },
  }

  if (!state.files.length)
    return (
      <div className="grid gap-6 lg:grid-cols-5" data-testid="pdf-splitter">
        <div className="space-y-3 lg:col-span-3">
          <DropZone
            onFiles={(files) => void addFiles(files)}
            onSample={() => void loadSample()}
            busy={false}
            inputId={INPUT_ID}
            copy={{
              heading: "Drop PDFs to split",
              dropping: "Drop to open these files",
              body: "Add one PDF or several, then cut them into parts, take pages out or remove them. You can also paste with ⌘V or Ctrl+V.",
              inputLabel: "Choose PDF files",
              action: "Choose files",
              limits: `Stays on your device · up to ${limits.files} files, ${megabytes(limits.totalBytes)} together`,
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
                  text: "Every page is shown. Press between two pages to cut there, or cut every few pages, into equal parts, at bookmarks or by size.",
                },
                {
                  icon: IconStack2,
                  title: "Take pages out, or leave them out",
                  text: "Select pages to save them as one new file, or to remove them from the file.",
                },
                {
                  icon: IconBook2,
                  title: "Read before you cut",
                  text: "Open a file in the reader to find the right place, search it, and cut after the page you are on.",
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
  const count = shown?.count ?? 0
  const everyCount = typedCount(every, 5000)
  const equalCount = typedCount(equal, 5000)
  const hint = MODES.find((entry) => entry.value === mode)!.hint
  const allHeadings = shown?.file.headings ?? []
  const listed = headingsAt(allHeadings, level, filter)
  const firstTicked = listed.find(
    (heading) => !shown?.file.unticked.has(heading.page)
  )
  const pagesField =
    typedPages ?? selectionText(shown?.file.selected ?? new Set())
  const pagesRead =
    typedPages !== null && typedPages.trim()
      ? parseRanges(typedPages, Math.max(count, 1))
      : null
  const toWrite = (shown?.parts ?? []).filter((part) => !part.skipped)
  const totalBytes = finished.reduce((sum, part) => sum + part.bytes, 0)
  const sourceBytes = views
    .filter((view) => view.current && !view.problem)
    .reduce((sum, view) => sum + view.file.size, 0)
  const outdated =
    !done && Object.keys(results).length > 0 && workable.length > 0
  /** What stands in the way, said once in the result card. */
  const problem =
    wrongPattern ??
    (reading
      ? null
      : workable.length
        ? null
        : several
          ? "None of the files can be split as things stand. Each file's row says why."
          : (shown?.problem ?? null))

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="pdf-splitter"
      data-ready={reading ? undefined : "true"}
      data-split={done ? "true" : undefined}
      data-parts={shown?.parts.length ?? 0}
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
                disabled={splitting}
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
          summaries={summaries}
          onShow={show}
          onRead={readRow}
          onRemove={removeFile}
          onUnlock={unlock}
          disabled={splitting}
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

        {state.files.some((file) => file.status === "ready") && (
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

            <RulesPanel
              mode={mode}
              count={count}
              several={several}
              every={every}
              onEvery={setEvery}
              everyCount={everyCount}
              onPlaceEvery={() => {
                if (!everyCount) return
                dispatch({
                  type: "cut-all",
                  rule: (pages) => cutsEvery(pages, everyCount),
                })
                setAnnouncement(
                  `Cut after every ${plural(everyCount, "page")}. ${plural(cutsEvery(count, everyCount).length + 1, "part")}.`
                )
              }}
              equal={equal}
              onEqual={setEqual}
              equalCount={equalCount}
              onPlaceEqual={() => {
                if (!equalCount) return
                dispatch({
                  type: "cut-all",
                  rule: (pages) => cutsEqual(pages, equalCount),
                })
                setAnnouncement(`Cut into ${plural(equalCount, "equal part")}.`)
              }}
              onEachPage={() => {
                dispatch({
                  type: "cut-all",
                  rule: (pages) => cutsEvery(pages, 1),
                })
                setAnnouncement(
                  `Every page is a part of its own. ${plural(count, "part")}.`
                )
              }}
              onClearCuts={() => {
                dispatch({ type: "cut-all", rule: () => [] })
                setAnnouncement("Removed every cut.")
              }}
              hasCuts={state.files.some((file) => file.cuts.present.length > 0)}
              canUndo={Boolean(shown?.file.cuts.past.length)}
              canRedo={Boolean(shown?.file.cuts.future.length)}
              onUndo={() => {
                if (shown) dispatch({ type: "undo", id: shown.file.id })
                setAnnouncement("Undone.")
              }}
              onRedo={() => {
                if (shown) dispatch({ type: "redo", id: shown.file.id })
                setAnnouncement("Done again.")
              }}
              ranges={ranges}
              onRanges={setRanges}
              rangesWrong={Boolean(ranges.trim() && shown?.problem)}
              pagesField={pagesField}
              onPagesField={(text) => {
                setTypedPages(text)
                dispatch({
                  type: "select-all",
                  rule: (pages) => {
                    if (!text.trim()) return new Set()
                    const read = parseRanges(text, pages)
                    return new Set("pages" in read ? read.pages : [])
                  },
                })
              }}
              onPagesBlur={() => {
                if (!pagesRead || "pages" in pagesRead) setTypedPages(null)
              }}
              pagesProblem={
                pagesRead && "problem" in pagesRead ? pagesRead.problem : null
              }
              selectedCount={shown?.file.selected.size ?? 0}
              onSelectAll={() => {
                dispatch({
                  type: "select-all",
                  rule: (pages) =>
                    new Set(Array.from({ length: pages }, (_, at) => at)),
                })
                setTypedPages(null)
              }}
              onSelectNone={() => {
                dispatch({ type: "select-all", rule: () => new Set() })
                setTypedPages(null)
              }}
              headings={listed}
              levels={deepestLevel(allHeadings)}
              level={level}
              onLevel={setLevel}
              filter={filter}
              onFilter={setFilter}
              unticked={shown?.file.unticked ?? new Set()}
              onTick={(pages, ticked) => {
                if (shown)
                  dispatch({ type: "tick", id: shown.file.id, pages, ticked })
              }}
              front={front}
              onFront={setFront}
              hasFront={Boolean(firstTicked && firstTicked.page > 0)}
              size={size}
              onSize={setSize}
              sizeText={sizeText}
              onSizeText={setSizeText}
              sizeUnit={sizeUnit}
              onSizeUnit={setSizeUnit}
              sizeWrong={limit === null}
            />

            {shown && shown.file.status === "ready" && (
              <PageBoard
                key={shown.file.id}
                file={shown.file.id}
                count={count}
                pictures={pictures}
                onNeed={needPage}
                mode={mode}
                cuts={shown.file.cuts.present}
                onCut={cut}
                selected={shown.file.selected}
                onSelect={select}
                membership={membership}
                leftOut={leftOut}
                onRead={readPage}
                onFocused={onFocused}
              />
            )}
          </>
        )}
        <PdfReader
          reading={reader.reading}
          source={reader.source}
          onClose={reader.close}
          returnTo={reader.opener}
          action={
            readingSource && readingSource === shown?.file.id && mode === "cuts"
              ? (page) =>
                  page < count - 1
                    ? {
                        label: shown.file.cuts.present.includes(page)
                          ? `Remove the cut after page ${page + 1}`
                          : `Cut after page ${page + 1}`,
                        pressed: shown.file.cuts.present.includes(page),
                        icon: <IconScissors aria-hidden="true" />,
                        onPress: () => cutIn(shown.file.id, page),
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
            {one && !several ? "New PDF" : "Parts"}
          </h2>
          <p className="text-sm text-muted-foreground" data-testid="plan">
            {reading
              ? "Reading your files…"
              : !workable.length
                ? "Nothing to split yet."
                : several
                  ? `${plural(workable.length, "file")} to split${views.length > workable.length ? ` · ${plural(views.length - workable.length, "file")} left out` : ""}`
                  : mode === "size" && !shown?.current
                    ? `Parts of at most ${size === "custom" ? `${sizeText.trim()} ${sizeUnit}` : `${size} MB`} from ${plural(count, "page")}`
                    : one
                      ? `One file with ${plural(toWrite[0]?.pages.length ?? 0, "page")} of ${count.toLocaleString("en")}`
                      : `${plural(toWrite.length, "part")} from ${plural(count, "page")}${(shown?.parts.length ?? 0) > toWrite.length ? ` · ${plural((shown?.parts.length ?? 0) - toWrite.length, "part")} left out` : ""}`}
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
                <p className="min-w-0 text-sm text-muted-foreground">
                  {progress.files > 1 &&
                    `File ${progress.file} of ${progress.files} · `}
                  {progress.of === null
                    ? `Page ${progress.done.toLocaleString("en")} of ${progress.total.toLocaleString("en")} · ${plural(progress.parts, "part")} so far`
                    : progress.of === 1
                      ? `Page ${progress.done.toLocaleString("en")} of ${progress.total.toLocaleString("en")}`
                      : `Part ${Math.min(progress.parts + 1, progress.of).toLocaleString("en")} of ${progress.of.toLocaleString("en")}`}
                </p>
                <Button variant="outline" onClick={() => cancel.current?.()}>
                  <IconPlayerStop aria-hidden="true" /> Cancel
                </Button>
              </div>
            </div>
          ) : done ? (
            <div className="space-y-3">
              <p className="text-sm" data-testid="result-facts">
                <span className="font-medium">
                  {finished.length === 1
                    ? `${plural(finished[0].pages, "page")} · ${sizeLabel(finished[0].bytes)}`
                    : `${plural(finished.length, "file")} · ${sizeLabel(totalBytes)} together`}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {several
                    ? `the originals are ${sizeLabel(sourceBytes)}`
                    : `the original is ${sizeLabel(sourceBytes)}`}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {finished.length === 1 ? (
                  <a
                    href={finished[0].url}
                    download={finished[0].name}
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
              <Button
                size="lg"
                disabled={!canSplit}
                onClick={() => void startSplit()}
              >
                <IconScissors aria-hidden="true" />
                {several
                  ? `Split ${plural(workable.length, "file")}`
                  : one
                    ? "Make the PDF"
                    : "Split PDF"}
              </Button>
              {outdated && (
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

          {shown && shown.parts.length > 0 && (
            <div className="space-y-2">
              {several && (
                <h3 className="text-sm font-medium">
                  Parts of <span className="break-all">{shown.file.name}</span>
                </h3>
              )}
              <PartsList
                parts={shown.parts}
                names={shown.names}
                written={written}
                onName={nameTyped}
                onSkip={skip}
                onRead={readPart}
                disabled={splitting}
                canSkip={mode !== "size"}
              />
            </div>
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
              aria-invalid={wrongPattern ? true : undefined}
              aria-describedby={`${ids}-pattern-hint`}
              className="font-mono"
            />
            <p
              id={`${ids}-pattern-hint`}
              className="mt-2 text-xs text-muted-foreground"
            >
              Placeholders: {nameTokens.map((token) => `{${token}}`).join(", ")}
              .
              {shown?.names[0] && (
                <>
                  {" "}
                  The first is saved as{" "}
                  <span className="font-mono break-all">{shown.names[0]}</span>.
                </>
              )}
              {several &&
                " In the ZIP, each file's parts are in a folder of their own."}
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Files are split on your device and are not uploaded.
          </p>
        </section>
      </div>
    </div>
  )
}
