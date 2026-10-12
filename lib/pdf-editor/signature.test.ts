import { describe, expect, it } from "vitest"
import { BLACK, LINE_HEIGHT, MOST_POINTS } from "./objects"
import {
  CHECK_NAMES,
  CHECK_SHAPES,
  CHECK_SIZE,
  checkMark,
  drawnSignature,
  fitStrokes,
  inkOnly,
  LARGEST_REMEMBERED,
  LONGEST_SIGNATURE,
  readSignature,
  seenBox,
  SIGNATURE_PEN,
  SIGNATURE_SIZE,
  SIGNATURE_TEXT,
  typedSignature,
  type Pixels,
} from "./signature"

const at = (x: number, y: number) => ({ x, y })
const BLUE = [0.1, 0.25, 0.75] as const

describe("fitting what was drawn", () => {
  const box = { x: 100, y: 200, width: 200, height: 50 }

  it("scales strokes into a box in proportion, and puts them in its middle", () => {
    // Twice as wide as tall: the height of the box decides.
    const fitted = fitStrokes(
      [
        [at(0, 0), at(40, 20)],
        [at(20, 10), at(20, 20)],
      ],
      box
    )
    expect(fitted).toEqual([
      [at(150, 200), at(250, 250)],
      [at(200, 225), at(200, 250)],
    ])
    // Very wide and flat: the width decides, and it sits half way down.
    expect(fitStrokes([[at(0, 0), at(400, 10)]], box)).toEqual([
      [at(100, 222.5), at(300, 227.5)],
    ])
  })

  it("fits a level or an upright stroke by the one size it has", () => {
    expect(fitStrokes([[at(5, 5), at(25, 5)]], box)).toEqual([
      [at(100, 225), at(300, 225)],
    ])
    expect(fitStrokes([[at(5, 5), at(5, 15)]], box)).toEqual([
      [at(200, 200), at(200, 250)],
    ])
  })

  it("puts a single dot in the middle, and has nothing to do with nothing", () => {
    expect(fitStrokes([[at(7, 9)]], box)).toEqual([[at(200, 225)]])
    expect(fitStrokes([], box)).toEqual([])
    expect(fitStrokes([[]], box)).toEqual([])
  })
})

describe("signatures on a page", () => {
  it("makes a drawing of what was drawn, about a point", () => {
    const signed = drawnSignature(
      [[at(0, 0), at(340, 128)]],
      "signature",
      at(300, 400),
      BLUE,
      "s"
    )
    const { width, height } = SIGNATURE_SIZE.signature
    expect(signed).toEqual({
      id: "s",
      kind: "ink",
      rotation: 0,
      opacity: 1,
      box: { x: 300 - width / 2, y: 400 - height / 2, width, height },
      strokes: [
        [
          at(300 - width / 2, 400 - height / 2),
          at(300 + width / 2, 400 + height / 2),
        ],
      ],
      stroke: BLUE,
      weight: SIGNATURE_PEN,
    })
    // Initials are smaller.
    const initials = drawnSignature(
      [[at(0, 0), at(10, 10)]],
      "initials",
      at(50, 50),
      BLACK,
      "i"
    )
    expect(initials.box.height).toBe(SIGNATURE_SIZE.initials.height)
    expect(initials.box.width).toBe(SIGNATURE_SIZE.initials.height)
  })

  it("makes one line of text of what was typed, as wide as its letters", () => {
    const size = SIGNATURE_TEXT.signature
    const signed = typedSignature(
      "  Ada Lovelace ",
      "sacramento",
      "signature",
      at(300, 400),
      BLACK,
      "t",
      150
    )
    const wide = 150 + size * 0.4
    expect(signed).toEqual({
      id: "t",
      kind: "text",
      rotation: 0,
      opacity: 1,
      box: {
        x: 300 - wide / 2,
        y: 400 - (size * LINE_HEIGHT) / 2,
        width: wide,
        height: size * LINE_HEIGHT,
      },
      text: "Ada Lovelace",
      lines: ["Ada Lovelace"],
      font: "sacramento",
      bold: false,
      italic: false,
      size,
      colour: BLACK,
      align: "left",
    })
    // Initials are set smaller, a very long name is cut, and a width of nothing still leaves a box.
    expect(
      typedSignature("AL", "kalam", "initials", at(0, 0), BLACK, "i", 30).size
    ).toBe(SIGNATURE_TEXT.initials)
    expect(
      typedSignature(
        "x".repeat(200),
        "kalam",
        "signature",
        at(0, 0),
        BLACK,
        "l",
        0
      )
    ).toMatchObject({
      text: "x".repeat(LONGEST_SIGNATURE),
      box: { width: 20 },
    })
  })
})

describe("the marks of a paper form", () => {
  it("has a name for each", () => {
    expect(CHECK_SHAPES.map((shape) => CHECK_NAMES[shape])).toEqual([
      "tick",
      "cross",
      "dot",
    ])
  })

  it("draws a tick as one stroke with a corner, about a point", () => {
    const tick = checkMark("tick", at(100, 100), BLACK, "t")
    expect(tick.kind).toBe("ink")
    expect(tick.strokes).toHaveLength(1)
    const [stroke] = tick.strokes
    // Down to its corner, then up to the right, further than it came down.
    expect(stroke[0]).toEqual(at(94, 100.6))
    expect(stroke.at(-1)).toEqual(at(106, 94.6))
    const lowest = Math.max(...stroke.map((point) => point.y))
    expect(lowest).toBeCloseTo(105.4)
    expect(tick.box.x).toBeCloseTo(94)
    expect(tick.box.width).toBeCloseTo(CHECK_SIZE)
    expect(tick.weight).toBe(1.5)
    expect(tick.stroke).toBe(BLACK)
  })

  it("draws a cross as two strokes, and a dot as one point as wide as its pen", () => {
    const cross = checkMark("cross", at(100, 100), BLUE, "c", 20)
    expect(cross.strokes).toHaveLength(2)
    expect(cross.strokes[0][0]).toEqual(at(90, 90))
    expect(cross.strokes[0].at(-1)).toEqual(at(110, 110))
    expect(cross.strokes[1][0]).toEqual(at(110, 90))
    expect(cross.box).toEqual({ x: 90, y: 90, width: 20, height: 20 })
    expect(cross.weight).toBe(2.5)
    const dot = checkMark("dot", at(50, 60), BLACK, "d")
    expect(dot.strokes).toEqual([[at(50, 60)]])
    expect(dot.box).toEqual({ x: 50, y: 60, width: 0, height: 0 })
    expect(dot.weight).toBe(CHECK_SIZE / 2)
    // A very small mark still has a pen that can be seen.
    expect(checkMark("tick", at(0, 0), BLACK, "s", 4).weight).toBe(1)
  })
})

/** A picture of one colour all over, with some pixels of another. */
function picture(
  width: number,
  height: number,
  paper: number[],
  marks: Record<string, number[]> = {}
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data.set(marks[`${x},${y}`] ?? paper, (y * width + x) * 4)
  return { data, width, height }
}
const pixel = (from: Pixels, x: number, y: number) =>
  Array.from(
    from.data.slice((y * from.width + x) * 4, (y * from.width + x) * 4 + 4)
  )

describe("taking the paper out of a picture of a signature", () => {
  it("makes the paper see-through and leaves the ink solid, in its own colour", () => {
    const cream = [240, 236, 220, 255]
    const scan = picture(10, 10, cream, {
      "2,2": [20, 30, 120, 255],
      "3,2": [20, 30, 120, 255],
      // A soft edge, half way between ink and paper.
      "4,2": [130, 133, 170, 255],
      // The grain of the paper, a little darker than the rest.
      "8,8": [228, 224, 208, 255],
    })
    const out = inkOnly(scan)
    expect(pixel(out, 0, 0)).toEqual([0, 0, 0, 0])
    expect(pixel(out, 8, 8)).toEqual([0, 0, 0, 0])
    expect(pixel(out, 2, 2)).toEqual([20, 30, 120, 255])
    const [r, g, b, solid] = pixel(out, 4, 2)
    expect([r, g, b]).toEqual([130, 133, 170])
    expect(solid).toBeGreaterThan(60)
    expect(solid).toBeLessThan(220)
    expect(seenBox(out)).toEqual({ x: 2, y: 2, width: 3, height: 1 })
  })

  it("keeps what was see-through already see-through", () => {
    const out = inkOnly(
      picture(10, 10, [255, 255, 255, 255], {
        "1,1": [0, 0, 0, 255],
        "2,1": [0, 0, 0, 128],
        "3,1": [0, 0, 0, 0],
      })
    )
    expect(pixel(out, 1, 1)[3]).toBe(255)
    expect(pixel(out, 2, 1)[3]).toBe(128)
    expect(pixel(out, 3, 1)[3]).toBe(0)
  })

  it("gives back nothing for a picture with no ink to tell from paper", () => {
    const blank = inkOnly(picture(4, 4, [250, 250, 250, 255]))
    expect(seenBox(blank)).toBeNull()
    expect(blank.width).toBe(4)
    // All black counts as no difference either.
    expect(seenBox(inkOnly(picture(4, 4, [0, 0, 0, 255])))).toBeNull()
  })

  it("finds the box around what can be seen", () => {
    const some = picture(6, 5, [0, 0, 0, 0], {
      "1,3": [0, 0, 0, 9],
      "4,1": [0, 0, 0, 255],
    })
    expect(seenBox(some)).toEqual({ x: 1, y: 1, width: 4, height: 3 })
  })
})

describe("reading a signature the browser kept", () => {
  it("reads back each kind", () => {
    const drawn = { kind: "draw", strokes: [[at(1, 2), at(3, 4)], []] }
    expect(readSignature(drawn)).toEqual({
      kind: "draw",
      strokes: [[at(1, 2), at(3, 4)]],
    })
    expect(
      readSignature({ kind: "type", text: " Ada ", font: "kalam" })
    ).toEqual({
      kind: "type",
      text: "Ada",
      font: "kalam",
    })
    const stored = {
      kind: "picture",
      data: "data:image/png;base64,AAAA",
      width: 300,
      height: 80,
      extra: true,
    }
    expect(readSignature(stored)).toEqual({
      kind: "picture",
      data: "data:image/png;base64,AAAA",
      width: 300,
      height: 80,
    })
  })

  it("refuses what is not a signature", () => {
    for (const value of [
      null,
      "draw",
      7,
      {},
      { kind: "other" },
      { kind: "draw" },
      { kind: "draw", strokes: [] },
      { kind: "draw", strokes: [[]] },
      { kind: "draw", strokes: ["no"] },
      { kind: "draw", strokes: [[null]] },
      { kind: "draw", strokes: [["no"]] },
      { kind: "draw", strokes: [[{ x: 1 }]] },
      { kind: "draw", strokes: [[{ x: "1", y: 2 }]] },
      { kind: "type", text: "  ", font: "kalam" },
      { kind: "type", text: 5, font: "kalam" },
      { kind: "type", text: "Ada", font: "sans" },
      { kind: "type", text: "x".repeat(LONGEST_SIGNATURE + 1), font: "kalam" },
      {
        kind: "picture",
        data: "data:image/jpeg;base64,AAAA",
        width: 1,
        height: 1,
      },
      { kind: "picture", data: 5, width: 1, height: 1 },
      {
        kind: "picture",
        data: "data:image/png;base64,AA",
        width: 0,
        height: 1,
      },
      {
        kind: "picture",
        data: "data:image/png;base64,AA",
        width: 1,
        height: -1,
      },
      {
        kind: "picture",
        data: "data:image/png;base64,AA",
        width: "1",
        height: 1,
      },
      {
        kind: "picture",
        data: "data:image/png;base64,AA",
        width: 1,
        height: null,
      },
      {
        kind: "picture",
        data: `data:image/png;base64,${"A".repeat(LARGEST_REMEMBERED)}`,
        width: 1,
        height: 1,
      },
    ])
      expect(
        readSignature(value),
        JSON.stringify(value)?.slice(0, 60)
      ).toBeNull()
  })

  it("refuses a drawing with more points than a file should carry", () => {
    const long = Array.from({ length: MOST_POINTS + 1 }, (_, x) => at(x, 0))
    expect(readSignature({ kind: "draw", strokes: [long] })).toBeNull()
  })
})
