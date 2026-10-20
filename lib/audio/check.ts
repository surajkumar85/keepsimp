/**
 * The check every result goes through before it is offered: the file that
 * was written is opened again and decoded, and its length, sample rate and
 * channels are held against what was asked.
 */
import { dbLabel } from "./level"

export interface Heard {
  /** Seconds of sound decoded from the result. */
  duration: number
  sampleRate: number
  channels: number
  /** The loudest sample decoded, from 0 to 1. */
  peak: number
  /** Its loudness in LUFS and true peak in dBTP, as decoded (SILENT for none). */
  loudness?: { integrated: number; truePeak: number }
}

export interface Expected {
  duration: number
  sampleRate: number
  channels: number
  /** Copied sound is cut on the codec's frames, so it may be a little longer. */
  copy: boolean
  /** The source has sound in it (not all silence). */
  audible: boolean
  /** The bitrate asked of a constant-bitrate format (MP3), in bits per second; null otherwise. */
  bitrate?: number | null
  /** How large the file written is, in bytes. */
  bytes?: number
  /** The loudness it was normalised to, in LUFS; null when it was not (or could not be). */
  loudness?: number | null
  /** The highest a true peak may be, in dBTP, for a lossless format (lossy encoders add a little); null for none. */
  ceiling?: number | null
}

/** How far a normalised loudness may stray, in LU, and a lossless peak over its ceiling, in dB. */
export const LOUDNESS_TOLERANCE = 1
export const CEILING_TOLERANCE = 0.2

/** How far a length may stray: about two codec frames, or more for copied sound. */
export const lengthTolerance = (expected: Expected) =>
  expected.copy ? 0.25 : Math.max(0.06, expected.duration * 0.001)

/** What is wrong with a result, in sentences; empty when it is as asked. */
export function checkResult(expected: Expected, heard: Heard | null): string[] {
  if (!heard) return ["The file that was written could not be read back."]
  const problems: string[] = []
  if (Math.abs(heard.duration - expected.duration) > lengthTolerance(expected))
    problems.push(
      `It is ${heard.duration.toFixed(2)} s long, not ${expected.duration.toFixed(2)} s.`
    )
  if (heard.sampleRate !== expected.sampleRate)
    problems.push(
      `Its sample rate is ${heard.sampleRate} Hz, not ${expected.sampleRate} Hz.`
    )
  if (heard.channels !== expected.channels)
    problems.push(
      `It has ${heard.channels} channels, not ${expected.channels}.`
    )
  if (expected.audible && heard.peak < 1e-4)
    problems.push("It is silent, though the original is not.")
  // Tags and cover art only add bytes, so a file well under its bitrate was written at another.
  if (expected.bitrate && expected.bytes !== undefined && heard.duration > 0) {
    const kbits = (expected.bytes * 8) / heard.duration / 1000
    if (kbits < (expected.bitrate / 1000) * 0.8)
      problems.push(
        `It was written at about ${Math.round(kbits)} kbit/s, not ${expected.bitrate / 1000}.`
      )
  }
  const measured = heard.loudness
  if (measured && expected.loudness != null) {
    if (Math.abs(measured.integrated - expected.loudness) > LOUDNESS_TOLERANCE)
      problems.push(
        `It measures ${dbLabel(measured.integrated)} LUFS, not ${dbLabel(expected.loudness)}.`
      )
  }
  if (
    measured &&
    expected.ceiling != null &&
    measured.truePeak > expected.ceiling + CEILING_TOLERANCE
  )
    problems.push(
      `Its peaks reach ${dbLabel(measured.truePeak)} dBTP, over ${dbLabel(expected.ceiling)}.`
    )
  return problems
}
