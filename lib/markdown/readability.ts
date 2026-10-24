/**
 * How easy an English text is to read, as an estimate: sentence lengths,
 * the Flesch reading ease (Flesch 1948) from a count of syllables made by
 * rule, long sentences, and phrases that may be passive. Only for English,
 * and only a guide; the page says so.
 */

export interface Readability {
  sentences: number
  words: number
  /** Flesch reading ease, 0 to 100: higher is easier. */
  ease: number
  /** The ease in words. */
  said: string
  /** Words a sentence, on average. */
  averageSentence: number
  /** Sentences longer than `LONG_SENTENCE` words, as they are written. */
  long: string[]
  /** Phrases such as "was written", which may be passive. */
  passive: string[]
}

export const LONG_SENTENCE = 25

/** Syllables in an English word, by rule: groups of vowels, less a silent e. */
export function syllables(word: string) {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "")
  if (!lower) return 0
  if (lower.length <= 3) return 1
  const trimmed = lower
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
  const groups = trimmed.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups?.length ?? 1)
}

/** The reading ease in words, by Flesch's own bands. */
export function easeSaid(ease: number) {
  if (ease >= 90) return "Very easy"
  if (ease >= 80) return "Easy"
  if (ease >= 70) return "Fairly easy"
  if (ease >= 60) return "Plain English"
  if (ease >= 50) return "Fairly hard"
  if (ease >= 30) return "Hard"
  return "Very hard"
}

const PASSIVE =
  /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+(?:ed|en)|made|done|given|taken|seen|known|shown|written|built|sent|kept|found|told|held|paid|left|put|set|read|run)\b/gi

/** The estimate for a text (the document's words without their marks). */
export function readabilityOf(text: string): Readability {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" })
  const sentences = Array.from(segmenter.segment(text), (one) =>
    one.segment.replace(/\s+/g, " ").trim()
  ).filter((one) => /[a-z]/i.test(one))
  const wordsOf = (sentence: string) =>
    sentence.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word))
  const words = sentences.flatMap(wordsOf)
  const count = Math.max(1, sentences.length)
  const syllableCount = words.reduce((sum, word) => sum + syllables(word), 0)
  const ease = words.length
    ? Math.round(
        Math.min(
          100,
          Math.max(
            0,
            206.835 -
              1.015 * (words.length / count) -
              84.6 * (syllableCount / words.length)
          )
        )
      )
    : 0
  return {
    sentences: sentences.length,
    words: words.length,
    ease,
    said: words.length ? easeSaid(ease) : "Nothing to read yet",
    averageSentence: Math.round((words.length / count) * 10) / 10,
    long: sentences.filter((one) => wordsOf(one).length > LONG_SENTENCE),
    passive: Array.from(text.matchAll(PASSIVE), (match) => match[0]),
  }
}
