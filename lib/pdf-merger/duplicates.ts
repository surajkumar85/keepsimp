/**
 * Finding identical things in a file in one pass: each is given a key, and
 * only things with the same key are ever compared with each other.
 */

/** A long run of bytes is recognised by this much of each end. */
export const HASHED_END = 512 * 1024

/**
 * A number for a run of bytes; equal bytes always give the same number.
 * Different bytes may give it too, so a match is a reason to compare, not
 * proof.
 */
export function hashBytes(bytes: Uint8Array) {
  // FNV-1a
  let hash = 0x811c9dc5
  const take = (from: number, to: number) => {
    for (let index = from; index < to; index++)
      hash = Math.imul(hash ^ bytes[index], 0x01000193)
  }
  if (bytes.length <= HASHED_END * 2) take(0, bytes.length)
  else {
    take(0, HASHED_END)
    take(bytes.length - HASHED_END, bytes.length)
  }
  return hash >>> 0
}

export function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++)
    if (a[index] !== b[index]) return false
  return true
}

/** Remembers what it has been shown, and says when it is shown the same again. */
export class Duplicates {
  private readonly kept = new Map<string, number[]>()

  /**
   * The thing shown earlier that this one is a copy of. Null when there is
   * none, and this one is then remembered for those that follow.
   * @param same Whether this thing and one with the same key really are the same.
   */
  find(key: string, number: number, same: (other: number) => boolean) {
    const alike = this.kept.get(key)
    if (!alike) {
      this.kept.set(key, [number])
      return null
    }
    for (const other of alike) if (same(other)) return other
    alike.push(number)
    return null
  }
}

/**
 * Kinds of dictionary that only describe something: two that read the same
 * are the same. A page, a note, a form field, a layer or a tag is a thing of
 * its own even when another reads the same, and is never among these.
 */
const DESCRIPTIONS = new Set([
  "Font",
  "FontDescriptor",
  "ExtGState",
  "Encoding",
])

export const isDescription = (type: string) => DESCRIPTIONS.has(type)
