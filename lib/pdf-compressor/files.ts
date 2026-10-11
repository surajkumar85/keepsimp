/**
 * The files being compressed, and what is known of each. One of them is
 * shown in detail: its breakdown, and its pages before and after.
 */
import type { FileFacts } from "@/lib/pdf-merger/files"
import { megabytes, refusal, type Limits } from "@/lib/pdf-merger/settings"
import type { Audit } from "./mupdf-audit"

export interface CompressFile {
  id: string
  file: Blob
  name: string
  size: number
  status: "reading" | "locked" | "ready" | "error"
  /** For a locked file: a password was tried and did not open it. */
  wrongPassword?: boolean
  error?: string
  facts?: FileFacts
  /** The password that opened it, kept only while the file is here. */
  password?: string
  /** What its bytes are spent on, once that has been worked out; null when it could not be. */
  audit?: Audit | null
}

export interface CompressState {
  files: CompressFile[]
  /** The file shown in detail; null when there are no files. */
  active: string | null
}

export const noFiles: CompressState = { files: [], active: null }

export type CompressAction =
  | {
      type: "add"
      items: { id: string; file: Blob; name: string; size: number }[]
    }
  | { type: "opened"; id: string; facts: FileFacts }
  | { type: "locked"; id: string; wrong: boolean }
  /** A password is being tried. */
  | { type: "unlocking"; id: string; password: string }
  | { type: "failed"; id: string; message: string }
  | { type: "audit"; id: string; audit: Audit | null }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "activate"; id: string }

export function compressReducer(
  state: CompressState,
  action: CompressAction
): CompressState {
  const change = (
    id: string,
    edit: (file: CompressFile) => CompressFile
  ): CompressState => ({
    ...state,
    files: state.files.map((file) => (file.id === id ? edit(file) : file)),
  })
  switch (action.type) {
    case "add": {
      const files = [
        ...state.files,
        ...action.items.map((item) => ({
          ...item,
          status: "reading" as const,
        })),
      ]
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
        // A password that did not work is not kept.
        password: undefined,
      }))
    case "unlocking":
      return change(action.id, (file) => ({
        ...file,
        status: "reading",
        wrongPassword: false,
        password: action.password,
      }))
    case "failed":
      return change(action.id, (file) => ({
        ...file,
        status: "error",
        error: action.message,
      }))
    case "audit":
      return change(action.id, (file) => ({ ...file, audit: action.audit }))
    case "remove": {
      const at = state.files.findIndex((file) => file.id === action.id)
      if (at < 0) return state
      const files = state.files.filter((file) => file.id !== action.id)
      // The file that took its place is shown, or the one before it.
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
  }
}

/**
 * Which of the files being added can be taken, given what is already there.
 * @returns For each new file, null when it is taken or the reason it is not.
 */
export function admitFiles(
  current: readonly { size: number }[],
  incoming: readonly { name: string; size: number; pdf: boolean }[],
  limits: Limits
): (string | null)[] {
  let count = current.length
  let total = current.reduce((sum, file) => sum + file.size, 0)
  return incoming.map((file) => {
    if (file.size === 0) return `${file.name} is empty.`
    if (!file.pdf) return refusal(file.name).replace(" or a picture.", ".")
    if (file.size > limits.fileBytes)
      return `${file.name} is larger than ${megabytes(limits.fileBytes)}.`
    if (count >= limits.files)
      return `${file.name} was left out: up to ${limits.files} files can be compressed at once.`
    if (total + file.size > limits.totalBytes)
      return `${file.name} was left out: together the files would be larger than ${megabytes(limits.totalBytes)}.`
    count++
    total += file.size
    return null
  })
}

/** What the page says when files were refused: each reason, or a count when there are many. */
export function refusalNotice(verdicts: readonly (string | null)[]) {
  const refused = verdicts.filter((verdict) => verdict !== null)
  return refused.length > 3
    ? `${refused.length} files were left out: they are not PDFs, or are too large.`
    : refused.join(" ")
}
