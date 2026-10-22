/**
 * The theme's colours as rgb(), read by drawing each, for the canvas a
 * video is drawn on in its worker: the video panel and the agent tool read
 * them the same way. Only for the browser.
 */
import type { VideoColours } from "./video"

/** One theme colour as rgb(); grey when it cannot be read. */
export function colourOf(element: Element, name: string) {
  const probe = document.createElement("canvas")
  probe.width = probe.height = 1
  const context = probe.getContext("2d", { willReadFrequently: true })
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  if (!context || !value) return "rgb(128, 128, 128)"
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return `rgb(${red}, ${green}, ${blue})`
}

/** The colours a video is drawn in, as the theme has them where `element` is. */
export const themeColours = (element: Element): VideoColours => ({
  background: colourOf(element, "--background"),
  foreground: colourOf(element, "--foreground"),
  muted: colourOf(element, "--muted-foreground"),
  accent: colourOf(element, "--primary"),
})
