import type { Pixels } from "@/lib/image-compressor/ssim"
import { changedRect, cropPixels, evenRect, settle } from "./delta"
import { filterRows, writeApng, type ApngImage } from "./encoders/apng"
import { retimeGif, writeGif, type GifImage } from "./encoders/gif"
import { writeWebp, type WebpImage } from "./encoders/webp"
import { readGif } from "./decoders/gif"
import { wholeUnits } from "./timeline"
import type { Colour, Frame, Rect } from "./types"

/** A set of colours and a way to redraw any picture with them. */
export interface Palette {
  colours: Colour[]
  /** One palette index per pixel. */
  remap(pixels: Pixels, dithering: boolean): Uint8Array
  free(): void
}

export interface BuildDeps {
  /** Choose up to `colours` colours that suit a picture. */
  palette(sample: Pixels, colours: number): Promise<Palette>
  /** Encode a still WebP. */
  encodeWebp(
    pixels: Pixels,
    options: { quality: number; lossless: boolean }
  ): Promise<Uint8Array>
  /** zlib-compress bytes. */
  deflate(bytes: Uint8Array): Promise<Uint8Array>
  /** gifski: every frame at once, durations in milliseconds. */
  gifski(frames: Frame[], quality: number): Promise<Uint8Array>
  /** Called between frames; rejects when the work has been cancelled. */
  checkpoint(): Promise<void>
  progress(label: string): void
}

const copyPixels = (pixels: Pixels): Pixels => ({
  data: pixels.data.slice(),
  width: pixels.width,
  height: pixels.height,
})

const whole = (pixels: Pixels): Rect => ({
  x: 0,
  y: 0,
  width: pixels.width,
  height: pixels.height,
})

/** True when any pixel is see-through enough to matter (`below` out of 255). */
export function hasClearPixels(frames: readonly Pixels[], below: number) {
  const seen = new Set<Pixels>()
  for (const frame of frames) {
    if (seen.has(frame)) continue
    seen.add(frame)
    for (let i = 3; i < frame.data.length; i += 4)
      if (frame.data[i] < below) return true
  }
  return false
}

/**
 * One picture that stands for the whole animation when colours are chosen:
 * up to `limit` frames, spread evenly, each thinned to about `edge` pixels.
 */
export function sampleFrames(
  frames: readonly Pixels[],
  limit = 32,
  edge = 128
): Pixels {
  const unique = [...new Set(frames)]
  const count = Math.min(limit, unique.length)
  const picked = Array.from(
    { length: count },
    (_, index) => unique[Math.floor((index * unique.length) / count)]
  )
  const { width, height } = picked[0]
  const step = Math.max(1, Math.ceil(Math.max(width, height) / edge))
  const tileWidth = Math.ceil(width / step)
  const tileHeight = Math.ceil(height / step)
  const data = new Uint8ClampedArray(tileWidth * tileHeight * count * 4)
  picked.forEach((frame, tile) => {
    for (let y = 0; y < tileHeight; y++)
      for (let x = 0; x < tileWidth; x++) {
        const from = (y * step * width + x * step) * 4
        data.set(
          frame.data.subarray(from, from + 4),
          ((tile * tileHeight + y) * tileWidth + x) * 4
        )
      }
  })
  return { data, width: tileWidth, height: tileHeight * count }
}

/** A palette with one fully clear entry, and that entry's index. */
function withClearEntry(colours: Colour[]) {
  const table = colours.map((colour) => [...colour] as Colour)
  let clear = table.findIndex((colour) => colour[3] === 0)
  if (clear < 0) {
    clear = table.length
    table.push([0, 0, 0, 0])
  }
  return { table, clear }
}

interface IndexedOptions {
  colours: number
  dithering: boolean
  tolerance: number
}

/** KeepSimp's own GIF encoder: one shared palette, and only what changed in each frame. */
export async function buildGif(
  frames: readonly Frame[],
  plays: number,
  options: IndexedOptions,
  deps: BuildDeps
) {
  const { width, height } = frames[0]
  // One entry is kept for "show what is already there".
  const palette = await deps.palette(
    sampleFrames(frames),
    Math.min(255, options.colours)
  )
  try {
    const { table, clear } = withClearEntry(palette.colours)
    // GIF pixels are either there or not, so faint ones become clear.
    const faint = table.map((colour) => colour[3] < 128)
    const indicesFor = (pixels: Pixels) => {
      const indices = palette.remap(pixels, options.dithering)
      for (let i = 0; i < indices.length; i++)
        if (faint[indices[i]]) indices[i] = clear
      return indices
    }
    const delays = wholeUnits(
      frames.map((frame) => frame.duration),
      10,
      2
    )
    const images: GifImage[] = []
    const seeThrough = hasClearPixels(frames, 128)
    let reference: Pixels | null = null
    for (let index = 0; index < frames.length; index++) {
      await deps.checkpoint()
      deps.progress(`Writing frame ${index + 1} of ${frames.length}`)
      const frame = frames[index]
      const delay = delays[index]
      if (seeThrough) {
        // Without a way to erase single pixels, every frame is drawn in full.
        images.push({
          ...whole(frame),
          indices: indicesFor(frame),
          delay,
          dispose: "background",
          transparent: clear,
        })
        continue
      }
      if (!reference) {
        reference = copyPixels(frame)
        images.push({
          ...whole(frame),
          indices: indicesFor(frame),
          delay,
          dispose: "none",
          transparent: null,
        })
        continue
      }
      const rect = changedRect(reference, frame, options.tolerance)
      if (!rect) {
        // Nothing moved: the frame before simply stays up longer.
        const last = images[images.length - 1]
        last.delay = Math.min(65535, last.delay + delay)
        continue
      }
      const unchanged = settle(reference, frame, rect, options.tolerance)
      const indices = indicesFor(cropPixels(frame, rect))
      for (let i = 0; i < indices.length; i++)
        if (unchanged[i]) indices[i] = clear
      images.push({
        ...rect,
        indices,
        delay,
        dispose: "none",
        transparent: clear,
      })
    }
    return writeGif({ width, height, palette: table, plays, images })
  } finally {
    palette.free()
  }
}

/** gifski's GIF, with our own timing and loop count written into it. */
export async function buildGifBest(
  frames: readonly Frame[],
  plays: number,
  quality: number,
  deps: BuildDeps
) {
  deps.progress(
    `Encoding ${frames.length} frames with gifski. This can take a while…`
  )
  const gif = await deps.gifski([...frames], quality)
  const delays = wholeUnits(
    frames.map((frame) => frame.duration),
    10,
    2
  )
  // gifski may merge frames that look the same; then its own timing is kept.
  const kept = readGif(gif).frames.length === frames.length
  return retimeGif(gif, plays, kept ? delays : null)
}

/** Animated WebP: each frame's changed area as a still WebP. */
export async function buildWebp(
  frames: readonly Frame[],
  plays: number,
  options: {
    quality: number
    lossless: boolean
    mixed: boolean
    tolerance: number
  },
  deps: BuildDeps
) {
  const { width, height } = frames[0]
  // In mixed mode the first patches are written both ways, and the way that
  // made them smaller overall is used for the rest.
  const TRIALS = 2
  let trials = options.mixed ? TRIALS : 0
  let lossy = 0
  let exact = 0
  let lossless = options.lossless
  const encode = async (patch: Pixels) => {
    if (trials === 0)
      return deps.encodeWebp(patch, { quality: options.quality, lossless })
    const [first, second] = [
      await deps.encodeWebp(patch, {
        quality: options.quality,
        lossless: false,
      }),
      await deps.encodeWebp(patch, { quality: 100, lossless: true }),
    ]
    lossy += first.length
    exact += second.length
    if (--trials === 0) lossless = exact < lossy
    return second.length < first.length ? second : first
  }
  // Browsers show WebP frames of 10 ms or less at 100 ms.
  const durations = wholeUnits(
    frames.map((frame) => frame.duration),
    1,
    11
  )
  const images: WebpImage[] = []
  let reference: Pixels | null = null
  for (let index = 0; index < frames.length; index++) {
    await deps.checkpoint()
    deps.progress(`Writing frame ${index + 1} of ${frames.length}`)
    const frame = frames[index]
    let rect = whole(frame)
    if (reference) {
      const changed = changedRect(reference, frame, options.tolerance)
      if (!changed) {
        const last = images[images.length - 1]
        last.duration = Math.min(0xffffff, last.duration + durations[index])
        continue
      }
      rect = evenRect(changed)
      settle(reference, frame, rect, options.tolerance)
    } else reference = copyPixels(frame)
    images.push({
      ...rect,
      webp: await encode(cropPixels(frame, rect)),
      duration: durations[index],
      blend: "source",
    })
  }
  return writeWebp({
    width,
    height,
    alpha: hasClearPixels(frames, 255),
    plays,
    images,
  })
}

/** Animated PNG with every pixel exact. */
export async function buildApng(
  frames: readonly Frame[],
  plays: number,
  deps: BuildDeps
) {
  const { width, height } = frames[0]
  const alpha = hasClearPixels(frames, 255)
  const durations = wholeUnits(
    frames.map((frame) => frame.duration),
    1,
    1
  )
  const images: ApngImage[] = []
  let reference: Pixels | null = null
  for (let index = 0; index < frames.length; index++) {
    await deps.checkpoint()
    deps.progress(`Writing frame ${index + 1} of ${frames.length}`)
    const frame = frames[index]
    let rect = whole(frame)
    if (reference) {
      const changed = changedRect(reference, frame)
      if (!changed) {
        const last = images[images.length - 1]
        last.duration = Math.min(65535, last.duration + durations[index])
        continue
      }
      rect = changed
      settle(reference, frame, rect, 0)
    } else reference = copyPixels(frame)
    const patch = cropPixels(frame, rect)
    let rows: Uint8Array | Uint8ClampedArray = patch.data
    if (!alpha) {
      const solid = new Uint8Array(rect.width * rect.height * 3)
      for (let from = 0, to = 0; from < patch.data.length; from += 4, to += 3)
        solid.set(patch.data.subarray(from, from + 3), to)
      rows = solid
    }
    images.push({
      ...rect,
      data: await deps.deflate(
        filterRows(rows, rect.width, rect.height, alpha ? 4 : 3)
      ),
      duration: durations[index],
      blend: "source",
    })
  }
  return writeApng({
    width,
    height,
    colour: alpha ? "rgba" : "rgb",
    plays,
    images,
  })
}

/** Animated PNG reduced to a palette, the way pngquant shrinks a still PNG. */
export async function buildApngIndexed(
  frames: readonly Frame[],
  plays: number,
  options: IndexedOptions,
  deps: BuildDeps
) {
  const { width, height } = frames[0]
  const seeThrough = hasClearPixels(frames, 255)
  const palette = await deps.palette(
    sampleFrames(frames),
    // Solid animations keep one entry for "show what is already there".
    Math.min(seeThrough ? 256 : 255, options.colours)
  )
  try {
    const { table, clear } = seeThrough
      ? { table: palette.colours, clear: -1 }
      : withClearEntry(palette.colours)
    const durations = wholeUnits(
      frames.map((frame) => frame.duration),
      1,
      1
    )
    const images: ApngImage[] = []
    let reference: Pixels | null = null
    for (let index = 0; index < frames.length; index++) {
      await deps.checkpoint()
      deps.progress(`Writing frame ${index + 1} of ${frames.length}`)
      const frame = frames[index]
      let rect = whole(frame)
      let unchanged: Uint8Array | null = null
      if (reference) {
        const changed = changedRect(reference, frame, options.tolerance)
        if (!changed) {
          const last = images[images.length - 1]
          last.duration = Math.min(65535, last.duration + durations[index])
          continue
        }
        rect = changed
        unchanged = settle(reference, frame, rect, options.tolerance)
      } else reference = copyPixels(frame)
      const indices = palette.remap(cropPixels(frame, rect), options.dithering)
      if (unchanged && !seeThrough)
        for (let i = 0; i < indices.length; i++)
          if (unchanged[i]) indices[i] = clear
      images.push({
        ...rect,
        data: await deps.deflate(
          filterRows(indices, rect.width, rect.height, 1)
        ),
        duration: durations[index],
        // A see-through animation replaces each patch; a solid one paints over it.
        blend: seeThrough || index === 0 ? "source" : "over",
      })
    }
    return writeApng({
      width,
      height,
      colour: "indexed",
      palette: table,
      plays,
      images,
    })
  } finally {
    palette.free()
  }
}
