import { safeSegment } from "@/lib/image-resizer/naming"
import type { BookmarkPolicy } from "./outline"
import type { FooterPlace, NumberStyle, SheetChoice } from "./print"

const MB = 1024 * 1024

export interface Limits {
  files: number
  /** Largest single file, in bytes. */
  fileBytes: number
  /** Largest sum of all files, in bytes. */
  totalBytes: number
  /** Most pages in one result. */
  pages: number
}

/**
 * Limits, set from the measurements in docs/pdf-merger.md. The engine has
 * 2 GB of memory at most, and a merge needs about twice the size of the files.
 */
export const desktopLimits: Limits = {
  files: 100,
  fileBytes: 300 * MB,
  totalBytes: 500 * MB,
  pages: 5000,
}

/** Phones and small tablets close a page that takes much less memory. */
export const phoneLimits: Limits = {
  files: 100,
  fileBytes: 100 * MB,
  totalBytes: 200 * MB,
  pages: 5000,
}

/**
 * The limits for a device.
 * @param device `memory` in gigabytes where the browser tells (Chromium only); `touch` when a finger is the main pointer.
 */
export function limitsFor(device: { memory?: number; touch: boolean }) {
  return device.touch || (device.memory !== undefined && device.memory < 4)
    ? phoneLimits
    : desktopLimits
}

export const DEFAULT_NAME = "merged"

/** A contents page at the front: none, or one line per file by its name or its own title. */
export type ContentsChoice = "none" | "files" | "titles"

/**
 * What happens to fillable fields.
 * - keep: every field stays; one whose name is taken gets a number added
 * - join: fields with the same name become one field, filled in once
 * - flatten: what is filled in stays visible, but can no longer be changed
 * - remove: fields are taken out
 */
export type FormsChoice = "keep" | "join" | "flatten" | "remove"

/** The page numbers a viewer shows: 1 onwards, or each file's own. */
export type LabelsChoice = "continuous" | "keep"

export interface MergeSettings {
  /** The result's file name, without ".pdf". */
  name: string
  bookmarks: BookmarkPolicy
  contents: ContentsChoice
  /** The first file is a cover: the contents page comes after it and does not list it. */
  cover: boolean
  forms: FormsChoice
  labels: LabelsChoice
  /** Carry files attached to the PDFs into the result. */
  attachments: boolean
  title: string
  author: string
  subject: string
  keywords: string
  /** Lock the result with a password. */
  protect: boolean
  password: string
  /** A second password that lifts the limits below; made up when left empty. */
  ownerPassword: string
  allowPrint: boolean
  allowCopy: boolean
  allowChanges: boolean
  /** For double-sided printing: a blank page after every file with an odd number of pages. */
  duplex: boolean
  /** One size for every page. */
  sheet: SheetChoice
  /** Whether pages smaller than that size are made larger. */
  enlarge: boolean
  /** Print each page's file name at its foot. */
  footerName: boolean
  /** Print page numbers at the foot of every page. */
  numbers: NumberStyle
  numbersAt: FooterPlace
  numbersFrom: number
}

export const defaultSettings: MergeSettings = {
  name: DEFAULT_NAME,
  bookmarks: "nested",
  contents: "none",
  cover: false,
  forms: "keep",
  labels: "continuous",
  attachments: true,
  title: "",
  author: "",
  subject: "",
  keywords: "",
  protect: false,
  password: "",
  ownerPassword: "",
  allowPrint: true,
  allowCopy: true,
  allowChanges: true,
  duplex: false,
  sheet: "keep",
  enlarge: true,
  footerName: false,
  numbers: "none",
  numbersAt: "centre",
  numbersFrom: 1,
}

const DETAIL_LIMIT = 500
/** The longest password the strongest PDF lock takes, in bytes. */
const PASSWORD_BYTES = 127
const bytesOf = (text: string) => new TextEncoder().encode(text).length

/** Why the settings cannot be used as they are; null when they can. */
export function settingsProblem(settings: MergeSettings) {
  for (const [label, value] of [
    ["title", settings.title],
    ["author", settings.author],
    ["subject", settings.subject],
    ["keywords", settings.keywords],
  ])
    if (value.length > DETAIL_LIMIT)
      return `Keep the ${label} under ${DETAIL_LIMIT} characters.`
  if (
    settings.numbers !== "none" &&
    !(
      Number.isInteger(settings.numbersFrom) &&
      settings.numbersFrom >= 0 &&
      settings.numbersFrom <= 99_999
    )
  )
    return "Start page numbers at a whole number from 0 to 99,999."
  if (!settings.protect) return null
  if (!settings.password)
    return "Enter a password for the merged PDF, or turn the password off."
  if (
    bytesOf(settings.password) > PASSWORD_BYTES ||
    bytesOf(settings.ownerPassword) > PASSWORD_BYTES
  )
    return "Use a shorter password: at most 127 bytes, which is 127 plain letters."
  if (settings.ownerPassword && settings.ownerPassword === settings.password)
    return "The second password must differ from the first, or be left empty."
  return null
}

/**
 * The number a PDF stores to say what its reader may do. Reading aloud for
 * accessibility is always allowed.
 */
export function permissionBits(
  settings: Pick<MergeSettings, "allowPrint" | "allowCopy" | "allowChanges">
) {
  // Every bit that has no meaning is set, as the format asks; -3904 allows nothing.
  let bits = -3904 | 512
  if (settings.allowPrint) bits |= 4 | 2048
  if (settings.allowCopy) bits |= 16
  if (settings.allowChanges) bits |= 8 | 32 | 256 | 1024
  return bits
}

/** True when the result would be locked with limits on what a reader may do. */
export function limitsReaders(settings: MergeSettings) {
  return (
    settings.protect &&
    !(settings.allowPrint && settings.allowCopy && settings.allowChanges)
  )
}

/**
 * The settings that change the result's bytes, as one string. The file name
 * is applied afterwards, so it is not among them.
 */
export function settingsKey(settings: MergeSettings) {
  const { name, ...rest } = settings
  void name
  return JSON.stringify({
    ...rest,
    cover: settings.contents === "none" ? null : settings.cover,
    enlarge: settings.sheet === "keep" ? null : settings.enlarge,
    ...(settings.numbers === "none"
      ? { numbersAt: null, numbersFrom: null }
      : null),
    // What the lock would be does not matter while there is none.
    ...(settings.protect
      ? null
      : {
          password: null,
          ownerPassword: null,
          allowPrint: null,
          allowCopy: null,
          allowChanges: null,
        }),
  })
}

/** A safe file name for the result, always ending in ".pdf". */
export function outputName(name: string) {
  const stem = safeSegment(name.trim().replace(/\.pdf$/i, "")).slice(0, 120)
  return `${stem || DEFAULT_NAME}.pdf`
}

/** What a file is called in bookmarks: its name without ".pdf". */
export function entryName(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").trim() || fileName
}

/**
 * True when a file's first bytes say it is a PDF. The marker may sit a little
 * way in: some files start with a byte-order mark or a line of junk.
 */
export function looksLikePdf(head: Uint8Array) {
  const marker = [0x25, 0x50, 0x44, 0x46, 0x2d]
  const last = Math.min(head.length - marker.length, 1024)
  for (let start = 0; start <= last; start++)
    if (marker.every((byte, offset) => head[start + offset] === byte))
      return true
  return false
}

/** Documents that are not PDFs but could be saved as one by the program that made them. */
const OFFICE =
  /\.(docx?|xlsx?|pptx?|od[tsp]|rtf|pages|numbers|key|epub|mobi|txt|md|html?|xps)$/i

/** Why a file that is neither a PDF nor a picture is refused, in words that say what to do. */
export function refusal(name: string) {
  return OFFICE.test(name)
    ? `${name} is not a PDF. Save or export it as a PDF first, then add that.`
    : `${name} is not a PDF or a picture.`
}

export const megabytes = (bytes: number) =>
  `${Math.round(bytes / MB).toLocaleString("en")} MB`

/**
 * Which of the files being added can be taken, given what is already there.
 * @returns For each new file, null when it is taken or the reason it is not.
 */
export function admit(
  current: readonly { size: number }[],
  incoming: readonly { size: number }[],
  limits: Limits = desktopLimits
): (string | null)[] {
  let count = current.length
  let total = current.reduce((sum, file) => sum + file.size, 0)
  return incoming.map((file) => {
    if (count >= limits.files)
      return `Up to ${limits.files} files can be merged at once.`
    if (file.size > limits.fileBytes)
      return `This file is larger than ${megabytes(limits.fileBytes)}.`
    if (file.size === 0) return "This file is empty."
    if (total + file.size > limits.totalBytes)
      return `Together the files would be larger than ${megabytes(limits.totalBytes)}.`
    count++
    total += file.size
    return null
  })
}

/** How the result's size compares with the files that went in, in words. */
export function describeSize(input: number, output: number) {
  const change = Math.round(((output - input) / input) * 100)
  if (change <= -1) return `${-change}% smaller than the files together`
  if (change >= 1) return `${change}% larger than the files together`
  return "the same size as the files together"
}
