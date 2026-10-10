import type { Pixels } from "@/lib/image-compressor/ssim"
import type { Rect } from "./types"

export type Filter = "none" | "greyscale" | "sepia" | "invert"

/** Colour changes applied to every frame. The three numbers run from -100 to 100. */
export interface Adjustments {
  filter: Filter
  brightness: number
  contrast: number
  saturation: number
}

/** True when the adjustments would change a picture at all. */
export function adjusts(look: Adjustments) {
  return (
    look.filter !== "none" ||
    look.brightness !== 0 ||
    look.contrast !== 0 ||
    look.saturation !== 0
  )
}

const clamp = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : value)

/** A copy of a picture with brightness, contrast, saturation and a filter applied. Opacity is untouched. */
export function adjustPixels(pixels: Pixels, look: Adjustments): Pixels {
  // Brightness and contrast act on each channel alone, so one table serves all three.
  const contrast = (100 + look.contrast) / 100
  const shift = look.brightness * 1.275
  const table = new Uint8ClampedArray(256)
  for (let value = 0; value < 256; value++)
    table[value] = (value - 128) * contrast + 128 + shift
  const saturation = (100 + look.saturation) / 100
  const data = new Uint8ClampedArray(pixels.data.length)
  for (let i = 0; i < data.length; i += 4) {
    let red = table[pixels.data[i]]
    let green = table[pixels.data[i + 1]]
    let blue = table[pixels.data[i + 2]]
    const grey = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    if (saturation !== 1) {
      red = clamp(grey + (red - grey) * saturation)
      green = clamp(grey + (green - grey) * saturation)
      blue = clamp(grey + (blue - grey) * saturation)
    }
    if (look.filter === "greyscale") {
      const level = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      red = green = blue = level
    } else if (look.filter === "sepia") {
      const [r, g, b] = [red, green, blue]
      red = clamp(0.393 * r + 0.769 * g + 0.189 * b)
      green = clamp(0.349 * r + 0.686 * g + 0.168 * b)
      blue = clamp(0.272 * r + 0.534 * g + 0.131 * b)
    } else if (look.filter === "invert") {
      red = 255 - red
      green = 255 - green
      blue = 255 - blue
    }
    data[i] = red
    data[i + 1] = green
    data[i + 2] = blue
    data[i + 3] = pixels.data[i + 3]
  }
  return { data, width: pixels.width, height: pixels.height }
}

/**
 * How much of the picture shows at a moment, from 0 (all fade colour) to 1.
 * A frame fades in by where it starts and out by where it ends, so the first
 * frame of a fade-in and the last of a fade-out are fully faded.
 * @param start When the frame appears, in milliseconds.
 * @param end When it disappears.
 * @param total Length of the animation.
 * @param fadeIn Length of the fade at the start, in milliseconds; 0 for none.
 * @param fadeOut Length of the fade at the end.
 */
export function fadeAmount(
  start: number,
  end: number,
  total: number,
  fadeIn: number,
  fadeOut: number
) {
  const rising = fadeIn > 0 ? Math.min(1, start / fadeIn) : 1
  const falling = fadeOut > 0 ? Math.min(1, (total - end) / fadeOut) : 1
  return Math.max(0, Math.min(rising, falling))
}

/** A copy of a picture mixed towards one colour; `amount` 1 leaves it as it is. Opacity is untouched. */
export function fadePixels(
  pixels: Pixels,
  colour: readonly [number, number, number],
  amount: number
): Pixels {
  const data = new Uint8ClampedArray(pixels.data.length)
  const rest = 1 - amount
  for (let i = 0; i < data.length; i += 4) {
    data[i] = pixels.data[i] * amount + colour[0] * rest
    data[i + 1] = pixels.data[i + 1] * amount + colour[1] * rest
    data[i + 2] = pixels.data[i + 2] * amount + colour[2] * rest
    data[i + 3] = pixels.data[i + 3]
  }
  return { data, width: pixels.width, height: pixels.height }
}

/**
 * A copy of a frame with a layer painted over it at a position. The parts of
 * the layer that fall outside the frame are left out.
 * @param opacity 0 to 1, on top of the layer's own.
 */
export function paintOver(
  frame: Pixels,
  layer: Pixels,
  x = 0,
  y = 0,
  opacity = 1
): Pixels {
  const data = frame.data.slice()
  const left = Math.max(0, x)
  const top = Math.max(0, y)
  const right = Math.min(frame.width, x + layer.width)
  const bottom = Math.min(frame.height, y + layer.height)
  for (let row = top; row < bottom; row++)
    for (let column = left; column < right; column++) {
      const from = ((row - y) * layer.width + (column - x)) * 4
      const alpha = (layer.data[from + 3] / 255) * opacity
      if (alpha <= 0) continue
      const to = (row * frame.width + column) * 4
      const under = data[to + 3] / 255
      const out = alpha + under * (1 - alpha)
      for (let channel = 0; channel < 3; channel++)
        data[to + channel] =
          (layer.data[from + channel] * alpha +
            data[to + channel] * under * (1 - alpha)) /
          out
      data[to + 3] = out * 255
    }
  return { data, width: frame.width, height: frame.height }
}

export type Corner =
  "top-left" | "top-right" | "bottom-left" | "bottom-right" | "centre"

/**
 * Where an overlay image goes on a frame: as wide as a percentage of the
 * frame, keeping its own shape, with a margin from the edges it sits against
 * for as long as there is room for one.
 */
export function overlayRect(
  frame: { width: number; height: number },
  image: { width: number; height: number },
  corner: Corner,
  percent: number
): Rect {
  const width = Math.max(1, Math.round((frame.width * percent) / 100))
  const height = Math.max(1, Math.round((width * image.height) / image.width))
  const margin = Math.round(Math.min(frame.width, frame.height) * 0.04)
  // The margin gives way when the overlay would otherwise be pushed off the frame.
  const inset = (room: number) =>
    Math.max(0, Math.min(margin, Math.floor(room / 2)))
  const [left, top] = [inset(frame.width - width), inset(frame.height - height)]
  return {
    width,
    height,
    x:
      corner === "centre"
        ? Math.round((frame.width - width) / 2)
        : corner.endsWith("left")
          ? left
          : frame.width - width - left,
    y:
      corner === "centre"
        ? Math.round((frame.height - height) / 2)
        : corner.startsWith("top")
          ? top
          : frame.height - height - top,
  }
}

/** Break a caption into lines no wider than `maxWidth`, at spaces; a single long word is kept whole. */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  const lines: string[] = []
  // A line break typed into the caption always starts a new line.
  for (const paragraph of text.split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const longer = line ? `${line} ${word}` : word
      if (line && measure(longer) > maxWidth) {
        lines.push(line)
        line = word
      } else line = longer
    }
    if (line) lines.push(line)
  }
  return lines
}

const SMALLEST_TEXT = 8

/**
 * Wrap a caption, making the text smaller until its widest line fits; a very
 * long word stops shrinking at the smallest readable size.
 * @param measure Width of some text at a text size.
 */
export function fitLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  measure: (text: string, size: number) => number
) {
  let size = Math.max(SMALLEST_TEXT, fontSize)
  for (;;) {
    const at = size
    const lines = wrapText(text, maxWidth, (line) => measure(line, at))
    if (
      size === SMALLEST_TEXT ||
      lines.every((line) => measure(line, at) <= maxWidth)
    )
      return { lines, fontSize: size }
    size = Math.max(SMALLEST_TEXT, Math.floor(size * 0.9))
  }
}

/** Caption text sizes, as a share of the frame's shorter side. */
export const captionSizes = { small: 0.07, medium: 0.1, large: 0.14 }
export type CaptionSize = keyof typeof captionSizes

/** What the text renderer needs to draw the captions for a frame size. */
export interface CaptionLayout {
  width: number
  height: number
  /** Text height in pixels. */
  fontSize: number
  /** Space between the text and the frame's edges. */
  margin: number
  colour: [number, number, number]
  /** The colour of the line around the letters, or null for none. */
  outline: [number, number, number] | null
  top: string
  bottom: string
}

/** Lay captions out for a frame; null when there is nothing to write. */
export function captionLayout(
  frame: { width: number; height: number },
  caption: {
    top: string
    bottom: string
    size: CaptionSize
    colour: [number, number, number]
    outline: boolean
    uppercase: boolean
  }
): CaptionLayout | null {
  const tidy = (text: string) =>
    caption.uppercase ? text.trim().toUpperCase() : text.trim()
  const top = tidy(caption.top)
  const bottom = tidy(caption.bottom)
  if (!top && !bottom) return null
  const side = Math.min(frame.width, frame.height)
  // The outline contrasts with the letters: dark around light text, light around dark.
  const light =
    0.2126 * caption.colour[0] +
      0.7152 * caption.colour[1] +
      0.0722 * caption.colour[2] >
    140
  return {
    ...frame,
    fontSize: Math.max(
      SMALLEST_TEXT,
      Math.round(side * captionSizes[caption.size])
    ),
    margin: Math.max(2, Math.round(side * 0.04)),
    colour: caption.colour,
    outline: caption.outline ? (light ? [0, 0, 0] : [255, 255, 255]) : null,
    top,
    bottom,
  }
}

/** Whether a caption is on screen for a frame, given when the frame shows and the caption's own times. */
export function captionShows(
  start: number,
  end: number,
  from: number | null,
  until: number | null
) {
  return end > (from ?? 0) * 1000 && start < (until ?? Infinity) * 1000
}
