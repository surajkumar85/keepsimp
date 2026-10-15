/**
 * Fitting a lossy file under a size: its size is close to bitrate times
 * length, so the bitrate is worked out from the limit, less room for the
 * container and tags, and rounded down to one the codec offers.
 */
import { sizeLabel } from "@/lib/image-compressor/formats"

/** Bytes kept free for headers, indexes and tags, besides 3% of the limit. */
export const OVERHEAD_BYTES = 8 * 1024

/** The highest bitrate (kbit/s) among those allowed at which `seconds` of sound fit in `bytes`; null when none does. */
export function bitrateForSize(
  bytes: number,
  seconds: number,
  allowed: readonly number[]
): number | null {
  if (!(seconds > 0)) return allowed[allowed.length - 1]
  const room = bytes * 0.97 - OVERHEAD_BYTES
  const kbits = (room * 8) / seconds / 1000
  const fitting = allowed.filter((one) => one <= kbits)
  return fitting.length ? fitting[fitting.length - 1] : null
}

/** What fitting the limit did, in words. */
export function fittedSaid(
  bytes: number,
  kbits: number | null,
  lowest: number
) {
  return kbits === null
    ? `It cannot fit under ${sizeLabel(bytes)} even at ${lowest} kbit/s, the lowest offered, so it is written at that.`
    : `To fit under ${sizeLabel(bytes)}, it is written at ${kbits} kbit/s.`
}
