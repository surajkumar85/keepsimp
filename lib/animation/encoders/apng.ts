import { ByteWriter } from "../bytes"
import { pngChunk, pngSignature } from "../decoders/apng"
import type { Colour, Rect } from "../types"

export type PngColour = "rgba" | "rgb" | "indexed"

export interface ApngImage extends Rect {
  /** The patch's filtered rows, zlib-compressed: the body of an IDAT chunk. */
  data: Uint8Array
  /** Milliseconds on screen. */
  duration: number
  /** "over" paints the patch on what is there; "source" replaces it. */
  blend: "source" | "over"
}

export interface ApngAnimation {
  width: number
  height: number
  colour: PngColour
  /** For indexed colour: up to 256 colours with their opacity. */
  palette?: Colour[]
  /** Times to play; 0 means forever. */
  plays: number
  images: ApngImage[]
}

const paeth = (left: number, up: number, corner: number) => {
  const estimate = left + up - corner
  const toLeft = Math.abs(estimate - left)
  const toUp = Math.abs(estimate - up)
  const toCorner = Math.abs(estimate - corner)
  return toLeft <= toUp && toLeft <= toCorner
    ? left
    : toUp <= toCorner
      ? up
      : corner
}

/**
 * Prepare rows for compression the way PNG asks: each row starts with the
 * number of the filter that made it most compressible.
 * @param bytesPerPixel 4 for RGBA, 3 for RGB, 1 for palette indices.
 */
export function filterRows(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  bytesPerPixel: number
) {
  const stride = width * bytesPerPixel
  const output = new Uint8Array((stride + 1) * height)
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(stride))
  for (let y = 0; y < height; y++) {
    const row = y * stride
    let best = 0
    // Palette indices are not smooth, so they are stored as they are.
    if (bytesPerPixel > 1) {
      let lowest = Infinity
      for (let filter = 0; filter < 5; filter++) {
        const candidate = candidates[filter]
        let cost = 0
        for (let i = 0; i < stride; i++) {
          const value = data[row + i]
          const left = i >= bytesPerPixel ? data[row + i - bytesPerPixel] : 0
          const up = y > 0 ? data[row + i - stride] : 0
          const corner =
            y > 0 && i >= bytesPerPixel
              ? data[row + i - stride - bytesPerPixel]
              : 0
          const predicted =
            filter === 0
              ? 0
              : filter === 1
                ? left
                : filter === 2
                  ? up
                  : filter === 3
                    ? (left + up) >> 1
                    : paeth(left, up, corner)
          const filtered = (value - predicted) & 0xff
          candidate[i] = filtered
          // Small differences either side of zero compress best.
          cost += filtered < 128 ? filtered : 256 - filtered
        }
        if (cost < lowest) {
          lowest = cost
          best = filter
        }
      }
    } else candidates[0].set(data.subarray(row, row + stride))
    output[y * (stride + 1)] = best
    output.set(candidates[best], y * (stride + 1) + 1)
  }
  return output
}

/** PNG stores delays as a fraction of a second; thousandths keep milliseconds exact. */
function control(out: ByteWriter, sequence: number, image: ApngImage) {
  const body = new ByteWriter()
    .u32be(sequence)
    .u32be(image.width)
    .u32be(image.height)
    .u32be(image.x)
    .u32be(image.y)
    .u16be(Math.max(1, Math.min(65535, Math.round(image.duration))))
    .u16be(1000)
    .u8(0)
    .u8(image.blend === "over" ? 1 : 0)
  pngChunk(out, "fcTL", body.finish())
}

/** Write an animated PNG from compressed patches that share one colour type. */
export function writeApng(animation: ApngAnimation) {
  const { width, height, colour, palette = [], plays, images } = animation
  const out = pngSignature(new ByteWriter())
  pngChunk(
    out,
    "IHDR",
    new ByteWriter()
      .u32be(width)
      .u32be(height)
      .u8(8)
      .u8(colour === "rgba" ? 6 : colour === "rgb" ? 2 : 3)
      .bytes([0, 0, 0])
      .finish()
  )
  pngChunk(
    out,
    "acTL",
    new ByteWriter().u32be(images.length).u32be(plays).finish()
  )
  if (colour === "indexed") {
    pngChunk(
      out,
      "PLTE",
      Uint8Array.from(palette.flatMap((entry) => entry.slice(0, 3)))
    )
    // Opacity is listed only as far as the last colour that is not solid.
    let last = palette.length
    while (last > 0 && palette[last - 1][3] === 255) last--
    if (last > 0)
      pngChunk(
        out,
        "tRNS",
        Uint8Array.from(palette.slice(0, last), (entry) => entry[3])
      )
  }
  let sequence = 0
  images.forEach((image, index) => {
    control(out, sequence++, image)
    if (index === 0) pngChunk(out, "IDAT", image.data)
    else {
      const body = new Uint8Array(image.data.length + 4)
      new DataView(body.buffer).setUint32(0, sequence++)
      body.set(image.data, 4)
      pngChunk(out, "fdAT", body)
    }
  })
  pngChunk(out, "IEND", new Uint8Array(0))
  return out.finish()
}
