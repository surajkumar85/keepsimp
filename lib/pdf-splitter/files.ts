import type { FileFacts } from "@/lib/pdf-merger/files"
import {
  record,
  redo,
  startHistory,
  undo,
  type History,
} from "@/lib/pdf-merger/pages"
import type { Heading } from "./bookmarks"
import { tidyCuts } from "./parts"

/** One file to split, with what was chosen for it alone. */
export interface SplitFile {
  id: string
  file: Blob
  name: string
  size: number
  status: "reading" | "locked" | "ready" | "error"
  /** For a locked file: a password was tried and did not open it. */
  wrongPassword?: boolean
  error?: string
  facts?: FileFacts
  /** Its bookmarks that lead to pages, once they have been read. */
  headings?: Heading[]
  /** Cuts placed between its pages, with their history. */
  cuts: History<number[]>
  /** Pages selected to take out or remove, counted from 0. */
  selected: ReadonlySet<number>
  /** Names typed for parts, by part key (see `partKeys`). */
  names: Readonly<Record<string, string>>
  /** Parts left out, by part key. */
  skipped: ReadonlySet<string>
  /** Bookmarks not to split at, by the page they open. */
  unticked: ReadonlySet<number>
  /** Each page's share of marks, as far as the pages have been looked at. */
  ink?: number[]
  /** Pages whose blankness was turned round by hand. */
  flipped: ReadonlySet<number>
  /** The pages that hold some words, and which words those were. */
  starts?: { key: string; pages: number[] }
  /** What each page says in some area, and which area that was. */
  texts?: { key: string; texts: string[] }
}

export interface SplitState {
  files: SplitFile[]
  /** The file whose pages are shown; null when there are no files. */
  active: string | null
}

export const noFiles: SplitState = { files: [], active: null }

export type SplitAction =
  | {
      type: "add"
      items: { id: string; file: Blob; name: string; size: number }[]
    }
  | { type: "opened"; id: string; facts: FileFacts }
  | { type: "locked"; id: string; wrong: boolean }
  | { type: "unlocking"; id: string }
  | { type: "failed"; id: string; message: string }
  | { type: "headings"; id: string; headings: Heading[] }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "activate"; id: string }
  /** Put new cuts in one file, as a step that can be undone. */
  | { type: "cut"; id: string; cuts: number[] }
  /** Place cuts in every file that is ready, by a rule that is given each file's page count. */
  | { type: "cut-all"; rule: (pages: number) => number[] }
  | { type: "undo"; id: string }
  | { type: "redo"; id: string }
  | { type: "select"; id: string; selected: ReadonlySet<number> }
  /** Select pages in every file that is ready, by a rule that is given each file's page count. */
  | { type: "select-all"; rule: (pages: number) => ReadonlySet<number> }
  | { type: "name"; id: string; key: string; name: string }
  | { type: "skip"; id: string; key: string; skipped: boolean }
  /** What a run of pages was found to hold of marks, from page `from` on. */
  | { type: "ink"; id: string; from: number; shares: readonly number[] }
  /** Call a page blank that was not found to be, or keep one that was. */
  | { type: "flip"; id: string; page: number }
  | { type: "starts"; id: string; key: string; pages: number[] }
  | { type: "texts"; id: string; key: string; texts: string[] }
  /**
   * The file's pages are no longer the same pages, as when double pages are
   * cut in half: everything chosen or found for it is let go, and it is read again.
   */
  | { type: "renew"; id: string }
  /** Split at a bookmark, or not; with no page, at every bookmark or none of those given. */
  | { type: "tick"; id: string; pages: readonly number[]; ticked: boolean }

/** Nothing chosen and nothing found, as for a file that was just added. */
const untouched = () => ({
  cuts: startHistory<number[]>([]),
  selected: new Set<number>(),
  names: {},
  skipped: new Set<string>(),
  unticked: new Set<number>(),
  flipped: new Set<number>(),
})

const fresh = (item: {
  id: string
  file: Blob
  name: string
  size: number
}): SplitFile => ({
  ...item,
  status: "reading",
  ...untouched(),
})

/** A file's pages; none until it has been read. */
const pagesOf = (file: SplitFile) => file.facts?.pages ?? 0

export function splitReducer(
  state: SplitState,
  action: SplitAction
): SplitState {
  const change = (id: string, edit: (file: SplitFile) => SplitFile) => ({
    ...state,
    files: state.files.map((file) => (file.id === id ? edit(file) : file)),
  })
  switch (action.type) {
    case "add": {
      const files = [...state.files, ...action.items.map(fresh)]
      return { files, active: state.active ?? files[0]?.id ?? null }
    }
    case "opened":
      return change(action.id, (file) => ({
        ...file,
        status: "ready",
        facts: action.facts,
        wrongPassword: false,
        error: undefined,
      }))
    case "locked":
      return change(action.id, (file) => ({
        ...file,
        status: "locked",
        wrongPassword: action.wrong,
      }))
    case "unlocking":
      return change(action.id, (file) => ({ ...file, status: "reading" }))
    case "failed":
      return change(action.id, (file) => ({
        ...file,
        status: "error",
        error: action.message,
      }))
    case "headings":
      return change(action.id, (file) => ({
        ...file,
        headings: action.headings,
      }))
    case "remove": {
      const at = state.files.findIndex((file) => file.id === action.id)
      if (at < 0) return state
      const files = state.files.filter((file) => file.id !== action.id)
      // The file after the one removed is shown next; the last, when there is none after.
      const next = files[Math.min(at, files.length - 1)]?.id ?? null
      return {
        files,
        active: state.active === action.id ? next : state.active,
      }
    }
    case "clear":
      return noFiles
    case "activate":
      return state.files.some((file) => file.id === action.id)
        ? { ...state, active: action.id }
        : state
    case "cut":
      return change(action.id, (file) => ({
        ...file,
        cuts: record(file.cuts, tidyCuts(action.cuts, pagesOf(file))),
      }))
    case "cut-all":
      return {
        ...state,
        files: state.files.map((file) =>
          file.status === "ready"
            ? {
                ...file,
                cuts: record(
                  file.cuts,
                  tidyCuts(action.rule(pagesOf(file)), pagesOf(file))
                ),
              }
            : file
        ),
      }
    case "undo":
      return change(action.id, (file) => ({ ...file, cuts: undo(file.cuts) }))
    case "redo":
      return change(action.id, (file) => ({ ...file, cuts: redo(file.cuts) }))
    case "select":
      return change(action.id, (file) => ({
        ...file,
        selected: action.selected,
      }))
    case "select-all":
      return {
        ...state,
        files: state.files.map((file) =>
          file.status === "ready"
            ? { ...file, selected: action.rule(pagesOf(file)) }
            : file
        ),
      }
    case "name":
      return change(action.id, (file) => ({
        ...file,
        names: { ...file.names, [action.key]: action.name },
      }))
    case "skip":
      return change(action.id, (file) => {
        const skipped = new Set(file.skipped)
        if (action.skipped) skipped.add(action.key)
        else skipped.delete(action.key)
        return { ...file, skipped }
      })
    case "ink":
      return change(action.id, (file) => {
        const ink = (file.ink ?? []).slice(0, action.from)
        // A run that does not follow on from what is known is not used.
        return ink.length === action.from
          ? { ...file, ink: [...ink, ...action.shares] }
          : file
      })
    case "flip":
      return change(action.id, (file) => {
        const flipped = new Set(file.flipped)
        if (!flipped.delete(action.page)) flipped.add(action.page)
        return { ...file, flipped }
      })
    case "starts":
      return change(action.id, (file) => ({
        ...file,
        starts: { key: action.key, pages: action.pages },
      }))
    case "texts":
      return change(action.id, (file) => ({
        ...file,
        texts: { key: action.key, texts: action.texts },
      }))
    case "renew":
      return change(action.id, (file) => ({
        id: file.id,
        file: file.file,
        name: file.name,
        size: file.size,
        status: "reading",
        ...untouched(),
      }))
    case "tick":
      return change(action.id, (file) => {
        const unticked = new Set(file.unticked)
        for (const page of action.pages)
          if (action.ticked) unticked.delete(page)
          else unticked.add(page)
        return { ...file, unticked }
      })
  }
}
