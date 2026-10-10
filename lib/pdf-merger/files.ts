import { rotate, type Rotation } from "@/lib/image-compressor/geometry"
import { parseRanges, type Ranges } from "./ranges"
import { desktopLimits } from "./settings"

/** What the engine found when it opened a file. */
export interface FileFacts {
  pages: number
  /** The first page as it is shown, in points (1/72 inch). */
  width: number
  height: number
  title: string
  bookmarks: number
  /** The file was damaged and was repaired while reading. */
  repaired: boolean
  /** It needed a password to open. */
  unlocked: boolean
  /** Its author did not allow pages to be changed. */
  restricted: boolean
  /** It carries a digital signature, which a merge cannot keep valid. */
  signed: boolean
  /** It has accessibility tags, which are not carried over. */
  tagged: boolean
  forms: boolean
  /** Set for a picture added as a page: its size in pixels, as it is shown. */
  picture?: { width: number; height: number }
}

export type SortOrder = "added" | "name" | "name-desc" | "oldest" | "newest"

export interface PdfFile {
  id: string
  file: Blob
  name: string
  size: number
  /** When the file was last changed, in milliseconds. */
  modified: number
  /** Its turn among everything added so far. */
  added: number
  status: "reading" | "locked" | "ready" | "error"
  /** For a locked file: a password was tried and did not open it. */
  wrongPassword?: boolean
  error?: string
  facts?: FileFacts
  /** Pages to take, as typed; empty for all. */
  range: string
  /** A turn applied to every page taken from this file. */
  rotation: Rotation
  /** The file is a picture, which becomes a page. */
  picture?: boolean
}

export interface FilesState {
  files: PdfFile[]
  /** How the list is sorted; "custom" once something was moved by hand. */
  order: SortOrder | "custom"
  /** How many files have ever been added. */
  arrivals: number
}

export const noFiles: FilesState = { files: [], order: "added", arrivals: 0 }

export type FilesAction =
  | {
      type: "add"
      items: {
        id: string
        file: Blob
        name: string
        size: number
        modified: number
        picture?: boolean
      }[]
    }
  | { type: "opened"; id: string; facts: FileFacts }
  | { type: "locked"; id: string; wrong: boolean }
  /** A password was sent; the file is being read again. */
  | { type: "unlocking"; id: string }
  | { type: "failed"; id: string; message: string }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "move"; id: string; to: number }
  | { type: "sort"; order: SortOrder }
  | { type: "range"; id: string; text: string }
  | { type: "rotate"; id: string; direction: "left" | "right" }
  /** The same file once more, straight after the first. */
  | { type: "again"; id: string; newId: string }

// Numbers inside names sort by value, so "2.pdf" comes before "10.pdf".
const names = new Intl.Collator("en", { numeric: true, sensitivity: "base" })

function sorted(files: PdfFile[], order: SortOrder | "custom") {
  if (order === "custom") return files
  const byArrival = (a: PdfFile, b: PdfFile) => a.added - b.added
  const compare: Record<SortOrder, (a: PdfFile, b: PdfFile) => number> = {
    added: byArrival,
    name: (a, b) => names.compare(a.name, b.name) || byArrival(a, b),
    "name-desc": (a, b) => names.compare(b.name, a.name) || byArrival(a, b),
    oldest: (a, b) => a.modified - b.modified || byArrival(a, b),
    newest: (a, b) => b.modified - a.modified || byArrival(a, b),
  }
  return [...files].sort(compare[order])
}

const change = (
  state: FilesState,
  id: string,
  update: (file: PdfFile) => PdfFile
): FilesState => ({
  ...state,
  files: state.files.map((file) => (file.id === id ? update(file) : file)),
})

export function filesReducer(
  state: FilesState,
  action: FilesAction
): FilesState {
  switch (action.type) {
    case "add": {
      const added = action.items.map((item, index) => ({
        ...item,
        added: state.arrivals + index,
        status: "reading" as const,
        range: "",
        rotation: 0 as const,
      }))
      return {
        files: sorted([...state.files, ...added], state.order),
        order: state.order,
        arrivals: state.arrivals + added.length,
      }
    }
    case "opened":
      return change(state, action.id, (file) => ({
        ...file,
        status: "ready",
        facts: action.facts,
        wrongPassword: undefined,
        error: undefined,
      }))
    case "locked":
      return change(state, action.id, (file) => ({
        ...file,
        status: "locked",
        wrongPassword: action.wrong,
      }))
    case "unlocking":
      return change(state, action.id, (file) => ({
        ...file,
        status: "reading",
      }))
    case "failed":
      return change(state, action.id, (file) => ({
        ...file,
        status: "error",
        error: action.message,
      }))
    case "remove":
      return {
        ...state,
        files: state.files.filter((file) => file.id !== action.id),
      }
    case "clear":
      return { ...noFiles, arrivals: state.arrivals }
    case "move": {
      const from = state.files.findIndex((file) => file.id === action.id)
      const to = Math.max(0, Math.min(state.files.length - 1, action.to))
      if (from < 0 || from === to) return state
      const files = [...state.files]
      files.splice(to, 0, ...files.splice(from, 1))
      return { ...state, files, order: "custom" }
    }
    case "sort":
      return {
        ...state,
        files: sorted(state.files, action.order),
        order: action.order,
      }
    case "range":
      return change(state, action.id, (file) => ({
        ...file,
        range: action.text,
      }))
    case "rotate":
      return change(state, action.id, (file) => ({
        ...file,
        rotation: rotate(file.rotation, action.direction),
      }))
    case "again": {
      const at = state.files.findIndex((file) => file.id === action.id)
      if (at < 0) return state
      const { file, name, size, modified, picture } = state.files[at]
      const files = [...state.files]
      files.splice(at + 1, 0, {
        id: action.newId,
        file,
        name,
        size,
        modified,
        picture,
        added: state.arrivals,
        // It is read afresh, so a locked file asks for its password again.
        status: "reading",
        range: "",
        rotation: 0,
      })
      return { files, order: "custom", arrivals: state.arrivals + 1 }
    }
  }
}

/** The pages chosen from a file that has been read; null until then. */
export function chosenPages(file: PdfFile): Ranges | null {
  return file.status === "ready" && file.facts
    ? parseRanges(file.range, file.facts.pages)
    : null
}

/** What the engine is asked to take from one file. */
export interface MergePart {
  id: string
  /** Pages counted from 0, in the order they go into the result. */
  pages: number[]
  rotation: Rotation
}

export interface MergeStatus {
  parts: MergePart[]
  /** Pages in the result. */
  pages: number
  /** Bytes of the files that take part. */
  bytes: number
  /** Files that could not be read, and so are left out. */
  leftOut: number
  /** Some files are still being read. */
  reading: boolean
  /** Why a merge cannot start yet, when it cannot. */
  problem: string | null
}

/** What to say while locked files wait for their passwords; null when none do. */
export function lockedProblem(files: readonly PdfFile[]) {
  const locked = files.filter((file) => file.status === "locked")
  if (!locked.length) return null
  return locked.length === 1
    ? `Enter the password for ${locked[0].name}, or remove it.`
    : `Enter the passwords for the ${locked.length} locked files, or remove them.`
}

/** What to say when a result would have too many pages; null when it would not. */
export function pagesProblem(pages: number, maxPages: number) {
  return pages > maxPages
    ? `The result would have ${pages.toLocaleString("en")} pages. Up to ${maxPages.toLocaleString("en")} can be merged at once.`
    : null
}

/** What a merge would do with the list as it stands, and what stands in its way. */
export function mergeStatus(
  files: readonly PdfFile[],
  maxPages = desktopLimits.pages
): MergeStatus {
  const parts: MergePart[] = []
  let pages = 0
  let bytes = 0
  let problem = lockedProblem(files)
  for (const file of files) {
    const chosen = chosenPages(file)
    if (!chosen) continue
    if ("problem" in chosen) {
      problem ??= `Check the pages for ${file.name}.`
      continue
    }
    parts.push({ id: file.id, pages: chosen.pages, rotation: file.rotation })
    pages += chosen.pages.length
    bytes += file.size
  }
  problem ??= pagesProblem(pages, maxPages)
  return {
    parts,
    pages,
    bytes,
    leftOut: files.filter((file) => file.status === "error").length,
    reading: files.some((file) => file.status === "reading"),
    problem,
  }
}
