import { describe, expect, it } from "vitest"
import type { Quad } from "@/lib/pdf-reader/text"
import type { LetterLine } from "./comments"
import {
  appliedIn,
  boxOf,
  CLEAN_NOTHING,
  cleans,
  foundIn,
  readClean,
  LONGEST_SOUGHT,
  readSought,
  shapeSearch,
  inBoxes,
  MOST_FOUND,
  MOST_MARK_QUADS,
  overlaps,
  passesCardCheck,
  quadOf,
  readApplied,
  readRedactOp,
  residueIn,
} from "./redact"

const quad: Quad = [10, 20, 110, 20, 10, 40, 110, 40]

/** A line of letters ten points wide each, starting at a place. */
const lineOf = (text: string, x = 0, y = 0): LetterLine => ({
  letters: Array.from(text),
  quads: Array.from(text, (_, at) =>
    quadOf({ x: x + at * 10, y, width: 10, height: 12 })
  ),
})

describe("readRedactOp", () => {
  it("takes a mark, the taking away of one, and the applying of all", () => {
    expect(
      readRedactOp({ do: "mark", page: 2, id: "k1a", quads: [[...quad], "x"] })
    ).toEqual({ do: "mark", page: 2, id: "k1a", quads: [quad] })
    expect(readRedactOp({ do: "unmark", page: 0, id: "k1a", more: 1 })).toEqual(
      {
        do: "unmark",
        page: 0,
        id: "k1a",
      }
    )
    expect(readRedactOp({ do: "apply" })).toEqual({ do: "apply" })
    expect(readRedactOp({ do: "apply", touched: true, page: 3 })).toEqual({
      do: "apply",
      touched: true,
    })
    expect(readRedactOp({ do: "apply", touched: "yes" })).toEqual({
      do: "apply",
    })
    // No more quads than a mark may have.
    const many = Array.from({ length: MOST_MARK_QUADS + 5 }, () => [...quad])
    expect(
      (
        readRedactOp({ do: "mark", page: 0, id: "a", quads: many }) as {
          quads: Quad[]
        }
      ).quads
    ).toHaveLength(MOST_MARK_QUADS)
  })

  it("refuses what is no change to the marks", () => {
    for (const bad of [
      null,
      "mark",
      { do: "other", page: 0, id: "a" },
      { do: "mark", page: -1, id: "a", quads: [[...quad]] },
      { do: "mark", page: 0.5, id: "a", quads: [[...quad]] },
      { do: "mark", page: 0, id: "", quads: [[...quad]] },
      { do: "mark", page: 0, id: "a b", quads: [[...quad]] },
      { do: "mark", page: 0, id: 7, quads: [[...quad]] },
      { do: "mark", page: 0, id: "a" },
      { do: "mark", page: 0, id: "a", quads: [] },
      { do: "mark", page: 0, id: "a", quads: [[1, 2, 3]] },
      { do: "mark", page: 0, id: "a", quads: [[1, 2, 3, 4, 5, 6, 7, NaN]] },
      { do: "unmark", page: 0 },
    ])
      expect(readRedactOp(bad)).toBeNull()
  })
})

describe("readApplied", () => {
  const page = {
    page: 1,
    boxes: [{ x: 1, y: 2, width: 3, height: 4 }],
    residue: 0,
    notes: 1,
    fields: 2,
  }

  it("takes what applying did, for every change", () => {
    expect(
      readApplied(
        [[{ ...page, more: 1, boxes: [{ ...page.boxes[0], z: 1 }] }], []],
        2
      )
    ).toEqual([[page], []])
  })

  it("is nothing when it is not that", () => {
    for (const bad of [
      undefined,
      [[page]],
      [[page], "x"],
      [[null], []],
      [[{ ...page, page: -1 }], []],
      [[{ ...page, boxes: "none" }], []],
      [[{ ...page, residue: 0.5 }], []],
      [[{ ...page, notes: -1 }], []],
      [[{ ...page, boxes: [null] }], []],
      [[{ ...page, boxes: [{ x: 1, y: 2, width: 3 }] }], []],
    ])
      expect(readApplied(bad, 2)).toBeUndefined()
  })
})

describe("boxes and quads", () => {
  it("turn into one another", () => {
    expect(boxOf(quad)).toEqual({ x: 10, y: 20, width: 100, height: 20 })
    expect(quadOf(boxOf(quad))).toEqual(quad)
  })

  it("know what lies in and over them", () => {
    const boxes = [{ x: 0, y: 0, width: 10, height: 10 }]
    expect(inBoxes(boxes, 5, 5)).toBe(true)
    expect(inBoxes(boxes, 10, 10)).toBe(true)
    expect(inBoxes(boxes, 10, 10, 1)).toBe(false)
    expect(inBoxes(boxes, 11, 5)).toBe(false)
    expect(inBoxes(boxes, 5, -1)).toBe(false)
    expect(inBoxes([], 5, 5)).toBe(false)
    const box = { x: 0, y: 0, width: 10, height: 10 }
    expect(overlaps(box, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(overlaps(box, { x: 10, y: 0, width: 5, height: 5 })).toBe(false)
    expect(overlaps(box, { x: 0, y: 10, width: 5, height: 5 })).toBe(false)
    expect(overlaps(box, { x: -5, y: 2, width: 5, height: 5 })).toBe(false)
    expect(overlaps(box, { x: 2, y: -5, width: 5, height: 5 })).toBe(false)
  })
})

describe("passesCardCheck", () => {
  it("knows a card number by its last figure", () => {
    expect(passesCardCheck("4111 1111 1111 1111")).toBe(true)
    expect(passesCardCheck("4111-1111-1111-1112")).toBe(false)
    expect(passesCardCheck("378282246310005")).toBe(true)
    // Too few figures, or too many, is no card number whatever they add up to.
    expect(passesCardCheck("0000 0000")).toBe(false)
    expect(passesCardCheck("0".repeat(20))).toBe(false)
  })
})

describe("foundIn", () => {
  it("finds words in the lines of a page, with the box round their letters", () => {
    const lines = [lineOf("Send it to Ada today"), lineOf("ada, ADA", 40, 30)]
    const found = foundIn(lines, { words: "ada" })
    expect(found.map((one) => one.text)).toEqual(["Ada", "ada", "ADA"])
    // The eleventh to the thirteenth letter of the first line.
    expect(boxOf(found[0].quad)).toEqual({
      x: 110,
      y: 0,
      width: 30,
      height: 12,
    })
    expect(boxOf(found[1].quad)).toEqual({
      x: 40,
      y: 30,
      width: 30,
      height: 12,
    })
    expect(foundIn(lines, { words: "ada", matchCase: true })).toHaveLength(1)
    expect(foundIn(lines, { words: " to Ada " })).toHaveLength(1)
    expect(foundIn(lines, { words: "Grace" })).toEqual([])
    expect(foundIn(lines, { words: "  " })).toEqual([])
    expect(foundIn([], { words: "ada" })).toEqual([])
  })

  it("counts a letter that is two units long as one letter", () => {
    const [place] = foundIn([lineOf("a 😀 name here")], { words: "name" })
    expect(boxOf(place.quad)).toEqual({ x: 40, y: 0, width: 40, height: 12 })
    // A place where the page has a letter without a shape is a space.
    const gap = { ...lineOf("ab cd"), letters: ["a", "b", "", "c", "d"] }
    expect(foundIn([gap], { words: "b c" })).toHaveLength(1)
  })

  it("finds e-mail addresses", () => {
    const found = foundIn(
      [
        lineOf("Write to ada.lovelace@example.org, or to a@b.co."),
        lineOf("no at sign here"),
      ],
      { pattern: "email" }
    )
    expect(found.map((one) => one.text)).toEqual([
      "ada.lovelace@example.org",
      "a@b.co",
    ])
  })

  it("finds card numbers by their check figure, and nothing else that is long", () => {
    const found = foundIn(
      [
        lineOf("Card 4111 1111 1111 1111 expires"),
        lineOf("Order 1234 5678 9012 3456 is none"),
        lineOf("378282246310005"),
      ],
      { pattern: "card" }
    )
    expect(found.map((one) => one.text)).toEqual([
      "4111 1111 1111 1111",
      "378282246310005",
    ])
  })

  it("finds phone numbers, and takes no date, sum or card number for one", () => {
    const found = foundIn(
      [
        lineOf("Call +44 20 7946 0958 or (555) 010-9999."),
        lineOf("On 12.10.2026 and 2026-10-12 we paid 1,250.00 for item 12345."),
        lineOf("Card 4111 1111 1111 1111"),
        lineOf("ref.20794609580000000000"),
      ],
      { pattern: "phone" }
    )
    expect(found.map((one) => one.text)).toEqual([
      "+44 20 7946 0958",
      "(555) 010-9999",
    ])
  })

  it("stops at the most places it lists", () => {
    const line = lineOf("a".repeat(60))
    const lines = Array.from({ length: 100 }, () => line)
    expect(foundIn(lines, { words: "a" })).toHaveLength(MOST_FOUND)
  })
})

describe("shapes of one's own", () => {
  it("finds what has the shape: figures, letters, any one character and runs", () => {
    const lines = [
      lineOf("No 123-45-6789 and 987-65-4321, not 12-345-6789"),
      lineOf("Ref AB-12 or ref cd-34; Case x9y (open)"),
    ]
    expect(
      foundIn(lines, { shape: "###-##-####" }).map((one) => one.text)
    ).toEqual(["123-45-6789", "987-65-4321"])
    expect(
      foundIn(lines, { shape: " ref  @@-## " }).map((one) => one.text)
    ).toEqual(["Ref AB-12", "ref cd-34"])
    expect(
      foundIn(lines, { shape: "case ** (?pen)" }).map((one) => one.text)
    ).toEqual(["Case x9y (open)"])
    expect(foundIn(lines, { shape: "x9y." })).toEqual([])
    expect(foundIn(lines, { shape: "*" })).toEqual([])
  })

  it("is no search when it names nothing, is too long or has too many runs", () => {
    expect(shapeSearch("")).toBeNull()
    expect(shapeSearch(" ? * ")).toBeNull()
    expect(shapeSearch("a*b*c*d")).toBeNull()
    expect(shapeSearch("#".repeat(LONGEST_SOUGHT + 1))).toBeNull()
    expect(shapeSearch("a*b*c")).not.toBeNull()
    // Every sign a search reads its own way is taken as it is written.
    const literal = shapeSearch("a.b+c^$ {1} (x|y) [z] \\ / -")
    expect("a.b+c^$ {1} (x|y) [z] \\ / -".match(literal!)).not.toBeNull()
    expect("aXb+c^$ {1} (x|y) [z] \\ / -".match(literal!)).toBeNull()
  })
})

describe("what a download leaves out", () => {
  it("is only what is plainly asked for", () => {
    expect(readClean({ details: true, scripts: 1, more: true })).toEqual({
      details: true,
      attachments: false,
      scripts: false,
    })
    expect(readClean(null)).toEqual(CLEAN_NOTHING)
    expect(readClean("details")).toEqual(CLEAN_NOTHING)
    expect(cleans(CLEAN_NOTHING)).toBe(false)
    for (const one of ["details", "attachments", "scripts"] as const)
      expect(cleans({ ...CLEAN_NOTHING, [one]: true })).toBe(true)
  })
})

describe("readSought", () => {
  it("takes words, a kind of thing or a shape, and nothing else", () => {
    expect(readSought({ words: " Ada ", more: 1 })).toEqual({ words: "Ada" })
    expect(readSought({ words: "Ada", matchCase: true })).toEqual({
      words: "Ada",
      matchCase: true,
    })
    expect(readSought({ pattern: "email" })).toEqual({ pattern: "email" })
    expect(readSought({ shape: "##-##" })).toEqual({ shape: "##-##" })
    for (const wrong of [
      null,
      "Ada",
      {},
      { words: "  " },
      { words: 4 },
      { words: "a".repeat(LONGEST_SOUGHT + 1) },
      { pattern: "toString" },
      { pattern: "name" },
      { shape: "*" },
    ])
      expect(readSought(wrong)).toBeNull()
  })
})

describe("residueIn", () => {
  /** A picture four pixels to a point, of a page 20 by 20, see-through all over. */
  const picture = () => new Uint8Array(80 * 80 * 4)
  const paint = (
    pixels: Uint8Array,
    x: number,
    y: number,
    colour: [number, number, number, number]
  ) => pixels.set(colour, (y * 80 + x) * 4)
  const boxes = [
    { x: 2, y: 2, width: 6, height: 6 },
    { x: 10, y: 10, width: 8, height: 8 },
  ]

  it("finds nothing where a mark emptied the page", () => {
    const pixels = picture()
    expect(residueIn(pixels, 80, 80, 4, boxes)).toBe(0)
    // White, as the pixels of a picture are made, is nothing either; and a faint trace of an edge.
    paint(pixels, 20, 20, [255, 255, 255, 255])
    paint(pixels, 21, 20, [250, 250, 250, 255])
    paint(pixels, 22, 20, [0, 0, 0, 5])
    expect(residueIn(pixels, 80, 80, 4, boxes)).toBe(0)
  })

  it("counts each mark under which something is still drawn", () => {
    const pixels = picture()
    paint(pixels, 20, 20, [0, 0, 255, 255])
    paint(pixels, 21, 21, [0, 0, 255, 255])
    expect(residueIn(pixels, 80, 80, 4, boxes)).toBe(1)
    paint(pixels, 60, 60, [255, 255, 200, 255])
    expect(residueIn(pixels, 80, 80, 4, boxes)).toBe(2)
  })

  it("takes one colour all over a mark for the ground something stood on", () => {
    const pixels = picture()
    // The tint of a table's row, all over the first mark and beyond it.
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) paint(pixels, x, y, [230, 240, 250, 255])
    expect(residueIn(pixels, 80, 80, 4, boxes)).toBe(0)
    // A shade that is hardly another is the same ground.
    paint(pixels, 20, 20, [228, 243, 250, 252])
    expect(residueIn(pixels, 80, 80, 4, boxes)).toBe(0)
    // A rule across it is something drawn.
    for (let x = 0; x < 40; x++) paint(pixels, x, 22, [0, 0, 0, 255])
    expect(residueIn(pixels, 80, 80, 4, boxes)).toBe(1)
    // And so is a ground that ends under the mark.
    const half = picture()
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 20; x++) paint(half, x, y, [230, 240, 250, 255])
    expect(residueIn(half, 80, 80, 4, boxes)).toBe(1)
  })

  it("leaves a mark's very edge out, and what is off the picture", () => {
    const pixels = picture()
    // Half a point inside the first mark: beside it, as far as this goes.
    paint(pixels, 9, 20, [0, 0, 0, 255])
    paint(pixels, 20, 31, [0, 0, 0, 255])
    expect(residueIn(pixels, 80, 80, 4, boxes)).toBe(0)
    expect(
      residueIn(pixels, 80, 80, 4, [
        { x: -50, y: -50, width: 500, height: 500 },
      ])
    ).toBe(1)
    expect(
      residueIn(pixels, 80, 80, 4, [{ x: 100, y: 100, width: 5, height: 5 }])
    ).toBe(0)
  })
})

describe("appliedIn", () => {
  it("adds up what applying did", () => {
    const box = { x: 0, y: 0, width: 1, height: 1 }
    expect(
      appliedIn([
        {
          label: "a",
          ops: [],
          done: [
            [
              { page: 0, boxes: [box, box], residue: 1, notes: 2, fields: 0 },
              { page: 3, boxes: [box], residue: 0, notes: 0, fields: 1 },
            ],
            [],
          ],
        },
        { label: "b", ops: [] },
      ])
    ).toEqual({ places: 3, pages: 2, residue: 1, notes: 2, fields: 1 })
    expect(appliedIn([])).toEqual({
      places: 0,
      pages: 0,
      residue: 0,
      notes: 0,
      fields: 0,
    })
  })
})
