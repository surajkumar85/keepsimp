import { describe, expect, it } from "vitest"
import type { LetterLine } from "./comments"
import {
  FIELD_HEIGHT,
  MOST_SUGGESTED,
  nameFrom,
  shapeOf,
  suggestFields,
  type Drawn,
} from "./form-suggest"
import { quadOf } from "./redact"

const PAGE = { width: 400, height: 600 }

/** A line of letters 6 points wide each and 11 high, its top at y. */
const words = (text: string, x: number, y: number): LetterLine => ({
  letters: Array.from(text),
  quads: Array.from(text, (_, at) =>
    quadOf({ x: x + at * 6, y, width: 6, height: 11 })
  ),
})
const rule = (x: number, y: number, width: number): Drawn => ({
  points: [
    { x, y },
    { x: x + width, y },
  ],
  closed: false,
  filled: false,
  light: 0,
})
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  filled = false,
  light = 0
): Drawn => ({
  points: [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ],
  closed: true,
  filled,
  light,
})

describe("shapeOf", () => {
  it("knows a rule, drawn as a line or as a thin dark bar", () => {
    expect(shapeOf(rule(10, 50, 100))).toEqual({
      rule: { x: 10, y: 50, width: 100, height: 0 },
    })
    expect(shapeOf(rect(10, 50, 100, 1.5, true, 0))).toEqual({
      rule: { x: 10, y: 50, width: 100, height: 1.5 },
    })
    // A thin light bar is a shade, and a short line is a mark, not a rule.
    expect(shapeOf(rect(10, 50, 100, 1.5, true, 0.9))).toBeNull()
    expect(shapeOf(rule(10, 50, 20))).toBeNull()
  })

  it("knows an upright line, which parts a rule, unless it is a light shade", () => {
    expect(shapeOf(rect(10, 50, 1, 30, true, 0))).toEqual({
      post: { x: 10, y: 50, width: 1, height: 30 },
    })
    expect(shapeOf(rect(10, 50, 1, 30, true, 0.9))).toBeNull()
  })

  it("knows an upright box, open with its first corner again or closed", () => {
    expect(shapeOf(rect(10, 10, 100, 20))).toEqual({
      box: { x: 10, y: 10, width: 100, height: 20 },
    })
    const square = rect(10, 10, 20, 20)
    expect(
      shapeOf({
        ...square,
        closed: false,
        points: [...square.points, square.points[0]],
      })
    ).toEqual({ box: { x: 10, y: 10, width: 20, height: 20 } })
    // Four corners that are not joined up, a slanted one, a dark block, a dot.
    expect(shapeOf({ ...square, closed: false })).toBeNull()
    expect(
      shapeOf({
        ...square,
        points: [
          { x: 0, y: 10 },
          { x: 10, y: 0 },
          { x: 20, y: 10 },
          { x: 10, y: 20 },
        ],
      })
    ).toBeNull()
    expect(shapeOf(rect(10, 10, 100, 20, true, 0.2))).toBeNull()
    expect(shapeOf(rect(10, 10, 100, 20, true, 0.95))).toEqual({
      box: { x: 10, y: 10, width: 100, height: 20 },
    })
    expect(shapeOf({ ...square, points: [{ x: 1, y: 1 }] })).toBeNull()
  })
})

describe("nameFrom", () => {
  it("makes a field's name of the words that label it", () => {
    expect(nameFrom("First name:")).toBe("First_name")
    expect(nameFrom("  Date of birth (dd/mm/yyyy) *")).toBe("Date_of_birth_dd")
    expect(nameFrom("2. Phone")).toBe("2_Phone")
    expect(nameFrom("::")).toBe("")
    expect(nameFrom("a".repeat(80))).toHaveLength(60)
  })
})

describe("suggestFields", () => {
  const lines = [
    words("Name:", 40, 52),
    words("Address", 80, 88),
    words("Comments", 40, 186),
    words("Phone ______", 40, 320),
    words("Heading", 40, 400),
    words("Office", 45, 452),
  ]
  const drawn = [
    rule(80, 62, 220),
    rect(80, 100, 200, 22),
    rect(80, 100, 200, 22),
    rect(40, 140, 12, 12),
    rect(40, 200, 300, 80),
    // Across the page: a rule that parts it.
    rule(10, 300, 380),
    // Under printed words: they are written in already.
    rule(40, 413, 100),
    // A box with words in it is a label, not a field.
    rect(40, 450, 100, 20),
    // A box too small and not square, a block too tall, and one too large.
    rect(300, 140, 25, 12),
    rect(40, 300, 100, 260),
    rect(0, 0, 400, 180),
  ]

  it("suggests fields from rules, boxes, squares and underscores, named by their labels", () => {
    expect(suggestFields(drawn, lines, PAGE, [], [])).toEqual([
      {
        kind: "text",
        from: "line",
        box: { x: 80, y: 62 - FIELD_HEIGHT, width: 220, height: FIELD_HEIGHT },
        name: "Name",
      },
      {
        kind: "text",
        from: "box",
        box: { x: 80, y: 100, width: 200, height: 22 },
        name: "Address",
      },
      {
        kind: "check",
        from: "square",
        box: { x: 40, y: 140, width: 12, height: 12 },
        name: "Checkbox",
      },
      {
        kind: "multiline",
        from: "box",
        box: { x: 40, y: 200, width: 300, height: 80 },
        name: "Comments",
      },
      {
        kind: "text",
        from: "underscores",
        box: { x: 76, y: 331 - FIELD_HEIGHT, width: 36, height: FIELD_HEIGHT },
        name: "Phone",
      },
    ])
  })

  it("leaves out places that are fields already, and takes names that are free", () => {
    const got = suggestFields(
      drawn,
      lines,
      PAGE,
      [{ x: 79, y: 99, width: 202, height: 24 }],
      ["Name", "Checkbox"]
    )
    expect(got.map((one) => one.name)).toEqual([
      "Name_2",
      "Checkbox_2",
      "Comments",
      "Phone",
    ])
  })

  it("keeps a field over a rule near the top on the page, and names a field without a label", () => {
    expect(suggestFields([rule(100, 10, 80)], [], PAGE, [], [])).toEqual([
      {
        kind: "text",
        from: "line",
        box: { x: 100, y: 0, width: 80, height: 10 },
        name: "Text_field",
      },
    ])
  })

  it("names a field by the closest label, and leaves out what is no shape", () => {
    const got = suggestFields(
      [rect(200, 500, 100, 20), rect(10, 10, 50, 20, true, 0)],
      [
        // Too far to the left to be its label.
        words("Far away label", 10, 505),
        words("Near", 150, 505),
        // Farther than "Near", and found after it.
        words("Mid:", 100, 506),
        // Over it, but farther than a label beside it.
        words("Title", 200, 488),
      ],
      PAGE,
      [],
      []
    )
    expect(got.map((one) => one.name)).toEqual(["Near"])
  })

  it("parts a rule into the cells of a table by the upright lines that come down onto it", () => {
    const post = (x: number, y: number, height: number): Drawn => ({
      points: [
        { x, y },
        { x, y: y + height },
      ],
      closed: false,
      filled: false,
      light: 0,
    })
    const got = suggestFields(
      [
        // Across the whole page, but parted: a row of a table.
        rule(10, 100, 380),
        post(150, 70, 30),
        post(250, 70, 31),
        // A post too short to reach the rule, one that hangs below it, one
        // at its very end, and one so close that the cell is too narrow.
        post(200, 70, 20),
        post(300, 101, 20),
        post(388, 70, 30),
        post(270, 70, 30),
      ],
      [words("First", 12, 78)],
      PAGE,
      [],
      []
    )
    expect(got.map(({ box, name }) => [box.x, box.width, box.y, name])).toEqual(
      [
        [152, 96, 100 - FIELD_HEIGHT, "Text_field"],
        [272, 118, 100 - FIELD_HEIGHT, "Text_field_2"],
        // Lower, under the label: up to its letters' bottom, 78 + 11, and a point more.
        [10, 138, 90, "First"],
      ]
    )
  })

  it("stops at the most fields one page is given", () => {
    const squares = Array.from({ length: MOST_SUGGESTED + 50 }, (_, at) =>
      rect((at % 20) * 19, Math.floor(at / 20) * 19, 12, 12)
    )
    expect(suggestFields(squares, [], PAGE, [], [])).toHaveLength(
      MOST_SUGGESTED
    )
  })
})
