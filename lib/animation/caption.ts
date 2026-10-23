/// <reference lib="webworker" />
import type { Pixels } from "@/lib/image-compressor/ssim"
import { fitLines, type CaptionLayout } from "./effects"

declare const self: DedicatedWorkerGlobalScope

const FAMILY = "KeepSimp Caption"
export const CANNOT_DRAW_TEXT =
  "This browser cannot draw text on animations. Use a current version of Chrome, Edge, Firefox or Safari."

let family: Promise<string> | null = null

/** The site's heading font, loaded once; the system's own when it cannot be. */
export function captionFont() {
  family ??= (async () => {
    try {
      const face = new FontFace(
        FAMILY,
        `url(${new URL("../../node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2", import.meta.url)})`,
        { weight: "100 900" }
      )
      await face.load()
      self.fonts.add(face)
      return `"${FAMILY}", sans-serif`
    } catch {
      return "sans-serif"
    }
  })()
  return family
}

const rgb = (colour: readonly number[]) => `rgb(${colour.join(" ")})`

/** Draw captions on a clear picture the size of a frame. */
export async function renderCaption(layout: CaptionLayout): Promise<Pixels> {
  if (typeof OffscreenCanvas === "undefined") throw new Error(CANNOT_DRAW_TEXT)
  const canvas = new OffscreenCanvas(layout.width, layout.height)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error(CANNOT_DRAW_TEXT)
  const fonts = await captionFont()
  const fontAt = (size: number) => `800 ${size}px ${fonts}`
  // The outline reaches a little past the letters on either side.
  const maxWidth = Math.max(
    1,
    layout.width -
      layout.margin * 2 -
      (layout.outline ? layout.fontSize / 6 : 0)
  )
  const draw = (text: string, edge: "top" | "bottom") => {
    if (!text) return
    const { lines, fontSize } = fitLines(
      text,
      maxWidth,
      layout.fontSize,
      (line, size) => {
        context.font = fontAt(size)
        return context.measureText(line).width
      }
    )
    context.font = fontAt(fontSize)
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.lineJoin = "round"
    context.lineWidth = Math.max(2, fontSize / 6)
    const lineHeight = fontSize * 1.15
    lines.forEach((line, index) => {
      const y =
        edge === "top"
          ? layout.margin + lineHeight * (index + 0.5)
          : layout.height -
            layout.margin -
            lineHeight * (lines.length - index - 0.5)
      if (layout.outline) {
        context.strokeStyle = rgb(layout.outline)
        context.strokeText(line, layout.width / 2, y)
      }
      context.fillStyle = rgb(layout.colour)
      context.fillText(line, layout.width / 2, y)
    })
  }
  draw(layout.top, "top")
  draw(layout.bottom, "bottom")
  const image = context.getImageData(0, 0, layout.width, layout.height)
  return { data: image.data, width: image.width, height: image.height }
}
