import { describe, expect, it } from "vitest"
import {
  cleanWord,
  hexOf,
  inDrawnOrder,
  spaced,
  layerOf,
  LONGEST_SIDE,
  LONGEST_WORD,
  MOST_LINES,
  MOST_PIXELS,
  MOST_WORDS,
  OCR_DPI,
  ocrSummary,
  pagesNamed,
  ocrZoom,
  readingOf,
  readOcrOp,
  wordsIn,
  type OcrLine,
  type TesseractBlock,
} from "./ocr"

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  x0,
  y0,
  x1,
  y1,
})

/** Tesseract's blocks for some lines, each a list of words with their boxes. */
const blocks = (
  ...lines: {
    bbox: ReturnType<typeof box>
    baseline?: ReturnType<typeof box>
    words: [string, ReturnType<typeof box>, number?][]
  }[]
): TesseractBlock[] => [
  {
    paragraphs: [
      {
        lines: lines.map((line) => ({
          bbox: line.bbox,
          baseline:
            line.baseline ??
            box(line.bbox.x0, line.bbox.y1, line.bbox.x1, line.bbox.y1),
          words: line.words.map(([text, bbox, confidence = 90]) => ({
            text,
            bbox,
            confidence,
          })),
        })),
      },
    ],
  },
]

describe("ocrZoom", () => {
  it("draws a page at 300 dots to the inch, and a large one smaller", () => {
    expect(ocrZoom(612, 792)).toBe(OCR_DPI / 72)
    // A poster: held to the most pixels a page is drawn with.
    const poster = ocrZoom(2000, 3000)
    expect(2000 * 3000 * poster ** 2).toBeCloseTo(MOST_PIXELS)
    // A long strip: held to the longest side.
    expect(ocrZoom(100, 4000) * 4000).toBeCloseTo(LONGEST_SIDE)
    expect(ocrZoom(0, 100)).toBe(OCR_DPI / 72)
  })
})

describe("cleanWord", () => {
  it("keeps a word's letters, and nothing that is not one", () => {
    expect(cleanWord("Café")).toBe("Café")
    expect(cleanWord(" a​b\tc\u0007 ")).toBe("abc")
    expect(cleanWord("x".repeat(LONGEST_WORD + 5))).toHaveLength(LONGEST_WORD)
    expect(cleanWord(" ")).toBe("")
  })
})

describe("readingOf", () => {
  it("takes lines to the page's points, with their words in order, and counts how sure it was", () => {
    const read = readingOf(
      blocks(
        {
          bbox: box(100, 200, 500, 240),
          words: [
            ["world", box(300, 200, 500, 240), 40],
            ["Hello", box(100, 200, 280, 240), 96],
            [" ", box(290, 200, 295, 240)],
          ],
        },
        // A line with nothing in it is left out.
        { bbox: box(0, 0, 10, 10), words: [["​", box(0, 0, 10, 10)]] }
      ),
      0.5
    )
    expect(read).toEqual({
      lines: [
        {
          x: 50,
          y: 120,
          size: 20,
          slope: 0,
          words: [
            { text: "Hello", x: 50, width: 90 },
            { text: "world", x: 150, width: 100 },
          ],
        },
      ],
      words: 2,
      unsure: 1,
      confidence: 68,
    })
    expect(readingOf(null, 1)).toEqual({
      lines: [],
      words: 0,
      unsure: 0,
      confidence: 0,
    })
  })

  it("follows a line that slopes, either way, and keeps one that is plumb level", () => {
    // Going down 10 over 200: its box is 30 high, of which 10 is the slope.
    const down = readingOf(
      blocks({
        bbox: box(0, 100, 200, 130),
        baseline: box(0, 115, 200, 125),
        words: [["down", box(0, 100, 200, 130)]],
      }),
      1
    ).lines[0]
    expect(down).toMatchObject({ y: 120, size: 20, slope: 0.05 })
    const up = readingOf(
      blocks({
        bbox: box(0, 100, 200, 130),
        baseline: box(0, 125, 200, 115),
        words: [["up", box(0, 100, 200, 130)]],
      }),
      1
    ).lines[0]
    expect(up).toMatchObject({ y: 130, size: 20, slope: -0.05 })
    // A steep one is held to a slope of one; a baseline of no length is level.
    expect(
      readingOf(
        blocks({
          bbox: box(0, 0, 10, 100),
          baseline: box(0, 0, 10, 90),
          words: [["steep", box(0, 0, 10, 100)]],
        }),
        1
      ).lines[0].slope
    ).toBe(1)
    expect(
      readingOf(
        blocks({
          bbox: box(0, 0, 10, 10),
          baseline: box(5, 5, 5, 5),
          words: [["dot", box(0, 0, 10, 10)]],
        }),
        1
      ).lines[0]
    ).toMatchObject({ slope: 0, size: 10 })
  })

  it("stops at the most words and lines a page is given", () => {
    const many = (count: number, each: number) =>
      blocks(
        ...Array.from({ length: count }, (_, line) => ({
          bbox: box(0, line * 10, 1000, line * 10 + 8),
          words: Array.from(
            { length: each },
            (_, at) =>
              ["w", box(at * 2, line * 10, at * 2 + 1, line * 10 + 8)] as [
                string,
                ReturnType<typeof box>,
              ]
          ),
        }))
      )
    const words = readingOf(many(3, MOST_WORDS / 2), 1)
    expect(words.words).toBe(MOST_WORDS)
    expect(words.lines).toHaveLength(2)
    expect(readingOf(many(MOST_LINES + 3, 1), 1).lines).toHaveLength(MOST_LINES)
  })
})

describe("readOcrOp", () => {
  const line: OcrLine = {
    x: 10,
    y: 20,
    size: 12,
    slope: 0.01,
    words: [{ text: "word", x: 10, width: 30 }],
  }

  it("takes a page's reading as it came, and nothing that is not one", () => {
    expect(readOcrOp({ page: 2, lines: [line] })).toEqual({
      page: 2,
      lines: [line],
    })
    expect(readOcrOp({ page: 0, lines: [] })).toEqual({ page: 0, lines: [] })
    for (const bad of [
      null,
      "page",
      { page: -1, lines: [] },
      { page: 0.5, lines: [] },
      { page: 0, lines: "x" },
      { page: 0, lines: Array.from({ length: MOST_LINES + 1 }, () => line) },
      { page: 0, lines: [null] },
      { page: 0, lines: [{ ...line, x: "1" }] },
      { page: 0, lines: [{ ...line, y: Infinity }] },
      { page: 0, lines: [{ ...line, slope: 2 }] },
      { page: 0, lines: [{ ...line, size: 0 }] },
      { page: 0, lines: [{ ...line, size: 6000 }] },
      { page: 0, lines: [{ ...line, words: [] }] },
      { page: 0, lines: [{ ...line, words: "x" }] },
      { page: 0, lines: [{ ...line, words: [null] }] },
      { page: 0, lines: [{ ...line, words: [{ text: 1, x: 0, width: 1 }] }] },
      {
        page: 0,
        lines: [{ ...line, words: [{ text: "a b", x: 0, width: 1 }] }],
      },
      { page: 0, lines: [{ ...line, words: [{ text: "", x: 0, width: 1 }] }] },
      { page: 0, lines: [{ ...line, words: [{ text: "a", x: 0, width: 0 }] }] },
      {
        page: 0,
        lines: [{ ...line, words: [{ text: "a", x: NaN, width: 1 }] }],
      },
      {
        page: 0,
        lines: Array.from({ length: 3 }, () => ({
          ...line,
          words: Array.from({ length: MOST_WORDS / 2 }, () => line.words[0]),
        })),
      },
    ])
      expect(readOcrOp(bad)).toBeNull()
  })
})

describe("layerOf", () => {
  it("writes each word unseen, stretched to its width, with a space that fills the room to the next", () => {
    const written = layerOf(
      [
        {
          x: 100,
          y: 200,
          size: 20,
          slope: 0,
          words: [
            { text: "Hi", x: 100, width: 30 },
            { text: "€1", x: 150, width: 20 },
          ],
        },
      ],
      "KsOcr",
      [1, 0, 0, -1, 0, 800]
    )
    expect(written).toBe(
      [
        "q",
        "BT",
        "3 Tr 0 Tc 0 Tw 0 Ts",
        "/KsOcr 20 Tf",
        "1 0 0 1 100 600 Tm",
        // Two letters of 10 points each are 20 wide: 150% of that is 30.
        "150 Tz <00480069> Tj",
        "200 Tz <0020> Tj",
        "1 0 0 1 150 600 Tm",
        "100 Tz <20ac0031> Tj",
        "ET",
        "Q",
        "",
      ].join("\n")
    )
  })

  it("follows a sloping line, and gives touching words a space all the same", () => {
    const written = layerOf(
      [
        {
          x: 0,
          y: 100,
          size: 10,
          slope: 0.75,
          words: [
            { text: "a", x: 0, width: 8 },
            { text: "b", x: 8, width: 8 },
          ],
        },
      ],
      "F",
      [1, 0, 0, 1, 0, 0]
    )
    // Along (0.8, 0.6): the second word starts 6 lower, 8 across.
    expect(written).toContain("0.8 0.6 0.6 -0.8 0 100 Tm")
    expect(written).toContain("0.8 0.6 0.6 -0.8 8 106 Tm")
    // 8 across is 10 along; the room between them is a hundredth of the size.
    expect(written).toContain("200 Tz <0061> Tj")
    expect(written).toContain("2.5 Tz <0020> Tj")
    expect(layerOf([], "F", [1, 0, 0, 1, 0, 0])).toBe("")
  })
})

describe("helpers", () => {
  it("writes letters as UTF-16, and counts words", () => {
    expect(hexOf("A😀")).toBe("0041d83dde00")
    expect(
      wordsIn([
        {
          page: 0,
          lines: [
            {
              x: 0,
              y: 0,
              size: 1,
              slope: 0,
              words: [{ text: "a", x: 0, width: 1 }],
            },
          ],
        },
        { page: 1, lines: [] },
      ])
    ).toBe(1)
  })
})

describe("what a run says", () => {
  const tally = {
    read: [] as number[],
    words: 0,
    unsure: 0,
    confidence: 0,
    hadText: [] as number[],
    blank: [] as number[],
    failed: [] as number[],
    stopped: false,
  }

  it("names pages as people count them", () => {
    expect(pagesNamed([2])).toBe("page 3")
    expect(pagesNamed([0, 4])).toBe("pages 1 and 5")
    expect(pagesNamed(Array.from({ length: 13 }, (_, at) => at))).toBe(
      "pages 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 and 3 more"
    )
  })

  it("says what was found, how sure it was, and what was left and why", () => {
    expect(
      ocrSummary({
        ...tally,
        read: [0, 1],
        words: 1204,
        unsure: 12,
        confidence: 94,
      })
    ).toEqual({
      text: "Words were recognised on pages 1 and 2: 1,204 words, 94% sure on average; 12 of them read with little certainty. They lie unseen over the pages: search or select them now, and Undo takes them all away.",
      good: true,
    })
    const mixed = ocrSummary({
      ...tally,
      read: [0],
      words: 1,
      confidence: 90,
      hadText: [1],
      blank: [2],
      failed: [3, 4],
      stopped: true,
    })
    expect(mixed.good).toBe(false)
    expect(mixed.text).toContain("page 1: 1 word, 90% sure on average.")
    expect(mixed.text).toContain("Stopped: the pages read so far are laid.")
    expect(mixed.text).toContain(
      "Page 2 already has text and was left as it is."
    )
    expect(mixed.text).toContain("No words were found on page 3.")
    expect(mixed.text).toContain("Pages 4 and 5 could not be read.")
    expect(ocrSummary({ ...tally, hadText: [0, 1] }).text).toContain(
      "Pages 1 and 2 already have text and were left as they are."
    )
    expect(ocrSummary({ ...tally, stopped: true }).text).toBe(
      "Stopped before any words were found."
    )
    expect(ocrSummary(tally)).toEqual({
      text: "There were no pages to read.",
      good: false,
    })
  })

  it("warns when most words were read with little certainty", () => {
    const doubt = ocrSummary({
      ...tally,
      read: [0],
      words: 740,
      unsure: 705,
      confidence: 24,
    })
    expect(doubt.good).toBe(false)
    expect(doubt.text).toContain("not to be relied on")
  })
})

describe("scripts", () => {
  it("writes a right-to-left word in the order its letters stand, and leaves others as they are", () => {
    expect(inDrawnOrder("שלום")).toBe("םולש")
    // A mark is turned round with its letter, as readers turn them back.
    expect(inDrawnOrder("ضوبّيا")).toBe("ايّبوض")
    expect(inDrawnOrder("Straße")).toBe("Straße")
    expect(inDrawnOrder("4821")).toBe("4821")
  })

  it("puts no space between words of scripts that are written together, nor before a mark", () => {
    expect(spaced("Hello", "world")).toBe(true)
    expect(spaced("发票", "已经")).toBe(false)
    expect(spaced("これ", "は")).toBe(false)
    expect(spaced("นี", "คือ")).toBe(false)
    expect(spaced("ค", "\u0E37อ")).toBe(false)
    // Korean is written with spaces; a Latin word beside Chinese gets one.
    expect(spaced("한국어", "문서")).toBe(true)
    expect(spaced("PDF", "文件")).toBe(true)
    expect(spaced("", "a")).toBe(true)
    expect(spaced("a", "")).toBe(true)
  })

  it("joins a mark that was read as a word of its own to the word before it", () => {
    const read = readingOf(
      blocks({
        bbox: box(0, 0, 100, 20),
        words: [
          ["ค", box(0, 2, 10, 20), 90],
          ["\u0E37", box(6, 0, 12, 8), 50],
          ["อ", box(14, 2, 24, 20), 90],
        ],
      }),
      1
    )
    expect(read.lines[0].words).toEqual([
      { text: "ค\u0E37", x: 0, width: 12 },
      { text: "อ", x: 14, width: 10 },
    ])
    expect(read.words).toBe(2)
    expect(read.unsure).toBe(1)
  })

  it("writes words written together up to the next, and never into it", () => {
    const written = layerOf(
      [
        {
          x: 0,
          y: 100,
          size: 10,
          slope: 0,
          words: [
            // Tesseract gave the first the width of the whole line.
            { text: "请求", x: 0, width: 100 },
            { text: "书", x: 22, width: 10 },
            { text: "OK", x: 40, width: 10 },
            { text: "go", x: 30, width: 10 },
          ],
        },
      ],
      "F",
      [1, 0, 0, 1, 0, 0]
    )
    // 请求 reaches to 书, 22 wide for two letters of 5 each: 220%.
    expect(written).toContain("220 Tz <8bf76c42> Tj\n1 0 0 -1 22 100 Tm")
    // 书 is followed by a Latin word: its own width, and a space up to it.
    expect(written).toContain("200 Tz <4e66> Tj\n160 Tz <0020> Tj")
    // A word that lies back over the one before keeps its own width.
    expect(written).toContain("1 0 0 -1 40 100 Tm\n100 Tz <004f004b> Tj")
  })
})
