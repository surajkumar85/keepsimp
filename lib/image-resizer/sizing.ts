import {
  validateSize,
  type Rect,
  type Size,
} from "@/lib/image-compressor/geometry"
import { focusForOffset, placeWindow, type Focus } from "./focus"
import { megapixelScale, roundTo, type Multiple } from "./units"

export type SizeMode =
  | "dimensions"
  | "width"
  | "height"
  | "longest"
  | "shortest"
  | "percent"
  | "megapixels"
  | "preset"

/** sharp's fit vocabulary: https://sharp.pixelplumbing.com/api-resize */
export type FitMode = "cover" | "contain" | "inside" | "outside" | "stretch"

export type SizeTarget =
  | { kind: "box"; width: number; height: number; fit: FitMode }
  | { kind: "width"; pixels: number }
  | { kind: "height"; pixels: number }
  | { kind: "longest"; pixels: number }
  | { kind: "shortest"; pixels: number }
  | { kind: "percent"; percent: number }
  | { kind: "megapixels"; megapixels: number }

export interface Layout {
  /** Final canvas size. */
  output: Size
  /** Part of the (rotated) source that is used. */
  sourceRect: Rect
  /** Where that part lands on the canvas; smaller than the canvas only when padding. */
  drawRect: Rect
  /** Output pixels per source pixel. */
  scale: number
  enlarged: boolean
  padded: boolean
  cropped: boolean
}

const positive = (value: number) => Number.isFinite(value) && value > 0
const atLeastOne = (value: number) => Math.max(1, Math.round(value))

function proportional(source: Size, scale: number, multiple: Multiple): Layout {
  const output = {
    width: roundTo(source.width * scale, multiple),
    height: roundTo(source.height * scale, multiple),
  }
  return {
    output,
    sourceRect: { x: 0, y: 0, ...source },
    drawRect: { x: 0, y: 0, ...output },
    scale,
    enlarged: scale > 1,
    padded: false,
    cropped: false,
  }
}

/**
 * Turn a size request into pixels: the output canvas, the source region to read
 * and where it is drawn. `focus` positions a crop, or aligns a padded image.
 */
export function resolveLayout(
  source: Size,
  target: SizeTarget,
  options: { enlarge: boolean; multiple: Multiple; focus: Focus }
): Layout {
  const limit = (scale: number) =>
    options.enlarge ? scale : Math.min(1, scale)
  let layout: Layout
  if (target.kind !== "box") {
    let scale: number
    if (target.kind === "percent") {
      if (!positive(target.percent))
        throw new Error("Enter a percentage above zero.")
      scale = target.percent / 100
    } else if (target.kind === "megapixels") {
      if (!positive(target.megapixels))
        throw new Error("Enter megapixels above zero.")
      scale = megapixelScale(source, target.megapixels)
    } else {
      if (!positive(target.pixels)) throw new Error("Enter a size above zero.")
      const reference =
        target.kind === "width"
          ? source.width
          : target.kind === "height"
            ? source.height
            : target.kind === "longest"
              ? Math.max(source.width, source.height)
              : Math.min(source.width, source.height)
      scale = target.pixels / reference
    }
    layout = proportional(source, limit(scale), options.multiple)
  } else {
    if (!positive(target.width) || !positive(target.height))
      throw new Error("Enter a width and height above zero.")
    const box = {
      width: roundTo(target.width, options.multiple),
      height: roundTo(target.height, options.multiple),
    }
    const ratioX = box.width / source.width
    const ratioY = box.height / source.height
    if (target.fit === "stretch") {
      const output = options.enlarge
        ? box
        : {
            width: Math.min(box.width, source.width),
            height: Math.min(box.height, source.height),
          }
      layout = {
        output,
        sourceRect: { x: 0, y: 0, ...source },
        drawRect: { x: 0, y: 0, ...output },
        scale: Math.max(
          output.width / source.width,
          output.height / source.height
        ),
        enlarged: output.width > source.width || output.height > source.height,
        padded: false,
        cropped: false,
      }
    } else if (target.fit === "inside" || target.fit === "outside") {
      const scale = limit(
        target.fit === "inside"
          ? Math.min(ratioX, ratioY)
          : Math.max(ratioX, ratioY)
      )
      layout = proportional(source, scale, options.multiple)
    } else if (target.fit === "cover") {
      const scale = limit(Math.max(ratioX, ratioY))
      const output = {
        width: Math.min(box.width, atLeastOne(source.width * scale)),
        height: Math.min(box.height, atLeastOne(source.height * scale)),
      }
      const width = Math.min(source.width, atLeastOne(output.width / scale))
      const height = Math.min(source.height, atLeastOne(output.height / scale))
      layout = {
        output,
        sourceRect: {
          x: placeWindow(source.width, width, options.focus.x),
          y: placeWindow(source.height, height, options.focus.y),
          width,
          height,
        },
        drawRect: { x: 0, y: 0, ...output },
        scale,
        enlarged: scale > 1,
        padded: false,
        cropped: width < source.width || height < source.height,
      }
    } else {
      const scale = limit(Math.min(ratioX, ratioY))
      const width = Math.min(box.width, atLeastOne(source.width * scale))
      const height = Math.min(box.height, atLeastOne(source.height * scale))
      layout = {
        output: box,
        sourceRect: { x: 0, y: 0, ...source },
        drawRect: {
          x: placeWindow(box.width, width, options.focus.x),
          y: placeWindow(box.height, height, options.focus.y),
          width,
          height,
        },
        scale,
        enlarged: scale > 1,
        padded: width < box.width || height < box.height,
        cropped: false,
      }
    }
  }
  const problem = validateSize(layout.output)
  if (problem) throw new Error(problem)
  return layout
}

/**
 * Move the picture inside its frame by a distance in output pixels and return
 * the focus that produces it. Dragging right shows more of the left side of a
 * crop, or pushes a padded image to the right.
 */
export function shiftFocus(
  layout: Layout,
  source: Size,
  dx: number,
  dy: number
): Focus {
  if (layout.padded || !layout.cropped) {
    const { drawRect, output } = layout
    return {
      x: focusForOffset(output.width, drawRect.width, drawRect.x + dx),
      y: focusForOffset(output.height, drawRect.height, drawRect.y + dy),
    }
  }
  const { sourceRect, scale } = layout
  return {
    x: focusForOffset(
      source.width,
      sourceRect.width,
      sourceRect.x - dx / scale
    ),
    y: focusForOffset(
      source.height,
      sourceRect.height,
      sourceRect.y - dy / scale
    ),
  }
}

/** Scale a box target to a new width, keeping its shape (for responsive sets). */
export function scaleTarget(target: SizeTarget, width: number): SizeTarget {
  if (
    target.kind !== "box" ||
    target.fit === "inside" ||
    target.fit === "outside"
  )
    return { kind: "width", pixels: width }
  return {
    kind: "box",
    width,
    height: Math.max(1, Math.round((width * target.height) / target.width)),
    fit: target.fit,
  }
}
