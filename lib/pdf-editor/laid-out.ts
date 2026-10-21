/**
 * Text boxes with their lines broken as the browser writes them, in the
 * editor's own fonts: the editor's page and the agent tools both lay text
 * out with this, so a box breaks the same way whoever made it. The fonts
 * must be loaded as `screenFamily(key)` first. Only for the browser.
 */
import { screenFamily } from "./fonts"
import { fontKey, retyped, type TextObject } from "./objects"
import { breakLines, combLine } from "./text-layout"

let measurer: CanvasRenderingContext2D | null | undefined

/** How wide the browser writes some text in one of the editor's fonts, in points at a size in points. */
export function measureWith(key: string, size: number) {
  if (measurer === undefined)
    measurer = document.createElement("canvas").getContext("2d")
  return (text: string) => {
    if (!measurer) return text.length * size * 0.5
    measurer.font = `${size}px "${screenFamily(key)}"`
    // The file is written letter by letter, each as wide as the font says.
    measurer.fontKerning = "none"
    return measurer.measureText(text).width
  }
}

/** A text box with its lines broken for its width, in its own font. */
export const laidOut = (object: TextObject, text = object.text): TextObject =>
  retyped(object, {
    text,
    // A row of boxes is one line, with a letter to a box.
    lines: object.comb
      ? [combLine(text, object.comb)]
      : breakLines(
          text,
          object.box.width,
          measureWith(fontKey(object), object.size)
        ),
  })
