/**
 * The parts of a video kept, in the file's own seconds, as the trimmer
 * edits them: keep a stretch, cut one out, split at points. Edits never
 * change the file; a plan writes what is kept. Pure, so the page, the
 * worker and the tests share it.
 */

export interface Part {
  start: number
  end: number
}

/** Parts shorter than this are dropped (a tenth of a second, as the audio splitter does). */
export const SHORTEST_PART = 0.1

/** The parts in order, joined where they touch or overlap, held inside the file, short ones left out. */
export function tidy(parts: Part[], duration: number): Part[] {
  const held = parts
    .map((part) => ({
      start: Math.max(0, Math.min(part.start, part.end)),
      end: Math.min(duration, Math.max(part.start, part.end)),
    }))
    .filter((part) => part.end - part.start >= SHORTEST_PART)
    .sort((a, b) => a.start - b.start)
  const joined: Part[] = []
  for (const part of held) {
    const last = joined.at(-1)
    if (last && part.start <= last.end) last.end = Math.max(last.end, part.end)
    else joined.push({ ...part })
  }
  return joined
}

/** The whole file, kept. */
export const whole = (duration: number): Part[] => [{ start: 0, end: duration }]

/** Whether the parts are the whole file. */
export const isWhole = (parts: Part[], duration: number) =>
  parts.length === 1 && parts[0].start <= 0 && parts[0].end >= duration

/** Pieces with nothing in them (a cut can leave them) are dropped, never turned round. */
const real = (parts: Part[]) => parts.filter((part) => part.end > part.start)

/** Keep only a stretch of what is kept now. */
export function keepOnly(
  parts: Part[],
  from: number,
  to: number,
  duration: number
) {
  const [a, b] = from <= to ? [from, to] : [to, from]
  return tidy(
    real(
      parts.map((part) => ({
        start: Math.max(part.start, a),
        end: Math.min(part.end, b),
      }))
    ),
    duration
  )
}

/** Cut a stretch out of what is kept now. */
export function cutOut(
  parts: Part[],
  from: number,
  to: number,
  duration: number
) {
  const [a, b] = from <= to ? [from, to] : [to, from]
  return tidy(
    real(
      parts.flatMap((part) => [
        { start: part.start, end: Math.min(part.end, a) },
        { start: Math.max(part.start, b), end: part.end },
      ])
    ),
    duration
  )
}

/** How long the result is. */
export const keptLength = (parts: Part[]) =>
  parts.reduce((sum, part) => sum + part.end - part.start, 0)

/** Where a moment of the file falls in the result; null when it is cut. */
export function retime(time: number, parts: Part[]): number | null {
  let before = 0
  for (const part of parts) {
    if (time < part.start) return null
    if (time < part.end) return before + time - part.start
    before += part.end - part.start
  }
  return null
}

/** Where a moment of the result comes from in the file (the inverse of `retime`). */
export function sourceTime(time: number, parts: Part[]): number {
  let left = time
  for (const part of parts) {
    const length = part.end - part.start
    if (left < length) return part.start + left
    left -= length
  }
  return parts.at(-1)?.end ?? 0
}

/**
 * Each part moved out to the keyframes around it, for copying without
 * encoding: it must start on a keyframe, and it ends where the next part
 * of the stream begins. `keyframes` are the picture's keyframe times, in
 * order. Parts that come to touch are joined.
 */
export function snapOut(parts: Part[], keyframes: number[], duration: number) {
  const snapped = parts.map((part) => {
    let start = 0
    for (const key of keyframes) {
      if (key > part.start + 1e-6) break
      start = key
    }
    const end = keyframes.find((key) => key >= part.end - 1e-6) ?? duration
    return { start, end }
  })
  return tidy(snapped, duration)
}

/** How far snapping moved the parts, in words; null when it did not. */
export function snapSaid(asked: Part[], snapped: Part[]) {
  const moved = (keptLength(snapped) - keptLength(asked)).toFixed(1)
  if (Number(moved) <= 0) return null
  return `Copied without encoding, a part can only begin and end where the video holds a whole picture (a keyframe), so ${moved} s more is kept around the cuts. Choose Exact to cut to the frame.`
}

/** Parts that split a file at points (the result is every part, each its own file). */
export function splitAt(points: number[], duration: number): Part[] {
  const cuts = [...new Set(points)]
    .filter(
      (point) => point > SHORTEST_PART && point < duration - SHORTEST_PART
    )
    .sort((a, b) => a - b)
  const edges = [0, ...cuts, duration]
  return edges.slice(1).map((end, index) => ({ start: edges[index], end }))
}

/** Points every so many seconds, for splitting. */
export function everyPoints(seconds: number, duration: number) {
  const points: number[] = []
  for (let at = seconds; at < duration - SHORTEST_PART; at += seconds)
    points.push(Math.round(at * 1000) / 1000)
  return points
}

/** A time for people: 1:07.25 or 1:02:03.5. */
export function clock(seconds: number) {
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = (seconds - hours * 3600 - minutes * 60)
    .toFixed(2)
    .padStart(5, "0")
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`
}

/** A typed time: 7.25, 1:07.25 or 1:02:03; null when it is not one. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":")
  if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part)))
    return null
  return parts.reduce((sum, part) => sum * 60 + Number(part), 0)
}
