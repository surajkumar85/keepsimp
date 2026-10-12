/**
 * Stamps, measuring lines and call-outs: what they are, how they look and
 * how the tools make and change them.
 */
import { describe, expect, it } from "vitest"
import { MEASURE_ROOM } from "./measure"
import {
  BLACK,
  CALLOUT_PAD,
  CALLOUT_WEIGHT,
  calloutFrame,
  calloutLine,
  fontsFor,
  handlesOf,
  handleSpot,
  isLine,
  KIND_NAMES,
  LONGEST_STAMP,
  moved,
  nameOf,
  pulled,
  reach,
  readObject,
  stampLayout,
  stampWeight,
  turnedTo,
  type LineObject,
  type MeasureObject,
  type ShapeObject,
  type StampObject,
  type TextObject,
} from "./objects"
import { lookOf, partsFor, stylesWith, withLook } from "./styles"
import {
  CALLOUT_AWAY,
  CLICK_SIZE,
  defaultStyles,
  handleAt,
  makeCallout,
  makeObject,
  nudge,
  press,
  release,
  STAMP_SIZE,
  TOOLS,
  touches,
  turns,
  type EditorState,
  type PageView,
} from "./tools"

const RED = [0.86, 0.15, 0.15] as const
const BLUE = [0.1, 0.25, 0.75] as const
const base = { rotation: 0, opacity: 1 }

const stamp: StampObject = {
  ...base,
  id: "stamp",
  kind: "stamp",
  box: { x: 100, y: 100, width: 150, height: 50 },
  label: "Approved",
  colour: RED,
}
const measure: MeasureObject = {
  ...base,
  id: "measure",
  kind: "measure",
  box: { x: 100, y: 300, width: 200, height: 0 },
  from: { x: 100, y: 300 },
  to: { x: 300, y: 300 },
  stroke: BLACK,
  weight: 1,
  unit: "mm",
  scale: 1,
}
const words: TextObject = {
  ...base,
  id: "words",
  kind: "text",
  box: { x: 300, y: 100, width: 120, height: 14.4 },
  text: "Look here",
  lines: ["Look here"],
  font: "sans",
  bold: false,
  italic: false,
  size: 12,
  colour: RED,
  align: "left",
}
const callout: TextObject = { ...words, id: "callout", tip: { x: 200, y: 200 } }
const line: LineObject = {
  ...base,
  id: "line",
  kind: "line",
  box: { x: 0, y: 0, width: 10, height: 0 },
  from: { x: 0, y: 0 },
  to: { x: 10, y: 0 },
  stroke: BLACK,
  weight: 2,
}
const box: ShapeObject = {
  ...base,
  id: "box",
  kind: "box",
  box: { x: 0, y: 0, width: 40, height: 20 },
  stroke: BLACK,
  fill: null,
  weight: 2,
}

const view: PageView = {
  page: 0,
  size: { width: 600, height: 800 },
  objects: [stamp, measure, callout],
}
const REACH = 6
const at = (x: number, y: number) => ({ point: { x, y }, reach: REACH })
const selecting = (ids: string[]): EditorState => ({
  tool: "select",
  selection: { page: 0, ids },
  gesture: null,
})

describe("what they are", () => {
  it("counts a measuring line among the lines, and names each kind", () => {
    expect([measure, line, stamp, words].map(isLine)).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(Object.keys(KIND_NAMES)).toHaveLength(10)
    expect([stamp, measure, callout, words].map(nameOf)).toEqual([
      "stamp",
      "measuring line",
      "call-out",
      "text box",
    ])
  })

  it("says which fonts each is drawn with", () => {
    expect(fontsFor(stamp)).toEqual(["sans-bold"])
    expect(fontsFor(measure)).toEqual(["sans"])
    expect(fontsFor({ ...words, font: "serif", italic: true })).toEqual([
      "serif-italic",
    ])
    expect(fontsFor(box)).toEqual([])
  })

  it("gives a stamp a frame that grows with it, within bounds", () => {
    expect(stampWeight({ x: 0, y: 0, width: 150, height: 50 })).toBe(4)
    expect(stampWeight({ x: 0, y: 0, width: 20, height: 5 })).toBe(1)
    expect(stampWeight({ x: 0, y: 0, width: 900, height: 300 })).toBe(6)
  })

  it("fits a stamp's words into its frame, in the middle", () => {
    // Wide words: the width decides.
    const wide = stampLayout(stamp.box, 6)
    expect(wide.size).toBeCloseTo((150 - 20) / 6)
    expect(wide.x).toBeCloseTo(175 - (6 * wide.size) / 2)
    expect(wide.y).toBeCloseTo(125 + wide.size * 0.36)
    // Few letters: the height decides.
    expect(stampLayout(stamp.box, 1).size).toBeCloseTo((50 - 20) / 0.9)
    // Words of no width, and a frame with no room, still give a size.
    expect(stampLayout(stamp.box, 0).size).toBeCloseTo((50 - 20) / 0.9)
    expect(stampLayout({ x: 0, y: 0, width: 2, height: 2 }, 5).size).toBe(1)
  })

  it("draws a call-out's line from the nearest place on its frame", () => {
    expect(calloutFrame(words.box)).toEqual({
      x: 300 - CALLOUT_PAD,
      y: 100 - CALLOUT_PAD,
      width: 120 + CALLOUT_PAD * 2,
      height: 14.4 + CALLOUT_PAD * 2,
    })
    // The point is below and to the left: the line leaves the lower left corner.
    expect(calloutLine(callout)).toEqual({
      from: { x: 296, y: 118.4 },
      to: { x: 200, y: 200 },
    })
    // Straight below the frame, it leaves the lower edge above the point.
    expect(calloutLine({ ...callout, tip: { x: 350, y: 300 } })?.from).toEqual({
      x: 350,
      y: 118.4,
    })
    // A point inside the frame needs no line, and a text box has none.
    expect(calloutLine({ ...callout, tip: { x: 350, y: 105 } })).toBeNull()
    expect(calloutLine(words)).toBeNull()
  })

  it("knows how far each reaches", () => {
    expect(reach(stamp)).toEqual({ x: 98, y: 98, width: 154, height: 54 })
    const room = MEASURE_ROOM + 0.5
    expect(reach(measure)).toEqual({
      x: 100 - room,
      y: 300 - room,
      width: 200 + room * 2,
      height: room * 2,
    })
    // A short line's label is longer than the line: there is room for that too.
    const short = reach({
      ...measure,
      to: { x: 110, y: 300 },
      box: { x: 100, y: 300, width: 10, height: 0 },
    })
    // "3.53 mm" is seven letters.
    const over = (7 * 9 * 0.62 - 10) / 2
    expect(short.x).toBeCloseTo(100 - room - over)
    expect(short.width).toBeCloseTo(10 + (room + over) * 2)
    // A call-out reaches from its frame to the point, with room for the arrow's head.
    const half = CALLOUT_WEIGHT / 2
    const all = reach(callout)
    expect(all.x).toBe(194)
    expect(all.y).toBe(96 - half)
    expect(all.x + all.width).toBe(424 + half)
    expect(all.y + all.height).toBe(206)
  })

  it("moves a call-out's words and leaves what it points at, and moves both ends of a measuring line", () => {
    const shifted = moved(callout, 30, -10)
    expect(shifted.box).toMatchObject({ x: 330, y: 90 })
    expect(shifted.tip).toEqual({ x: 200, y: 200 })
    expect(moved(measure, 5, 5)).toMatchObject({
      from: { x: 105, y: 305 },
      to: { x: 305, y: 305 },
      box: { x: 105, y: 305, width: 200, height: 0 },
    })
    const upright = turnedTo(measure, 90)
    expect(upright.from.x).toBeCloseTo(200)
    expect(upright.from.y).toBeCloseTo(200)
    expect(upright.to.y).toBeCloseTo(400)
  })

  it("is taken hold of by its ends, its sides, its corners or its point", () => {
    expect(handlesOf(measure)).toEqual(["w", "e"])
    expect(handlesOf(callout)).toEqual(["w", "e", "tip"])
    expect(handlesOf(words)).toEqual(["w", "e"])
    expect(handlesOf(stamp)).toHaveLength(8)
    expect(handleSpot(measure, "w")).toEqual({ x: 100, y: 300 })
    expect(handleSpot(measure, "e")).toEqual({ x: 300, y: 300 })
    expect(handleSpot(callout, "tip")).toEqual({ x: 200, y: 200 })
    expect(handleSpot(callout, "e")).toEqual({ x: 420, y: 107.2 })
    expect(handleSpot(stamp, "nw")).toEqual({ x: 100, y: 100 })
    // Asked for a point it does not have, a thing gives its middle.
    expect(handleSpot(stamp, "tip")).toEqual({ x: 175, y: 125 })
    expect(handleSpot(words, "tip")).toEqual({ x: 360, y: 107.2 })
  })

  it("is pulled by them", () => {
    expect(pulled(measure, "e", { x: 300, y: 400 })).toMatchObject({
      to: { x: 300, y: 400 },
      box: { x: 100, y: 300, width: 200, height: 100 },
    })
    expect(pulled(measure, "w", { x: 50, y: 300 }).from).toEqual({
      x: 50,
      y: 300,
    })
    const pointed = pulled(callout, "tip", { x: 50, y: 60 })
    expect(pointed.tip).toEqual({ x: 50, y: 60 })
    expect(pointed.box).toEqual(callout.box)
    // A thing without a point is left as it is.
    expect(pulled(words, "tip", { x: 1, y: 1 })).toBe(words)
    expect(pulled(stamp, "tip", { x: 1, y: 1 })).toBe(stamp)
    expect(pulled(stamp, "se", { x: 300, y: 200 }).box).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    })
  })
})

describe("reading them back from a file", () => {
  it("reads back what it writes", () => {
    for (const object of [stamp, measure, callout, words])
      expect(readObject(JSON.parse(JSON.stringify(object)))).toEqual(object)
    expect(readObject(words)).not.toHaveProperty("tip")
  })

  it("keeps a call-out upright, whatever the file says", () => {
    expect(readObject({ ...callout, rotation: 30 })?.rotation).toBe(0)
    expect(readObject({ ...words, rotation: 30 })?.rotation).toBe(30)
    expect(
      readObject({ ...callout, tip: { x: "1", y: 2 } })
    ).not.toHaveProperty("tip")
  })

  it("needs a stamp to say something, and keeps its words to a length", () => {
    expect(readObject({ ...stamp, label: "  Draft  " })).toMatchObject({
      label: "Draft",
    })
    expect(
      (
        readObject({
          ...stamp,
          label: "x".repeat(LONGEST_STAMP + 9),
        }) as StampObject
      ).label
    ).toHaveLength(LONGEST_STAMP)
    expect(readObject({ ...stamp, label: "   " })).toBeNull()
    expect(readObject({ ...stamp, label: 7 })).toBeNull()
    expect(readObject({ ...stamp, colour: "red" })).toMatchObject({
      colour: BLACK,
    })
  })

  it("needs both ends of a measuring line, and brings its unit and scale within bounds", () => {
    expect(readObject({ ...measure, from: null })).toBeNull()
    expect(readObject({ ...measure, to: [1, 2] })).toBeNull()
    expect(
      readObject({ ...measure, unit: "furlong", scale: -5, stroke: null })
    ).toMatchObject({ unit: "mm", scale: 1, stroke: BLACK })
    expect(readObject({ ...measure, scale: "50" })).toMatchObject({ scale: 1 })
    expect(readObject({ ...measure, unit: "ft", scale: 1e9 })).toMatchObject({
      unit: "ft",
      scale: 100_000,
    })
    expect(readObject({ ...measure, scale: 1e-9 })).toMatchObject({
      scale: 0.001,
    })
    // Its box follows its ends.
    expect(
      readObject({ ...measure, box: { x: 0, y: 0, width: 1, height: 1 } })?.box
    ).toEqual(measure.box)
  })
})

describe("how they look", () => {
  it("offers each kind and each tool its own parts", () => {
    expect(partsFor([stamp], "select")).toEqual(["label", "stroke", "opacity"])
    expect(partsFor([measure], "select")).toEqual([
      "unit",
      "scale",
      "stroke",
      "weight",
      "opacity",
    ])
    expect(partsFor([stamp, measure], "select")).toEqual(["stroke", "opacity"])
    expect(partsFor([], "stamp")).toEqual(["label", "stroke"])
    expect(partsFor([], "measure")).toEqual([
      "unit",
      "scale",
      "stroke",
      "weight",
    ])
    // A call-out is text in everything but the row of boxes.
    expect(partsFor([], "callout")).toEqual(
      partsFor([], "text").filter((part) => part !== "comb")
    )
  })

  it("gives a stamp other words and another colour", () => {
    expect(withLook(stamp, { label: "  Draft " })).toMatchObject({
      label: "Draft",
    })
    expect(withLook(stamp, { label: "Approved" })).toBe(stamp)
    expect(withLook(stamp, { label: "   " })).toBe(stamp)
    expect(withLook(stamp, { stroke: BLUE })).toMatchObject({ colour: BLUE })
    expect(withLook(stamp, { stroke: RED })).toBe(stamp)
    expect(withLook(stamp, { stroke: null })).toBe(stamp)
    expect(withLook(stamp, { opacity: 0.5 })).toMatchObject({ opacity: 0.5 })
    // A part it does not have changes nothing.
    expect(withLook(stamp, { weight: 4 })).toBe(stamp)
    expect(withLook(stamp, { unit: "cm" })).toBe(stamp)
  })

  it("gives a measuring line another unit, scale, colour and thickness", () => {
    expect(withLook(measure, { unit: "cm" })).toMatchObject({ unit: "cm" })
    expect(withLook(measure, { unit: "mm" })).toBe(measure)
    expect(withLook(measure, { scale: 50 })).toMatchObject({ scale: 50 })
    expect(withLook(measure, { scale: 1 })).toBe(measure)
    expect(withLook(measure, { scale: 0 })).toMatchObject({ scale: 0.001 })
    expect(withLook(measure, { stroke: RED })).toMatchObject({ stroke: RED })
    expect(withLook(measure, { stroke: null })).toBe(measure)
    expect(withLook(measure, { weight: 4 })).toMatchObject({ weight: 4 })
    expect(withLook(measure, { label: "x" })).toBe(measure)
  })

  it("keeps the look chosen for each tool for the next thing it makes", () => {
    expect(
      stylesWith(defaultStyles, "stamp", { label: " Final " })
    ).toMatchObject({ stampLabel: "Final" })
    expect(stylesWith(defaultStyles, "stamp", { label: "  " })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "stamp", { stroke: BLUE })).toMatchObject({
      stampColour: BLUE,
    })
    expect(stylesWith(defaultStyles, "stamp", { stroke: null })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "measure", { unit: "in" })).toMatchObject({
      unit: "in",
    })
    expect(stylesWith(defaultStyles, "measure", { scale: 1e9 })).toMatchObject({
      scale: 100_000,
    })
    expect(
      stylesWith(defaultStyles, "measure", { stroke: BLUE })
    ).toMatchObject({ stroke: BLUE })
    // A measuring line has to have a colour.
    expect(stylesWith(defaultStyles, "measure", { stroke: null })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "measure", { weight: 4 })).toMatchObject({
      weight: 4,
    })
    // A call-out is typed like any text, in the colour of arrows and lines.
    expect(
      stylesWith(defaultStyles, "callout", { stroke: BLUE })
    ).toMatchObject({ stroke: BLUE, textColour: defaultStyles.textColour })
    expect(stylesWith(defaultStyles, "text", { stroke: BLUE })).toMatchObject({
      textColour: BLUE,
      stroke: defaultStyles.stroke,
    })
    expect(stylesWith(defaultStyles, "callout", { stroke: null })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "callout", { bold: true })).toMatchObject({
      bold: true,
    })
    // A tool without the part is left as it is.
    expect(stylesWith(defaultStyles, "box", { unit: "in" })).toBe(defaultStyles)
  })

  it("shows the look of what is selected, or of what the tool would make", () => {
    expect(lookOf([], "stamp", defaultStyles)).toMatchObject({
      stroke: defaultStyles.stampColour,
      label: "Approved",
      unit: "mm",
      scale: 1,
    })
    expect(lookOf([], "callout", defaultStyles).stroke).toEqual(
      defaultStyles.stroke
    )
    expect(lookOf([stamp], "select", defaultStyles)).toMatchObject({
      stroke: RED,
      label: "Approved",
    })
    expect(
      lookOf(
        [{ ...measure, unit: "ft", scale: 20, stroke: BLUE, weight: 4 }],
        "select",
        defaultStyles
      )
    ).toMatchObject({ unit: "ft", scale: 20, stroke: BLUE, weight: 4 })
  })
})

describe("how the tools make and change them", () => {
  it("has a tool for each", () => {
    expect(TOOLS).toEqual(
      expect.arrayContaining(["stamp", "measure", "callout"])
    )
    expect(TOOLS).toHaveLength(12)
  })

  it("turns a stamp by its handle, and neither a measuring line nor a call-out", () => {
    expect([stamp, measure, callout, words].map(turns)).toEqual([
      true,
      false,
      false,
      true,
    ])
  })

  it("knows what a point touches", () => {
    expect(touches(measure, { x: 200, y: 304 }, REACH)).toBe(true)
    expect(touches(measure, { x: 200, y: 320 }, REACH)).toBe(false)
    // A call-out: its frame, the line to its point, and nothing else.
    expect(touches(callout, { x: 298, y: 98 }, REACH)).toBe(true)
    expect(touches(callout, { x: 248, y: 159 }, REACH)).toBe(true)
    expect(touches(callout, { x: 260, y: 220 }, REACH)).toBe(false)
    // With its point inside the frame there is no line to touch.
    const inward = { ...callout, tip: { x: 350, y: 105 } }
    expect(touches(inward, { x: 350, y: 105 }, REACH)).toBe(true)
    expect(touches(inward, { x: 250, y: 160 }, REACH)).toBe(false)
  })

  it("finds the point of a call-out and the ends of a measuring line under the pointer", () => {
    expect(handleAt(callout, { x: 202, y: 198 }, REACH)).toBe("tip")
    expect(handleAt(callout, { x: 300, y: 107 }, REACH)).toBe("w")
    expect(handleAt(measure, { x: 300, y: 302 }, REACH)).toBe("e")
    expect(handleAt(measure, { x: 200, y: 300 }, REACH)).toBeNull()
  })

  it("makes a stamp and a measuring line in the styles in use", () => {
    const styles = {
      ...defaultStyles,
      stampLabel: "Draft",
      stampColour: BLUE,
      unit: "cm" as const,
      scale: 50,
    }
    expect(
      makeObject("stamp", { x: 10, y: 10 }, { x: 110, y: 50 }, styles, "s")
    ).toEqual({
      id: "s",
      kind: "stamp",
      rotation: 0,
      opacity: 1,
      box: { x: 10, y: 10, width: 100, height: 40 },
      label: "Draft",
      colour: BLUE,
    })
    expect(
      makeObject("measure", { x: 10, y: 10 }, { x: 110, y: 10 }, styles, "m")
    ).toMatchObject({
      kind: "measure",
      from: { x: 10, y: 10 },
      to: { x: 110, y: 10 },
      unit: "cm",
      scale: 50,
      stroke: styles.stroke,
    })
    expect(
      makeObject("line", { x: 0, y: 0 }, { x: 5, y: 5 }, styles, "l")
    ).not.toHaveProperty("unit")
  })

  it("makes a stamp of a usual size by a click, and a measuring line by a drag", () => {
    const clicked = release(
      press(
        { tool: "stamp", selection: null, gesture: null },
        view,
        at(300, 400)
      ),
      view,
      defaultStyles,
      REACH,
      "new"
    )
    expect(clicked.change).toEqual({
      label: "Add stamp",
      ops: [
        {
          do: "add",
          page: 0,
          object: {
            id: "new",
            kind: "stamp",
            rotation: 0,
            opacity: 1,
            box: {
              x: 300 - STAMP_SIZE.width / 2,
              y: 400 - STAMP_SIZE.height / 2,
              ...STAMP_SIZE,
            },
            label: "Approved",
            colour: defaultStyles.stampColour,
          },
        },
      ],
    })
    expect(clicked.state).toEqual(selecting(["new"]))

    const pressed = press(
      { tool: "measure", selection: null, gesture: null },
      view,
      at(100, 500)
    )
    const dragged = release(
      {
        ...pressed,
        gesture: { ...pressed.gesture!, to: { x: 172, y: 500 } } as never,
      },
      view,
      defaultStyles,
      REACH,
      "m"
    )
    expect(dragged.change?.label).toBe("Add measuring line")
    expect(dragged.change?.ops[0]).toMatchObject({
      object: {
        kind: "measure",
        from: { x: 100, y: 500 },
        to: { x: 172, y: 500 },
      },
    })
    // A click makes one of a usual length, level, about the point.
    const level = release(pressed, view, defaultStyles, REACH, "m")
    expect(level.change?.ops[0]).toMatchObject({
      object: {
        from: { x: 100 - CLICK_SIZE.width / 2, y: 500 },
        to: { x: 100 + CLICK_SIZE.width / 2, y: 500 },
      },
    })
  })

  it("leaves a call-out to be typed before it is anything", () => {
    const pressed = press(
      { tool: "callout", selection: null, gesture: null },
      view,
      at(100, 600)
    )
    expect(pressed.gesture).toMatchObject({ kind: "make", tool: "callout" })
    expect(release(pressed, view, defaultStyles, REACH, "c")).toEqual({
      state: { tool: "callout", selection: null, gesture: null },
      change: null,
    })
  })

  it("puts a call-out's words where the drag ended, or up and to the right after a click", () => {
    const dragged = makeCallout(
      { x: 100, y: 600 },
      { x: 250, y: 500 },
      defaultStyles,
      "c",
      view.size,
      REACH
    )
    expect(dragged).toMatchObject({
      kind: "text",
      id: "c",
      tip: { x: 100, y: 600 },
      text: "",
      colour: defaultStyles.stroke,
      box: { x: 250, y: 500 - 7.2, width: 140 },
    })
    const clicked = makeCallout(
      { x: 100, y: 600 },
      { x: 101, y: 600 },
      defaultStyles,
      "c",
      view.size,
      REACH
    )
    expect(clicked.box).toMatchObject({
      x: 100 + CALLOUT_AWAY.x,
      y: 600 + CALLOUT_AWAY.y - 7.2,
    })
    // Near the right edge and the top of the page it stays on the page.
    const cornered = makeCallout(
      { x: 590, y: 10 },
      { x: 590, y: 10 },
      defaultStyles,
      "c",
      view.size,
      REACH
    )
    expect(cornered.box.x).toBe(480)
    expect(cornered.box.y).toBe(20 - 7.2)
    expect(cornered.box.width).toBeLessThanOrEqual(140)
  })

  it("moves the point of a call-out by its handle, and calls the steps by its name", () => {
    const pressed = press(selecting(["callout"]), view, at(200, 200))
    expect(pressed.gesture).toMatchObject({
      kind: "pull",
      id: "callout",
      handle: "tip",
    })
    const done = release(
      {
        ...pressed,
        gesture: { ...pressed.gesture!, to: { x: 80, y: 90 } } as never,
      },
      view,
      defaultStyles,
      REACH,
      "x"
    )
    expect(done.change).toMatchObject({
      label: "Resize call-out",
      ops: [{ do: "change", object: { id: "callout", tip: { x: 80, y: 90 } } }],
    })
    expect(nudge(selecting(["callout"]), view, 5, 0)?.label).toBe(
      "Move call-out"
    )
    expect(nudge(selecting(["measure"]), view, 5, 0)?.label).toBe(
      "Move measuring line"
    )
  })

  it("leaves a tick, a cross or a dot where a paper form is pressed, and keeps the tool in hand", () => {
    const pressed = press(
      {
        tool: "check",
        selection: selecting(["stamp"]).selection,
        gesture: null,
      },
      view,
      at(250, 650)
    )
    expect(pressed.selection).toBeNull()
    const done = release(pressed, view, defaultStyles, REACH, "tick")
    expect(done.state).toEqual({
      tool: "check",
      selection: null,
      gesture: null,
    })
    expect(done.change?.label).toBe("Add tick")
    expect(done.change?.ops[0]).toMatchObject({
      do: "add",
      page: 0,
      object: { id: "tick", kind: "ink", stroke: defaultStyles.checkColour },
    })
    const crossed = release(
      pressed,
      view,
      { ...defaultStyles, checkShape: "cross", checkColour: BLUE },
      REACH,
      "cross"
    )
    expect(crossed.change?.label).toBe("Add cross")
    expect(crossed.change?.ops[0]).toMatchObject({
      object: { stroke: BLUE, box: { x: 244, y: 644, width: 12, height: 12 } },
    })
    expect(TOOLS).toContain("check")
  })

  it("chooses the mark and its colour for the next press", () => {
    expect(partsFor([], "check")).toEqual(["shape", "stroke"])
    expect(stylesWith(defaultStyles, "check", { shape: "dot" })).toMatchObject({
      checkShape: "dot",
    })
    expect(stylesWith(defaultStyles, "check", { stroke: BLUE })).toMatchObject({
      checkColour: BLUE,
    })
    expect(stylesWith(defaultStyles, "check", { stroke: null })).toBe(
      defaultStyles
    )
    expect(lookOf([], "check", defaultStyles)).toMatchObject({
      shape: "tick",
      stroke: defaultStyles.checkColour,
    })
    // A thing has no mark to choose.
    expect(withLook(stamp, { shape: "dot" })).toBe(stamp)
  })
})
