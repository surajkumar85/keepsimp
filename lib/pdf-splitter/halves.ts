import type { Size } from "@/lib/image-compressor/geometry"
import type { Area } from "./text-rule"

/** A box in a file's own units: left, bottom, right, top, with "up" being up. */
export type Box = readonly [number, number, number, number]

/** How pages that hold two pages are cut. */
export interface HalfChoice {
  /** The two pages sit side by side, or one above the other. */
  direction: "across" | "down"
  /** Where the cut is, as a share of the page from its left or its top. */
  at: number
  /** Which half is read first: the left or top one, or the right or bottom one. */
  first: "start" | "end"
}

export const defaultHalves: HalfChoice = {
  direction: "across",
  at: 0.5,
  first: "start",
}

/** The cut may not be so near an edge that a half is a sliver. */
export const clampCut = (at: number) =>
  Number.isFinite(at) ? Math.min(0.8, Math.max(0.2, at)) : 0.5

/** The two halves of a page as it is shown, the one read first coming first. */
export function halfAreas(choice: HalfChoice): [Area, Area] {
  const at = clampCut(choice.at)
  const whole = { left: 0, top: 0, right: 1, bottom: 1 }
  const halves: [Area, Area] =
    choice.direction === "across"
      ? [
          { ...whole, right: at },
          { ...whole, left: at },
        ]
      : [
          { ...whole, bottom: at },
          { ...whole, top: at },
        ]
  return choice.first === "start" ? halves : [halves[1], halves[0]]
}

/**
 * An area of a page as it is shown, as a box in the file's own units. A page
 * may be stored turned: `rotation` is the clockwise turn a viewer applies,
 * so "left" on screen may be any side of the stored page.
 */
export function areaToBox(page: Box, rotation: number, area: Area): Box {
  const [x0, y0, x1, y1] = page
  const width = x1 - x0
  const height = y1 - y0
  const turn = ((rotation % 360) + 360) % 360
  /** A point of the shown page, as shares from its top left, in the file's units. */
  const point = (u: number, v: number): [number, number] =>
    turn === 90
      ? [x0 + v * width, y0 + u * height]
      : turn === 180
        ? [x1 - u * width, y0 + v * height]
        : turn === 270
          ? [x1 - v * width, y1 - u * height]
          : [x0 + u * width, y1 - v * height]
  const [ax, ay] = point(area.left, area.top)
  const [bx, by] = point(area.right, area.bottom)
  return [
    Math.min(ax, bx),
    Math.min(ay, by),
    Math.max(ax, bx),
    Math.max(ay, by),
  ]
}

/** Which pages are cut in half. */
export type HalveWhich =
  /** Every page. */
  | "all"
  /** Only pages that are wider than tall (or taller than wide, when cutting down). */
  | "wide"

/**
 * For each page, whether it is cut in half. A cover that is a single page
 * can be kept whole, as can pages that are not the shape of a double page.
 */
export function pagesToHalve(
  sizes: readonly Size[],
  choice: {
    which: HalveWhich
    direction: HalfChoice["direction"]
    cover: boolean
  }
) {
  return sizes.map((size, page) => {
    if (choice.cover && page === 0) return false
    if (choice.which === "all") return true
    return choice.direction === "across"
      ? size.width > size.height
      : size.height > size.width
  })
}

/** Everything that decides how double pages are cut in half. */
export interface HalveChoice extends HalfChoice {
  which: HalveWhich
  /** The first page is a single cover and stays whole. */
  cover: boolean
}

/** One page of the result: a page of the file, whole or one of its halves. */
export interface HalfPage {
  /** The page of the file, counted from 0. */
  page: number
  /** Which half, the one read first being 0; null for the whole page. */
  half: 0 | 1 | null
}

/** The pages of the result, in reading order. */
export const halvedPages = (halve: readonly boolean[]): HalfPage[] =>
  halve.flatMap((cut, page): HalfPage[] =>
    cut
      ? [
          { page, half: 0 },
          { page, half: 1 },
        ]
      : [{ page, half: null }]
  )
