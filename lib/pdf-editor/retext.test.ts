import { describe, expect, it } from "vitest"
import { BLACK } from "./objects"
import {
  concat,
  contentFor,
  familyOf,
  FURTHEST_MOVE,
  inverse,
  isLine,
  lacking,
  LONGEST_LINE,
  mainStyle,
  readTextOp,
  restyled,
  runsOf,
  spreadLooks,
  squeezed,
  standIns,
  type Glyph,
  type Matrix,
  type PageLine,
  type TextOp,
} from "./retext"

const box = { x: 10, y: 20, width: 100, height: 12 }
const op = (change: Partial<TextOp> = {}): TextOp => ({
  do: "retext",
  page: 0,
  box,
  was: "Old words",
  text: "New words",
  ...change,
})

describe("a change to a line, as it arrives", () => {
  it("is read with only what a change is", () => {
    expect(readTextOp({ ...op(), extra: true, box: { ...box, z: 1 } })).toEqual(
      op()
    )
    // A line is one line.
    expect(readTextOp(op({ text: "two\r\nlines" }))?.text).toBe("two lines")
    expect(readTextOp(op({ text: "" }))?.text).toBe("")
  })

  it("is refused when it is not one", () => {
    for (const value of [
      null,
      "retext",
      { ...op(), do: "erase" },
      op({ page: -1 }),
      op({ page: 1.5 }),
      { ...op(), was: 5 },
      { ...op(), text: null },
      op({ was: "x".repeat(LONGEST_LINE + 1) }),
      op({ text: "x".repeat(LONGEST_LINE + 1) }),
      { ...op(), box: null },
      { ...op(), box: "here" },
      { ...op(), box: { ...box, x: "10" } },
      { ...op(), box: { ...box, y: NaN } },
      { ...op(), box: { ...box, width: Infinity } },
      { ...op(), box: { x: 1, y: 2, width: 3 } },
    ])
      expect(readTextOp(value)).toBeNull()
  })

  it("is for the line at that place that says the same", () => {
    const line = { box, text: "Old  words " }
    expect(isLine(line, op())).toBe(true)
    expect(isLine({ ...line, box: { ...box, x: 10.8 } }, op())).toBe(true)
    expect(isLine({ ...line, box: { ...box, x: 12 } }, op())).toBe(false)
    expect(isLine({ ...line, box: { ...box, y: 22 } }, op())).toBe(false)
    expect(isLine({ ...line, box: { ...box, width: 90 } }, op())).toBe(false)
    expect(isLine({ ...line, box: { ...box, height: 14 } }, op())).toBe(false)
    expect(isLine({ ...line, text: "Other words" }, op())).toBe(false)
    expect(squeezed("  a \t b\n")).toBe("a b")
  })
})

describe("another look and another place for a line, as they arrive", () => {
  it("are read with only what they are", () => {
    expect(
      readTextOp(
        op({
          look: {
            size: 14,
            colour: [1, 0, 0.5],
            font: "serif-bold",
            extra: 1,
          } as never,
          move: { x: 3, y: -4, z: 9 } as never,
        })
      )
    ).toEqual(
      op({
        look: { size: 14, colour: [1, 0, 0.5], font: "serif-bold" },
        move: { x: 3, y: -4 },
      })
    )
    // A size is kept within what letters can be, and a move within the page.
    expect(readTextOp(op({ look: { size: 5000 } }))?.look).toEqual({
      size: 288,
    })
    expect(readTextOp(op({ look: { size: 0.5 } }))?.look).toEqual({ size: 4 })
    expect(readTextOp(op({ move: { x: 99_999, y: -99_999 } }))?.move).toEqual({
      x: FURTHEST_MOVE,
      y: -FURTHEST_MOVE,
    })
  })

  it("are left out when there is nothing of them", () => {
    for (const look of [
      null,
      "big",
      {},
      { size: "14" },
      { colour: [1, 0] },
      { colour: [1, 0, 2] },
      { colour: "red" },
      { font: "comic" },
      { font: 3 },
    ])
      expect(readTextOp({ ...op(), look })).toEqual(op())
    for (const move of [
      null,
      5,
      {},
      { x: 1 },
      { x: "1", y: 2 },
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
    ])
      expect(readTextOp({ ...op(), move })).toEqual(op())
    // One part of a look is a look.
    expect(readTextOp(op({ look: { colour: [0, 0, 1] } }))?.look).toEqual({
      colour: [0, 0, 1],
    })
  })
})

describe("the look of a whole line", () => {
  const style = (change: object = {}) => ({
    font: "A",
    size: 10,
    colour: BLACK,
    rise: 0,
    standIn: "sans",
    letters: "",
    ...change,
  })
  const line = {
    styles: [style(), style({ font: "B", size: 7, rise: 4 })],
    looks: [0, 0, 0, 0, 1],
  }

  it("is the look most of its letters have", () => {
    expect(mainStyle(line).font).toBe("A")
    expect(mainStyle({ ...line, looks: [1, 1, 0] }).font).toBe("B")
    expect(mainStyle({ styles: [style()], looks: [] }).font).toBe("A")
  })

  it("scales every look by as much as the main one, and colours them all", () => {
    expect(restyled(line, undefined)).toBe(line.styles)
    const larger = restyled(line, { size: 20 })
    expect(larger.map((one) => [one.size, one.rise])).toEqual([
      [20, 0],
      [14, 8],
    ])
    const red = restyled(line, { colour: [1, 0, 0] })
    expect(red.map((one) => one.colour)).toEqual([
      [1, 0, 0],
      [1, 0, 0],
    ])
    expect(red.map((one) => one.size)).toEqual([10, 7])
    // A line that was read without looks has nothing to scale.
    expect(restyled({ styles: [], looks: [] }, { size: 20 })).toEqual([])
  })
})

describe("the look each new letter takes", () => {
  // "Hello" plain, " " plain, "World" bold.
  const looks = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]

  it("leaves the letters that stay with the looks they had", () => {
    expect(spreadLooks("Hello World", "Hello World", looks)).toEqual(looks)
  })

  it("gives typed letters the look of the letter before them", () => {
    // Typed inside the plain word, and inside the bold one.
    expect(spreadLooks("Hello World", "Helloooo World", looks)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1,
    ])
    expect(spreadLooks("Hello World", "Hello Wonderful World", looks)).toEqual([
      0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ])
    // At the very end, of the last letter.
    expect(spreadLooks("Hello World", "Hello World!", looks).at(-1)).toBe(1)
  })

  it("gives letters typed at the very start the look of the first letter", () => {
    expect(spreadLooks("World", "The World", [1, 1, 1, 1, 1])).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ])
  })

  it("keeps the looks on both sides of what was taken out or replaced", () => {
    expect(spreadLooks("Hello World", "Held", looks)).toEqual([0, 0, 0, 1])
    expect(spreadLooks("Hello World", "Hello big World", looks)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1,
    ])
    expect(spreadLooks("Hello World", "", looks)).toEqual([])
  })

  it("gives wholly new words the look the line began with, and counts letters, not their pieces", () => {
    expect(spreadLooks("Hello", "Bye", [2, 2, 2, 2, 2])).toEqual([2, 2, 2])
    expect(spreadLooks("", "New", [])).toEqual([0, 0, 0])
    expect(spreadLooks("a😀b", "a😀😀b", [0, 1, 2])).toEqual([0, 1, 1, 2])
    // A reading with fewer looks than letters falls back on the look that is typed in.
    expect(spreadLooks("abc", "abc", [3])).toEqual([3, 3, 3])
    expect(spreadLooks("abc", "xbc", [3])).toEqual([3, 3, 3])
  })
})

describe("letters a font cannot write", () => {
  const line: PageLine = {
    text: "Total: 12",
    box,
    origin: { x: 10, y: 30 },
    along: { x: 1, y: 0 },
    styles: [
      {
        font: "A",
        size: 10,
        colour: BLACK,
        rise: 0,
        standIn: "sans",
        letters: "Total: 12",
      },
      {
        font: "B",
        size: 10,
        colour: BLACK,
        rise: 0,
        standIn: "sans-bold",
        letters: "0123456789",
      },
    ],
    looks: [0, 0, 0, 0, 0, 0, 0, 1, 1],
  }

  it("are named once each, spaces left out", () => {
    expect(lacking("Hello World", "Helo")).toEqual(["W", "r", "d"])
    expect(lacking("a b", "ab")).toEqual([])
    expect(lacking("", "ab")).toEqual([])
  })

  it("are worked out for each letter by the look it will take", () => {
    expect(standIns(line, "Total: 12")).toEqual([])
    // The figures are in the second font, which has every figure.
    expect(standIns(line, "Total: 1295")).toEqual([])
    // New letters in the first font, which has neither.
    expect(standIns(line, "Totals: 12")).toEqual(["s"])
    expect(standIns(line, "Sum: 12")).toEqual(["S", "u", "m"])
    // A line read without looks has no font that writes anything.
    expect(standIns({ ...line, styles: [], looks: [] }, "ab")).toEqual([
      "a",
      "b",
    ])
    // Set in one of the editor's fonts, the whole line is, and nothing stands in.
    expect(standIns(line, "Sum: 12", { font: "serif" })).toEqual([])
    expect(standIns(line, "Sum: 12", { size: 20 })).toEqual(["S", "u", "m"])
  })
})

describe("the editor's font that is closest to one of the file's", () => {
  it("goes by a name that is known", () => {
    // What the file says of these is wrong in both: the name is believed.
    expect(familyOf("WBVOOP+FrutigerLTPro-Condensed", false, true)).toBe("sans")
    expect(familyOf("ABCDEF+Helvetica-Bold", false, true)).toBe("sans")
    expect(familyOf("NimbusRomNo9L-Regu", false, false)).toBe("serif")
    expect(familyOf("NimbusSanL-Bold", false, true)).toBe("sans")
    expect(familyOf("TimesNewRomanPSMT", false, false)).toBe("serif")
    expect(familyOf("XEXHSJ+SFTT1000", false, true)).toBe("mono")
    expect(familyOf("CourierNewPS-BoldMT", false, false)).toBe("mono")
    // "Sans Serif" is a sans.
    expect(familyOf("MS-Sans-Serif", false, true)).toBe("sans")
    expect(familyOf("LiberationSerif", false, false)).toBe("serif")
  })

  it("goes by what the file says when the name tells nothing", () => {
    expect(familyOf("F1", false, true)).toBe("serif")
    expect(familyOf("F1", false, false)).toBe("sans")
    expect(familyOf("F1", true, true)).toBe("mono")
    expect(familyOf("", false, false)).toBe("sans")
  })
})

describe("matrices", () => {
  const flip: Matrix = [1, 0, 0, -1, 0, 800]
  const through = (matrix: Matrix, x: number, y: number) => [
    x * matrix[0] + y * matrix[2] + matrix[4],
    x * matrix[1] + y * matrix[3] + matrix[5],
  ]

  it("follow one another", () => {
    const moved: Matrix = [1, 0, 0, 1, 10, 20]
    const doubled: Matrix = [2, 0, 0, 2, 0, 0]
    expect(through(concat(moved, doubled), 1, 1)).toEqual([22, 42])
    expect(through(concat(doubled, moved), 1, 1)).toEqual([12, 22])
  })

  it("are undone by their inverse", () => {
    const turned: Matrix = [0, 1, -1, 0, 30, 40]
    for (const matrix of [flip, turned, [2, 0, 0, 3, 5, 7] as Matrix]) {
      const [x, y] = through(concat(matrix, inverse(matrix)), 12, 34)
      expect(x).toBeCloseTo(12)
      expect(y).toBeCloseTo(34)
    }
    // What flattens everything has no inverse, and is undone by nothing.
    expect(inverse([0, 0, 0, 0, 5, 5])).toEqual([1, 0, 0, 1, 0, 0])
  })
})

describe("what is written into the page", () => {
  const glyph = (change: Partial<Glyph> = {}): Glyph => ({
    font: "F1",
    code: "41",
    advance: 6,
    size: 10,
    colour: BLACK,
    rise: 0,
    ...change,
  })

  it("writes letters that follow each other in one look together", () => {
    const runs = runsOf(
      [glyph(), glyph({ code: "42" }), glyph({ code: "43" })],
      { x: 100, y: 50 }
    )
    expect(runs).toEqual([
      {
        font: "F1",
        size: 10,
        colour: BLACK,
        at: { x: 100, y: 50 },
        codes: "414243",
      },
    ])
  })

  it("starts anew where the font, the size, the colour or the height changes, and after room", () => {
    const red = [1, 0, 0] as const
    const runs = runsOf(
      [
        glyph(),
        glyph({ font: "F2", code: "0041" }),
        glyph({ size: 7, rise: 4, advance: 4 }),
        glyph({ colour: red }),
        // A space no font writes.
        glyph({ font: "", code: "", advance: 3 }),
        glyph({ colour: red, code: "44" }),
      ],
      { x: 0, y: 50 }
    )
    expect(
      runs.map((run) => [run.font, run.codes, run.at.x, run.at.y])
    ).toEqual([
      ["F1", "41", 0, 50],
      ["F2", "0041", 6, 50],
      ["F1", "41", 12, 46],
      ["F1", "41", 16, 50],
      ["F1", "44", 25, 50],
    ])
    expect(runsOf([], { x: 0, y: 0 })).toEqual([])
    // Up the page: letters follow each other upwards, and a raised one stands to the left.
    const up = runsOf(
      [glyph(), glyph({ rise: 4, size: 7, advance: 4 }), glyph({ code: "42" })],
      { x: 100, y: 500 },
      { x: 0, y: -1 }
    )
    expect(up.map((run) => [run.at.x, run.at.y, run.along])).toEqual([
      [100, 500, { x: 0, y: -1 }],
      [96, 494, { x: 0, y: -1 }],
      [100, 490, { x: 0, y: -1 }],
    ])
    expect(runsOf([glyph({ font: "", advance: 3 })], { x: 0, y: 0 })).toEqual(
      []
    )
  })

  it("is text that asks for everything it needs, placed in the page's own measure", () => {
    const content = contentFor(
      [
        {
          font: "KS1",
          size: 9.96,
          colour: [1, 0, 0],
          at: { x: 100, y: 50 },
          codes: "4142",
        },
        {
          font: "KS2",
          size: 12,
          colour: BLACK,
          at: { x: 130.123456, y: 50 },
          codes: "0003",
        },
      ],
      [1, 0, 0, -1, 0, 800]
    )
    expect(content).toBe(
      [
        "q",
        "BT",
        "0 Tr 0 Tc 0 Tw 100 Tz 0 Ts",
        "1 0 0 rg",
        "/KS1 9.96 Tf",
        "1 0 0 1 100 750 Tm",
        "<4142> Tj",
        "0 0 0 rg",
        "/KS2 12 Tf",
        "1 0 0 1 130.1235 750 Tm",
        "<0003> Tj",
        "ET",
        "Q",
        "",
      ].join("\n")
    )
    expect(contentFor([], [1, 0, 0, -1, 0, 800])).toBe("")
    // A line that runs up the page is written turned by a quarter.
    expect(
      contentFor(
        [
          {
            font: "F",
            size: 10,
            colour: BLACK,
            at: { x: 100, y: 500 },
            along: { x: 0, y: -1 },
            codes: "41",
          },
        ],
        [1, 0, 0, -1, 0, 800]
      )
    ).toContain("0 1 -1 0 100 300 Tm")
  })

  it("never writes a number in a form a page cannot read", () => {
    const content = contentFor(
      [
        {
          font: "F",
          size: 10,
          colour: [0.00000001, 0, 0],
          at: { x: 0, y: 800 },
          codes: "41",
        },
      ],
      [1, 0, 0, -1, 0, 800]
    )
    expect(content).not.toMatch(/e-/)
    expect(content).toContain("0 0 0 rg")
    // No "-0" for nothing.
    expect(content).toContain("1 0 0 1 0 0 Tm")
  })
})
