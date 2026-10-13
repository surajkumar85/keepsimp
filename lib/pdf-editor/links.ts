/**
 * Links: the places of a page that lead somewhere when they are pressed,
 * to an address on the web or to another page of the file. They can be
 * added, led somewhere else, moved, made larger or smaller, and taken away.
 *
 * This is the part that needs no engine: what a link leads to, how that is
 * typed and said, and what a change to a link is.
 */
import type { Box } from "./geometry"

/** Where a link leads: an address, or a page of the file, counted from 0. */
export type LinkTarget = { url: string } | { page: number }

/** A link of a page as the editor offers it. */
export interface PageLink {
  /** Which of the page's links it is, from 0 in the order the file has them. */
  index: number
  /** Where it lies, in points as the page is shown. */
  box: Box
  /** Where it leads; null when the file does not say it in a way that is understood. */
  to: LinkTarget | null
}

/** The longest an address is. */
export const LONGEST_ADDRESS = 2000
/** The smallest a link is, across and down, in points. */
export const SMALLEST_LINK = 4

/** The kinds of address a link is given: the web, a letter, a telephone. Nothing that runs anything. */
const KINDS = ["http:", "https:", "mailto:", "tel:"]

/**
 * An address as a link takes it, from what was typed; null when it is not
 * one a link is given. A name without its kind is taken for the web, and
 * what looks like a letter's address for a letter.
 */
export function addressFrom(typed: string): string | null {
  const text = typed.trim()
  if (!text || text.length > LONGEST_ADDRESS || /\s/.test(text)) return null
  let wanted = text
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    if (/^[^@/]+@[^@/]+\.[^@/]+$/.test(text)) wanted = `mailto:${text}`
    else if (/^[^/]+\.[^/.]{2,}(\/|$)/.test(text)) wanted = `https://${text}`
    else return null
  }
  let url: URL
  try {
    url = new URL(wanted)
  } catch {
    return null
  }
  if (!KINDS.includes(url.protocol)) return null
  // The web needs somewhere to go.
  if (url.protocol.startsWith("http") && !url.hostname.includes("."))
    return null
  return url.href
}

/**
 * Where a link is to lead, from what was typed: a page ("3", "page 3", "p.
 * 3") or an address; null when it is neither, or a page the file has not.
 * @param pages How many pages the file has.
 */
export function targetFrom(typed: string, pages: number): LinkTarget | null {
  const text = typed.trim()
  const page = /^(?:page|p\.?)?\s*(\d{1,6})$/i.exec(text)
  if (page) {
    const number = Number(page[1])
    return number >= 1 && number <= pages ? { page: number - 1 } : null
  }
  const url = addressFrom(text)
  return url ? { url } : null
}

/** Where a link leads, as it is typed and shown. */
export const targetText = (to: LinkTarget | null) =>
  !to ? "" : "url" in to ? to.url : `Page ${to.page + 1}`

/** What a link is called: where it leads, shortly. */
export function linkName(to: LinkTarget | null) {
  if (!to) return "Link that leads somewhere this editor cannot read"
  if ("page" in to) return `Link to page ${to.page + 1}`
  const short = to.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
  return `Link to ${short.length > 60 ? `${short.slice(0, 60)}…` : short}`
}

/**
 * Change the links of a page. With no link named, one is added, which
 * needs a place and somewhere to lead. A link that is named is put
 * somewhere else, led somewhere else, or taken away.
 */
export interface LinkOp {
  do: "link"
  page: number
  /** The link that is meant: which of the page's links, and where it lies, to be sure of it. */
  index?: number
  at?: Box
  /** Where it is to lie. */
  box?: Box
  /** Where it is to lead. */
  to?: LinkTarget
  remove?: true
}

export interface LinkChange {
  label: string
  ops: LinkOp[]
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)
const FURTHEST = 100_000

function readBox(value: unknown): Box | null {
  if (typeof value !== "object" || value === null) return null
  const { x, y, width, height } = value as Record<string, unknown>
  if (
    ![x, y, width, height].every(
      (one) => isNumber(one) && Math.abs(one) <= FURTHEST
    )
  )
    return null
  const box = { x, y, width, height } as Box
  return box.width >= SMALLEST_LINK && box.height >= SMALLEST_LINK ? box : null
}

function readTarget(value: unknown): LinkTarget | null {
  if (typeof value !== "object" || value === null) return null
  const { url, page } = value as Record<string, unknown>
  if (typeof url === "string") {
    // Only what could have been typed: the address as it would be taken.
    const address = addressFrom(url)
    return address ? { url: address } : null
  }
  return Number.isInteger(page) && (page as number) >= 0
    ? { page: page as number }
    : null
}

/** A change to a link as it arrives from the page or from a draft, or null when it is not one. */
export function readLinkOp(value: unknown): LinkOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  if (op.do !== "link" || !Number.isInteger(op.page) || (op.page as number) < 0)
    return null
  const base = { do: "link" as const, page: op.page as number }
  const box = op.box === undefined ? undefined : readBox(op.box)
  const to = op.to === undefined ? undefined : readTarget(op.to)
  if (box === null || to === null) return null
  if (op.index === undefined && op.at === undefined) {
    // A new link.
    return box && to ? { ...base, box, to } : null
  }
  const at = readBox(op.at)
  if (!Number.isInteger(op.index) || (op.index as number) < 0 || !at)
    return null
  const named = { ...base, index: op.index as number, at }
  if (op.remove === true) return { ...named, remove: true }
  if (!box && !to) return null
  return { ...named, ...(box ? { box } : null), ...(to ? { to } : null) }
}

/** Whether two boxes are the same place, to within what reading and writing lose. */
export const sameBox = (one: Box, two: Box) =>
  Math.abs(one.x - two.x) <= 0.5 &&
  Math.abs(one.y - two.y) <= 0.5 &&
  Math.abs(one.width - two.width) <= 0.5 &&
  Math.abs(one.height - two.height) <= 0.5

/** Whether two links lead to the same place. */
export const sameTarget = (one: LinkTarget | null, two: LinkTarget | null) =>
  targetText(one) === targetText(two) && Boolean(one) === Boolean(two)
