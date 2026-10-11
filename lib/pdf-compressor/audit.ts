/**
 * What a file's bytes are spent on. The engine names what each stored stream
 * is for; this adds them up into the few groups a person can act on.
 */

export type AuditKind =
  | "pictures"
  | "fonts"
  | "content"
  | "private"
  | "attachments"
  | "thumbnails"
  | "details"
  | "profiles"
  | "rest"

export interface AuditItem {
  kind: Exclude<AuditKind, "rest">
  bytes: number
}

export interface AuditPart {
  kind: AuditKind
  bytes: number
  /** Its share of the file, from 0 to 1. */
  share: number
}

export interface Breakdown {
  total: number
  /** Largest first, with what cannot be told apart ("rest") last. Empty groups are left out. */
  parts: AuditPart[]
}

export const auditLabels: Record<AuditKind, string> = {
  pictures: "Pictures",
  fonts: "Fonts",
  content: "Text and drawings",
  private: "Private data of the app that made it",
  attachments: "Attached files",
  thumbnails: "Page thumbnails",
  details: "Document details",
  profiles: "Colour profiles",
  rest: "Structure and everything else",
}

/**
 * Add up a file's streams by kind.
 * @param total The size of the file in bytes. What the streams do not account for is the "rest".
 */
export function breakdown(total: number, items: readonly AuditItem[]) {
  const sums = new Map<AuditKind, number>()
  let known = 0
  for (const item of items) {
    sums.set(item.kind, (sums.get(item.kind) ?? 0) + item.bytes)
    known += item.bytes
  }
  // A damaged file can claim more than it holds; shares still add up to one.
  const whole = Math.max(total, known)
  const parts: AuditPart[] = [...sums]
    .filter(([, bytes]) => bytes > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, bytes]) => ({ kind, bytes, share: bytes / whole }))
  const rest = whole - known
  if (rest > 0) parts.push({ kind: "rest", bytes: rest, share: rest / whole })
  return { total: whole, parts } satisfies Breakdown
}

/** One picture of a file, for the list of what weighs most. */
export interface PictureRow {
  /** The number the file gives the picture. */
  object: number
  width: number
  height: number
  bytes: number
  /** The first page that shows it, counted from 1; null when none was found. */
  page: number | null
}

/** The heaviest pictures, heaviest first. */
export function heaviest(rows: readonly PictureRow[], count = 5) {
  return [...rows]
    .sort((a, b) => b.bytes - a.bytes || a.object - b.object)
    .slice(0, count)
}

/** A share as a whole percent, with anything real shown as at least 1. */
export function percentOf(share: number) {
  if (share <= 0) return 0
  return Math.max(1, Math.round(share * 100))
}
