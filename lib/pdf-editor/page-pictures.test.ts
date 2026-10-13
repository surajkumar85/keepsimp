import { describe, expect, it } from "vitest"
import {
  boxOf,
  cutPart,
  drawing,
  fitInto,
  isUpright,
  LEAST_PART,
  leadFor,
  moved,
  picturesIn,
  readPictureOp,
  sameMatrix,
  scaledAbout,
  turnedAbout,
} from "./page-pictures"
import { concat, type Matrix } from "./retext"

const any = () => true
const rounded = (matrix: readonly number[]) =>
  matrix.map((value) => Math.round(value * 1000) / 1000 || 0)

describe("finding the pictures a page's content draws", () => {
  it("finds each with the measure it is drawn in, in order", () => {
    const content =
      "q 200 0 0 100 40 600 cm /Im1 Do Q\nq 2 0 0 2 0 0 cm q 50 0 0 50 10 10 cm /Im2 Do Q Q /Im1 Do"
    const found = picturesIn(content, any)
    expect(found.map((one) => one.name)).toEqual(["Im1", "Im2", "Im1"])
    expect(found[0].ctm).toEqual([200, 0, 0, 100, 40, 600])
    // A measure inside another: the inner one first, then the outer.
    expect(found[1].ctm).toEqual([100, 0, 0, 100, 20, 20])
    // After "Q" the measure is what it was before "q".
    expect(found[2].ctm).toEqual([1, 0, 0, 1, 0, 0])
    expect(content.slice(found[0].from, found[0].to)).toBe("/Im1 Do")
    expect(content.slice(found[1].from, found[1].to)).toBe("/Im2 Do")
    expect(found.every((one) => one.part === null)).toBe(true)
  })

  it("takes only what is a picture, and reads a name as it is meant", () => {
    const found = picturesIn("/Form1 Do /A#20b Do /Im1 Do", (name) =>
      ["A b", "Im1"].includes(name)
    )
    expect(found.map((one) => one.name)).toEqual(["A b", "Im1"])
    // "Do" with nothing to draw, or with a number, draws nothing.
    expect(picturesIn("Do 5 Do / Do", any)).toEqual([])
  })

  it("knows a clip of its own before a picture, and counts it to the instruction", () => {
    const content = "q 0.25 0 0.5 0.5 re W n /Im1 Do Q"
    const [found] = picturesIn(content, any)
    expect(found.part).toEqual([0.25, 0, 0.5, 0.5])
    expect(content.slice(found.from, found.to)).toBe(
      "0.25 0 0.5 0.5 re W n /Im1 Do"
    )
    // Any other clip, or a box with too few numbers, is the page's own business.
    expect(picturesIn("0 0 1 1 re W* n /Im1 Do", any)[0].part).toBeNull()
    expect(picturesIn("0 0 1 1 re f /Im1 Do", any)[0].part).toBeNull()
    expect(picturesIn("0 1 1 re W n /Im1 Do", any)[0].part).toBeNull()
    expect(picturesIn("W n /Im1 Do", any)[0].part).toBeNull()
    expect(picturesIn("0 0 1 1 re W n 7 /Im1 Do", any)[0].part).toBeNull()
  })

  it("passes over strings, comments, lists and pictures written into the content", () => {
    const content = [
      "% /Im9 Do in a comment",
      "BT (a \\) /Im8 Do ( nested ) text) Tj <2f496d37> Tj [(/Im6 Do) -20 (b)] TJ ET",
      "/P <</MCID 0 /A [1 2]>> BDC",
      "BI /W 2 /H 2 /BPC 8 /CS /G ID \u0001EI\u0002 Do \nEI",
      "q 10 0 0 10 5 5 cm /Im1 Do Q",
      "EMC",
      "{ } )",
    ].join("\n")
    const found = picturesIn(content, any)
    expect(found.map((one) => one.name)).toEqual(["Im1"])
    expect(found[0].ctm).toEqual([10, 0, 0, 10, 5, 5])
  })

  it("survives content that ends too soon or says too little", () => {
    expect(picturesIn("", any)).toEqual([])
    expect(picturesIn("(a string that never ends", any)).toEqual([])
    expect(picturesIn("<abc", any)).toEqual([])
    expect(picturesIn("BI /W 1 ID abc", any)).toEqual([])
    expect(picturesIn("BI /W 1", any)).toEqual([])
    expect(picturesIn("BI /W 1 ID xEIx EI", any)).toEqual([])
    // "Q" with nothing kept, and "cm" with too little or with what is no number.
    const found = picturesIn("Q 1 2 cm 1 0 0 1 /x 5 cm /Im1 Do % end", any)
    expect(found[0].ctm).toEqual([1, 0, 0, 1, 0, 0])
    expect(picturesIn("1 0 0 1 5 +.5 cm /Im1 Do", any)[0].ctm).toEqual([
      1, 0, 0, 1, 5, 0.5,
    ])
  })
})

describe("what is written to draw a picture", () => {
  it("is its name and Do, with what stands before it closed off", () => {
    expect(drawing("Im1")).toBe("/Im1 Do")
    expect(drawing("A b/c")).toBe("/A#20b#2fc Do")
    expect(drawing("Im1", [[2, 0, 0, 2, 10, 0.000004]])).toBe(
      "q 2 0 0 2 10 0 cm /Im1 Do Q"
    )
    expect(drawing("Im1", [], [0.25, 0, 0.5, 1])).toBe(
      "q 0.25 0 0.5 1 re W n /Im1 Do Q"
    )
    const all = drawing(
      "Im1",
      [
        [1, 0, 0, 1, 5, 5],
        [0.5, 0, 0, 0.5, 0, 0],
      ],
      [0, 0, 1, 0.5]
    )
    expect(all).toBe(
      "q 1 0 0 1 5 5 cm 0.5 0 0 0.5 0 0 cm 0 0 1 0.5 re W n /Im1 Do Q"
    )
    // What was written is found again as it was meant.
    const [found] = picturesIn(all, any)
    expect(found.ctm).toEqual([0.5, 0, 0, 0.5, 5, 5])
    expect(found.part).toEqual([0, 0, 1, 0.5])
  })
})

describe("where a picture is", () => {
  // Upright, as the page is shown with y running down: 200 wide, 100 high, its top left at 40, 60.
  const upright: Matrix = [200, 0, 0, -100, 40, 160]

  it("gives the box it takes up, whole or the part that shows", () => {
    expect(boxOf(upright)).toEqual({ x: 40, y: 60, width: 200, height: 100 })
    // The left half of its upper half.
    expect(boxOf(upright, [0, 0.5, 0.5, 0.5])).toEqual({
      x: 40,
      y: 60,
      width: 100,
      height: 50,
    })
    // Turned by a quarter, it is as wide as it was high.
    const turned = concat(upright, turnedAbout({ x: 140, y: 110 }, 1))
    const box = boxOf(turned)
    expect(rounded([box.x, box.y, box.width, box.height])).toEqual([
      90, 10, 100, 200,
    ])
  })

  it("tells a picture that stands upright from one that is turned or mirrored", () => {
    expect(isUpright(upright)).toBe(true)
    expect(isUpright([200, 0.01, -0.01, -100, 0, 0])).toBe(true)
    expect(isUpright([200, 0, 0, 100, 0, 0])).toBe(false)
    expect(isUpright([-200, 0, 0, -100, 0, 0])).toBe(false)
    expect(isUpright([0, 200, 100, 0, 0, 0])).toBe(false)
    expect(isUpright([200, 5, 0, -100, 0, 0])).toBe(false)
    expect(isUpright([200, 0, 5, -100, 0, 0])).toBe(false)
    expect(isUpright([0, 0, 0, 0, 0, 0])).toBe(false)
  })

  it("takes two places for the same when reading and writing lost a hair", () => {
    expect(sameMatrix(upright, [200.1, 0, 0, -100.1, 40.3, 159.8])).toBe(true)
    expect(sameMatrix(upright, [201, 0, 0, -100, 40, 160])).toBe(false)
    expect(sameMatrix(upright, [200, 0, 0, -100, 41, 160])).toBe(false)
    // A tiny picture is no more exact than a point.
    expect(sameMatrix([0.5, 0, 0, 0.5, 0, 0], [0.501, 0, 0, 0.5, 0, 0])).toBe(
      true
    )
  })

  it("moves, scales and turns everything about a point", () => {
    expect(moved({ x: 3, y: -4 })).toEqual([1, 0, 0, 1, 3, -4])
    const centre = { x: 10, y: 20 }
    const through = (matrix: Matrix, x: number, y: number) => [
      Math.round(matrix[0] * x + matrix[2] * y + matrix[4]),
      Math.round(matrix[1] * x + matrix[3] * y + matrix[5]),
    ]
    // The point stays where it is; a point beside it goes twice as far away.
    expect(through(scaledAbout(centre, 2), 10, 20)).toEqual([10, 20])
    expect(through(scaledAbout(centre, 2), 15, 20)).toEqual([20, 20])
    // A quarter turn clockwise, as the page is shown: what was to the right is below.
    expect(through(turnedAbout(centre, 1), 15, 20)).toEqual([10, 25])
    expect(through(turnedAbout(centre, 2), 15, 20)).toEqual([5, 20])
    expect(through(turnedAbout(centre, -1), 15, 20)).toEqual([10, 15])
    expect(turnedAbout(centre, 3)).toEqual(turnedAbout(centre, -1))
    expect(rounded(turnedAbout(centre, 4))).toEqual([1, 0, 0, 1, 0, 0])
    expect(rounded(turnedAbout(centre, 0.4))).toEqual([1, 0, 0, 1, 0, 0])
  })

  it("says what to write before a picture to put it somewhere else", () => {
    const by = moved({ x: 30, y: 50 })
    // What stands before it, and then where it was, is where it is to be.
    expect(rounded(concat(leadFor(upright, by), upright))).toEqual(
      rounded(concat(upright, by))
    )
    const turn = turnedAbout({ x: 140, y: 110 }, 1)
    expect(rounded(concat(leadFor(upright, turn), upright))).toEqual(
      rounded(concat(upright, turn))
    )
  })
})

describe("cutting a picture to a part", () => {
  it("cuts away shares of what shows, at each side", () => {
    expect(
      cutPart(null, { left: 0.25, top: 0, right: 0.25, bottom: 0.5 })
    ).toEqual([0.25, 0.5, 0.5, 0.5])
    // Of a part, a part: half of what shows, from the left; a quarter from the top.
    expect(
      cutPart([0.25, 0.5, 0.5, 0.5], {
        left: 0.5,
        top: 0.25,
        right: 0,
        bottom: 0,
      })
    ).toEqual([0.5, 0.5, 0.25, 0.375])
    expect(cutPart(null, { left: 0, top: 0, right: 0, bottom: 0 })).toEqual([
      0, 0, 1, 1,
    ])
  })

  it("always leaves a little showing", () => {
    const [left, bottom, width, height] = cutPart(null, {
      left: 0.7,
      top: 0.6,
      right: 0.7,
      bottom: 0.9,
    })
    expect(width).toBeCloseTo(LEAST_PART)
    expect(height).toBeCloseTo(LEAST_PART)
    expect(left + width).toBeLessThanOrEqual(1)
    expect(bottom + height).toBeLessThanOrEqual(1)
  })
})

describe("another picture in the place of one", () => {
  it("is set in whole and undistorted, in the middle", () => {
    // A tall picture where a wide one showed: as high as that, narrower.
    expect(
      fitInto({ width: 240, height: 144 }, { width: 50, height: 100 })
    ).toEqual([0.3, 0, 0, 1, 0.35, 0])
    // A wide one where a tall one showed: as wide as that, less high.
    expect(
      rounded(fitInto({ width: 100, height: 200 }, { width: 400, height: 200 }))
    ).toEqual([1, 0, 0, 0.25, 0, 0.375])
    expect(
      fitInto({ width: 100, height: 50 }, { width: 20, height: 10 })
    ).toEqual([1, 0, 0, 1, 0, 0])
    // What has no height is not divided by.
    expect(
      fitInto({ width: 100, height: 0 }, { width: 20, height: 0 }).every(
        Number.isFinite
      )
    ).toBe(true)
  })
})

describe("a change to a picture as it arrives", () => {
  const at = [200, 0, 0, -100, 40, 160]
  const op = (more: object = {}) => ({
    do: "picture",
    page: 0,
    index: 1,
    at,
    ...more,
  })

  it("reads one thing to do, and nothing else", () => {
    expect(readPictureOp(op({ remove: true, by: at, extra: 1 }))).toEqual({
      do: "picture",
      page: 0,
      index: 1,
      at,
      remove: true,
    })
    expect(readPictureOp(op({ by: [1, 0, 0, 1, 5, 5], cut: null }))).toEqual({
      ...op(),
      by: [1, 0, 0, 1, 5, 5],
    })
    expect(readPictureOp(op({ cut: null, picture: "p" }))).toEqual({
      ...op(),
      cut: null,
    })
    expect(
      readPictureOp(
        op({ cut: { left: 0.1, top: 0, right: 0.2, bottom: 0, more: 1 } })
      )
    ).toEqual({ ...op(), cut: { left: 0.1, top: 0, right: 0.2, bottom: 0 } })
    expect(readPictureOp(op({ picture: "photo-1" }))).toEqual({
      ...op(),
      picture: "photo-1",
    })
    // What is read is the reader's own: the list it was given can change.
    const given = op({ remove: true })
    const read = readPictureOp(given)!
    given.at[0] = 999
    expect(read.at[0]).toBe(200)
    given.at[0] = 200
  })

  it("refuses what is not one", () => {
    for (const bad of [
      null,
      "picture",
      op(),
      op({ do: "retext", remove: true }),
      op({ page: -1, remove: true }),
      op({ page: 0.5, remove: true }),
      op({ index: -1, remove: true }),
      op({ index: "1", remove: true }),
      op({ at: [1, 0, 0, 1, 0], remove: true }),
      op({ at: "here", remove: true }),
      op({ at: [1, 0, 0, 1, 0, NaN], remove: true }),
      op({ at: [1, 0, 0, 1, 0, 1e9], remove: true }),
      // A measure that flattens everything onto a line.
      op({ at: [1, 2, 2, 4, 0, 0], remove: true }),
      op({ remove: 1 }),
      op({ by: [1, 0, 0] }),
      op({ by: [0, 0, 0, 0, 0, 0] }),
      op({ cut: "half" }),
      op({ cut: { left: 0.1, top: 0, right: 0.2 } }),
      op({ cut: { left: -0.1, top: 0, right: 0, bottom: 0 } }),
      op({ cut: { left: 1, top: 0, right: 0, bottom: 0 } }),
      op({ cut: { left: 0.5, top: 0, right: 0.5, bottom: 0 } }),
      op({ cut: { left: 0, top: 0.6, right: 0, bottom: 0.4 } }),
      op({ cut: { left: 0, top: 0, right: 0, bottom: 0 } }),
      op({ picture: "" }),
      op({ picture: 7 }),
      op({ picture: "x".repeat(65) }),
    ])
      expect(readPictureOp(bad)).toBeNull()
  })
})
