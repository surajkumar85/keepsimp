import type { Size } from "@/lib/image-compressor/geometry"

/** Screen pixels for one point (1/72 inch) at 100%: a page at its printed size. */
export const POINT = 96 / 72
/** Space between pages and around the column, in screen pixels. */
export const GAP = 16
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
/** The stops the zoom buttons move between. */
export const ZOOMS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
]

export const clampZoom = (zoom: number) =>
  Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : 1

/** A page's size once a quarter turn is applied. */
export const turned = (size: Size, rotation: number): Size =>
  rotation % 180 === 0 ? size : { width: size.height, height: size.width }

/**
 * Where a spot on a page ends up once the page is turned clockwise, measured
 * from the top left corner of the turned page.
 */
export function turnedPoint(
  point: { x: number; y: number },
  size: Size,
  rotation: number
) {
  const turn = ((rotation % 360) + 360) % 360
  if (turn === 90) return { x: size.height - point.y, y: point.x }
  if (turn === 180) return { x: size.width - point.x, y: size.height - point.y }
  if (turn === 270) return { x: point.y, y: size.width - point.x }
  return point
}

/** The zoom at which a page is exactly as wide as the room for it. */
export const fitWidth = (page: Size, room: Size) =>
  clampZoom((room.width - GAP * 2) / (Math.max(page.width, 1) * POINT))

/** The zoom at which a whole page can be seen at once. */
export const fitPage = (page: Size, room: Size) =>
  clampZoom(
    Math.min(
      (room.width - GAP * 2) / (Math.max(page.width, 1) * POINT),
      (room.height - GAP * 2) / (Math.max(page.height, 1) * POINT)
    )
  )

/** How the zoom is chosen: to suit the room, or a number someone asked for. */
export type ZoomChoice =
  /** As wide as the room allows, but no larger than a comfortable reading size. */
  | { fit: "auto" }
  | { fit: "width" }
  /** So that this page, counted from 0, is seen whole. */
  | { fit: "page"; page: number }
  | { fit: null; zoom: number }

/** The largest zoom "auto" chooses. */
export const COMFORTABLE = 1.25

/** The zoom a choice comes to, for pages of these sizes in a room. */
export function zoomFor(
  choice: ZoomChoice,
  sizes: readonly Size[],
  room: Size
) {
  if (choice.fit === null) return clampZoom(choice.zoom)
  if (!sizes.length) return 1
  if (choice.fit === "page")
    return fitPage(sizes[choice.page] ?? sizes[0], room)
  // The widest page decides, so no page needs scrolling sideways.
  const widest = sizes.reduce((a, b) => (b.width > a.width ? b : a))
  const width = fitWidth(widest, room)
  return choice.fit === "auto" ? Math.min(width, COMFORTABLE) : width
}

/**
 * The next stop in a direction. A stop within a couple of percent of the
 * zoom does not count, so every press makes a change that can be seen.
 */
export function stepZoom(zoom: number, direction: 1 | -1) {
  const next =
    direction === 1
      ? ZOOMS.find((stop) => stop > zoom + 0.02)
      : [...ZOOMS].reverse().find((stop) => stop < zoom - 0.02)
  return next ?? (direction === 1 ? MAX_ZOOM : MIN_ZOOM)
}

export const zoomLabel = (zoom: number) => `${Math.round(zoom * 100)}%`

export interface Column {
  /** Each page's box in screen pixels; `top` is measured from the top of the column. */
  pages: { top: number; width: number; height: number }[]
  /** The whole column, including the space around it. */
  width: number
  height: number
}

/** Stack pages in one column at a zoom. Sizes are in points, as the pages are shown. */
export function layoutColumn(sizes: readonly Size[], zoom: number): Column {
  const scale = zoom * POINT
  let top = GAP
  let widest = 0
  const pages = sizes.map((size) => {
    const box = {
      top,
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    }
    top += box.height + GAP
    widest = Math.max(widest, box.width)
    return box
  })
  return { pages, width: widest + GAP * 2, height: top }
}

/** The first page whose foot is below a line, by halving; the last page when none is. */
function firstBelow(column: Column, line: number) {
  let low = 0
  let high = column.pages.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    const page = column.pages[middle]
    if (page.top + page.height > line) high = middle
    else low = middle + 1
  }
  return low
}

/**
 * The pages worth drawing: those on screen and those within `margin` pixels
 * of it, as the first and last page counted from 0. Null for an empty column.
 */
export function pagesNear(
  column: Column,
  scrollTop: number,
  roomHeight: number,
  margin: number
): { first: number; last: number } | null {
  if (!column.pages.length) return null
  const first = firstBelow(column, scrollTop - margin)
  let last = first
  const end = scrollTop + roomHeight + margin
  while (last + 1 < column.pages.length && column.pages[last + 1].top < end)
    last++
  return { first, last }
}

/** The page a reader would say they are on: the one with most of the screen. */
export function currentPage(
  column: Column,
  scrollTop: number,
  roomHeight: number
) {
  if (!column.pages.length) return 0
  const start = firstBelow(column, scrollTop)
  const end = scrollTop + roomHeight
  let best = start
  let most = -1
  for (let at = start; at < column.pages.length; at++) {
    const page = column.pages[at]
    if (page.top >= end) break
    const seen =
      Math.min(page.top + page.height, end) - Math.max(page.top, scrollTop)
    if (seen > most) {
      most = seen
      best = at
    }
  }
  return best
}

/** Where to scroll so a page starts at the top of the screen. */
export const scrollToPage = (column: Column, page: number) =>
  column.pages.length
    ? Math.max(
        0,
        column.pages[Math.min(Math.max(page, 0), column.pages.length - 1)].top -
          GAP
      )
    : 0

/** A spot in the document that does not depend on the zoom. */
export interface Anchor {
  page: number
  /** How far down that page, from 0 at its top to 1 at its foot; outside that range in the gaps. */
  along: number
}

/** The spot at the middle of the screen. */
export function anchorAt(
  column: Column,
  scrollTop: number,
  roomHeight: number
): Anchor {
  if (!column.pages.length) return { page: 0, along: 0 }
  const line = scrollTop + roomHeight / 2
  const at = firstBelow(column, line)
  const page = column.pages[at]
  return { page: at, along: (line - page.top) / page.height }
}

/** Where to scroll so a spot is at the middle of the screen again. */
export function scrollToAnchor(
  column: Column,
  anchor: Anchor,
  roomHeight: number
) {
  const page = column.pages[anchor.page]
  if (!page) return 0
  const line = page.top + anchor.along * page.height
  return Math.max(
    0,
    Math.min(column.height - roomHeight, line - roomHeight / 2)
  )
}

/**
 * How many pixels to draw a page with on its longer side: enough for the
 * screen's density, and no more than `limit`.
 */
export const drawEdge = (
  box: { width: number; height: number },
  density: number,
  limit: number
) =>
  Math.max(
    1,
    Math.min(limit, Math.ceil(Math.max(box.width, box.height) * density))
  )

/** A page number as typed, to a page counted from 0; null when it is not one of the pages. */
export function parsePageNumber(text: string, count: number) {
  if (!/^\s*\d+\s*$/.test(text)) return null
  const page = Number(text)
  return page >= 1 && page <= count ? page - 1 : null
}
