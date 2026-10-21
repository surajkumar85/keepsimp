/**
 * Transcripts: what Whisper heard, as segments with their times. Whisper
 * hears 30 seconds at a time, so a sound is transcribed window by window,
 * and each window after the first starts where the last segment it was sure
 * of ended (as OpenAI's own Whisper seeks), so no word is cut in two or
 * heard twice and an hour is never held whole. Segments can be written as
 * text, SubRip (SRT) or WebVTT, searched, and followed as the sound plays.
 */

export interface Segment {
  /** Seconds from the start of the sound. */
  start: number
  end: number
  text: string
}

/** What Whisper says of one window: text with times from the window's start (the end missing when the window ran out). */
export interface Heard {
  text: string
  timestamp: [number, number | null]
}

/** How much Whisper hears at once, in seconds, and at what rate. */
export const WINDOW = 30
export const WHISPER_RATE = 16000
/** A segment ending this close to the end of a window may have been cut short. */
export const CUT_SHORT = 1

/** Text with its spaces tidied. */
export const tidy = (text: string) => text.replace(/\s+/g, " ").trim()

/**
 * The segments of a window that are kept, in the sound's own times, and
 * where the next window starts. The last segment of a window that is not
 * the sound's last is left for the next window when it may have been cut
 * short; the next window always starts a little later than this one.
 */
export function keptFrom(
  start: number,
  length: number,
  heard: readonly Heard[],
  last: boolean
): { kept: Segment[]; next: number } {
  const all = heard
    // Whisper can put an end past what it heard: never past the window.
    .map((one) => ({
      start: start + Math.min(length, Math.max(0, one.timestamp[0])),
      end: start + Math.min(length, one.timestamp[1] ?? length),
      open: one.timestamp[1] === null,
      text: tidy(one.text),
    }))
    .filter((one) => one.text)
  const sure = all.filter(
    (one, index) =>
      last ||
      index < all.length - 1 ||
      (!one.open && one.end < start + length - CUT_SHORT)
  )
  // A window that is all one segment is kept as it is, so the sound goes on.
  const kept = sure.length || last ? sure : all.slice(0, 1)
  const end = kept.length ? kept[kept.length - 1].end : start + length
  return {
    kept: kept.map(({ start, end, text }) => ({
      start,
      end: Math.max(start, end),
      text,
    })),
    // The sound's last window hears it to its end.
    next: last ? Math.max(end, start + length) : Math.max(end, start + 1),
  }
}

/**
 * Segments without the loops Whisper can fall into: a run of three or more
 * of the same text becomes one, over all their time. Two in a row are kept,
 * since sound itself repeats (a chorus, a call and its answer).
 */
export function withoutLoops(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = []
  for (let index = 0; index < segments.length;) {
    let run = index + 1
    const key = segments[index].text.toLowerCase()
    while (run < segments.length && segments[run].text.toLowerCase() === key)
      run++
    if (run - index >= 3)
      out.push({ ...segments[index], end: segments[run - 1].end })
    else out.push(...segments.slice(index, run))
    index = run
  }
  return out
}

/** A time as hours, minutes, seconds and milliseconds, with the separator SRT (",") or WebVTT (".") uses. */
export function stamp(seconds: number, separator: "," | ".") {
  const total = Math.max(0, Math.round(seconds * 1000))
  const two = (value: number) => String(value).padStart(2, "0")
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor(total / 60_000) % 60
  const rest = Math.floor(total / 1000) % 60
  return `${two(hours)}:${two(minutes)}:${two(rest)}${separator}${String(total % 1000).padStart(3, "0")}`
}

/** A time as the page shows it: m:ss, or h:mm:ss. */
export function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const two = (value: number) => String(value).padStart(2, "0")
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  return hours
    ? `${hours}:${two(minutes)}:${two(total % 60)}`
    : `${minutes}:${two(total % 60)}`
}

/** SubRip subtitles. */
export const toSrt = (segments: readonly Segment[]) =>
  segments
    .map(
      (one, index) =>
        `${index + 1}\n${stamp(one.start, ",")} --> ${stamp(one.end, ",")}\n${one.text}\n`
    )
    .join("\n")

/** WebVTT subtitles; a cue's text never holds "-->", which would end it. */
export const toVtt = (segments: readonly Segment[]) =>
  `WEBVTT\n\n${segments
    .map(
      (one) =>
        `${stamp(one.start, ".")} --> ${stamp(one.end, ".")}\n${one.text.replace(/-->/g, "->")}\n`
    )
    .join("\n")}`

/** Plain text, with each segment's time in front when asked. */
export const toText = (segments: readonly Segment[], times = false) =>
  `${segments
    .map((one) => (times ? `[${clock(one.start)}] ${one.text}` : one.text))
    .join("\n")}\n`

/** Text compared without case or accents. */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

/** The segments that hold a search, by index; none for an empty search. */
export function found(segments: readonly Segment[], query: string) {
  const wanted = plain(tidy(query))
  if (!wanted) return []
  return segments.flatMap((one, index) =>
    plain(one.text).includes(wanted) ? [index] : []
  )
}

/** The segment being heard at a time, by index; −1 between segments. */
export function segmentAt(segments: readonly Segment[], time: number) {
  let low = 0
  let high = segments.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const one = segments[middle]
    if (time < one.start) high = middle - 1
    else if (time >= one.end) low = middle + 1
    else return middle
  }
  return -1
}

/**
 * Phrases Whisper is known to write over silence, music or noise, having
 * learnt them from the ends of subtitled videos. They are kept, since they
 * can be said, but marked for checking.
 */
const STOCK = [
  "thank you",
  "thanks for watching",
  "thank you for watching",
  "thank you very much",
  "please subscribe",
  "subscribe to my channel",
  "see you next time",
  "bye",
  "you",
  "subtitles by the amara.org community",
]

/**
 * Whether a segment is one Whisper writes when nothing was said: one of its
 * stock phrases, or a word said three times running ("die die die").
 */
export function doubtful(text: string) {
  const bare = plain(text)
    .replace(/[^\p{L}\p{N}. ]/gu, "")
    .replace(/[. ]+$/, "")
    .trim()
  return STOCK.includes(bare) || /\b(\p{L}+)(?:[ .]+\1\b){2,}/u.test(bare)
}

/** Under this, in dBFS, a part of a window is silent… */
export const SILENT = -60
/** …when it is also this far under the window's loudest second. */
export const QUIETER = 30

/**
 * Segments without those that lie in silence, which Whisper fills with
 * words nobody said: their sound (from `audio`, the window at 16 kHz from
 * `start` seconds) is under SILENT dBFS and QUIETER dB under the loudest
 * second of the window.
 */
export function inSound(
  segments: readonly Segment[],
  audio: Float32Array,
  start: number
): Segment[] {
  const level = (from: number, to: number) => {
    const first = Math.max(0, Math.floor(from))
    const last = Math.min(audio.length, Math.ceil(to))
    let sum = 0
    for (let index = first; index < last; index++) sum += audio[index] ** 2
    return last > first
      ? 10 * Math.log10(sum / (last - first) + 1e-20)
      : -Infinity
  }
  let loudest = -Infinity
  for (let at = 0; at < audio.length; at += WHISPER_RATE)
    loudest = Math.max(loudest, level(at, at + WHISPER_RATE))
  return segments.filter((one) => {
    const db = level(
      (one.start - start) * WHISPER_RATE,
      (one.end - start) * WHISPER_RATE
    )
    // A window that is all silence has nothing louder to compare with.
    return !(db < SILENT && (loudest < SILENT || db < loudest - QUIETER))
  })
}

/** The languages offered; Whisper hears about a hundred, and finds which by itself when none is chosen. */
export const LANGUAGES: readonly { code: string; label: string }[] = [
  { code: "", label: "Find it by itself" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "vi", label: "Vietnamese" },
]
