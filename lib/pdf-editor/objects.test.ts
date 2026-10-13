import { describe, expect, it } from "vitest"
import {
  arrowHead,
  arrowShaft,
  atLeast,
  BLACK,
  copyOf,
  FONT_KEYS,
  fontKey,
  handlesOf,
  isHand,
  KIND_NAMES,
  LINE_HEIGHT,
  MOST_LETTERS,
  MOST_POINTS,
  moved,
  onTurnedPage,
  pulled,
  reach,
  readObject,
  retyped,
  textHeight,
  turnedTo,
  WHITE,
  type CoverObject,
  type InkObject,
  type LineObject,
  type PictureObject,
  type ShapeObject,
  type TextObject,
} from "./objects"

const base = { id: "a", rotation: 0, opacity: 1 }
const text: TextObject = {
  ...base,
  kind: "text",
  box: { x: 10, y: 20, width: 100, height: 14.4 },
  text: "Hello",
  lines: ["Hello"],
  font: "sans",
  bold: false,
  italic: false,
  size: 12,
  colour: BLACK,
  align: "left",
}
const picture: PictureObject = {
  ...base,
  kind: "picture",
  box: { x: 0, y: 0, width: 200, height: 100 },
  picture: "p1",
}
const shape: ShapeObject = {
  ...base,
  kind: "box",
  box: { x: 50, y: 50, width: 40, height: 20 },
  stroke: BLACK,
  fill: null,
  weight: 2,
}
const line: LineObject = {
  ...base,
  kind: "line",
  box: { x: 10, y: 10, width: 30, height: 40 },
  from: { x: 10, y: 10 },
  to: { x: 40, y: 50 },
  stroke: BLACK,
  weight: 2,
}
const ink: InkObject = {
  ...base,
  kind: "ink",
  box: { x: 0, y: 0, width: 20, height: 10 },
  strokes: [
    [
      { x: 0, y: 0 },
      { x: 20, y: 10 },
    ],
    [{ x: 10, y: 5 }],
  ],
  stroke: BLACK,
  weight: 2,
}
const cover: CoverObject = {
  ...base,
  kind: "cover",
  box: { x: 5, y: 5, width: 50, height: 10 },
  fill: WHITE,
}

describe("moved", () => {
  it("moves a box, and every point of a thing made of points", () => {
    expect(moved(shape, 5, -10).box).toEqual({
      x: 55,
      y: 40,
      width: 40,
      height: 20,
    })
    const far = moved(line, 5, -10)
    expect(far.from).toEqual({ x: 15, y: 0 })
    expect(far.to).toEqual({ x: 45, y: 40 })
    expect(far.box).toEqual({ x: 15, y: 0, width: 30, height: 40 })
    const drawn = moved(ink, 1, 2)
    expect(drawn.strokes[1]).toEqual([{ x: 11, y: 7 }])
    expect(drawn.box).toEqual({ x: 1, y: 2, width: 20, height: 10 })
    // The original is left as it was.
    expect(line.from).toEqual({ x: 10, y: 10 })
  })
})

describe("reach", () => {
  it("holds the whole of a thing, turn and edge included", () => {
    expect(reach(cover)).toEqual(cover.box)
    // An edge of 2 reaches 1 beyond the box.
    expect(reach(shape)).toEqual({ x: 49, y: 49, width: 42, height: 22 })
    expect(reach({ ...shape, stroke: null })).toEqual(shape.box)
    expect(reach(line)).toEqual({ x: 9, y: 9, width: 32, height: 42 })
    // An arrow's head is wider than its line: 0.45 of 8 points each side.
    const arrow = reach({ ...line, kind: "arrow" })
    expect(arrow.x).toBeCloseTo(6.4)
    expect(arrow.width).toBeCloseTo(37.2)
    expect(arrow.height).toBeCloseTo(47.2)
    const turned = reach({ ...cover, rotation: 90 })
    expect(turned.width).toBeCloseTo(10)
    expect(turned.height).toBeCloseTo(50)
    expect(reach(text).height).toBeCloseTo(text.box.height)
  })
})

describe("handles and pulling", () => {
  it("gives each kind the handles it can be pulled by", () => {
    expect(handlesOf(line)).toEqual(["w", "e"])
    expect(handlesOf({ ...line, kind: "arrow" })).toEqual(["w", "e"])
    expect(handlesOf(text)).toEqual(["w", "e"])
    expect(handlesOf(shape)).toHaveLength(8)
    expect(handlesOf(picture)).toHaveLength(8)
  })

  it("moves an end of a line", () => {
    const start = pulled(line, "w", { x: 0, y: 0 })
    expect(start.from).toEqual({ x: 0, y: 0 })
    expect(start.to).toEqual(line.to)
    expect(start.box).toEqual({ x: 0, y: 0, width: 40, height: 50 })
    const end = pulled(line, "e", { x: 100, y: 10 })
    expect(end.to).toEqual({ x: 100, y: 10 })
    expect(end.box.height).toBe(0)
  })

  it("keeps a picture's shape unless told not to, and lets a box change its own", () => {
    const larger = pulled(picture, "se", { x: 400, y: 150 })
    expect(larger.box).toEqual({ x: 0, y: 0, width: 400, height: 200 })
    const free = pulled(picture, "se", { x: 400, y: 150 }, false)
    expect(free.box).toEqual({ x: 0, y: 0, width: 400, height: 150 })
    expect(pulled(shape, "se", { x: 150, y: 80 }).box).toEqual({
      x: 50,
      y: 50,
      width: 100,
      height: 30,
    })
  })

  it("scales a drawing with its box", () => {
    const wide = pulled(ink, "e", { x: 40, y: 5 })
    expect(wide.strokes[0][1]).toEqual({ x: 40, y: 10 })
    expect(wide.strokes[1][0]).toEqual({ x: 20, y: 5 })
    expect(wide.box).toEqual({ x: 0, y: 0, width: 40, height: 10 })
    // A flat stroke has no height to scale by; it keeps its place.
    const flat: InkObject = {
      ...ink,
      box: { x: 0, y: 5, width: 20, height: 0 },
      strokes: [
        [
          { x: 0, y: 5 },
          { x: 20, y: 5 },
        ],
      ],
    }
    const pulledFlat = pulled(flat, "se", { x: 40, y: 30 })
    expect(pulledFlat.strokes[0][1].x).toBeCloseTo(40)
    expect(pulledFlat.strokes[0][1].y).toBeCloseTo(5)
    const dot: InkObject = {
      ...ink,
      box: { x: 3, y: 3, width: 0, height: 0 },
      strokes: [[{ x: 3, y: 3 }]],
    }
    expect(pulled(dot, "se", { x: 30, y: 30 }).strokes[0][0]).toEqual({
      x: 3,
      y: 3,
    })
  })
})

describe("turnedTo", () => {
  it("turns a box about its centre and brings the angle into one turn", () => {
    expect(turnedTo(shape, 450).rotation).toBe(90)
    expect(turnedTo(shape, -90).rotation).toBe(270)
    expect(turnedTo(shape, 30).box).toEqual(shape.box)
  })

  it("turns the points of a line and keeps it unturned itself", () => {
    const upright = turnedTo(line, 90)
    expect(upright.rotation).toBe(0)
    // About the middle of its box, (25, 30).
    expect(upright.from.x).toBeCloseTo(45)
    expect(upright.from.y).toBeCloseTo(15)
    expect(upright.to.x).toBeCloseTo(5)
    expect(upright.to.y).toBeCloseTo(45)
    expect(turnedTo(ink, 180).strokes[0][0].x).toBeCloseTo(20)
  })
})

describe("onTurnedPage", () => {
  // A page 200 wide and 300 high, as it is shown before the turn.
  const page = { width: 200, height: 300 }

  it("keeps a box where it is on what the page shows, and turns it with the page", () => {
    // Its middle is at 60, 27.2: a quarter on, that is 300 - 27.2 across and 60 down.
    const quarter = onTurnedPage(text, page, 90)
    expect(quarter.rotation).toBe(90)
    expect(quarter.box.width).toBe(100)
    expect(quarter.box.height).toBeCloseTo(14.4)
    expect(quarter.box.x + 50).toBeCloseTo(272.8)
    expect(quarter.box.y + 7.2).toBeCloseTo(60)
    const half = onTurnedPage(text, page, 180)
    expect(half.rotation).toBe(180)
    expect(half.box.x + 50).toBeCloseTo(140)
    expect(half.box.y + 7.2).toBeCloseTo(272.8)
    const three = onTurnedPage({ ...text, rotation: 350 }, page, 270)
    expect(three.rotation).toBe(260)
    expect(three.box.x + 50).toBeCloseTo(27.2)
    expect(three.box.y + 7.2).toBeCloseTo(140)
    // Four quarters bring it back to where it was.
    let round = text
    let sheet = page
    for (let turn = 0; turn < 4; turn++) {
      round = onTurnedPage(round, sheet, 90)
      sheet = { width: sheet.height, height: sheet.width }
    }
    expect(round.rotation).toBe(0)
    expect(round.box.x).toBeCloseTo(text.box.x)
    expect(round.box.y).toBeCloseTo(text.box.y)
  })

  it("turns what a call-out points at, and every point of a thing made of points", () => {
    const callout = onTurnedPage({ ...text, tip: { x: 150, y: 250 } }, page, 90)
    expect(callout.tip).toEqual({ x: 50, y: 150 })
    expect(onTurnedPage(text, page, 90)).not.toHaveProperty("tip")
    const turned = onTurnedPage(line, page, 180)
    expect(turned.rotation).toBe(0)
    expect(turned.from).toEqual({
      x: 200 - line.from.x,
      y: 300 - line.from.y,
    })
    expect(turned.to).toEqual({ x: 200 - line.to.x, y: 300 - line.to.y })
    expect(turned.box.width).toBeCloseTo(line.box.width)
    const drawn = onTurnedPage(ink, page, 270)
    expect(drawn.strokes[0][0]).toEqual({
      x: ink.strokes[0][0].y,
      y: 200 - ink.strokes[0][0].x,
    })
  })
})

describe("text", () => {
  it("is as tall as its lines", () => {
    expect(textHeight(3, 10)).toBeCloseTo(3 * 10 * LINE_HEIGHT)
    // A box with nothing typed yet still has the height of a line.
    expect(textHeight(0, 10)).toBeCloseTo(10 * LINE_HEIGHT)
    const two = retyped(text, {
      text: "Hello\nthere",
      lines: ["Hello", "there"],
    })
    expect(two.box.height).toBeCloseTo(2 * 12 * LINE_HEIGHT)
    expect(two.box.width).toBe(100)
    expect(retyped(text, { size: 24 }).box.height).toBeCloseTo(24 * LINE_HEIGHT)
    expect(retyped(text, { size: 1 }).size).toBe(4)
    expect(retyped(text, { size: 5000 }).size).toBe(288)
  })
})

describe("copyOf", () => {
  it("is the same thing with another name, a little aside", () => {
    const copy = copyOf(shape, "b")
    expect(copy.id).toBe("b")
    expect(copy.box).toEqual({ x: 62, y: 62, width: 40, height: 20 })
    expect(copyOf(line, "c", 0).from).toEqual(line.from)
  })
})

describe("readObject", () => {
  it("reads back every kind it writes", () => {
    for (const object of [text, picture, shape, line, ink, cover]) {
      const read = readObject(JSON.parse(JSON.stringify(object)))
      expect(read).toEqual(object)
    }
    expect(readObject({ ...shape, kind: "ellipse" })?.kind).toBe("ellipse")
    expect(readObject({ ...line, kind: "arrow" })?.kind).toBe("arrow")
    expect(Object.keys(KIND_NAMES)).toHaveLength(10)
  })

  it("refuses what is not an object of ours", () => {
    for (const value of [
      null,
      undefined,
      "text",
      42,
      {},
      { ...shape, id: "" },
      { ...shape, id: 7 },
      { ...shape, id: "x".repeat(65) },
      { ...shape, box: null },
      { ...shape, box: { x: 0, y: 0, width: -1, height: 5 } },
      { ...shape, box: { x: 0, y: 0, width: 5, height: -1 } },
      { ...shape, box: { x: NaN, y: 0, width: 5, height: 5 } },
      { ...shape, box: { x: 0, y: "0", width: 5, height: 5 } },
      { ...shape, box: { x: 0, y: 0, width: Infinity, height: 5 } },
      { ...shape, box: { x: 0, y: 0, width: 5, height: "5" } },
      { ...shape, kind: "star" },
      { ...text, text: 5 },
      { ...text, text: "x".repeat(MOST_LETTERS + 1) },
      { ...text, lines: "Hello" },
      { ...text, lines: [5] },
      { ...text, lines: ["x".repeat(MOST_LETTERS), "y"] },
      { ...picture, picture: "" },
      { ...picture, picture: 4 },
      { ...line, from: null },
      { ...line, to: { x: 1 } },
      { ...line, to: { x: "1", y: 2 } },
      { ...ink, strokes: "none" },
      { ...ink, strokes: [5] },
      { ...ink, strokes: [[{ x: 1, y: "2" }]] },
      { ...ink, strokes: [] },
      { ...ink, strokes: [[]] },
      {
        ...ink,
        strokes: [
          Array.from({ length: MOST_POINTS + 1 }, () => ({ x: 0, y: 0 })),
        ],
      },
    ])
      expect(readObject(value)).toBeNull()
  })

  it("brings what is out of bounds back in, and fills in what is missing", () => {
    const loose = readObject({
      id: "t",
      kind: "text",
      box: { x: 1, y: 2, width: 3, height: 4 },
      text: "a",
      lines: ["a"],
      font: "comic",
      size: 4000,
      colour: [2, 0, 0],
      align: "justify",
      rotation: -90,
      opacity: 7,
    }) as TextObject
    expect(loose).toMatchObject({
      font: "sans",
      size: 288,
      colour: BLACK,
      align: "left",
      rotation: 270,
      opacity: 1,
      bold: false,
      italic: false,
    })
    // A font of one's own goes by its key; what only looks like one is no font.
    expect(
      (readObject({ ...text, font: "own-0123456789ab" }) as TextObject).font
    ).toBe("own-0123456789ab")
    expect((readObject({ ...text, font: "own-1" }) as TextObject).font).toBe(
      "sans"
    )
    const styled = readObject({
      ...text,
      font: "mono",
      bold: true,
      italic: true,
      align: "right",
      size: "big",
      rotation: "a",
      opacity: "b",
    }) as TextObject
    expect(styled).toMatchObject({
      font: "mono",
      bold: true,
      italic: true,
      align: "right",
      size: 12,
      rotation: 0,
      opacity: 1,
    })
    expect((readObject({ ...text, align: "centre" }) as TextObject).align).toBe(
      "centre"
    )
    const thick = readObject({
      ...shape,
      weight: 900,
      stroke: [0, 0],
      fill: [0.5, 0.5, 0.5],
    }) as ShapeObject
    expect(thick).toMatchObject({
      weight: 24,
      stroke: null,
      fill: [0.5, 0.5, 0.5],
    })
    expect((readObject({ ...shape, weight: "2" }) as ShapeObject).weight).toBe(
      1
    )
    expect(
      (readObject({ ...line, stroke: "red" }) as LineObject).stroke
    ).toEqual(BLACK)
    expect(
      (readObject({ ...ink, stroke: [0, 0, 9] }) as InkObject).stroke
    ).toEqual(BLACK)
    expect((readObject({ ...cover, fill: null }) as CoverObject).fill).toEqual(
      WHITE
    )
    // A line's box is worked out from its ends, whatever the file claims.
    const lying = readObject({
      ...line,
      box: { x: 0, y: 0, width: 1, height: 1 },
      rotation: 45,
    }) as LineObject
    expect(lying.box).toEqual(line.box)
    expect(lying.rotation).toBe(0)
    // Empty strokes are dropped; the rest stay.
    const drawn = readObject({
      ...ink,
      strokes: [[], [{ x: 1, y: 1 }]],
    }) as InkObject
    expect(drawn.strokes).toEqual([[{ x: 1, y: 1 }]])
  })
})

describe("fonts and arrows", () => {
  it("names the font file a text box is written with", () => {
    expect(fontKey({ font: "sans", bold: false, italic: false })).toBe("sans")
    expect(fontKey({ font: "serif", bold: true, italic: false })).toBe(
      "serif-bold"
    )
    expect(fontKey({ font: "mono", bold: true, italic: true })).toBe(
      "mono-bold-italic"
    )
    // A font that looks written by hand has one file, whatever is asked of it.
    expect(fontKey({ font: "kalam", bold: true, italic: true })).toBe("kalam")
    // A font of one's own is one file as well.
    expect(
      fontKey({ font: "own-0123456789ab", bold: true, italic: true })
    ).toBe("own-0123456789ab")
    expect(isHand("kalam")).toBe(true)
    expect(isHand("serif")).toBe(false)
    expect(FONT_KEYS).toHaveLength(16)
    expect(FONT_KEYS).toContain("sans-italic")
    expect(FONT_KEYS).toContain("greatvibes")
  })

  it("draws an arrow's head at the end of its line, growing with its weight", () => {
    const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 2)
    expect(head[0]).toEqual({ x: 100, y: 0 })
    expect(head[1].x).toBeCloseTo(92)
    expect(head[1].y).toBeCloseTo(3.6)
    expect(head[2].y).toBeCloseTo(-3.6)
    // A thin line still has a head that can be seen.
    expect(arrowHead({ x: 0, y: 0 }, { x: 0, y: 50 }, 0.5)[1].y).toBeCloseTo(44)
    // An arrow of no length points nowhere, and is still three points.
    const none = arrowHead({ x: 5, y: 5 }, { x: 5, y: 5 }, 2)
    expect(none.every((point) => Number.isFinite(point.x + point.y))).toBe(true)
    // The line stops inside the head.
    expect(arrowShaft({ x: 0, y: 0 }, { x: 100, y: 0 }, 2).x).toBeCloseTo(93.6)
    expect(arrowShaft({ x: 0, y: 0 }, { x: 5, y: 0 }, 2)).toEqual({
      x: 0,
      y: 0,
    })
  })
})

describe("atLeast", () => {
  it("gives a box its least size", () => {
    expect(atLeast({ x: 1, y: 2, width: 0, height: 100 })).toEqual({
      x: 1,
      y: 2,
      width: 4,
      height: 100,
    })
    expect(atLeast({ x: 1, y: 2, width: 9, height: 1 }).height).toBe(4)
  })
})
