import { describe, expect, it } from "vitest"
import {
  BLACK,
  WHITE,
  type CoverObject,
  type InkObject,
  type LineObject,
  type PictureObject,
  type ShapeObject,
  type TextObject,
} from "./objects"
import {
  colourName,
  cssColour,
  lookOf,
  PALETTE,
  partsFor,
  sameColour,
  stylesWith,
  TEXT_SIZES,
  WEIGHTS,
  withLook,
} from "./styles"
import { defaultStyles } from "./tools"

const RED = PALETTE[2].colour
const BLUE = PALETTE[6].colour
const base = { id: "a", rotation: 0, opacity: 1 }
const text: TextObject = {
  ...base,
  kind: "text",
  box: { x: 0, y: 0, width: 100, height: 14.4 },
  text: "Hi",
  lines: ["Hi"],
  font: "sans",
  bold: false,
  italic: false,
  size: 12,
  colour: BLACK,
  align: "left",
}
const shape: ShapeObject = {
  ...base,
  kind: "box",
  box: { x: 0, y: 0, width: 10, height: 10 },
  stroke: BLACK,
  fill: null,
  weight: 2,
}
const line: LineObject = {
  ...base,
  kind: "line",
  box: { x: 0, y: 0, width: 10, height: 0 },
  from: { x: 0, y: 0 },
  to: { x: 10, y: 0 },
  stroke: BLACK,
  weight: 2,
}
const ink: InkObject = {
  ...base,
  kind: "ink",
  box: { x: 0, y: 0, width: 0, height: 0 },
  strokes: [[{ x: 0, y: 0 }]],
  stroke: BLACK,
  weight: 2,
}
const cover: CoverObject = {
  ...base,
  kind: "cover",
  box: { x: 0, y: 0, width: 10, height: 10 },
  fill: WHITE,
}
const picture: PictureObject = {
  ...base,
  kind: "picture",
  box: { x: 0, y: 0, width: 10, height: 10 },
  picture: "p",
}

describe("colours", () => {
  it("are written for the browser, compared and named", () => {
    expect(cssColour([1, 0.5, 0])).toBe("rgb(255 128 0)")
    expect(sameColour(RED, [...RED])).toBe(true)
    expect(sameColour(RED, BLUE)).toBe(false)
    expect(sameColour(null, null)).toBe(true)
    expect(sameColour(RED, null)).toBe(false)
    expect(sameColour(null, RED)).toBe(false)
    expect(colourName(RED)).toBe("Red")
    expect(colourName([0.123, 0, 0])).toBe("Custom")
    expect(PALETTE).toHaveLength(9)
    expect(WEIGHTS).toContain(2)
    expect(TEXT_SIZES).toContain(12)
  })
})

describe("partsFor", () => {
  it("gives the parts a tool's next thing will have", () => {
    expect(partsFor([], "select")).toEqual([])
    expect(partsFor([], "cover")).toEqual(["fill"])
    expect(partsFor([], "ink")).toEqual(["stroke", "weight"])
    expect(partsFor([], "text")).toContain("font")
  })

  it("gives the parts all the selected things share", () => {
    expect(partsFor([shape], "select")).toEqual([
      "stroke",
      "fill",
      "weight",
      "opacity",
    ])
    expect(partsFor([shape, line], "select")).toEqual([
      "stroke",
      "weight",
      "opacity",
    ])
    expect(partsFor([text, picture], "select")).toEqual(["opacity"])
    expect(partsFor([cover, picture], "select")).toEqual([])
  })
})

describe("withLook", () => {
  it("changes a shape's edge, inside and weight", () => {
    expect(withLook(shape, { stroke: RED })).toMatchObject({ stroke: RED })
    expect(withLook(shape, { fill: BLUE })).toMatchObject({ fill: BLUE })
    expect(withLook(shape, { weight: 4 })).toMatchObject({ weight: 4 })
    expect(withLook(shape, { weight: 900 })).toMatchObject({ weight: 24 })
    // The same look again is the same thing.
    expect(withLook(shape, { stroke: BLACK })).toBe(shape)
    expect(withLook(shape, { fill: null })).toBe(shape)
    expect(withLook(shape, { weight: 2 })).toBe(shape)
  })

  it("never leaves a shape with neither edge nor inside", () => {
    expect(withLook(shape, { stroke: null })).toBe(shape)
    const filled = withLook(shape, { fill: RED }) as ShapeObject
    expect(withLook(filled, { stroke: null })).toMatchObject({ stroke: null })
    const bare = { ...filled, stroke: null }
    expect(withLook(bare, { fill: null })).toBe(bare)
    expect(withLook(filled, { fill: null })).toMatchObject({ fill: null })
  })

  it("changes lines and drawings, which always have a colour", () => {
    expect(withLook(line, { stroke: RED })).toMatchObject({ stroke: RED })
    expect(withLook(line, { stroke: null })).toBe(line)
    expect(withLook(line, { stroke: BLACK })).toBe(line)
    expect(withLook(ink, { stroke: BLUE })).toMatchObject({ stroke: BLUE })
    expect(withLook(ink, { weight: 8 })).toMatchObject({ weight: 8 })
    expect(withLook({ ...line, kind: "arrow" }, { stroke: RED })).toMatchObject(
      { stroke: RED }
    )
    // A line has no inside.
    expect(withLook(line, { fill: RED })).toBe(line)
  })

  it("changes a cover's colour and nothing else of it", () => {
    expect(withLook(cover, { fill: BLACK })).toMatchObject({ fill: BLACK })
    expect(withLook(cover, { fill: null })).toBe(cover)
    expect(withLook(cover, { fill: WHITE })).toBe(cover)
    expect(withLook(cover, { stroke: RED })).toBe(cover)
    expect(withLook(cover, { opacity: 0.5 })).toBe(cover)
  })

  it("changes text: its colour, font, size, weight, slant and alignment", () => {
    expect(withLook(text, { stroke: RED })).toMatchObject({ colour: RED })
    expect(withLook(text, { stroke: null })).toBe(text)
    expect(withLook(text, { stroke: BLACK })).toBe(text)
    expect(withLook(text, { font: "serif" })).toMatchObject({ font: "serif" })
    expect(withLook(text, { font: "sans" })).toBe(text)
    expect(withLook(text, { bold: true })).toMatchObject({ bold: true })
    expect(withLook(text, { italic: true })).toMatchObject({ italic: true })
    expect(withLook(text, { align: "centre" })).toMatchObject({
      align: "centre",
    })
    const larger = withLook(text, { size: 24 }) as TextObject
    expect(larger.size).toBe(24)
    expect(larger.box.height).toBeCloseTo(28.8)
    expect(withLook(text, { size: 12 })).toBe(text)
    // Text has no weight of line and no inside.
    expect(withLook(text, { weight: 4 })).toBe(text)
    expect(withLook(text, { fill: RED })).toBe(text)
  })

  it("makes things see-through, never quite invisible", () => {
    expect(withLook(picture, { opacity: 0.5 })).toMatchObject({ opacity: 0.5 })
    expect(withLook(picture, { opacity: 0 })).toMatchObject({ opacity: 0.05 })
    expect(withLook(picture, { opacity: 1 })).toBe(picture)
    expect(withLook(picture, { stroke: RED })).toBe(picture)
    expect(withLook(text, { opacity: 0.3 })).toMatchObject({ opacity: 0.3 })
  })
})

describe("stylesWith", () => {
  it("remembers a choice for the kind of thing the tool makes", () => {
    expect(stylesWith(defaultStyles, "box", { stroke: BLUE }).stroke).toEqual(
      BLUE
    )
    expect(stylesWith(defaultStyles, "box", { fill: RED }).fill).toEqual(RED)
    expect(stylesWith(defaultStyles, "ellipse", { weight: 8 }).weight).toBe(8)
    expect(stylesWith(defaultStyles, "ink", { stroke: RED }).inkColour).toEqual(
      RED
    )
    expect(stylesWith(defaultStyles, "ink", { weight: 4 }).inkWeight).toBe(4)
    expect(
      stylesWith(defaultStyles, "cover", { fill: BLACK }).coverFill
    ).toEqual(BLACK)
    expect(
      stylesWith(defaultStyles, "text", { stroke: RED }).textColour
    ).toEqual(RED)
    expect(stylesWith(defaultStyles, "text", { size: 18 }).size).toBe(18)
    expect(stylesWith(defaultStyles, "text", { bold: true }).bold).toBe(true)
    expect(stylesWith(defaultStyles, "text", { font: "mono" }).font).toBe(
      "mono"
    )
    expect(stylesWith(defaultStyles, "text", { align: "right" }).align).toBe(
      "right"
    )
  })

  it("ignores what the tool has no use for, and what would make nothing to see", () => {
    expect(stylesWith(defaultStyles, "select", { stroke: RED })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "line", { fill: RED })).toBe(defaultStyles)
    expect(stylesWith(defaultStyles, "line", { stroke: null })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "arrow", { stroke: null })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "ink", { stroke: null })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "text", { stroke: null })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "cover", { fill: null })).toBe(
      defaultStyles
    )
    // No edge on a shape that has no inside either: refused.
    expect(stylesWith(defaultStyles, "box", { stroke: null })).toBe(
      defaultStyles
    )
    // With an inside, "no edge" is not something the styles can hold; the edge stays.
    const filled = stylesWith(defaultStyles, "box", { fill: RED })
    expect(stylesWith(filled, "box", { stroke: null })).toBe(filled)
    expect(stylesWith(filled, "box", { fill: null }).fill).toBeNull()
  })
})

describe("lookOf", () => {
  it("shows the look of what a tool would make", () => {
    expect(lookOf([], "box", defaultStyles)).toMatchObject({
      stroke: defaultStyles.stroke,
      fill: null,
      weight: 2,
      opacity: 1,
    })
    expect(lookOf([], "ink", defaultStyles)).toMatchObject({
      stroke: defaultStyles.inkColour,
      weight: defaultStyles.inkWeight,
    })
    expect(lookOf([], "text", defaultStyles)).toMatchObject({
      stroke: defaultStyles.textColour,
      font: "sans",
      size: 12,
    })
    expect(lookOf([], "cover", defaultStyles).fill).toEqual(WHITE)
  })

  it("shows the look of the first selected thing", () => {
    expect(
      lookOf(
        [{ ...text, colour: RED, bold: true, size: 18, opacity: 0.5 }],
        "select",
        defaultStyles
      )
    ).toMatchObject({ stroke: RED, bold: true, size: 18, opacity: 0.5 })
    expect(
      lookOf([{ ...shape, fill: BLUE, weight: 4 }], "select", defaultStyles)
    ).toMatchObject({
      stroke: BLACK,
      fill: BLUE,
      weight: 4,
    })
    expect(lookOf([line], "select", defaultStyles)).toMatchObject({
      stroke: BLACK,
      fill: null,
    })
    expect(lookOf([cover], "select", defaultStyles).fill).toEqual(WHITE)
    expect(
      lookOf([{ ...picture, opacity: 0.4 }], "select", defaultStyles).opacity
    ).toBe(0.4)
  })
})
