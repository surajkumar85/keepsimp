export interface Size {
  width: number
  height: number
}
export interface Rect extends Size {
  x: number
  y: number
}
export type Rotation = 0 | 90 | 180 | 270
export type Fit = "contain" | "cover" | "stretch"
export type SizeUnit = "px" | "percent"
export type AspectPreset =
  "free" | "original" | "1:1" | "4:5" | "4:3" | "3:2" | "16:9" | "9:16"
export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export const MAX_SIDE = 16383
export const MAX_PIXELS = 50_000_000

export const aspectPresets: AspectPreset[] = [
  "free",
  "original",
  "1:1",
  "4:5",
  "4:3",
  "3:2",
  "16:9",
  "9:16",
]

export type ResizeMode =
  | { kind: "original" }
  | { kind: "scale"; percent: number }
  | { kind: "long-edge"; pixels: number }
  | {
      kind: "custom"
      width: number | null
      height: number | null
      unit: SizeUnit
      lock: boolean
      fit: Fit
    }

export function rotate(rotation: Rotation, direction: "left" | "right") {
  return ((rotation + (direction === "right" ? 90 : 270)) % 360) as Rotation
}

export function orientedSize(size: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { ...size }
}

const positive = (value: number) => Number.isFinite(value) && value > 0
const atLeastOne = (value: number) => Math.max(1, Math.round(value))

export function validateSize(size: Size) {
  if (![size.width, size.height].every((v) => Number.isInteger(v) && v > 0))
    return "Use whole-number dimensions greater than zero."
  if (size.width > MAX_SIDE || size.height > MAX_SIDE)
    return `Keep each side at ${MAX_SIDE.toLocaleString("en-US")} px or less.`
  if (size.width * size.height > MAX_PIXELS)
    return "Keep the output at 50 megapixels or less."
  return null
}

/**
 * Work out the output size and which part of the (cropped) source fills it.
 * `source` is relative to the crop; "cover" trims the overflow from the centre.
 */
export function resolveResize(
  source: Size,
  mode: ResizeMode
): { output: Size; region: Rect } {
  const whole = { x: 0, y: 0, ...source }
  if (mode.kind === "original") return { output: { ...source }, region: whole }
  if (mode.kind === "scale") {
    if (!positive(mode.percent)) throw new Error("Choose a scale above 0%.")
    const factor = mode.percent / 100
    return {
      output: {
        width: atLeastOne(source.width * factor),
        height: atLeastOne(source.height * factor),
      },
      region: whole,
    }
  }
  if (mode.kind === "long-edge") {
    if (!positive(mode.pixels)) throw new Error("Choose a long edge above 0.")
    const factor = mode.pixels / Math.max(source.width, source.height)
    return {
      output: {
        width: atLeastOne(source.width * factor),
        height: atLeastOne(source.height * factor),
      },
      region: whole,
    }
  }
  const toPixels = (value: number | null, base: number) =>
    value === null
      ? null
      : mode.unit === "percent"
        ? (base * value) / 100
        : value
  const width = toPixels(mode.width, source.width)
  const height = toPixels(mode.height, source.height)
  if (
    (width !== null && !positive(width)) ||
    (height !== null && !positive(height))
  )
    throw new Error("Enter a width and height greater than zero.")
  if (width === null && height === null)
    throw new Error("Enter a width or a height.")
  const ratio = source.width / source.height
  if (mode.lock || width === null || height === null) {
    const output =
      width !== null
        ? { width: atLeastOne(width), height: atLeastOne(width / ratio) }
        : { width: atLeastOne(height! * ratio), height: atLeastOne(height!) }
    return { output, region: whole }
  }
  const box = { width: atLeastOne(width), height: atLeastOne(height) }
  if (mode.fit === "stretch") return { output: box, region: whole }
  if (mode.fit === "contain") {
    const factor = Math.min(
      box.width / source.width,
      box.height / source.height
    )
    return {
      output: {
        width: atLeastOne(source.width * factor),
        height: atLeastOne(source.height * factor),
      },
      region: whole,
    }
  }
  const factor = Math.max(box.width / source.width, box.height / source.height)
  const regionWidth = Math.min(source.width, atLeastOne(box.width / factor))
  const regionHeight = Math.min(source.height, atLeastOne(box.height / factor))
  return {
    output: box,
    region: {
      x: Math.floor((source.width - regionWidth) / 2),
      y: Math.floor((source.height - regionHeight) / 2),
      width: regionWidth,
      height: regionHeight,
    },
  }
}

export function aspectValue(preset: AspectPreset, source: Size) {
  if (preset === "free") return null
  if (preset === "original") return source.width / source.height
  const [w, h] = preset.split(":").map(Number)
  return w / h
}

/** The largest centred crop with the requested aspect ratio. */
export function initialCrop(source: Size, aspect: number | null): Rect {
  if (aspect === null) return { x: 0, y: 0, ...source }
  let width = source.width
  let height = Math.round(width / aspect)
  if (height > source.height) {
    height = source.height
    width = Math.round(height * aspect)
  }
  width = Math.max(1, Math.min(source.width, width))
  height = Math.max(1, Math.min(source.height, height))
  return {
    x: Math.floor((source.width - width) / 2),
    y: Math.floor((source.height - height) / 2),
    width,
    height,
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Round to whole pixels and keep the rectangle inside the image. */
export function clampCrop(rect: Rect, bounds: Size): Rect {
  const width = clamp(Math.round(rect.width), 1, bounds.width)
  const height = clamp(Math.round(rect.height), 1, bounds.height)
  return {
    x: clamp(Math.round(rect.x), 0, bounds.width - width),
    y: clamp(Math.round(rect.y), 0, bounds.height - height),
    width,
    height,
  }
}

export function moveCrop(rect: Rect, dx: number, dy: number, bounds: Size) {
  return clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds)
}

/** Drag one edge or corner; with an aspect ratio the opposite side stays anchored. */
export function resizeCrop(
  rect: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: Size,
  aspect: number | null
): Rect {
  const west = handle.includes("w")
  const east = handle.includes("e")
  const north = handle.includes("n")
  const south = handle.includes("s")
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const left = west ? clamp(rect.x + dx, 0, right - 1) : rect.x
  const top = north ? clamp(rect.y + dy, 0, bottom - 1) : rect.y
  const newRight = east ? clamp(right + dx, left + 1, bounds.width) : right
  const newBottom = south ? clamp(bottom + dy, top + 1, bounds.height) : bottom
  if (aspect === null)
    return clampCrop(
      { x: left, y: top, width: newRight - left, height: newBottom - top },
      bounds
    )
  let width = newRight - left
  let height = newBottom - top
  const horizontal = west || east
  const vertical = north || south
  if (horizontal && !vertical) height = width / aspect
  else if (vertical && !horizontal) width = height * aspect
  else if (width / aspect > height) height = width / aspect
  else width = height * aspect
  const centreX = rect.x + rect.width / 2
  const centreY = rect.y + rect.height / 2
  const maxWidth = west
    ? right
    : east
      ? bounds.width - left
      : 2 * Math.min(centreX, bounds.width - centreX)
  const maxHeight = north
    ? bottom
    : south
      ? bounds.height - top
      : 2 * Math.min(centreY, bounds.height - centreY)
  const factor = Math.min(1, maxWidth / width, maxHeight / height)
  width *= factor
  height *= factor
  return clampCrop(
    {
      x: west ? right - width : east ? left : centreX - width / 2,
      y: north ? bottom - height : south ? top : centreY - height / 2,
      width,
      height,
    },
    bounds
  )
}

/** Map a crop chosen on the unrotated image when the rotation changes, keeping the same pixels. */
export function rotateCrop(
  rect: Rect,
  bounds: Size,
  direction: "left" | "right"
): Rect {
  return direction === "right"
    ? {
        x: bounds.height - rect.y - rect.height,
        y: rect.x,
        width: rect.height,
        height: rect.width,
      }
    : {
        x: rect.y,
        y: bounds.width - rect.x - rect.width,
        width: rect.height,
        height: rect.width,
      }
}

export function flipCrop(rect: Rect, bounds: Size, axis: "x" | "y"): Rect {
  return axis === "x"
    ? { ...rect, x: bounds.width - rect.x - rect.width }
    : { ...rect, y: bounds.height - rect.y - rect.height }
}

export interface PipelinePlan {
  rotation: Rotation
  flipX: boolean
  flipY: boolean
  /** Area of the rotated, flipped source to read, in source pixels. */
  sourceRect: Rect
  output: Size
}

export function planPipeline(options: {
  source: Size
  rotation: Rotation
  flipX: boolean
  flipY: boolean
  crop: Rect | null
  resize: ResizeMode
}): PipelinePlan {
  const oriented = orientedSize(options.source, options.rotation)
  const crop = options.crop
    ? clampCrop(options.crop, oriented)
    : { x: 0, y: 0, ...oriented }
  const { output, region } = resolveResize(crop, options.resize)
  const problem = validateSize(output)
  if (problem) throw new Error(problem)
  return {
    rotation: options.rotation,
    flipX: options.flipX,
    flipY: options.flipY,
    sourceRect: {
      x: crop.x + region.x,
      y: crop.y + region.y,
      width: region.width,
      height: region.height,
    },
    output,
  }
}

/** Successively smaller sizes for reaching a target file size; null once too small to help. */
export function downscaleStep(size: Size, factor = 0.85): Size | null {
  const next = {
    width: Math.max(1, Math.floor(size.width * factor)),
    height: Math.max(1, Math.floor(size.height * factor)),
  }
  return Math.max(next.width, next.height) < 16 ? null : next
}
