import { hex, parseColor } from "./core"

/** Each swatch of a PNG palette strip is this many pixels square. */
export const STRIP_SIDE = 160

/** Draws a palette as a strip of swatches, opacity kept, on a canvas sized by `stripSize`. */
export function drawStrip(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  colors: string[]
) {
  colors.forEach((color, i) => {
    context.fillStyle = hex(parseColor(color))
    context.fillRect(i * STRIP_SIDE, 0, STRIP_SIDE, STRIP_SIDE)
  })
}

export function stripSize(count: number) {
  return { width: count * STRIP_SIDE, height: STRIP_SIDE }
}
