/**
 * Subtitles written on the picture: read from an SRT or WebVTT file, put
 * on the result's clock (through the trim and the speed), and drawn on the
 * frames they show over, in the site's Outfit, outlined, wrapped by the
 * animation converter's own line fitting. Pure but for the drawing, which
 * is handed a canvas.
 */
import { fitLines } from "@/lib/animation/effects"
import { retime, type Part } from "./trim"

/** One subtitle: when it shows (seconds) and what it says, a line to a row. */
export interface Cue {
  start: number
  end: number
  text: string
}

export type SubtitleSize = "small" | "medium" | "large"

/** Text heights as shares of the picture's shorter side: smaller than captions, as subtitles stay longer. */
export const SUBTITLE_SIZES: Record<SubtitleSize, number> = {
  small: 0.045,
  medium: 0.06,
  large: 0.08,
}

/** Most cues read from a file: a feature film has under two thousand. */
export const MOST_CUES = 10_000

/** A time in a subtitle file: 01:02:03,450, 02:03.450 or 1:02:03.45. */
function seconds(time: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(
    time.trim()
  )
  if (!match) return null
  const [, hours = "0", minutes, secs, fraction] = match
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(secs) +
    Number(fraction.padEnd(3, "0")) / 1000
  )
}

/** Text as it is shown: tags (<i>, <c.red>, {\an8}) taken out, spaces tidied. */
function shown(text: string) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}

/**
 * The cues of an SRT or WebVTT file, in order of time. Blocks without a
 * time line (WebVTT's header, notes and styles, SRT's numbers alone) are
 * passed over; a block whose times run backwards is left out.
 */
export function parseSubtitles(text: string): Cue[] {
  const cues: Cue[] = []
  const blocks = text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split("\n")
    const at = lines.findIndex((line) => line.includes("-->"))
    if (at < 0) continue
    const [from, rest] = lines[at].split("-->")
    // WebVTT may put settings (position, align) after the end time.
    const start = seconds(from)
    const end = seconds(rest.trim().split(/\s+/)[0])
    if (start === null || end === null || end <= start) continue
    const words = shown(lines.slice(at + 1).join("\n"))
    if (words) cues.push({ start, end, text: words })
    if (cues.length >= MOST_CUES) break
  }
  return cues.sort((a, b) => a.start - b.start)
}

/**
 * Cues on the result's clock: through the parts kept (a cue in a cut part
 * is left out, one across a cut keeps its kept part) and the speed. Cues
 * are in the source's own seconds.
 */
export function placedCues(
  cues: Cue[],
  parts: Part[] | null,
  speed: number
): Cue[] {
  const placed: Cue[] = []
  const pieces = parts ?? null
  for (const cue of cues) {
    if (!pieces) {
      placed.push({
        ...cue,
        start: cue.start / speed,
        end: cue.end / speed,
      })
      continue
    }
    for (const part of pieces) {
      const start = Math.max(cue.start, part.start)
      const end = Math.min(cue.end, part.end)
      if (end - start < 0.05) continue
      placed.push({
        text: cue.text,
        start: retime(start, pieces)! / speed,
        end: (retime(start, pieces)! + (end - start)) / speed,
      })
    }
  }
  return placed
}

/** The cue showing at a time, or null (by halving: cues are in order). */
export function cueAt(cues: Cue[], time: number): Cue | null {
  let low = 0
  let high = cues.length - 1
  let found: Cue | null = null
  while (low <= high) {
    const middle = (low + high) >> 1
    if (cues[middle].start <= time) {
      found = cues[middle]
      low = middle + 1
    } else high = middle - 1
  }
  if (found && time < found.end) return found
  // An earlier, longer cue may still show over a later, shorter one's start.
  for (let index = low - 2; index >= 0 && index >= low - 4; index--)
    if (cues[index].start <= time && time < cues[index].end) return cues[index]
  return null
}

/** What the page says of subtitles. */
export function subtitlesSaid(name: string, read: number, placed: number) {
  const left = read - placed
  return `${placed} ${placed === 1 ? "subtitle" : "subtitles"} from ${name} ${placed === 1 ? "is" : "are"} written on the picture${left > 0 ? `; ${left} in parts cut out ${left === 1 ? "is" : "are"} left out` : ""}.`
}

/**
 * One cue drawn along the bottom of a frame: white, outlined in black,
 * centred, wrapped to the picture's width and made smaller if a word will
 * not fit (`fitLines`), in the font family given.
 */
export function drawCue(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  size: SubtitleSize,
  family: string
) {
  const side = Math.min(width, height)
  const fontSize = Math.max(10, Math.round(side * SUBTITLE_SIZES[size]))
  const margin = Math.round(side * 0.06)
  const maxWidth = Math.max(1, width - margin * 2)
  const fontAt = (pixels: number) => `700 ${pixels}px ${family}`
  // Each line of the cue wrapped by itself, at one size for all of them.
  const rows = text.split("\n")
  let fitted = fontSize
  for (const row of rows)
    fitted = Math.min(
      fitted,
      fitLines(row, maxWidth, fitted, (line, pixels) => {
        context.font = fontAt(pixels)
        return context.measureText(line).width
      }).fontSize
    )
  const lines = rows.flatMap(
    (row) =>
      fitLines(row, maxWidth, fitted, (line, pixels) => {
        context.font = fontAt(pixels)
        return context.measureText(line).width
      }).lines
  )
  context.save()
  context.font = fontAt(fitted)
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.lineJoin = "round"
  context.lineWidth = Math.max(2, fitted / 5)
  context.strokeStyle = "black"
  context.fillStyle = "white"
  const lineHeight = fitted * 1.2
  lines.forEach((line, index) => {
    const y = height - margin - lineHeight * (lines.length - index - 0.5)
    context.strokeText(line, width / 2, y)
    context.fillText(line, width / 2, y)
  })
  context.restore()
}
