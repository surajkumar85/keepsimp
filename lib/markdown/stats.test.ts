import { describe, expect, it } from "vitest"
import { renderMarkdown } from "./render"
import { countWords, statsOf, statsSaid, WORDS_A_MINUTE } from "./stats"

describe("stats", () => {
  it("counts words without the marks of Markdown", () => {
    const { plain } = renderMarkdown(
      "# A **bold** title\n\n- [one](https://example.com) `two`\n\n```js\nthree four\n```"
    )
    expect(countWords(plain)).toBe(7)
  })

  it("counts words in scripts written without spaces", () => {
    expect(countWords("我喜欢读书")).toBeGreaterThan(1)
    expect(countWords("Hello, world! 3.5")).toBe(3)
  })

  it("says characters with and without spaces, and the time to read", () => {
    expect(statsOf("ab c\nd")).toEqual({
      words: 3,
      characters: 5,
      charactersWithoutSpaces: 4,
      minutes: 1,
    })
    expect(statsOf("")).toMatchObject({ words: 0, minutes: 0 })
    const long = Array(WORDS_A_MINUTE + 1)
      .fill("word")
      .join(" ")
    expect(statsOf(long).minutes).toBe(2)
  })

  it("puts them in a line", () => {
    expect(statsSaid(statsOf(""))).toBe("0 words")
    expect(statsSaid(statsOf("one"))).toBe("1 word · 1 min read")
    expect(
      statsSaid({
        words: 1204,
        characters: 0,
        charactersWithoutSpaces: 0,
        minutes: 6,
      })
    ).toBe("1,204 words · 6 min read")
  })
})
