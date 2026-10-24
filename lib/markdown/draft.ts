/**
 * What the editor keeps on the device while "Keep a draft on this device"
 * is on: the open documents, each with its text, its name, the text as
 * last saved, its pictures and its versions. Whatever is read back is
 * checked as if it came from anywhere, since storage can hold anything.
 */

export interface PictureDraft {
  name: string
  type: string
  bytes: ArrayBuffer
}

export interface VersionDraft {
  /** When it was kept, in milliseconds since 1970. */
  at: number
  label: string
  text: string
}

export interface DocumentDraft {
  id: string
  name: string | null
  text: string
  saved: string
  pictures: PictureDraft[]
  versions: VersionDraft[]
}

export interface Draft {
  version: 1
  active: string
  documents: DocumentDraft[]
}

/** The most kept: a draft that grows past this is not kept, and the page says so. */
export const LARGEST_DRAFT = 200 * 1024 * 1024
export const MOST_DOCUMENTS = 20
export const MOST_VERSIONS = 50

const isString = (value: unknown): value is string => typeof value === "string"
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function readPicture(value: unknown): PictureDraft | null {
  if (!isObject(value)) return null
  const { name, type, bytes } = value
  if (
    !isString(name) ||
    // A path inside the document's folder: never above it, never from its root.
    !/^(?!\/)(?!.*\.\.)[\w./ -]+$/.test(name) ||
    !isString(type) ||
    !type.startsWith("image/") ||
    !(bytes instanceof ArrayBuffer)
  )
    return null
  return { name, type, bytes }
}

function readVersion(value: unknown): VersionDraft | null {
  if (!isObject(value)) return null
  const { at, label, text } = value
  if (
    typeof at !== "number" ||
    !Number.isFinite(at) ||
    !isString(label) ||
    !isString(text)
  )
    return null
  return { at, label, text }
}

function readDocument(value: unknown): DocumentDraft | null {
  if (!isObject(value)) return null
  const { id, name, text, saved, pictures, versions } = value
  if (!isString(id) || !isString(text) || !isString(saved)) return null
  if (name !== null && !isString(name)) return null
  return {
    id,
    name: name as string | null,
    text,
    saved,
    pictures: Array.isArray(pictures)
      ? pictures.map(readPicture).filter((one) => one !== null)
      : [],
    versions: Array.isArray(versions)
      ? versions
          .map(readVersion)
          .filter((one) => one !== null)
          .slice(-MOST_VERSIONS)
      : [],
  }
}

/** A draft read back from storage, or null when it is not one. */
export function readDraft(value: unknown): Draft | null {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !Array.isArray(value.documents)
  )
    return null
  const documents = value.documents
    .map(readDocument)
    .filter((one) => one !== null)
    .slice(0, MOST_DOCUMENTS)
  if (!documents.length) return null
  const active =
    isString(value.active) && documents.some((one) => one.id === value.active)
      ? value.active
      : documents[0].id
  return { version: 1, active, documents }
}

/** How many bytes a draft takes, roughly: its text as UTF-16 and its pictures. */
export function draftSize(draft: Draft) {
  return draft.documents.reduce(
    (sum, one) =>
      sum +
      (one.text.length + one.saved.length) * 2 +
      one.versions.reduce((all, version) => all + version.text.length * 2, 0) +
      one.pictures.reduce((all, picture) => all + picture.bytes.byteLength, 0),
    0
  )
}
