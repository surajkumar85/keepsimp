import { describe, expect, it } from "vitest"
import { handlePoint } from "./geometry"
import {
  BLACK,
  WHITE,
  type EditorObject,
  type InkObject,
  type LineObject,
  type PictureObject,
  type ShapeObject,
  type TextObject,
} from "./objects"
import {
  applied,
  about,
  boundsAround,
  CLICK_SIZE,
  defaultStyles,
  drag,
  handleAt,
  makeObject,
  makeText,
  nextThing,
  nudge,
  paste,
  pick,
  press,
  release,
  removeSelected,
  reorder,
  restyle,
  selectAll,
  shown,
  startState,
  TEXT_WIDTH,
  thingAt,
  TOOLS,
  touches,
  turnHandle,
  turns,
  type EditorState,
  type PageView,
} from "./tools"

const base = { rotation: 0, opacity: 1 }
const box: ShapeObject = {
  ...base,
  id: "box",
  kind: "box",
  box: { x: 100, y: 100, width: 80, height: 40 },
  stroke: BLACK,
  fill: null,
  weight: 2,
}
const picture: PictureObject = {
  ...base,
  id: "pic",
  kind: "picture",
  box: { x: 300, y: 300, width: 100, height: 50 },
  picture: "p",
}
const line: LineObject = {
  ...base,
  id: "line",
  kind: "line",
  box: { x: 200, y: 500, width: 100, height: 0 },
  from: { x: 200, y: 500 },
  to: { x: 300, y: 500 },
  stroke: BLACK,
  weight: 2,
}
const ink: InkObject = {
  ...base,
  id: "ink",
  kind: "ink",
  box: { x: 400, y: 600, width: 50, height: 50 },
  strokes: [
    [
      { x: 400, y: 600 },
      { x: 450, y: 650 },
    ],
  ],
  stroke: BLACK,
  weight: 2,
}
const view: PageView = {
  page: 0,
  size: { width: 600, height: 800 },
  objects: [box, picture, line, ink],
}
const REACH = 6
const at = (x: number, y: number, shift = false) => ({
  point: { x, y },
  reach: REACH,
  shift,
})
const selecting = (ids: string[], page = 0): EditorState => ({
  tool: "select",
  selection: { page, ids },
  gesture: null,
})

describe("finding things", () => {
  it("knows what a point touches", () => {
    expect(touches(box, { x: 140, y: 120 }, REACH)).toBe(true)
    expect(touches(box, { x: 190, y: 120 }, REACH)).toBe(false)
    expect(touches(line, { x: 250, y: 505 }, REACH)).toBe(true)
    expect(touches(line, { x: 250, y: 510 }, REACH)).toBe(false)
    expect(touches(ink, { x: 425, y: 627 }, REACH)).toBe(true)
    expect(touches(ink, { x: 450, y: 600 }, REACH)).toBe(false)
  })

  it("takes the topmost of the things under a point", () => {
    const over: ShapeObject = { ...box, id: "over" }
    expect(
      thingAt({ ...view, objects: [box, over] }, { x: 140, y: 120 }, REACH)?.id
    ).toBe("over")
    expect(thingAt(view, { x: 5, y: 5 }, REACH)).toBeNull()
  })

  it("finds the handles of a thing, and the one that turns it", () => {
    expect(handleAt(box, { x: 180, y: 140 }, REACH)).toBe("se")
    expect(handleAt(box, { x: 140, y: 100 }, REACH)).toBe("n")
    expect(handleAt(box, { x: 140, y: 120 }, REACH)).toBeNull()
    const turn = turnHandle(box, REACH)
    expect(turn).toEqual({ x: 140, y: 100 - 4 * REACH })
    expect(handleAt(box, turn, REACH)).toBe("turn")
    // A line is turned by its ends; it has no handle for it.
    expect(turns(line)).toBe(false)
    expect(turns(box)).toBe(true)
    expect(handleAt(line, { x: 201, y: 501 }, REACH)).toBe("w")
    expect(handleAt(line, { x: 299, y: 499 }, REACH)).toBe("e")
    expect(handleAt(line, { x: 250, y: 500 }, REACH)).toBeNull()
    expect(handleAt(line, turnHandle(line, REACH), REACH)).toBeNull()
  })

  it("puts the turning handle above the top of a turned thing, and of one with no height", () => {
    const turned = turnHandle({ ...box, rotation: 90 }, REACH)
    // The top of the box now points right.
    expect(turned.x).toBeCloseTo(160 + 4 * REACH)
    expect(turned.y).toBeCloseTo(120)
    const flat = turnHandle({ ...box, box: { ...box.box, height: 0 } }, REACH)
    expect(Number.isFinite(flat.x)).toBe(true)
    expect(Number.isFinite(flat.y)).toBe(true)
  })

  it("places a point as a turned thing has it", () => {
    const point = about({ ...box, rotation: 180 }, { x: 100, y: 100 })
    expect(point.x).toBeCloseTo(180)
    expect(point.y).toBeCloseTo(140)
  })
})

describe("selecting", () => {
  it("selects what is clicked and lets go of the rest", () => {
    const pressed = press(startState, view, at(140, 120))
    expect(pressed.selection).toEqual({ page: 0, ids: ["box"] })
    expect(pressed.gesture).toMatchObject({ kind: "move", begun: false })
    // Letting go without moving changes nothing in the file.
    const done = release(pressed, view, defaultStyles, REACH, "n")
    expect(done.change).toBeNull()
    expect(done.state.selection).toEqual({ page: 0, ids: ["box"] })
    expect(done.state.gesture).toBeNull()
  })

  it("adds to and takes from the selection with shift", () => {
    const two = press(selecting(["box"]), view, at(350, 320, true))
    expect(two.selection?.ids).toEqual(["box", "pic"])
    const one = press({ ...two, gesture: null }, view, at(140, 120, true))
    expect(one.selection?.ids).toEqual(["pic"])
    // Taken out of the selection, it is not moved by the press that did it.
    expect(one.gesture).toBeNull()
    const none = press(selecting(["box"]), view, at(140, 120, true))
    expect(none.selection).toBeNull()
  })

  it("keeps a selection of several when one of them is pressed, to move them together", () => {
    const pressed = press(selecting(["box", "pic"]), view, at(350, 320))
    expect(pressed.selection?.ids).toEqual(["box", "pic"])
    expect(pressed.gesture?.kind).toBe("move")
  })

  it("lets go of everything on a click on nothing", () => {
    const pressed = press(selecting(["box"]), view, at(20, 20))
    expect(pressed.selection).toBeNull()
    expect(pressed.gesture?.kind).toBe("marquee")
    const done = release(pressed, view, defaultStyles, REACH, "n")
    expect(done.state.selection).toBeNull()
    expect(done.change).toBeNull()
    // With shift, a click on nothing keeps what was selected.
    const kept = release(
      press(selecting(["box"]), view, at(20, 20, true)),
      view,
      defaultStyles,
      REACH,
      "n"
    )
    expect(kept.state.selection?.ids).toEqual(["box"])
  })

  it("selects what a dragged-out area touches", () => {
    let state = press(startState, view, at(90, 90))
    state = drag(state, view, at(410, 360))
    expect(state.gesture).toMatchObject({
      kind: "marquee",
      to: { x: 410, y: 360 },
    })
    const done = release(state, view, defaultStyles, REACH, "n")
    expect(done.state.selection?.ids).toEqual(["box", "pic"])
    // With shift, it adds to what was there.
    let more = press(selecting(["line"]), view, at(90, 90, true))
    more = drag(more, view, at(190, 150, true))
    expect(
      release(more, view, defaultStyles, REACH, "n").state.selection?.ids
    ).toEqual(["line", "box"])
  })

  it("selects everything, steps through things, and forgets a selection on another page", () => {
    expect(selectAll(startState, view).selection?.ids).toHaveLength(4)
    expect(selectAll(startState, { ...view, objects: [] }).selection).toBeNull()
    expect(nextThing(startState, view, 1)).toEqual({ page: 0, ids: ["box"] })
    expect(nextThing(startState, view, -1)).toEqual({ page: 0, ids: ["ink"] })
    expect(nextThing(selecting(["box"]), view, 1)).toEqual({
      page: 0,
      ids: ["pic"],
    })
    expect(nextThing(selecting(["ink"]), view, 1)).toBeNull()
    expect(nextThing(selecting(["box"]), view, -1)).toBeNull()
    expect(nextThing(startState, { ...view, objects: [] }, 1)).toBeNull()
    // A selection on page 3 means nothing on page 0.
    expect(nudge(selecting(["box"], 3), view, 1, 0)).toBeNull()
  })
})

describe("moving", () => {
  it("moves what is selected once the pointer has gone far enough", () => {
    let state = press(startState, view, at(140, 120))
    // A tremor is not a move.
    state = drag(state, view, at(141, 120, true))
    expect(state.gesture).toMatchObject({ begun: false })
    state = drag(state, view, at(160, 150, true))
    expect(state.gesture).toMatchObject({ begun: true, to: { x: 160, y: 150 } })
    expect(shown(state, view)[0].box).toMatchObject({ x: 120, y: 130 })
    // Once begun, coming back near the start is still a move.
    expect(drag(state, view, at(140.5, 120, true)).gesture).toMatchObject({
      begun: true,
    })
    const done = release(state, view, defaultStyles, REACH, "n")
    expect(done.change).toEqual({
      label: "Move box",
      ops: [
        {
          do: "change",
          page: 0,
          object: { ...box, box: { ...box.box, x: 120, y: 130 } },
        },
      ],
    })
  })

  it("lines up with the page and with other things, unless shift is held", () => {
    let state = press(startState, view, at(140, 120))
    // Its left edge would be at 3, the outside of its line at 2: the page's
    // edge pulls that to 0.
    state = drag(state, view, at(43, 120))
    expect(state.gesture).toMatchObject({
      to: { x: 41, y: 120 },
      guides: [{ axis: "x", at: 0 }],
    })
    expect(drag(state, view, at(43, 120, true)).gesture).toMatchObject({
      to: { x: 43, y: 120 },
      guides: [],
    })
  })

  it("moves several together, and names how many", () => {
    let state = press(selecting(["box", "pic"]), view, at(350, 320, true))
    state = {
      ...state,
      selection: { page: 0, ids: ["box", "pic"] },
      gesture: {
        kind: "move",
        page: 0,
        from: { x: 350, y: 320 },
        to: { x: 350, y: 320 },
        guides: [],
        begun: false,
      },
    }
    state = drag(state, view, at(370, 340, true))
    const done = release(state, view, defaultStyles, REACH, "n")
    expect(done.change?.label).toBe("Move 2 things")
    expect(done.change?.ops).toHaveLength(2)
  })

  it("changes nothing when a move ends where it began, or nothing is selected", () => {
    let state = press(startState, view, at(140, 120))
    state = drag(state, view, at(170, 120, true))
    state = drag(state, view, at(140, 120, true))
    expect(release(state, view, defaultStyles, REACH, "n").change).toBeNull()
    const lost: EditorState = { ...state, selection: null }
    expect(
      release(drag(lost, view, at(180, 120)), view, defaultStyles, REACH, "n")
        .change
    ).toBeNull()
  })

  it("nudges with the keys", () => {
    expect(nudge(selecting(["line"]), view, 0, -10)?.ops[0]).toMatchObject({
      do: "change",
      object: { from: { x: 200, y: 490 } },
    })
    expect(nudge(startState, view, 1, 1)).toBeNull()
  })
})

describe("pulling and turning", () => {
  it("pulls a handle of the one selected thing", () => {
    let state = press(selecting(["box"]), view, at(180, 140))
    expect(state.gesture).toMatchObject({
      kind: "pull",
      handle: "se",
      keepShape: false,
    })
    state = drag(state, view, at(200, 180))
    expect(shown(state, view)[0].box).toEqual({
      x: 100,
      y: 100,
      width: 100,
      height: 80,
    })
    const done = release(state, view, defaultStyles, REACH, "n")
    expect(done.change?.label).toBe("Resize box")
    expect(done.change?.ops[0]).toMatchObject({
      object: { box: { width: 100, height: 80 } },
    })
    // Shift keeps the shape of a box, and lets go of a picture's.
    expect(
      press(selecting(["box"]), view, at(180, 140, true)).gesture
    ).toMatchObject({ keepShape: true })
    expect(press(selecting(["pic"]), view, at(400, 350)).gesture).toMatchObject(
      { keepShape: true }
    )
    expect(
      press(selecting(["pic"]), view, at(400, 350, true)).gesture
    ).toMatchObject({ keepShape: false })
  })

  it("turns a thing by its handle, settling on round angles unless shift is held", () => {
    const handle = turnHandle(box, REACH)
    let state = press(selecting(["box"]), view, at(handle.x, handle.y))
    expect(state.gesture).toMatchObject({ kind: "turn", angle: 0 })
    // Straight right of its centre, give or take.
    state = drag(state, view, at(240, 122))
    expect(state.gesture).toMatchObject({ angle: 90 })
    expect(shown(state, view)[0].rotation).toBe(90)
    const free = drag(state, view, at(240, 122, true))
    expect((free.gesture as { angle: number }).angle).toBeCloseTo(91.15, 1)
    const done = release(state, view, defaultStyles, REACH, "n")
    expect(done.change).toMatchObject({
      label: "Turn box",
      ops: [{ object: { rotation: 90 } }],
    })
    // A turn that ends where it began is no change.
    const back = drag(state, view, at(140, 20))
    expect(release(back, view, defaultStyles, REACH, "n").change).toBeNull()
  })

  it("does nothing when the thing has gone in the meantime", () => {
    const gone = { ...view, objects: [picture] }
    const pulling: EditorState = {
      ...selecting(["box"]),
      gesture: {
        kind: "pull",
        page: 0,
        id: "box",
        handle: "se",
        to: { x: 1, y: 1 },
        keepShape: false,
      },
    }
    expect(release(pulling, gone, defaultStyles, REACH, "n").change).toBeNull()
    const turning: EditorState = {
      ...selecting(["box"]),
      gesture: { kind: "turn", page: 0, id: "box", angle: 40 },
    }
    expect(drag(turning, gone, at(1, 1))).toBe(turning)
    expect(release(turning, gone, defaultStyles, REACH, "n").change).toBeNull()
  })

  it("ignores a gesture that belongs to another page", () => {
    const other = { ...view, page: 1 }
    const state = press(startState, view, at(140, 120))
    expect(drag(state, other, at(1, 1))).toBe(state)
    expect(shown(state, other)).toEqual(view.objects)
    expect(release(state, other, defaultStyles, REACH, "n")).toEqual({
      state: { ...state, gesture: null },
      change: null,
    })
    expect(
      release(startState, view, defaultStyles, REACH, "n").change
    ).toBeNull()
    expect(drag(startState, view, at(1, 1))).toBe(startState)
  })
})

describe("making things", () => {
  it("has a tool for each thing that can be made", () => {
    expect(TOOLS).toContain("cover")
    expect(TOOLS[0]).toBe("select")
  })

  it("drags out a box and selects it, back with the selection tool", () => {
    let state = press(pick(selecting(["box"]), "box"), view, at(200, 200))
    expect(state.selection).toBeNull()
    state = drag(state, view, at(260, 230))
    // Nothing is shown for it among the things; the screen draws the gesture.
    expect(shown(state, view)).toEqual(view.objects)
    const done = release(state, view, defaultStyles, REACH, "new")
    expect(done.state).toEqual({
      tool: "select",
      selection: { page: 0, ids: ["new"] },
      gesture: null,
    })
    expect(done.change).toEqual({
      label: "Add box",
      ops: [
        {
          do: "add",
          page: 0,
          object: {
            id: "new",
            kind: "box",
            rotation: 0,
            opacity: 1,
            box: { x: 200, y: 200, width: 60, height: 30 },
            stroke: defaultStyles.stroke,
            fill: null,
            weight: 2,
          },
        },
      ],
    })
  })

  it("makes a thing of a usual size on a click, kept on the page", () => {
    const clicked = release(
      press(pick(startState, "ellipse"), view, at(300, 400)),
      view,
      defaultStyles,
      REACH,
      "e"
    )
    expect(clicked.change?.ops[0]).toMatchObject({
      object: {
        kind: "ellipse",
        box: {
          x: 240,
          y: 360,
          width: CLICK_SIZE.width,
          height: CLICK_SIZE.height,
        },
      },
    })
    const corner = release(
      press(pick(startState, "cover"), view, at(0, 0)),
      view,
      defaultStyles,
      REACH,
      "c"
    )
    const made = corner.change!.ops[0] as { object: EditorObject }
    expect(made.object).toMatchObject({ kind: "cover", fill: WHITE })
    expect(made.object.box.x).toBeGreaterThan(-CLICK_SIZE.width + 3)
    const arrow = release(
      press(pick(startState, "arrow"), view, at(300, 400)),
      view,
      defaultStyles,
      REACH,
      "a"
    )
    expect(arrow.change).toMatchObject({
      label: "Add arrow",
      ops: [
        {
          object: {
            kind: "arrow",
            from: { x: 240, y: 400 },
            to: { x: 360, y: 400 },
          },
        },
      ],
    })
  })

  it("draws a line between where it was pressed and let go", () => {
    let state = press(pick(startState, "line"), view, at(10, 10))
    state = drag(state, view, at(110, 60))
    expect(
      release(state, view, defaultStyles, REACH, "l").change?.ops[0]
    ).toMatchObject({
      object: {
        kind: "line",
        from: { x: 10, y: 10 },
        to: { x: 110, y: 60 },
        box: { width: 100, height: 50 },
      },
    })
    expect(
      makeObject("cover", { x: 5, y: 9 }, { x: 1, y: 2 }, defaultStyles, "x")
        .box
    ).toEqual({
      x: 1,
      y: 2,
      width: 4,
      height: 7,
    })
  })

  it("draws freehand, thinned, and keeps the pen in the hand", () => {
    let state = press(pick(selecting(["box"]), "ink"), view, at(10, 10))
    for (let x = 11; x <= 60; x++) state = drag(state, view, at(x, 10))
    state = drag(state, view, at(60, 40))
    expect((state.gesture as { points: unknown[] }).points).toHaveLength(52)
    const done = release(state, view, defaultStyles, REACH, "i")
    expect(done.state).toEqual({ tool: "ink", selection: null, gesture: null })
    expect(done.change).toMatchObject({
      label: "Draw",
      ops: [
        {
          do: "add",
          object: {
            kind: "ink",
            strokes: [
              [
                { x: 10, y: 10 },
                { x: 60, y: 10 },
                { x: 60, y: 40 },
              ],
            ],
            box: { x: 10, y: 10, width: 50, height: 30 },
            stroke: defaultStyles.inkColour,
          },
        },
      ],
    })
    // A tap leaves a dot.
    const dot = release(
      press(pick(startState, "ink"), view, at(5, 5)),
      view,
      defaultStyles,
      REACH,
      "d"
    )
    expect(dot.change?.ops[0]).toMatchObject({
      object: { strokes: [[{ x: 5, y: 5 }]] },
    })
  })

  it("leaves the text tool to the screen, and starts a text box where asked", () => {
    const state = press(pick(selecting(["box"]), "text"), view, at(50, 50))
    expect(state).toEqual({ tool: "text", selection: null, gesture: null })
    const text: TextObject = makeText(
      { x: 50, y: 60 },
      { ...defaultStyles, size: 20, bold: true },
      "t",
      view.size
    )
    expect(text).toMatchObject({
      kind: "text",
      // The first line has the point at half its height.
      box: { x: 50, y: 48, width: TEXT_WIDTH, height: 24 },
      text: "",
      lines: [""],
      size: 20,
      bold: true,
    })
    // Near the right edge it is as wide as there is room, but never too narrow to type in.
    expect(
      makeText({ x: 500, y: 60 }, defaultStyles, "t", view.size).box.width
    ).toBe(92)
    expect(
      makeText({ x: 590, y: 60 }, defaultStyles, "t", view.size).box.width
    ).toBe(40)
    // At the very top of a page it stays on the page.
    expect(makeText({ x: 50, y: 3 }, defaultStyles, "t", view.size).box.y).toBe(
      0
    )
  })

  it("keeps the selection when the selection tool is taken up, and drops it for any other", () => {
    expect(pick(selecting(["box"]), "select").selection?.ids).toEqual(["box"])
    expect(pick(selecting(["box"]), "ink").selection).toBeNull()
  })
})

describe("changes from the keys and the panel", () => {
  it("deletes what is selected", () => {
    const done = removeSelected(selecting(["box", "ink"]), view)
    expect(done.state.selection).toBeNull()
    expect(done.change).toEqual({
      label: "Delete 2 things",
      ops: [
        { do: "remove", page: 0, id: "box" },
        { do: "remove", page: 0, id: "ink" },
      ],
    })
    expect(removeSelected(startState, view)).toEqual({
      state: startState,
      change: null,
    })
  })

  it("pastes copies under new names, selected, a little aside and on the page", () => {
    const done = paste(pick(startState, "ink"), view, [box, line], ["b2", "l2"])
    expect(done.state).toEqual({
      tool: "select",
      selection: { page: 0, ids: ["b2", "l2"] },
      gesture: null,
    })
    expect(done.change?.label).toBe("Paste 2 things")
    expect(done.change?.ops[0]).toMatchObject({
      do: "add",
      object: { id: "b2", box: { x: 112, y: 112 } },
    })
    // From a larger page, it still lands on this one.
    const far = paste(
      startState,
      view,
      [{ ...box, box: { ...box.box, x: 5000, y: 5000 } }],
      ["f"]
    )
    const landed = (far.change!.ops[0] as { object: EditorObject }).object
    expect(landed.box.x).toBeLessThan(600)
    expect(landed.box.y).toBeLessThan(800)
    expect(paste(startState, view, [], [])).toEqual({
      state: startState,
      change: null,
    })
    expect(paste(startState, view, [box], ["one"]).change?.label).toBe(
      "Paste box"
    )
  })

  it("moves things up and down among the others, keeping their own order", () => {
    expect(reorder(selecting(["box", "pic"]), view, "front")).toEqual({
      label: "Bring forward",
      ops: [
        { do: "order", page: 0, id: "box", to: "front" },
        { do: "order", page: 0, id: "pic", to: "front" },
      ],
    })
    expect(
      reorder(selecting(["box", "pic"]), view, "back")?.ops.map(
        (op) => (op as { id: string }).id
      )
    ).toEqual(["pic", "box"])
    expect(
      reorder(selecting(["box", "pic"]), view, "forward")?.ops.map(
        (op) => (op as { id: string }).id
      )
    ).toEqual(["pic", "box"])
    expect(reorder(selecting(["box"]), view, "backward")?.label).toBe(
      "Send back"
    )
    expect(reorder(startState, view, "front")).toBeNull()
  })

  it("gives the selected things another look, leaving out what did not change", () => {
    const change = restyle(selecting(["box", "pic"]), view, (object) =>
      object.kind === "box" ? { ...object, weight: 5 } : object
    )
    expect(change).toEqual({
      label: "Change the look",
      ops: [{ do: "change", page: 0, object: { ...box, weight: 5 } }],
    })
    expect(restyle(selecting(["pic"]), view, (object) => object)).toBeNull()
  })

  it("measures the box around several things", () => {
    expect(boundsAround([box, picture])).toEqual({
      x: 99,
      y: 99,
      width: 301,
      height: 251,
    })
    const corner = handlePoint(box.box, 0, "nw")
    expect(corner).toEqual({ x: 100, y: 100 })
  })
})

describe("showing a change before the file has answered", () => {
  const a = { ...view.objects[0], id: "a" }
  const b = { ...view.objects[0], id: "b" }
  const c = { ...view.objects[0], id: "c" }
  const pages = [[a, b, c], [a]]
  const ids = (list: readonly { id: string }[]) =>
    list.map((object) => object.id).join("")
  const order = (id: string, to: "front" | "back" | "forward" | "backward") =>
    ids(
      applied(pages, { label: "", ops: [{ do: "order", page: 0, id, to }] })[0]
    )

  it("adds, changes and removes, and leaves other pages the lists they were", () => {
    const moved = { ...b, opacity: 0.5 }
    const d = { ...a, id: "d" }
    const next = applied(pages, {
      label: "",
      ops: [
        { do: "add", page: 0, object: d },
        { do: "change", page: 0, object: moved },
        { do: "remove", page: 0, id: "a" },
      ],
    })
    expect(ids(next[0])).toBe("bcd")
    expect(next[0][0]).toBe(moved)
    expect(next[1]).toBe(pages[1])
    // What was given is not changed.
    expect(ids(pages[0])).toBe("abc")
  })

  it("takes an added thing that is already there as that thing changed", () => {
    const again = { ...b, opacity: 0.2 }
    const next = applied(pages, {
      label: "",
      ops: [{ do: "add", page: 0, object: again }],
    })
    expect(ids(next[0])).toBe("abc")
    expect(next[0][1]).toBe(again)
  })

  it("passes over a thing that is not there, and adds to a page it has no list for", () => {
    const next = applied(pages, {
      label: "",
      ops: [
        { do: "change", page: 0, object: { ...a, id: "gone" } },
        { do: "remove", page: 1, id: "gone" },
        { do: "order", page: 0, id: "gone", to: "front" },
        { do: "add", page: 3, object: a },
      ],
    })
    expect(ids(next[0])).toBe("abc")
    expect(ids(next[1])).toBe("a")
    expect(ids(next[3])).toBe("a")
  })

  it("moves a thing up and down among the others", () => {
    expect(order("a", "front")).toBe("bca")
    expect(order("c", "back")).toBe("cab")
    expect(order("a", "forward")).toBe("bac")
    expect(order("c", "backward")).toBe("acb")
    // At the end of the way it stays.
    expect(order("c", "forward")).toBe("abc")
    expect(order("a", "backward")).toBe("abc")
  })
})
