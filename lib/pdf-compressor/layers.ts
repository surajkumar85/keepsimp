/**
 * A scanned page taken apart into layers: a black-and-white mask that says
 * where the ink is, at the scan's full sharpness; the paper behind it, soft
 * and small; and the colour of the ink, smaller still. Put back together
 * they look like the scan, at a fraction of its size, and the letters keep
 * their edges where a JPEG of the whole page would blur them.
 *
 * This is known as mixed raster content (ITU-T T.44). The numbers here are
 * KeepSimp's own.
 */
import type { Pixels } from "@/lib/image-compressor/ssim"

/** The brightness of every pixel, from 0 for black to 255 for white. */
export function brightness(pixels: Pixels) {
  const { data, width, height } = pixels
  const out = new Uint8Array(width * height)
  for (let index = 0; index < out.length; index++) {
    const at = index * 4
    out[index] =
      (data[at] * 77 + data[at + 1] * 150 + data[at + 2] * 29 + 128) >> 8
  }
  return out
}

/** How strongly a busy neighbourhood pulls the line between ink and paper down (Sauvola's k). */
const PULL = 0.3
/** A neighbourhood whose brightness varies less than this holds no ink: it is paper, or a flat patch. */
const FLAT = 9
/**
 * Print covers a small part of the paper it is on. A neighbourhood where
 * more than this share would be ink is a photograph or a filled shape, and
 * is left to the paper layer whole.
 */
const TOO_DENSE = 0.6
/**
 * What is left of a neighbourhood once its ink is taken away should be
 * paper: nearly all of one brightness. At least this share of it must lie
 * within `PAPER_RANGE` of its middle value, or the neighbourhood is a
 * photograph, where "ink" would be whatever happens to be darker.
 */
const PAPER_SHARE = 0.8
const PAPER_RANGE = 16
/** In a page turned black and white, a flat patch is ink when it is darker than this. */
const DARK = 110
/** Neighbourhoods are about a fortieth of the page's shorter side, within these bounds. */
const SMALLEST_TILE = 16
const LARGEST_TILE = 64

/**
 * Where the ink is. Each neighbourhood of the page sets its own line between
 * ink and paper from how bright it is and how much it varies (Sauvola, 2000),
 * so grey paper, a shadow in the fold or a tinted box do not turn into ink.
 * The lines of neighbouring neighbourhoods are blended, so no edge shows
 * between them.
 * @param everything Decide for every pixel, as a page in black and white
 *   needs: a flat dark patch is ink, and a photograph is split into dark and
 *   light. Without it, only what looks like print on paper is ink, and the
 *   rest is left for the paper layer.
 * @returns One byte a pixel, 1 for ink.
 */
export function inkMask(pixels: Pixels, everything = false) {
  const { width, height } = pixels
  const light = brightness(pixels)
  const tile = Math.min(
    LARGEST_TILE,
    Math.max(SMALLEST_TILE, Math.round(Math.min(width, height) / 40))
  )
  const columns = Math.ceil(width / tile)
  const rows = Math.ceil(height / tile)
  const lines = new Float32Array(columns * rows)
  const histogram = new Uint32Array(256)
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      let sum = 0
      let squares = 0
      let count = 0
      const bottom = Math.min(height, (row + 1) * tile)
      const right = Math.min(width, (column + 1) * tile)
      for (let y = row * tile; y < bottom; y++)
        for (let x = column * tile; x < right; x++) {
          const value = light[y * width + x]
          sum += value
          squares += value * value
          count++
        }
      const mean = sum / count
      const spread = Math.sqrt(Math.max(0, squares / count - mean * mean))
      let line =
        spread < FLAT
          ? everything
            ? DARK
            : -1
          : mean * (1 + PULL * (spread / 128 - 1))
      if (line > 0 && !everything) {
        let under = 0
        histogram.fill(0)
        for (let y = row * tile; y < bottom; y++)
          for (let x = column * tile; x < right; x++) {
            const value = light[y * width + x]
            if (value < line) under++
            else histogram[value]++
          }
        const over = count - under
        // The middle value of what is not ink, and how much of it is close by.
        let middle = 0
        for (let seen = 0; middle < 255; middle++) {
          seen += histogram[middle]
          if (seen * 2 >= over) break
        }
        let close = 0
        const from = Math.max(0, middle - PAPER_RANGE)
        const to = Math.min(255, middle + PAPER_RANGE)
        for (let value = from; value <= to; value++) close += histogram[value]
        if (under > count * TOO_DENSE || close < over * PAPER_SHARE) line = -1
      }
      lines[row * columns + column] = line
    }
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    // Between the middles of two rows of neighbourhoods.
    const down = Math.min(rows - 1, Math.max(0, y / tile - 0.5))
    const top = Math.floor(down)
    const below = Math.min(rows - 1, top + 1)
    const lower = down - top
    for (let x = 0; x < width; x++) {
      const across = Math.min(columns - 1, Math.max(0, x / tile - 0.5))
      const left = Math.floor(across)
      const next = Math.min(columns - 1, left + 1)
      const further = across - left
      const line =
        (lines[top * columns + left] * (1 - further) +
          lines[top * columns + next] * further) *
          (1 - lower) +
        (lines[below * columns + left] * (1 - further) +
          lines[below * columns + next] * further) *
          lower
      if (light[y * width + x] < line) mask[y * width + x] = 1
    }
  }
  return mask
}

/** The share of pixels that are ink, from 0 to 1. */
export function inkShare(mask: Uint8Array) {
  let ink = 0
  for (let index = 0; index < mask.length; index++) ink += mask[index]
  return mask.length ? ink / mask.length : 0
}

/**
 * The mask grown by `reach` pixels each way. The pale rim around a letter is
 * neither ink nor clean paper, and is kept out of the paper's colour with this.
 */
export function grow(
  mask: Uint8Array,
  width: number,
  height: number,
  reach: number
) {
  const across = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = Math.max(0, x - reach)
      const to = Math.min(width - 1, x + reach)
      for (let near = from; near <= to; near++)
        if (mask[y * width + near]) {
          across[y * width + x] = 1
          break
        }
    }
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = Math.max(0, y - reach)
      const to = Math.min(height - 1, y + reach)
      for (let near = from; near <= to; near++)
        if (across[near * width + x]) {
          out[y * width + x] = 1
          break
        }
    }
  return out
}

/**
 * A small picture of the mean colour of some of a page's pixels: each of its
 * pixels stands for a square of `step` by `step`. Squares with no pixel to
 * go by take the colour of the nearest square that has one, so the picture
 * is smooth where it will not be seen.
 * @param counts Which pixels count: 1 for those that do.
 * @param darkest Go by the darker half of a square's pixels only. The rim of
 *   a letter is paler than its body, and would wash the ink's colour out.
 * @param otherwise Pixels to go by in a square where none of `counts` are set,
 *   before a neighbour's colour is taken.
 */
export function meanLayer(
  pixels: Pixels,
  counts: Uint8Array,
  step: number,
  darkest = false,
  otherwise?: Uint8Array
): Pixels {
  const width = Math.ceil(pixels.width / step)
  const height = Math.ceil(pixels.height / step)
  const data = new Uint8ClampedArray(width * height * 4)
  const known = new Uint8Array(width * height)
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      let red = 0
      let green = 0
      let blue = 0
      let count = 0
      const bottom = Math.min(pixels.height, (row + 1) * step)
      const right = Math.min(pixels.width, (column + 1) * step)
      // The mean brightness of the square's pixels, when only the darker half counts.
      let limit = Infinity
      if (darkest) {
        let sum = 0
        let among = 0
        for (let y = row * step; y < bottom; y++)
          for (let x = column * step; x < right; x++) {
            const index = y * pixels.width + x
            if (!counts[index]) continue
            sum +=
              pixels.data[index * 4] +
              pixels.data[index * 4 + 1] +
              pixels.data[index * 4 + 2]
            among++
          }
        limit = among ? sum / among : Infinity
      }
      for (let y = row * step; y < bottom; y++)
        for (let x = column * step; x < right; x++) {
          const index = y * pixels.width + x
          if (!counts[index]) continue
          const r = pixels.data[index * 4]
          const g = pixels.data[index * 4 + 1]
          const b = pixels.data[index * 4 + 2]
          if (r + g + b > limit) continue
          red += r
          green += g
          blue += b
          count++
        }
      if (!count && otherwise)
        for (let y = row * step; y < bottom; y++)
          for (let x = column * step; x < right; x++) {
            const index = y * pixels.width + x
            if (!otherwise[index]) continue
            red += pixels.data[index * 4]
            green += pixels.data[index * 4 + 1]
            blue += pixels.data[index * 4 + 2]
            count++
          }
      const at = (row * width + column) * 4
      data[at + 3] = 255
      if (!count) continue
      data[at] = red / count
      data[at + 1] = green / count
      data[at + 2] = blue / count
      known[row * width + column] = 1
    }
  if (darkest) deepen(data, known, width, height)
  // Colours spread to the squares without one: along rows both ways, then
  // along columns both ways. A picture with nothing known stays as it is.
  const spread = (from: number, to: number) => {
    if (!known[from] || known[to]) return
    data.set(data.subarray(from * 4, from * 4 + 3), to * 4)
    known[to] = 1
  }
  for (let row = 0; row < height; row++) {
    for (let column = 1; column < width; column++)
      spread(row * width + column - 1, row * width + column)
    for (let column = width - 2; column >= 0; column--)
      spread(row * width + column + 1, row * width + column)
  }
  for (let column = 0; column < width; column++) {
    for (let row = 1; row < height; row++)
      spread((row - 1) * width + column, row * width + column)
    for (let row = height - 2; row >= 0; row--)
      spread((row + 1) * width + column, row * width + column)
  }
  // Ink has a few colours, not thousands: grain is rounded away, so equal
  // inks are stored as equal numbers and pack to almost nothing.
  if (darkest)
    for (let at = 0; at < data.length; at += 4)
      for (let channel = 0; channel < 3; channel++)
        data[at + channel] =
          (data[at + channel] & ~(INK_STEP - 1)) + INK_STEP / 2
  return { data, width, height }
}

/** Ink colours are rounded to steps of this many levels. */
const INK_STEP = 16

/** A colour is grey enough to be the rim of black print when its channels lie this close together. */
const GREYISH = 48
/** A square is a rim when a neighbour is darker than it by more than this. */
const PALER = 30

/**
 * Give squares that caught only the pale rim of a letter the colour of the
 * letter's body next to them. A square where a letter ends holds nothing
 * but rim, and would paint that end of the letter grey. Only greys follow a
 * darker grey: coloured ink keeps its colour beside black print.
 */
function deepen(
  data: Uint8ClampedArray,
  known: Uint8Array,
  width: number,
  height: number
) {
  const before = data.slice()
  const greyAt = (at: number) =>
    Math.max(before[at], before[at + 1], before[at + 2]) -
      Math.min(before[at], before[at + 1], before[at + 2]) <
    GREYISH
  const lightAt = (at: number) => before[at] + before[at + 1] + before[at + 2]
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const index = row * width + column
      if (!known[index] || !greyAt(index * 4)) continue
      let darkest = index
      for (let down = -1; down <= 1; down++)
        for (let across = -1; across <= 1; across++) {
          const y = row + down
          const x = column + across
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          const near = y * width + x
          if (
            known[near] &&
            greyAt(near * 4) &&
            lightAt(near * 4) < lightAt(darkest * 4)
          )
            darkest = near
        }
      if (lightAt(index * 4) - lightAt(darkest * 4) > PALER * 3)
        data.set(before.subarray(darkest * 4, darkest * 4 + 3), index * 4)
    }
}

export interface Layers {
  width: number
  height: number
  /** One byte a pixel, 1 for ink. */
  mask: Uint8Array
  /** The paper: one pixel for every `paperStep` pixels each way. */
  paper: Pixels
  paperStep: number
  /** The colour of the ink, likewise. */
  ink: Pixels
  inkStep: number
}

/** How far the rim of a letter reaches, in pixels, for a page this many pixels wide. */
const rimOf = (width: number) => Math.max(1, Math.round(width / 1200))

/**
 * Take a scanned page apart.
 * @param paperStep How many pixels of the page one pixel of the paper stands for, each way.
 * @param inkStep The same for the colour of the ink.
 */
export function splitLayers(
  pixels: Pixels,
  paperStep: number,
  inkStep: number
): Layers {
  const { width, height } = pixels
  const mask = inkMask(pixels)
  const rim = grow(mask, width, height, rimOf(width))
  const clean = new Uint8Array(rim.length)
  const bare = new Uint8Array(rim.length)
  for (let index = 0; index < rim.length; index++) {
    clean[index] = rim[index] ^ 1
    bare[index] = mask[index] ^ 1
  }
  return {
    width,
    height,
    mask,
    // Where letters stand close, the gaps between them are all rim: better
    // their own colour than a neighbour's.
    paper: meanLayer(pixels, clean, paperStep, false, bare),
    paperStep,
    ink: meanLayer(pixels, mask, inkStep, true),
    inkStep,
  }
}

/** What a viewer shows of the layers: ink where the mask says so, paper elsewhere. */
export function rebuild(layers: Layers): Pixels {
  const { width, height, mask, paper, paperStep, ink, inkStep } = layers
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const from = mask[index] ? ink : paper
      const step = mask[index] ? inkStep : paperStep
      const at = (Math.floor(y / step) * from.width + Math.floor(x / step)) * 4
      data.set(from.data.subarray(at, at + 4), index * 4)
    }
  return { data, width, height }
}
