import type { Target } from "./settings"

export interface SizeRow {
  target: Target
  bytes: number
  /** Size relative to the original: 0.4 is 60% smaller. */
  ratio: number
  smallest: boolean
}

/** Order measured sizes smallest first and mark the winner. */
export function rankSizes(
  results: readonly { target: Target; bytes: number }[],
  originalBytes: number
): SizeRow[] {
  const sorted = [...results].sort((a, b) => a.bytes - b.bytes)
  return sorted.map((result, index) => ({
    ...result,
    ratio: originalBytes > 0 ? result.bytes / originalBytes : 1,
    smallest: index === 0 && sorted.length > 1,
  }))
}
