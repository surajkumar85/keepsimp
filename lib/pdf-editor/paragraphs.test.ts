import { describe, expect, it } from "vitest"
import { BLACK } from "./objects"
import {
  ALIGNS,
  asLine,
  blocksOf,
  carry,
  firstChanged,
  flow,
  joined,
  joinedWords,
  LONGEST_BLOCK,
  MOST_LINES,
  readFlowOp,
  readTextChange,
  readWrote,
  shapeOf,
  SOFT,
  wordsOf,
  type Piece,
} from "./paragraphs"
import type { Glyph, LineStyle, PageLine } from "./retext"

const style = (more: Partial<LineStyle> = {}): LineStyle => ({
  font: "Body",
  size: 10,
  colour: BLACK,
  rise: 0,
  standIn: "sans",
  letters: "abc",
  ...more,
})

/** A line of a page: where it starts, how wide it is, on which line it is written. */
function line(
  text: string,
  x: number,
  y: number,
  width: number,
  more: Partial<PageLine> & { size?: number; font?: string } = {}
): PageLine {
  const { size = 10, font = "Body", ...rest } = more
  return {
    text,
    box: { x, y: y - size * 0.8, width, height: size },
    origin: { x, y },
    along: { x: 1, y: 0 },
    styles: [style({ size, font })],
    looks: Array.from(text).map(() => 0),
    first: text.split(" ")[0].length * size * 0.5,
    ...rest,
  }
}

/** Lines one under the other from a top, each as wide as said, 12 points apart. */
const stack = (
  widths: number[],
  more: Partial<PageLine> & { size?: number; font?: string } = {},
  x = 50,
  top = 100,
  words = "word word word"
) => widths.map((width, at) => line(words, x, top + at * 12, width, more))

describe("which lines are a paragraph", () => {
  it("takes full lines in one font at one distance, and ends at a short one", () => {
    const lines = stack([300, 298, 120, 300, 299, 80])
    expect(blocksOf(lines)).toEqual([
      { lines: [0, 1, 2], box: { x: 50, y: 92, width: 300, height: 34 } },
      { lines: [3, 4, 5], box: { x: 50, y: 128, width: 300, height: 34 } },
    ])
  })

  it("leaves short stacks, lists and lines of another kind as lines", () => {
    // An address: no line is full.
    expect(blocksOf(stack([60, 97, 85]))).toEqual([])
    // Narrow lines, though each is as long as the next.
    expect(blocksOf(stack([100, 100, 100]))).toEqual([])
    // Two lines are only running text when they are as wide as a column of it.
    expect(blocksOf(stack([150, 80]))).toEqual([])
    expect(blocksOf(stack([200, 80]))).toHaveLength(1)
    // Every line begins with a capital, a figure or a mark: a list.
    for (const words of ["Word word", "1. word", "– word"])
      expect(blocksOf(stack([300, 300, 300], {}, 50, 100, words))).toEqual([])
    // Two lines may both begin a sentence.
    expect(blocksOf(stack([300, 100], {}, 50, 100, "Word word"))).toHaveLength(
      1
    )
    // Another font, another size, another distance, another column.
    const [a, b] = stack([300, 300])
    expect(blocksOf([a, { ...b, styles: [style({ font: "Bold" })] }])).toEqual(
      []
    )
    expect(blocksOf([a, { ...b, styles: [style({ size: 12 })] }])).toEqual([])
    expect(blocksOf([a, line("word", 50, 100 + 40, 300)])).toEqual([])
    expect(blocksOf([a, line("word", 50, 100 + 4, 300)])).toEqual([])
    expect(blocksOf([a, line("word", 400, 112, 300)])).toEqual([])
    // A third line that is further from the second than the second from the first.
    expect(
      blocksOf([...stack([300, 300]), line("word", 50, 130, 300)])
    ).toHaveLength(1)
    // Turned lines, lines that cannot be changed, and lines without a look.
    expect(blocksOf(stack([300, 300], { along: { x: 0, y: -1 } }))).toEqual([])
    expect(blocksOf(stack([300, 300], { fixed: "No." }))).toEqual([])
    expect(blocksOf(stack([300, 300], { styles: [], looks: [] }))).toEqual([])
    expect(blocksOf([])).toEqual([])
  })

  it("keeps columns apart, and reads them from the top and from the left", () => {
    const left = stack([180, 180, 90], {}, 40)
    const right = stack([180, 180, 90], {}, 240)
    // As a page gives them: line by line across.
    const lines = left.flatMap((one, at) => [one, right[at]])
    expect(blocksOf(lines).map((block) => block.lines)).toEqual([
      [0, 2, 4],
      [1, 3, 5],
    ])
    // The higher one first, whichever is given first.
    const lower = stack([300, 300], {}, 50, 300)
    expect(
      blocksOf([...lower, ...stack([300, 300])]).map((block) => block.lines)
    ).toEqual([
      [2, 3],
      [0, 1],
    ])
  })

  it("begins a new paragraph where a line is set in", () => {
    const lines = [
      line("word word", 64, 100, 286),
      line("word word", 50, 112, 300),
      line("word word", 64, 124, 286),
      line("word word", 50, 136, 300),
      line("word word", 50, 148, 120),
    ]
    expect(blocksOf(lines).map((block) => block.lines)).toEqual([
      [0, 1],
      [2, 3, 4],
    ])
  })

  it("takes lines set about their middle and to the right, and leaves lines that keep to nothing", () => {
    const centred = [
      line("word word", 60, 100, 280),
      line("word word", 100, 112, 200),
    ]
    expect(blocksOf(centred)).toHaveLength(1)
    // To the right: every line ends at the same place, and a short one ends the paragraph.
    const right = [
      line("word word", 50, 100, 300),
      line("word word", 60, 112, 290),
      line("word word", 250, 124, 100),
      line("word word", 55, 136, 295),
    ]
    expect(blocksOf(right).map((block) => block.lines)).toEqual([[0, 1, 2]])
    // Neither edge and no middle.
    const loose = [
      line("word word", 50, 100, 250),
      line("word word", 80, 112, 270),
      line("word word", 65, 124, 200),
    ]
    expect(blocksOf(loose)).toEqual([])
    // A line whose first word is not known is taken to be one word.
    const [a, b] = stack([300, 300])
    expect(blocksOf([a, { ...b, first: undefined }])).toHaveLength(1)
  })

  it("holds no more lines in a paragraph than a paragraph may have", () => {
    const many = stack(Array.from({ length: MOST_LINES + 5 }, () => 300))
    const blocks = blocksOf(many)
    expect(blocks[0].lines).toHaveLength(MOST_LINES)
    expect(blocks[1].lines).toHaveLength(5)
  })
})

describe("how a paragraph is set", () => {
  it("reads its edges, how far its first line is set in, and the distance between its lines", () => {
    const lines = [
      line("a", 64, 100, 286),
      line("b", 50, 112, 300),
      line("c", 50, 124, 300),
      line("d", 50, 136, 90),
    ]
    expect(shapeOf(lines)).toEqual({
      left: 50,
      right: 350,
      indent: 14,
      leading: 12,
      align: "justify",
    })
    // Ragged on the right: set to the left.
    expect(shapeOf(stack([300, 280, 290, 100])).align).toBe("left")
    // One line is set to the left, a line and a fifth apart.
    expect(shapeOf([line("a", 30, 100, 80, { size: 20 })])).toEqual({
      left: 30,
      right: 110,
      indent: 0,
      leading: 24,
      align: "left",
    })
    expect(shapeOf([{ ...line("a", 30, 100, 80), styles: [] }]).leading).toBe(
      14.4
    )
  })

  it("tells lines set to the right and about their middle", () => {
    const right = [
      line("a", 50, 100, 300),
      line("b", 90, 112, 260),
      line("c", 250, 124, 100),
    ]
    expect(shapeOf(right)).toMatchObject({
      left: 50,
      right: 350,
      indent: 0,
      align: "right",
    })
    const centred = [
      line("a", 60, 100, 280),
      line("b", 100, 112, 200),
      line("c", 80, 124, 240),
    ]
    expect(shapeOf(centred)).toMatchObject({ left: 60, align: "centre" })
    // Lines that keep to nothing are taken as set to the left, the first hanging out.
    const loose = [
      line("a", 50, 100, 250),
      line("b", 80, 112, 270),
      line("c", 82, 124, 200),
    ]
    expect(shapeOf(loose)).toMatchObject({
      left: 80,
      indent: -30,
      align: "left",
    })
  })

  it("makes the most of two lines", () => {
    // The same left edge, or the first set in: to the left.
    expect(shapeOf(stack([300, 100])).align).toBe("left")
    expect(
      shapeOf([line("a", 64, 100, 286), line("b", 50, 112, 100)])
    ).toMatchObject({ align: "left", indent: 14 })
    // The second begins further right: to the right when they end together, about the middle when they share one.
    expect(
      shapeOf([line("a", 50, 100, 300), line("b", 250, 112, 100)]).align
    ).toBe("right")
    expect(
      shapeOf([line("a", 60, 100, 280), line("b", 100, 112, 200)]).align
    ).toBe("centre")
    // Or the first hangs out to the left.
    expect(
      shapeOf([line("a", 50, 100, 300), line("b", 70, 112, 200)])
    ).toMatchObject({ align: "left", left: 70, indent: -20 })
  })
})

describe("what a paragraph says as one text", () => {
  const said = (text: string, styles = 1, look = 0) => ({
    text,
    looks: Array.from(text).map(() => look),
    styles: Array.from({ length: styles }, () => style()),
  })

  it("joins lines with a space, and says where each begins and how each letter looks", () => {
    const { text, looks, starts } = joined([
      said("One two", 2, 1),
      said("three", 1),
      said("four."),
    ])
    expect(text).toBe("One two three four.")
    expect(starts).toEqual([0, 8, 14])
    // The looks of the second line come after the two of the first; the space takes the look before it.
    expect(looks.slice(0, 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(looks.slice(8, 14)).toEqual([2, 2, 2, 2, 2, 2])
    expect(looks.slice(14)).toEqual([3, 3, 3, 3, 3])
    expect(joined([])).toEqual({ text: "", looks: [], starts: [] })
    // A line that says nothing has no look to give the space behind it.
    expect(joined([said(""), said("a")])).toEqual({
      text: " a",
      looks: [0, 1],
      starts: [0, 1],
    })
    // A line that says less of its looks than it has letters.
    expect(joined([{ ...said("ab"), looks: [] }, said("c")]).looks).toEqual([
      0, 0, 0, 1,
    ])
  })

  it("makes one word of a word that was broken at the end of a line", () => {
    expect(joined([said("the bor-"), said("rower pays")]).text).toBe(
      `the bor${SOFT}rower pays`
    )
    // A hyphen of the word's own stays: the word had one before, or the page writes it so elsewhere.
    expect(joined([said("a state-of-"), said("the-art thing")]).text).toBe(
      "a state-of-the-art thing"
    )
    expect(joined([said("from English-"), said("to-German texts")]).text).toBe(
      "from English-to-German texts"
    )
    const page = wordsOf([{ text: "A long-term plan (well-known)." }])
    expect(joined([said("for the long-"), said("term, then")], page).text).toBe(
      "for the long-term, then"
    )
    expect(joined([said("for the short-"), said("term")], page).text).toBe(
      `for the short${SOFT}term`
    )
    // No word goes on behind a hyphen that follows no letter, or before a capital or a figure.
    expect(joined([said("pages 4 -"), said("six")]).text).toBe("pages 4 - six")
    expect(joined([said("-"), said("six")]).text).toBe("- six")
    expect(joined([said("the Franco-"), said("German border")]).text).toBe(
      "the Franco-German border"
    )
    expect(joined([said("in 1914-"), said("18")]).text).toBe("in 1914- 18")
    expect(joined([said("an end-"), said("")]).text).toBe("an end-")
  })

  it("knows the words a page writes whole", () => {
    expect([
      ...wordsOf([
        { text: "“Long-term” plans, (well-known) ones." },
        { text: "A line that ends in half a word: bor-" },
        { text: "— 42 —" },
      ]),
    ]).toEqual([
      "long-term",
      "plans",
      "well-known",
      "ones",
      "a",
      "line",
      "that",
      "ends",
      "in",
      "half",
      "word",
      "42",
    ])
  })

  it("lists the words a soft hyphen joined", () => {
    expect(
      joinedWords(
        `The bor${SOFT}rower, the trans${SOFT}duc${SOFT}tion and the bor${SOFT}rower. ${SOFT}`
      )
    ).toEqual(["borrower", "transduction"])
    expect(joinedWords("Nothing joined")).toEqual([])
  })

  it("gives a paragraph as one line", () => {
    const lines = [
      line("the bor-", 64, 100, 286),
      { ...line("rower pays", 50, 112, 300), styles: [style({ font: "B" })] },
    ]
    const whole = asLine(lines)
    expect(whole.text).toBe(`the bor${SOFT}rower pays`)
    expect(whole.box).toEqual({ x: 50, y: 92, width: 300, height: 22 })
    expect(whole.origin).toEqual({ x: 64, y: 100 })
    expect(whole.styles.map((one) => one.font)).toEqual(["Body", "B"])
    expect(whole.looks.slice(-4)).toEqual([1, 1, 1, 1])
    expect(asLine(lines, new Set(["bor-rower"])).text).toBe(
      "the bor-rower pays"
    )
  })

  it("finds the first line a change touches", () => {
    const starts = [0, 8, 14]
    const was = "One two three four."
    expect(firstChanged(starts, was, was)).toBe(3)
    expect(firstChanged(starts, was, "One twp three four.")).toBe(0)
    expect(firstChanged(starts, was, "One two thrEE four.")).toBe(1)
    expect(firstChanged(starts, was, "One two three four. Five.")).toBe(2)
    // Typed at the very start of a line: that line, not the one before it.
    expect(firstChanged(starts, was, "One two and three four.")).toBe(1)
    // The space before a line was taken away: the line before it is touched.
    expect(firstChanged(starts, was, "One twothree four.")).toBe(0)
    expect(firstChanged(starts, was, "One two three")).toBe(1)
    expect(firstChanged([0], "a", "")).toBe(0)
  })
})

describe("a change to a paragraph as it arrives", () => {
  const box = { x: 1, y: 2, width: 3, height: 4 }
  const op = (more: object = {}) => ({
    do: "reflow",
    page: 0,
    lines: [{ box, was: "One two" }],
    text: "One\r\ntwo\rthree\tfour",
    ...more,
  })

  it("reads what a change is, and nothing else", () => {
    expect(readFlowOp(op())).toEqual({
      do: "reflow",
      page: 0,
      lines: [{ box, was: "One two" }],
      text: "One\ntwo\nthree four",
    })
    expect(
      readFlowOp(
        op({
          lines: [{ box: { ...box, extra: 1 }, was: "a", more: 2 }],
          look: { size: 14, font: "serif", nothing: 1 },
          align: "justify",
          move: { x: 3, y: -4 },
          extra: true,
        })
      )
    ).toEqual({
      do: "reflow",
      page: 0,
      lines: [{ box, was: "a" }],
      text: "One\ntwo\nthree four",
      look: { size: 14, font: "serif" },
      align: "justify",
      move: { x: 3, y: -4 },
    })
    for (const align of ALIGNS)
      expect(readFlowOp(op({ align }))?.align).toBe(align)
    expect(readFlowOp(op({ align: "middle" }))).not.toHaveProperty("align")
    expect(readFlowOp(op({ look: {}, move: { x: 0, y: 0 } }))).toEqual(
      readFlowOp(op())
    )
  })

  it("refuses what is not one", () => {
    for (const bad of [
      null,
      "reflow",
      op({ do: "retext" }),
      op({ page: -1 }),
      op({ page: 1.5 }),
      op({ text: 7 }),
      op({ text: "x".repeat(LONGEST_BLOCK + 1) }),
      op({ lines: "all" }),
      op({ lines: [] }),
      op({
        lines: Array.from({ length: MOST_LINES + 1 }, () => ({ box, was: "" })),
      }),
      op({ lines: [null] }),
      op({ lines: [{ box, was: 7 }] }),
      op({ lines: [{ box, was: "x".repeat(2001) }] }),
      op({ lines: [{ was: "a" }] }),
      op({ lines: [{ box: { ...box, x: "1" }, was: "a" }] }),
      op({ lines: [{ box: { ...box, y: NaN }, was: "a" }] }),
      op({ lines: [{ box: { ...box, width: null }, was: "a" }] }),
      op({ lines: [{ box: { ...box, height: Infinity }, was: "a" }] }),
    ])
      expect(readFlowOp(bad)).toBeNull()
  })

  it("reads a change to a line or to a paragraph", () => {
    expect(readTextChange(op())?.do).toBe("reflow")
    expect(
      readTextChange({ do: "retext", page: 0, box, was: "a", text: "b" })?.do
    ).toBe("retext")
    expect(readTextChange({ do: "other" })).toBeNull()
  })

  it("reads what changes to paragraphs wrote, one for each change", () => {
    const wrote = { from: 1, lines: [{ box, text: "a line" }] }
    expect(readWrote([null, wrote], 2)).toEqual([null, wrote])
    expect(
      readWrote(
        [
          {
            ...wrote,
            lines: [{ box: { ...box, z: 1 }, text: "t", more: 1 }],
            x: 1,
          },
        ],
        1
      )
    ).toEqual([{ from: 1, lines: [{ box, text: "t" }] }])
    for (const bad of [
      undefined,
      "wrote",
      [wrote],
      [null, 7],
      [null, undefined],
      [null, { from: -1, lines: [] }],
      [null, { from: 0.5, lines: [] }],
      [null, { from: 0, lines: "none" }],
      [
        null,
        {
          from: 0,
          lines: Array.from(
            { length: MOST_LINES * 4 + 1 },
            () => wrote.lines[0]
          ),
        },
      ],
      [null, { from: 0, lines: [null] }],
      [null, { from: 0, lines: [{ box, text: 7 }] }],
      [null, { from: 0, lines: [{ box, text: "x".repeat(2001) }] }],
      [null, { from: 0, lines: [{ text: "a" }] }],
      [null, { from: 0, lines: [{ box: { ...box, x: "1" }, text: "a" }] }],
      [null, { from: 0, lines: [{ box: { ...box, y: NaN }, text: "a" }] }],
      [null, { from: 0, lines: [{ box: { ...box, width: null }, text: "a" }] }],
      [
        null,
        { from: 0, lines: [{ box: { ...box, height: Infinity }, text: "a" }] },
      ],
    ])
      expect(readWrote(bad, 2)).toBeUndefined()
  })
})

describe("laying a paragraph out", () => {
  const glyph = (more: Partial<Glyph> = {}): Glyph => ({
    font: "F",
    code: "41",
    advance: 10,
    size: 10,
    colour: BLACK,
    rise: 0,
    ...more,
  })
  /** Letters ten points wide, spaces five, a soft hyphen that shows as a hyphen of ten. */
  const pieces = (text: string): Piece[] =>
    Array.from(text).map((letter) =>
      letter === SOFT
        ? {
            ...glyph({ font: "", code: "", advance: 0 }),
            letter,
            soft: glyph({ code: "2d" }),
          }
        : letter === " " || letter === "\n"
          ? {
              ...glyph({ font: "", code: "", advance: letter === " " ? 5 : 0 }),
              letter,
            }
          : { ...glyph({ code: letter }), letter }
    )
  const laid = (text: string, width: number, align = "left" as const) =>
    flow(pieces(text), () => width, align)

  it("breaks at spaces and leaves the space out", () => {
    const lines = laid("aaa bbb cc", 75)
    expect(lines.map((line) => line.text)).toEqual(["aaa bbb", "cc"])
    expect(lines.map((line) => line.width)).toEqual([65, 20])
    expect(lines[0].shift).toBe(0)
    // Every letter knows which of the letters given it is, and where it stands.
    expect(lines[0].places.map((place) => place.at)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
    expect(lines[0].places[4]).toEqual({ at: 4, x: 35, advance: 10 })
    expect(lines[1].places).toEqual([
      { at: 8, x: 0, advance: 10 },
      { at: 9, x: 10, advance: 10 },
    ])
    // What is written: the letters, and the room of the space between them.
    expect(lines[0].glyphs.map((one) => one.code).join("|")).toBe(
      "a|a|a||b|b|b"
    )
    expect(laid("", 100)).toEqual([])
    expect(laid("   ", 100)).toEqual([])
  })

  it("lets a word that is wider than the line run over, whole", () => {
    expect(laid("aaaaaaaaaa bb", 50).map((line) => line.text)).toEqual([
      "aaaaaaaaaa",
      "bb",
    ])
    expect(laid("aa bbbbbbbbbb", 50).map((line) => line.text)).toEqual([
      "aa",
      "bbbbbbbbbb",
    ])
  })

  it("shows a soft hyphen only where a line ends at it", () => {
    const text = `aaa bb${SOFT}bb cc`
    const tight = laid(text, 65)
    expect(tight.map((line) => line.text)).toEqual(["aaa bb-", "bb cc"])
    expect(tight[0].width).toBe(65)
    expect(tight[0].glyphs[tight[0].glyphs.length - 1].code).toBe("2d")
    // With room for the word, it is whole and the hyphen is nowhere.
    const wide = laid(text, 200)
    expect(wide.map((line) => line.text)).toEqual(["aaa bbbb cc"])
    expect(wide[0].glyphs.some((one) => one.code === "2d")).toBe(false)
    expect(wide[0].places).toHaveLength(11)
  })

  it("breaks behind a hyphen that is in a word, and keeps it", () => {
    expect(laid("aa bb-cc dd", 55).map((line) => line.text)).toEqual([
      "aa bb-",
      "cc dd",
    ])
    // A dash that follows no letter is no place to break.
    expect(laid("aaaa -bbb", 60).map((line) => line.text)).toEqual([
      "aaaa",
      "-bbb",
    ])
    expect(laid("-aaaaaaaa", 40).map((line) => line.text)).toEqual([
      "-aaaaaaaa",
    ])
  })

  it("begins a new line where the text has one, an empty line too", () => {
    expect(laid("aa\nbb cc\n\ndd", 100).map((line) => line.text)).toEqual([
      "aa",
      "bb cc",
      "",
      "dd",
    ])
    expect(laid("aa \n bb", 100).map((line) => line.text)).toEqual(["aa", "bb"])
  })

  it("sets lines to the right and about their middle", () => {
    expect(
      laid("aaa bb", 100, "right" as never).map((line) => line.shift)
    ).toEqual([45])
    expect(
      laid("aaa bb", 100, "centre" as never).map((line) => line.shift)
    ).toEqual([22.5])
  })

  it("spreads every line but the last of a paragraph to both edges", () => {
    const lines = flow(pieces("aaa bb cc dddd ee"), () => 100, "justify")
    expect(lines.map((line) => line.text)).toEqual(["aaa bb cc", "dddd ee"])
    // 80 points of words and spaces in 100: ten more behind each of the two spaces.
    expect(lines[0].width).toBe(100)
    expect(lines[0].glyphs.map((one) => one.advance)).toEqual([
      10, 10, 10, 5, 10, 10, 10, 5, 10, 10, 10,
    ])
    expect(lines[0].places[3]).toEqual({ at: 3, x: 30, advance: 5 })
    expect(lines[0].places[4]).toEqual({ at: 4, x: 45, advance: 10 })
    // The last line, and a line the text itself ends, are as wide as their words.
    expect(lines[1].width).toBe(65)
    const ended = flow(pieces("aaa bb\ncc dd"), () => 100, "justify")
    expect(ended.map((line) => line.width)).toEqual([55, 45])
    // A line of one word has no gap to spread, and gaps are spread no wider than is allowed.
    expect(
      flow(pieces("aaaaaaa bbbbbbb cc"), () => 80, "justify")[0].width
    ).toBe(70)
    const held = flow(pieces("aaa bb cc dddd ee"), () => 100, "justify", 12)
    expect(held[0].width).toBe(80)
    expect(
      flow(pieces("aaa bb cc dddd ee"), () => 100, "justify", 15)[0].width
    ).toBe(100)
  })

  it("gives each line the width that is its own", () => {
    const lines = flow(
      pieces("aaa bbb ccc ddd"),
      (at) => (at === 0 ? 35 : 100),
      "left"
    )
    expect(lines.map((line) => line.text)).toEqual(["aaa", "bbb ccc ddd"])
  })
})

describe("where a letter is after a change", () => {
  it("is where it was at the start and the end the old and new words share", () => {
    const to = carry("One two three", "One 2 three")
    expect(to(0)).toBe(0)
    expect(to(3)).toBe(3)
    // Typed over.
    expect(to(4)).toBeNull()
    expect(to(6)).toBeNull()
    expect(to(7)).toBe(5)
    expect(to(12)).toBe(10)
    expect(to(13)).toBeNull()
    expect(to(-1)).toBeNull()
    // Nothing changed, something added at the end, everything gone.
    expect(carry("abc", "abc")(1)).toBe(1)
    expect(carry("abc", "abcd")(2)).toBe(2)
    expect(carry("abc", "")(1)).toBeNull()
    // The same letter thrice, one taken away: the last is the one that is gone.
    expect(carry("aaa", "aa")(1)).toBe(1)
    expect(carry("aaa", "aa")(2)).toBeNull()
  })
})
