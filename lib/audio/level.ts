/**
 * How loud a result is to be: as the file is, normalised to a loudness
 * (BS.1770, with a true-peak limiter holding peaks under a ceiling),
 * normalised so its highest true peak reaches a level, or made louder by
 * a number of decibels (with the same limiter). Every file is measured
 * as it will be written (after its edits, at the rate and channels it
 * will have), so files normalised together come out matched.
 */

import { decibels, SILENT, type Loudness } from "./loudness"

export type LevelMode = "same" | "loudness" | "peak" | "louder"

export interface Level {
  mode: LevelMode
  /** The loudness to reach, in LUFS. */
  target: number
  /** In dBTP: the highest a peak may reach (loudness, louder), or the peak to reach (peak). */
  ceiling: number
  /** How much louder, in dB. */
  louder: number
}

export const defaultLevel: Level = {
  mode: "same",
  target: -14,
  ceiling: -1,
  louder: 6,
}

/** Loudness targets people are asked for, with who asks; sources in docs/audio-workspace.md. */
export const TARGETS = [
  { lufs: -14, label: "−14 LUFS", for: "Spotify, streaming" },
  { lufs: -16, label: "−16 LUFS", for: "Apple Podcasts" },
  { lufs: -23, label: "−23 LUFS", for: "Broadcast (EBU R 128)" },
  { lufs: -24, label: "−24 LUFS", for: "US TV (ATSC A/85)" },
] as const

/** The most a file is made louder to reach a loudness. */
export const MOST_RAISE = 30
/** The loudest target, the lowest, and the bounds of the other figures. */
export const LOUDEST_TARGET = -5
export const QUIETEST_TARGET = -40
export const LOWEST_CEILING = -9
export const MOST_LOUDER = 30

/** A number in dB as the page writes it: −1, 4.5, +3 where a sign helps. */
export function dbLabel(value: number, signed = false) {
  const rounded = Math.round(value * 10) / 10 + 0
  const text = Math.abs(rounded).toLocaleString("en", {
    maximumFractionDigits: 1,
  })
  return rounded < 0 ? `−${text}` : signed && rounded > 0 ? `+${text}` : text
}

/** Why these level settings cannot be used; null when they can. */
export function levelProblem(level: Level): string | null {
  if (level.mode === "loudness") {
    if (!(level.target >= QUIETEST_TARGET && level.target <= LOUDEST_TARGET))
      return `Choose a loudness from ${dbLabel(QUIETEST_TARGET)} to ${dbLabel(LOUDEST_TARGET)} LUFS.`
  }
  if (
    level.mode !== "same" &&
    !(level.ceiling >= LOWEST_CEILING && level.ceiling <= 0)
  )
    return `Choose a peak from ${dbLabel(LOWEST_CEILING)} to 0 dBTP.`
  if (
    level.mode === "louder" &&
    !(level.louder > 0 && level.louder <= MOST_LOUDER)
  )
    return `Choose how much louder, up to ${MOST_LOUDER} dB.`
  return null
}

/** Names what changes a result. */
export const levelKey = (level: Level) =>
  level.mode === "same"
    ? "same"
    : JSON.stringify([
        level.mode,
        level.mode === "loudness" ? level.target : 0,
        level.ceiling,
        level.mode === "louder" ? level.louder : 0,
      ])

/** Whether a file must be measured before it is written. */
export const needsMeasure = (level: Level) =>
  level.mode === "loudness" || level.mode === "peak"

/** The gain a file is given and whether the limiter holds its peaks, with what to say of it. */
export interface Gain {
  db: number
  /** The ceiling the limiter holds, as a level; null for no limiter. */
  ceiling: number | null
  notes: string[]
}

/** The gain for a file measured (as it will be written, before any gain). */
export function gainFor(level: Level, measured: Loudness | null): Gain {
  const ceiling = 10 ** (level.ceiling / 20)
  if (level.mode === "louder") return { db: level.louder, ceiling, notes: [] }
  if (level.mode === "loudness") {
    if (!measured || measured.integrated === SILENT)
      return {
        db: 0,
        ceiling: null,
        notes: [
          "It is too quiet or too short to measure its loudness, so its level is left as it is.",
        ],
      }
    const wanted = level.target - measured.integrated
    if (wanted > MOST_RAISE)
      return {
        db: MOST_RAISE,
        ceiling,
        notes: [
          `It would need to be ${dbLabel(wanted)} dB louder; it is made ${MOST_RAISE} dB louder, the most done here, and stays under the target.`,
        ],
      }
    return { db: wanted, ceiling, notes: [] }
  }
  if (level.mode === "peak") {
    if (!measured || measured.truePeak === SILENT)
      return {
        db: 0,
        ceiling: null,
        notes: ["It is silent, so its level is left as it is."],
      }
    return { db: level.ceiling - measured.truePeak, ceiling: null, notes: [] }
  }
  return { db: 0, ceiling: null, notes: [] }
}

/** What happened to a file's level, as it was measured before and after. */
export interface LevelResult {
  mode: LevelMode
  /** Measured as it would be written, before the gain; null when not measured. */
  before: Loudness | null
  db: number
  /** Measured as written, before encoding. */
  after: Loudness
  /** The most the limiter took off, in dB (0 when it did nothing or was not used). */
  limited: number
  notes: string[]
}

/** The sentence the page says of a file's level. */
export function levelSaid(result: LevelResult): string {
  const gain =
    Math.abs(result.db) < 0.05
      ? "Its level is left as it is"
      : `Made ${dbLabel(Math.abs(result.db))} dB ${result.db > 0 ? "louder" : "quieter"}`
  const reach =
    result.mode === "loudness"
      ? ` to ${dbLabel(result.after.integrated)} LUFS`
      : result.mode === "peak"
        ? ` so its peak is ${dbLabel(result.after.truePeak)} dBTP`
        : ""
  const limiter =
    result.limited > 0.05
      ? `; the limiter took at most ${dbLabel(result.limited)} dB off the loudest moments to keep peaks under the ceiling`
      : ""
  return `${gain}${reach}${limiter}.`
}

/** A loudness, its range and its peaks, as the meter says them. */
export function loudnessSaid(measured: Loudness) {
  if (measured.integrated === SILENT) return "Too quiet or too short to measure"
  return `${dbLabel(measured.integrated)} LUFS · range ${dbLabel(measured.range)} LU · peaks up to ${dbLabel(measured.truePeak)} dBTP`
}

/** The limiter's lowest gain, as dB taken off. */
export const takenOff = (lowest: number) =>
  lowest >= 1 ? 0 : -decibels(lowest)
