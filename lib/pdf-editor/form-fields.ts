/** Making the file's own AcroForm fields. No scripts from the page are accepted. */
import type { Size } from "@/lib/image-compressor/geometry"
import type { Box } from "./geometry"

export const MAKE_KINDS = [
  "text",
  "multiline",
  "check",
  "radio",
  "choice",
  "list",
  "date",
  "signature",
] as const
export type MakeKind = (typeof MAKE_KINDS)[number]
export const KIND_NAMES: Record<MakeKind, string> = {
  text: "Text field",
  multiline: "Multiline text",
  check: "Checkbox",
  radio: "Radio group",
  choice: "Dropdown",
  list: "List",
  date: "Date",
  signature: "Signature place",
}
export interface FieldSpec {
  kind: MakeKind
  name: string
  tooltip: string
  required: boolean
  maxLength: number
  options: string[]
  multiple: boolean
}
export type MakeFieldOp =
  | { do: "add"; page: number; box: Box; field: FieldSpec }
  | { do: "reshape"; page: number; id: string; box: Box }
  | {
      do: "properties"
      page: number
      id: string
      name: string
      tooltip: string
      required: boolean
      maxLength: number
    }
  | { do: "delete"; page: number; id: string }
  /** The order the Tab key goes through these fields of a page, first to last. */
  | { do: "order"; page: number; ids: string[] }
  /** A field of its own, like this one, at the same place on each of these pages. */
  | { do: "copy"; page: number; id: string; to: number[] }
export interface MakeFieldChange {
  label: string
  ops: MakeFieldOp[]
}
export const MIN_FIELD = 8
export const MOST_CHOICES = 100
export const MAX_LENGTH = 100_000
/** The most fields one change puts in order, or pages one field is copied to. */
export const MOST_IN_ONE = 5000
const isFieldId = (value: unknown): value is string =>
  typeof value === "string" && /^f\d+$/.test(value)
/** Dots name levels of a field tree; a name here is one flat part of it. */
export const validName = (value: unknown): value is string =>
  typeof value === "string" &&
  value === value.trim() &&
  value.length > 0 &&
  value.length <= 100 &&
  !/[.\p{Cc}]/u.test(value)
const tooltipOf = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 300 && !/[\p{Cc}]/u.test(value)
const lengthOf = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) <= MAX_LENGTH
export function readFieldSpec(value: unknown): FieldSpec | null {
  if (typeof value !== "object" || value === null) return null
  const v = value as Record<string, unknown>
  if (
    !MAKE_KINDS.includes(v.kind as MakeKind) ||
    !validName(v.name) ||
    !tooltipOf(v.tooltip) ||
    typeof v.required !== "boolean" ||
    !lengthOf(v.maxLength) ||
    typeof v.multiple !== "boolean"
  )
    return null
  if (
    !Array.isArray(v.options) ||
    v.options.length > MOST_CHOICES ||
    v.options.some(
      (option) =>
        typeof option !== "string" ||
        !option.trim() ||
        option.length > 200 ||
        /[\p{Cc}]/u.test(option)
    )
  )
    return null
  const kind = v.kind as MakeKind
  const options = v.options as string[]
  if (new Set(options).size !== options.length) return null
  const choice = kind === "choice" || kind === "list" || kind === "radio"
  if (
    choice ? options.length < (kind === "radio" ? 2 : 1) : options.length !== 0
  )
    return null
  return {
    kind,
    name: v.name,
    tooltip: v.tooltip,
    required: v.required,
    maxLength: v.maxLength,
    options: [...options],
    multiple: v.multiple,
  }
}
export function readFieldBox(value: unknown): Box | null {
  if (typeof value !== "object" || value === null) return null
  const b = value as Box
  if (
    ![b.x, b.y, b.width, b.height].every(
      (n) =>
        typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100_000
    ) ||
    b.x < 0 ||
    b.y < 0 ||
    b.width < MIN_FIELD ||
    b.height < MIN_FIELD
  )
    return null
  return { x: b.x, y: b.y, width: b.width, height: b.height }
}
export function readMakeFieldOp(value: unknown): MakeFieldOp | null {
  if (typeof value !== "object" || value === null) return null
  const v = value as Record<string, unknown>
  if (!Number.isInteger(v.page) || (v.page as number) < 0) return null
  const page = v.page as number
  if (v.do === "add") {
    const box = readFieldBox(v.box),
      field = readFieldSpec(v.field)
    return box && field ? { do: "add", page, box, field } : null
  }
  if (v.do === "order") {
    const ids = v.ids
    return Array.isArray(ids) &&
      ids.length > 0 &&
      ids.length <= MOST_IN_ONE &&
      ids.every(isFieldId) &&
      new Set(ids).size === ids.length
      ? { do: "order", page, ids: [...ids] }
      : null
  }
  if (!isFieldId(v.id)) return null
  const id = v.id
  if (v.do === "copy") {
    const to = v.to
    return Array.isArray(to) &&
      to.length > 0 &&
      to.length <= MOST_IN_ONE &&
      to.every(
        (one) => Number.isInteger(one) && (one as number) >= 0 && one !== page
      ) &&
      new Set(to).size === to.length
      ? { do: "copy", page, id, to: [...(to as number[])] }
      : null
  }
  if (v.do === "delete") return { do: "delete", page, id }
  if (v.do === "reshape") {
    const box = readFieldBox(v.box)
    return box ? { do: "reshape", page, id, box } : null
  }
  if (
    v.do === "properties" &&
    validName(v.name) &&
    tooltipOf(v.tooltip) &&
    typeof v.required === "boolean" &&
    lengthOf(v.maxLength)
  )
    return {
      do: "properties",
      page,
      id,
      name: v.name,
      tooltip: v.tooltip,
      required: v.required,
      maxLength: v.maxLength,
    }
  return null
}
/** Names are unique across the whole form, including a parent/child name collision. */
export const nameTaken = (
  names: readonly string[],
  name: string,
  except = ""
) =>
  names.some(
    (other) =>
      other !== except &&
      (other === name ||
        other.startsWith(`${name}.`) ||
        name.startsWith(`${other}.`))
  )
/** A name for a copy of a field on another page: its own name and that page's number. */
export function copyName(name: string, page: number, names: readonly string[]) {
  const stem = name.slice(0, 90)
  let candidate = `${stem}_p${page + 1}`
  for (let n = 2; nameTaken(names, candidate); n++)
    candidate = `${stem}_p${page + 1}_${n}`
  return candidate
}

export function offeredName(kind: MakeKind, names: readonly string[]) {
  const stem = KIND_NAMES[kind].replace(/ /g, "_")
  let n = 1
  while (nameTaken(names, `${stem}_${n}`)) n++
  return `${stem}_${n}`
}
export function defaultSpec(
  kind: MakeKind,
  names: readonly string[] = []
): FieldSpec {
  return {
    kind,
    name: offeredName(kind, names),
    tooltip: "",
    required: false,
    maxLength: 0,
    options:
      kind === "radio"
        ? ["Option 1", "Option 2"]
        : kind === "choice" || kind === "list"
          ? ["Choice 1", "Choice 2"]
          : [],
    multiple: false,
  }
}
/** Keep the whole field inside the visible page, including after keyboard resizing. */
export function fitField(box: Box, page: Size): Box {
  const width = Math.min(Math.max(MIN_FIELD, box.width), page.width),
    height = Math.min(Math.max(MIN_FIELD, box.height), page.height)
  return {
    width,
    height,
    x: Math.max(0, Math.min(box.x, page.width - width)),
    y: Math.max(0, Math.min(box.y, page.height - height)),
  }
}
export function initialField(
  kind: MakeKind,
  page: Size,
  point: { x: number; y: number }
): Box {
  const width = kind === "check" ? 20 : 180
  const height =
    kind === "multiline" || kind === "list" || kind === "radio" ? 64 : 24
  return fitField(
    { x: point.x - width / 2, y: point.y - height / 2, width, height },
    page
  )
}

/** Safe, fixed metadata; external viewers may format it, KeepSimp only reads it. */
export const DATE_ACTION = 'AFDate_FormatEx("yyyy-mm-dd");'
