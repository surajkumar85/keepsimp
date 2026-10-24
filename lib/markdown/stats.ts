/**
 * How long a document is: words counted as the browser's own word breaker
 * finds them (`Intl.Segmenter`), so Chinese, Japanese and Thai count right,
 * characters, and an estimate of the time it takes to read.
 */

/** Words a minute when reading silently, for non-fiction (Brysbaert 2019, doi:10.1016/j.jml.2019.104047). */
export const WORDS_A_MINUTE = 238

export interface Stats {
  words: number
  /** Characters a reader sees, without line breaks. */
  characters: number
  /** Characters but spaces. */
  charactersWithoutSpaces: number
  /** Minutes to read, rounded up; 0 for an empty document. */
  minutes: number
}

let segmenter: Intl.Segmenter | null = null

/** Words in a text, as the browser breaks them. */
export function countWords(text: string) {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "word" })
  let words = 0
  for (const segment of segmenter.segment(text)) if (segment.isWordLike) words++
  return words
}

export function statsOf(plain: string): Stats {
  const words = countWords(plain)
  const characters = [...plain.replace(/\n/g, "")].length
  return {
    words,
    characters,
    charactersWithoutSpaces: [...plain.replace(/\s/g, "")].length,
    minutes: words ? Math.ceil(words / WORDS_A_MINUTE) : 0,
  }
}

/** The counts in a line: "1,204 words · 6 min read". */
export function statsSaid(stats: Stats) {
  const words = `${stats.words.toLocaleString("en-GB")} ${stats.words === 1 ? "word" : "words"}`
  return stats.minutes ? `${words} · ${stats.minutes} min read` : words
}
