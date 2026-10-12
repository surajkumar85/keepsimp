/**
 * The fields of a form: what a file's fields are to the page, how they are
 * filled in, and what is still missing. A field is the file's own; filling
 * one in is a step in the same list of changes as everything else.
 *
 * A file's scripts are never run. A field that a script would format or
 * work out is filled in as it is typed.
 */
import type { Box } from "./geometry"

export const FIELD_KINDS = [
  "text",
  "check",
  "radio",
  "choice",
  "list",
  "signature",
  "button",
] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

/** One place of a form to fill in. A field shown in several places is one of these for each. */
export interface FormField {
  /** The number the file knows this place by, as `f<number>`. */
  id: string
  kind: FieldKind
  /** The field's whole name in the file. Places with one name are one field. */
  name: string
  /** What a person would call it: the file's hint for it, or its name made readable. */
  label: string
  /** Where it is on its page, in the page's points as the page is shown. */
  box: Box
  /** What it holds. A list that takes several holds one to a line. */
  value: string
  /** A tick box or a round button: whether this one is on. */
  on: boolean
  /** What a drop-down or a list offers, as the file keeps each choice. */
  options: string[]
  /** What a person is shown for each of them, in the same order. */
  shown: string[]
  required: boolean
  readOnly: boolean
  multiline: boolean
  password: boolean
  /** Its letters are spread over boxes, one each. */
  comb: boolean
  /** The most letters it takes; 0 when it has no limit. */
  maxLength: number
  /** A list that takes more than one of its options. */
  multiple: boolean
  /** A drop-down that also takes words that are not on its list. */
  custom: boolean
  /** How a date is written in it, such as "dd/mm/yyyy"; null when it is not a date. */
  date: string | null
}

/** What a file's form is, as a whole. */
export interface FormFacts {
  /** How many places there are to fill in, over all pages. */
  fields: number
  /** The form is also, or only, of the XFA kind, which is not read here. */
  xfa: boolean
  /** Some fields are formatted or worked out by scripts, which are not run. */
  scripts: boolean
}

export const noForm: FormFacts = { fields: 0, xfa: false, scripts: false }

/** The kinds a person fills in. A signature place and a push button are shown and left alone. */
export const fillable = (field: FormField) =>
  !field.readOnly && field.kind !== "signature" && field.kind !== "button"

/**
 * What a person would call a field: the hint its file gives, or the last
 * part of its name with the marks of a program taken out.
 */
export function labelOf(name: string, hint = "") {
  if (hint.trim()) return hint.trim()
  const last =
    name
      .split(".")
      .map((part) => part.replace(/\[\d+\]$/, "").trim())
      .filter(Boolean)
      .at(-1) ?? ""
  const words = last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
  return words ? words[0].toUpperCase() + words.slice(1) : "Field"
}

/** The ways Acrobat's numbered date formats are written. Those with a time of day are left out. */
const NUMBERED_DATES = [
  "m/d",
  "m/d/yy",
  "mm/dd/yy",
  "mm/yy",
  "d-mmm",
  "d-mmm-yy",
  "dd-mmm-yy",
  "yy-mm-dd",
  "mmm-yy",
  "mmmm-yy",
  "mmm d, yyyy",
  "mmmm d, yyyy",
]
const DATE_PART = /yyyy|yy|mmmm|mmm|mm|m|dd|d/g
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/**
 * How a field writes a date, read from the script that formats it. The
 * script is only read, never run. Null when the field is not a date, or
 * its format lacks a day, a month or a year, or has a time of day in it:
 * such a field is typed into like any other.
 */
export function dateFormat(script: string): string | null {
  const named = /AFDate_FormatEx\(\s*["']([^"']+)["']\s*\)/.exec(script)
  const numbered = /AFDate_Format\(\s*(\d+)\s*\)/.exec(script)
  const format = named
    ? named[1]
    : numbered
      ? (NUMBERED_DATES[Number(numbered[1])] ?? "")
      : ""
  const parts = format.match(DATE_PART) ?? []
  const has = (letter: string) => parts.some((part) => part[0] === letter)
  // What is left when the parts are taken out may be marks, not letters.
  const rest = format.replace(DATE_PART, "")
  return has("d") && has("m") && has("y") && !/[a-z]/i.test(rest)
    ? format
    : null
}

const two = (value: number) => String(value).padStart(2, "0")

/** A day as year, month and day when it is a real one. */
function realDay(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${two(month)}-${two(day)}`
    : ""
}

/**
 * A day written the way a field writes dates.
 * @param day As a date control gives it: "2026-10-12".
 * @returns Nothing when the day is not a day.
 */
export function writeDate(day: string, format: string) {
  const read = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!read || !realDay(Number(read[1]), Number(read[2]), Number(read[3])))
    return ""
  const [year, month, date] = read.slice(1).map(Number)
  return format.replace(DATE_PART, (part) => {
    if (part === "yyyy") return String(year).padStart(4, "0")
    if (part === "yy") return two(year % 100)
    if (part === "mmmm") return MONTHS[month - 1]
    if (part === "mmm") return MONTHS[month - 1].slice(0, 3)
    if (part === "mm") return two(month)
    if (part === "m") return String(month)
    return part === "dd" ? two(date) : String(date)
  })
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * What a field holds as a day for a date control ("2026-10-12"), read by
 * the way the field writes dates. Nothing when it does not read as one.
 */
export function readDate(value: string, format: string) {
  const parts: string[] = []
  let pattern = ""
  let from = 0
  for (const found of format.matchAll(DATE_PART)) {
    pattern += escaped(format.slice(from, found.index))
    parts.push(found[0])
    pattern += found[0].startsWith("mmm")
      ? "([A-Za-z]+)"
      : found[0] === "yyyy"
        ? "(\\d{4})"
        : "(\\d{1,2})"
    from = found.index + found[0].length
  }
  pattern += escaped(format.slice(from))
  const read = new RegExp(`^${pattern}$`).exec(value.trim())
  if (!read) return ""
  let year = 0
  let month = 0
  let day = 0
  parts.forEach((part, at) => {
    const text = read[at + 1]
    if (part === "yyyy") year = Number(text)
    // Two figures of a year are this century's, as a form filled in today means.
    else if (part === "yy") year = 2000 + Number(text)
    else if (part.startsWith("mmm"))
      month =
        MONTHS.findIndex((name) =>
          part === "mmm"
            ? name.slice(0, 3).toLowerCase() === text.toLowerCase()
            : name.toLowerCase() === text.toLowerCase()
        ) + 1
    else if (part[0] === "m") month = Number(text)
    else day = Number(text)
  })
  return realDay(year, month, day)
}

/**
 * Fields in the order they are gone through with Tab: rows from the top of
 * the page down, and from left to right along a row. A field is in a row
 * when its middle is no higher or lower than the row's first field reaches.
 */
export function inOrder<T extends { box: Box }>(fields: readonly T[]): T[] {
  const down = [...fields].sort((a, b) => a.box.y - b.box.y)
  const rows: T[][] = []
  for (const field of down) {
    const row = rows.at(-1)
    const first = row?.[0].box
    const middle = field.box.y + field.box.height / 2
    if (row && first && middle >= first.y && middle <= first.y + first.height)
      row.push(field)
    else rows.push([field])
  }
  return rows.flatMap((row) => row.sort((a, b) => a.box.x - b.box.x))
}

/** The options a list or drop-down holds as chosen. */
export const chosenOf = (field: FormField) =>
  field.value.split("\n").filter(Boolean)

/**
 * What a field takes of what it is given: a line without breaks, no more
 * letters than its limit, only what its list offers.
 * @returns Null when the field takes none of it.
 */
export function accepts(field: FormField, value: string): string | null {
  if (!fillable(field)) return null
  if (field.kind === "text") {
    const lines = field.multiline
      ? value.replace(/\r\n?/g, "\n")
      : value.replace(/[\r\n]+/g, " ")
    return field.maxLength > 0
      ? Array.from(lines).slice(0, field.maxLength).join("")
      : lines
  }
  if (field.kind === "choice")
    return value === "" || field.options.includes(value) || field.custom
      ? value.replace(/[\r\n]+/g, " ")
      : null
  if (field.kind === "list") {
    const asked = [...new Set(value.split("\n").filter(Boolean))]
    if (asked.some((option) => !field.options.includes(option))) return null
    return (field.multiple ? asked : asked.slice(0, 1)).join("\n")
  }
  return null
}

/** Filling a field in, or turning a tick box or a round button on or off. */
export type FieldOp =
  | { do: "fill"; page: number; id: string; value: string }
  | { do: "turn"; page: number; id: string; on: boolean }

export interface FieldChange {
  /** What the step is called in the list of changes. */
  label: string
  ops: FieldOp[]
}

/** The most letters a field is given at once. */
export const LONGEST_VALUE = 100_000

/** A change to a field as it arrives from the page, or null when it is not one. */
export function readFieldOp(value: unknown): FieldOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  if (
    !Number.isInteger(op.page) ||
    (op.page as number) < 0 ||
    typeof op.id !== "string" ||
    !/^f\d+$/.test(op.id)
  )
    return null
  const { page, id } = op as { page: number; id: string }
  if (
    op.do === "fill" &&
    typeof op.value === "string" &&
    op.value.length <= LONGEST_VALUE
  )
    return { do: "fill", page, id, value: op.value }
  if (op.do === "turn" && typeof op.on === "boolean")
    return { do: "turn", page, id, on: op.on }
  return null
}

/** What a change to a field is called in the list of changes. */
export function stepName(field: FormField, op: FieldOp) {
  if (op.do === "turn")
    return field.kind === "radio"
      ? `Choose ${field.label}`
      : `${op.on ? "Tick" : "Clear"} ${field.label}`
  return field.kind === "text"
    ? `${op.value ? "Fill in" : "Clear"} ${field.label}`
    : `${op.value ? "Choose" : "Clear"} ${field.label}`
}

/**
 * Whether a place still has nothing in it. A round button is empty while
 * none of its field's buttons is on, on whichever page.
 */
export function isEmpty(
  field: FormField,
  pages: readonly (readonly FormField[])[]
) {
  if (field.kind === "check") return !field.on
  if (field.kind === "radio")
    return !pages
      .flat()
      .some(
        (other) =>
          other.kind === "radio" && other.name === field.name && other.on
      )
  return !field.value.trim()
}

/** A field that must be filled in and is not. */
export interface Missing {
  page: number
  id: string
  label: string
}

/**
 * The fields that must be filled in and are still empty, in the order they
 * are gone through. Round buttons of one name are one field: it is filled
 * in when any of them is on, on whichever page.
 */
export function unfilled(pages: readonly (readonly FormField[])[]): Missing[] {
  const seen = new Set<string>()
  const missing: Missing[] = []
  pages.forEach((fields, page) => {
    for (const field of inOrder(fields)) {
      if (!field.required || !fillable(field)) continue
      // A field shown in several places is missing once.
      if (!isEmpty(field, pages) || seen.has(field.name)) continue
      seen.add(field.name)
      missing.push({ page, id: field.id, label: field.label })
    }
  })
  return missing
}

/** What the bar says about a form: how much there is to fill in, and what is still missing. */
export function formLine(pages: readonly (readonly FormField[])[]) {
  // Round buttons of one name, and a field shown in several places, are one field.
  const count = new Set(
    pages
      .flat()
      .filter(fillable)
      .map((field) => field.name)
  ).size
  if (!count) return ""
  const missing = unfilled(pages).length
  const fields = `${count.toLocaleString("en")} field${count === 1 ? "" : "s"} to fill in`
  return missing
    ? `${fields}. ${missing.toLocaleString("en")} that must be filled in ${missing === 1 ? "is" : "are"} still empty.`
    : `${fields}.`
}

/** A line of a list as it is drawn. */
export interface ListRow {
  text: string
  /** How far its top is from the top of the list, in points. */
  top: number
  chosen: boolean
}

/**
 * How a list is drawn in its box: the size of its letters, the height of a
 * line, and the lines that fit. The lines are made smaller, down to a
 * size that can still be read, before any is left out; when some must be,
 * the list starts at the first one that is chosen so that it can be seen.
 */
export function listRows(
  field: Pick<FormField, "options" | "value">,
  height: number
): { size: number; line: number; rows: ListRow[] } {
  const chosen = new Set(field.value.split("\n").filter(Boolean))
  const count = Math.max(1, field.options.length)
  const line = Math.min(14, Math.max(8, (height - 2) / count))
  const fit = Math.max(1, Math.floor((height - 2) / line))
  const first = field.options.findIndex((option) => chosen.has(option))
  const start = Math.max(
    0,
    Math.min(first < 0 ? 0 : first, field.options.length - fit)
  )
  return {
    size: line * 0.82,
    line,
    rows: field.options.slice(start, start + fit).map((text, at) => ({
      text,
      top: 1 + at * line,
      chosen: chosen.has(text),
    })),
  }
}
