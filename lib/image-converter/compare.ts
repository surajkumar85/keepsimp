import type { Target } from "./targets"

export interface Comparison {
  target: Target
  bytes: number
  /** Mean SSIM against the source, or null when it was not measured. */
  similarity: number | null
}

export interface RankedComparison extends Comparison {
  /** Size relative to the original file; below 1 is smaller. */
  ratio: number
  smallest: boolean
}

/** Smallest file first, flagging the winner and each size against the original. */
export function rankComparisons(
  results: Comparison[],
  originalBytes: number
): RankedComparison[] {
  const ordered = [...results].sort((a, b) => a.bytes - b.bytes)
  return ordered.map((result, index) => ({
    ...result,
    ratio: originalBytes > 0 ? result.bytes / originalBytes : 1,
    smallest: index === 0,
  }))
}
