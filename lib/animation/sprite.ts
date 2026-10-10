import type { Pixels } from "@/lib/image-compressor/ssim"
import type { Frame } from "./types"

export interface SheetLayout {
  columns: number
  rows: number
  /** Size of one frame. */
  width: number
  height: number
  sheetWidth: number
  sheetHeight: number
}

/**
 * Arrange frames in a grid that is as close to square as it can be, so
 * neither side of the sheet grows too long. Null when no grid fits `maxEdge`.
 */
export function sheetLayout(
  count: number,
  width: number,
  height: number,
  maxEdge: number
): SheetLayout | null {
  if (count < 1) return null
  const most = Math.floor(maxEdge / width)
  if (most < 1) return null
  const square = Math.ceil(Math.sqrt((count * height) / width))
  const columns = Math.max(1, Math.min(count, most, square))
  const rows = Math.ceil(count / columns)
  if (rows * height > maxEdge) return null
  return {
    columns,
    rows,
    width,
    height,
    sheetWidth: columns * width,
    sheetHeight: rows * height,
  }
}

/** Where a frame sits on the sheet. */
export const cellOf = (layout: SheetLayout, index: number) => ({
  x: (index % layout.columns) * layout.width,
  y: Math.floor(index / layout.columns) * layout.height,
})

/** Draw every frame onto one sheet, left to right, top to bottom. */
export function composeSheet(
  frames: readonly Pixels[],
  layout: SheetLayout
): Pixels {
  const data = new Uint8ClampedArray(layout.sheetWidth * layout.sheetHeight * 4)
  frames.forEach((frame, index) => {
    const { x, y } = cellOf(layout, index)
    for (let row = 0; row < layout.height; row++)
      data.set(
        frame.data.subarray(
          row * layout.width * 4,
          (row + 1) * layout.width * 4
        ),
        ((y + row) * layout.sheetWidth + x) * 4
      )
  })
  return { data, width: layout.sheetWidth, height: layout.sheetHeight }
}

const round = (value: number) => Math.round(value * 1000) / 1000

/** Frame positions and timing, in the shape most sprite tools read. */
export function spriteJson(
  frames: readonly Frame[],
  layout: SheetLayout,
  image: string,
  plays: number
) {
  return JSON.stringify(
    {
      frames: frames.map((frame, index) => ({
        frame: {
          ...cellOf(layout, index),
          w: layout.width,
          h: layout.height,
        },
        duration: round(frame.duration),
      })),
      meta: {
        app: "https://keepsimp.vercel.app",
        image,
        size: { w: layout.sheetWidth, h: layout.sheetHeight },
        frameSize: { w: layout.width, h: layout.height },
        // 0 means forever.
        plays,
      },
    },
    null,
    2
  )
}

/**
 * CSS that plays the sheet in an element with the class `sprite`. Each frame
 * gets its own keyframe, so frames can last different lengths of time.
 */
export function spriteCss(
  frames: readonly Frame[],
  layout: SheetLayout,
  image: string,
  plays: number
) {
  const total = frames.reduce((sum, frame) => sum + frame.duration, 0)
  let elapsed = 0
  const steps = frames.map((frame, index) => {
    const { x, y } = cellOf(layout, index)
    const at = total > 0 ? round((elapsed / total) * 100) : 0
    elapsed += frame.duration
    return `  ${at}% { background-position: ${x ? `-${x}px` : "0"} ${y ? `-${y}px` : "0"}; }`
  })
  return [
    ".sprite {",
    `  width: ${layout.width}px;`,
    `  height: ${layout.height}px;`,
    `  background: url("${image}") 0 0 / ${layout.sheetWidth}px ${layout.sheetHeight}px no-repeat;`,
    `  animation: sprite-play ${round(total / 1000)}s step-end ${plays === 0 ? "infinite" : plays};`,
    "}",
    "",
    "@keyframes sprite-play {",
    ...steps,
    "}",
    "",
    "@media (prefers-reduced-motion: reduce) {",
    "  .sprite { animation: none; }",
    "}",
    "",
  ].join("\n")
}
