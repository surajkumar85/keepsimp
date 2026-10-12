/**
 * What the pointer and the keys do. The screen reports where on a page
 * something happened; this decides what it means, shows it while it lasts,
 * and at the end names the change to make to the file. Nothing here touches
 * the engine or the screen.
 */
import type { Size } from "@/lib/image-compressor/geometry"
import {
  angleFrom,
  boxBetween,
  centreOf,
  distanceToPath,
  distanceToSegment,
  handlePoint,
  insideBox,
  keepOnPage,
  overlap,
  settleAngle,
  SMALLEST,
  snap,
  turnAbout,
  turnedBounds,
  type Box,
  type Guide,
  type Point,
} from "./geometry"
import { thin } from "./ink"
import type { MeasureUnit } from "./measure"
import { CHECK_NAMES, checkMark, type CheckShape } from "./signature"
import {
  BLACK,
  calloutFrame,
  calloutLine,
  copyOf,
  handlesOf,
  handleSpot,
  isLine,
  moved,
  nameOf,
  pulled,
  reach,
  textHeight,
  turnedTo,
  WHITE,
  type Colour,
  type EditorObject,
  type FontFamily,
  type Grip,
  type TextAlign,
  type TextObject,
} from "./objects"

export type Tool =
  | "select"
  | "text"
  | "box"
  | "ellipse"
  | "line"
  | "arrow"
  | "ink"
  | "cover"
  | "stamp"
  | "measure"
  | "callout"
  | "check"

export const TOOLS: readonly Tool[] = [
  "select",
  "text",
  "box",
  "ellipse",
  "line",
  "arrow",
  "ink",
  "cover",
  "stamp",
  "measure",
  "callout",
  "check",
]

/** What new things look like. The last choice made for a kind is kept for the next of its kind. */
export interface Styles {
  stroke: Colour
  fill: Colour | null
  weight: number
  inkColour: Colour
  inkWeight: number
  coverFill: Colour
  textColour: Colour
  font: FontFamily
  size: number
  bold: boolean
  italic: boolean
  align: TextAlign
  /** How many boxes the next text box spreads its letters over; 0 for none. */
  comb: number
  /** What the next stamp says, and its colour. */
  stampLabel: string
  stampColour: Colour
  /** The unit and the scale the next measuring line measures by. */
  unit: MeasureUnit
  scale: number
  /** The mark the next press on a paper form leaves, and its colour. */
  checkShape: CheckShape
  checkColour: Colour
}

export const defaultStyles: Styles = {
  stroke: [0.86, 0.15, 0.15],
  fill: null,
  weight: 2,
  inkColour: [0.1, 0.25, 0.75],
  inkWeight: 2,
  coverFill: WHITE,
  textColour: BLACK,
  font: "sans",
  size: 12,
  bold: false,
  italic: false,
  align: "left",
  comb: 0,
  stampLabel: "Approved",
  stampColour: [0.09, 0.56, 0.24],
  unit: "mm",
  scale: 1,
  checkShape: "tick",
  checkColour: BLACK,
}

/** One change to the things on a page. */
export type Op =
  | { do: "add"; page: number; object: EditorObject }
  | { do: "change"; page: number; object: EditorObject }
  | { do: "remove"; page: number; id: string }
  | {
      do: "order"
      page: number
      id: string
      to: "front" | "back" | "forward" | "backward"
    }

/** Changes made together, which are undone together. The label is what the undo list calls them. */
export interface Change {
  label: string
  ops: Op[]
}

/** Which things are selected, all on one page. */
export interface Selection {
  page: number
  ids: string[]
}

/** Something under way between a press and a release. */
export type Gesture =
  | {
      kind: "move"
      page: number
      from: Point
      to: Point
      guides: Guide[]
      /** A press that never moved far is a click, not a move. */
      begun: boolean
    }
  | {
      kind: "pull"
      page: number
      id: string
      handle: Grip
      to: Point
      keepShape: boolean
    }
  | { kind: "turn"; page: number; id: string; angle: number }
  | {
      kind: "make"
      page: number
      tool: Exclude<Tool, "select" | "ink" | "text">
      from: Point
      to: Point
    }
  | { kind: "ink"; page: number; points: Point[] }
  | { kind: "marquee"; page: number; from: Point; to: Point }

export interface EditorState {
  tool: Tool
  selection: Selection | null
  gesture: Gesture | null
}

export const startState: EditorState = {
  tool: "select",
  selection: null,
  gesture: null,
}

/** A page as the tools need it: its size and what has been added to it, bottom first. */
export interface PageView {
  page: number
  size: Size
  objects: readonly EditorObject[]
}

/** Facts about the moment of a press or a move. */
export interface Moment {
  point: Point
  /** How many points of the page a finger's width is: a few screen pixels at the zoom in use. */
  reach: number
  shift?: boolean
}

/** How far above its top a thing's turning handle floats, in units of `reach`. */
const TURN_GAP = 4
/** A press has to travel this far, in units of `reach`, to count as a drag. */
const DRAG_START = 0.5
/** A click with a shape tool makes a thing of this size. */
export const CLICK_SIZE: Size = { width: 120, height: 80 }
/** A click with the stamp tool makes a stamp of this size. */
export const STAMP_SIZE: Size = { width: 150, height: 46 }
/** Where a call-out's words go when it was placed by a click: this far from what it points at. */
export const CALLOUT_AWAY: Point = { x: 50, y: -50 }
/** A new text box is this wide unless it is dragged out. */
export const TEXT_WIDTH = 220

const selectedOn = (state: EditorState, view: PageView) =>
  state.selection?.page === view.page
    ? view.objects.filter((object) => state.selection!.ids.includes(object.id))
    : []

/** Where the handle that turns a thing is. */
export function turnHandle(object: EditorObject, reachNow: number): Point {
  const top = handlePoint(object.box, object.rotation, "n")
  const centre = centreOf(object.box)
  const length = Math.hypot(top.x - centre.x, top.y - centre.y) || 1
  const gap = TURN_GAP * reachNow
  return {
    x: top.x + ((top.x - centre.x) / length) * gap,
    y: top.y + ((top.y - centre.y) / length) * gap,
  }
}

/**
 * Whether a thing can be turned by its handle. Lines are turned by their
 * ends, and a call-out stands upright beside what it points at.
 */
export const turns = (object: EditorObject) =>
  !isLine(object) && !(object.kind === "text" && object.tip)

/** Whether a point touches a thing. */
export function touches(object: EditorObject, point: Point, room: number) {
  if (isLine(object))
    return (
      distanceToSegment(point, object.from, object.to) <=
      object.weight / 2 + room
    )
  if (object.kind === "text" && object.tip) {
    // Its frame, or the line from the frame to what it points at.
    const line = calloutLine(object)
    return (
      insideBox(point, calloutFrame(object.box), 0, room / 2) ||
      (line !== null && distanceToSegment(point, line.from, line.to) <= room)
    )
  }
  if (object.kind === "ink")
    return object.strokes.some(
      (stroke) => distanceToPath(point, stroke) <= object.weight / 2 + room
    )
  return insideBox(point, object.box, object.rotation, room / 2)
}

/** The topmost thing under a point; null when there is none. */
export function thingAt(view: PageView, point: Point, room: number) {
  for (let index = view.objects.length - 1; index >= 0; index--)
    if (touches(view.objects[index], point, room)) return view.objects[index]
  return null
}

/** Which handle of a selected thing a point is on: one that pulls, the one that turns, or none. */
export function handleAt(
  object: EditorObject,
  point: Point,
  room: number
): Grip | "turn" | null {
  const near = (at: Point) => Math.hypot(point.x - at.x, point.y - at.y) <= room
  if (turns(object) && near(turnHandle(object, room))) return "turn"
  for (const handle of handlesOf(object))
    if (near(handleSpot(object, handle))) return handle
  return null
}

/** A press on a page. */
export function press(
  state: EditorState,
  view: PageView,
  moment: Moment
): EditorState {
  const { point, reach: room } = moment
  if (state.tool === "ink")
    return {
      ...state,
      selection: null,
      gesture: { kind: "ink", page: view.page, points: [point] },
    }
  if (state.tool !== "select" && state.tool !== "text")
    return {
      ...state,
      selection: null,
      gesture: {
        kind: "make",
        page: view.page,
        tool: state.tool,
        from: point,
        to: point,
      },
    }
  if (state.tool === "text") return { ...state, selection: null, gesture: null }
  // The handles of the one selected thing come before anything under them.
  const chosen = selectedOn(state, view)
  if (chosen.length === 1) {
    const handle = handleAt(chosen[0], point, room)
    if (handle === "turn")
      return {
        ...state,
        gesture: {
          kind: "turn",
          page: view.page,
          id: chosen[0].id,
          angle: chosen[0].rotation,
        },
      }
    if (handle)
      return {
        ...state,
        gesture: {
          kind: "pull",
          page: view.page,
          id: chosen[0].id,
          handle,
          to: point,
          keepShape:
            chosen[0].kind === "picture"
              ? !moment.shift
              : Boolean(moment.shift),
        },
      }
  }
  const under = thingAt(view, point, room)
  if (!under)
    return {
      ...state,
      selection: moment.shift ? state.selection : null,
      gesture: { kind: "marquee", page: view.page, from: point, to: point },
    }
  const ids = chosen.map((object) => object.id)
  let next: string[]
  if (moment.shift)
    next = ids.includes(under.id)
      ? ids.filter((id) => id !== under.id)
      : [...ids, under.id]
  else next = ids.includes(under.id) ? ids : [under.id]
  return {
    ...state,
    selection: next.length ? { page: view.page, ids: next } : null,
    gesture: next.includes(under.id)
      ? {
          kind: "move",
          page: view.page,
          from: point,
          to: point,
          guides: [],
          begun: false,
        }
      : null,
  }
}

const pageBox = (view: PageView): Box => ({
  x: 0,
  y: 0,
  width: view.size.width,
  height: view.size.height,
})

/** The pointer moved while pressed. */
export function drag(
  state: EditorState,
  view: PageView,
  moment: Moment
): EditorState {
  const gesture = state.gesture
  if (!gesture || gesture.page !== view.page) return state
  const { point, reach: room } = moment
  switch (gesture.kind) {
    case "ink":
      return {
        ...state,
        gesture: { ...gesture, points: [...gesture.points, point] },
      }
    case "make":
    case "marquee":
      return { ...state, gesture: { ...gesture, to: point } }
    case "pull":
      return { ...state, gesture: { ...gesture, to: point } }
    case "turn": {
      const object = view.objects.find((one) => one.id === gesture.id)
      if (!object) return state
      const angle = angleFrom(centreOf(object.box), point)
      return {
        ...state,
        // Shift lets go of the angles a turn otherwise settles on.
        gesture: {
          ...gesture,
          angle: moment.shift ? angle : settleAngle(angle),
        },
      }
    }
    case "move": {
      const far =
        Math.hypot(point.x - gesture.from.x, point.y - gesture.from.y) >=
        DRAG_START * room
      if (!gesture.begun && !far) return state
      const chosen = selectedOn(state, view)
      const ids = new Set(chosen.map((object) => object.id))
      let dx = point.x - gesture.from.x
      let dy = point.y - gesture.from.y
      let guides: Guide[] = []
      if (chosen.length && !moment.shift) {
        const around = boundsAround(
          chosen.map((object) => moved(object, dx, dy))
        )
        const pull = snap(
          around,
          [
            pageBox(view),
            ...view.objects
              .filter((object) => !ids.has(object.id))
              .map((object) => turnedBounds(object.box, object.rotation)),
          ],
          room
        )
        dx += pull.dx
        dy += pull.dy
        guides = pull.guides
      }
      return {
        ...state,
        gesture: {
          ...gesture,
          to: { x: gesture.from.x + dx, y: gesture.from.y + dy },
          guides,
          begun: true,
        },
      }
    }
  }
}

/** The upright box around several things. */
export function boundsAround(objects: readonly EditorObject[]): Box {
  const boxes = objects.map(reach)
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  return {
    x: left,
    y: top,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - top,
  }
}

/** The things on a page as they look while a gesture lasts. */
export function shown(state: EditorState, view: PageView): EditorObject[] {
  const gesture = state.gesture
  if (!gesture || gesture.page !== view.page) return [...view.objects]
  const ids = state.selection?.page === view.page ? state.selection.ids : []
  return view.objects.map((object) => {
    if (gesture.kind === "move" && gesture.begun && ids.includes(object.id))
      return moved(
        object,
        gesture.to.x - gesture.from.x,
        gesture.to.y - gesture.from.y
      )
    if (gesture.kind === "pull" && gesture.id === object.id)
      return pulled(object, gesture.handle, gesture.to, gesture.keepShape)
    if (gesture.kind === "turn" && gesture.id === object.id)
      return turnedTo(object, gesture.angle)
    return object
  })
}

const label = (verb: string, objects: readonly EditorObject[]) =>
  objects.length === 1
    ? `${verb} ${nameOf(objects[0])}`
    : `${verb} ${objects.length} things`

/** A thing made by a shape tool between two points, in the styles in use. */
export function makeObject(
  tool: Exclude<Tool, "select" | "ink" | "text" | "callout" | "check">,
  from: Point,
  to: Point,
  styles: Styles,
  id: string
): EditorObject {
  const base = { id, rotation: 0, opacity: 1 }
  if (tool === "line" || tool === "arrow" || tool === "measure") {
    const line = {
      ...base,
      box: boxBetween(from, to),
      from,
      to,
      stroke: styles.stroke,
      weight: styles.weight,
    }
    return tool === "measure"
      ? { ...line, kind: tool, unit: styles.unit, scale: styles.scale }
      : { ...line, kind: tool }
  }
  const box = boxBetween(from, to)
  if (tool === "stamp")
    return {
      ...base,
      kind: "stamp",
      box,
      label: styles.stampLabel,
      colour: styles.stampColour,
    }
  if (tool === "cover")
    return { ...base, kind: "cover", box, fill: styles.coverFill }
  return {
    ...base,
    kind: tool,
    box,
    stroke: styles.stroke,
    fill: styles.fill,
    weight: styles.weight,
  }
}

/**
 * An empty text box ready to be typed into. Its first line starts at the
 * point and has the point at half its height, the way a text cursor shows
 * where the letters will be.
 */
export function makeText(
  at: Point,
  styles: Styles,
  id: string,
  page: Size
): TextObject {
  const width = Math.min(TEXT_WIDTH, Math.max(40, page.width - at.x - 8))
  const height = textHeight(1, styles.size)
  return {
    id,
    kind: "text",
    box: { x: at.x, y: Math.max(0, at.y - height / 2), width, height },
    rotation: 0,
    opacity: 1,
    text: "",
    lines: [""],
    font: styles.font,
    bold: styles.bold,
    italic: styles.italic,
    size: styles.size,
    colour: styles.textColour,
    align: styles.align,
    ...(styles.comb ? { comb: styles.comb } : null),
  }
}

/**
 * An empty call-out, ready to be typed into: it points at one place and its
 * words go at another. When the two are the same place, as after a click,
 * the words go up and to the right of what is pointed at.
 */
export function makeCallout(
  tip: Point,
  at: Point,
  styles: Styles,
  id: string,
  page: Size,
  reachNow: number
): TextObject {
  const dragged =
    Math.hypot(at.x - tip.x, at.y - tip.y) >= Math.max(SMALLEST, reachNow)
  const where = dragged
    ? at
    : {
        x: Math.min(tip.x + CALLOUT_AWAY.x, Math.max(0, page.width - 120)),
        y: Math.max(20, tip.y + CALLOUT_AWAY.y),
      }
  const text = makeText(where, styles, id, page)
  return {
    ...text,
    // Narrower than a text box: a call-out is a few words.
    box: { ...text.box, width: Math.min(text.box.width, 140) },
    // In the colour of arrows and lines, which it is kin to.
    colour: styles.stroke,
    tip: { ...tip },
  }
}

/** What a release leaves behind: the state, and a change to the file when there is one. */
export interface Outcome {
  state: EditorState
  change: Change | null
}

/**
 * The pointer was let go.
 * @param newId A name for a thing that is made.
 */
export function release(
  state: EditorState,
  view: PageView,
  styles: Styles,
  reachNow: number,
  newId: string
): Outcome {
  const gesture = state.gesture
  const idle = { ...state, gesture: null }
  if (!gesture || gesture.page !== view.page)
    return { state: idle, change: null }
  const page = view.page
  switch (gesture.kind) {
    case "marquee": {
      const area = boxBetween(gesture.from, gesture.to)
      const caught = view.objects
        .filter((object) => overlap(reach(object), area))
        .map((object) => object.id)
      // A click on nothing leaves what shift had kept.
      const tiny = area.width < reachNow && area.height < reachNow
      const kept = state.selection?.page === page ? state.selection.ids : []
      const ids = tiny ? kept : [...new Set([...kept, ...caught])]
      return {
        state: { ...idle, selection: ids.length ? { page, ids } : null },
        change: null,
      }
    }
    case "ink": {
      const points = thin(gesture.points, reachNow / 4)
      const object: EditorObject = {
        id: newId,
        kind: "ink",
        rotation: 0,
        opacity: 1,
        box: boxBetween(points[0], points[0]),
        strokes: [points],
        stroke: styles.inkColour,
        weight: styles.inkWeight,
      }
      // Its box follows its points.
      const fitted = moved(object, 0, 0)
      return {
        // The pen stays in the hand: nothing is selected, the tool stays.
        state: idle,
        change: { label: "Draw", ops: [{ do: "add", page, object: fitted }] },
      }
    }
    case "make": {
      // A call-out is typed before it is anything: whoever holds the typing
      // makes it, with `makeCallout`.
      if (gesture.tool === "callout") return { state: idle, change: null }
      if (gesture.tool === "check")
        return {
          // The tool stays in hand: a form has many boxes to mark.
          state: idle,
          change: {
            label: `Add ${CHECK_NAMES[styles.checkShape]}`,
            ops: [
              {
                do: "add",
                page,
                object: checkMark(
                  styles.checkShape,
                  gesture.to,
                  styles.checkColour,
                  newId
                ),
              },
            ],
          },
        }
      const tool = gesture.tool
      const dragged =
        Math.hypot(
          gesture.to.x - gesture.from.x,
          gesture.to.y - gesture.from.y
        ) >= Math.max(SMALLEST, reachNow)
      const line = tool === "line" || tool === "arrow" || tool === "measure"
      // A click makes a thing of a usual size around the point.
      const usual = tool === "stamp" ? STAMP_SIZE : CLICK_SIZE
      const from = dragged
        ? gesture.from
        : line
          ? { x: gesture.from.x - usual.width / 2, y: gesture.from.y }
          : {
              x: gesture.from.x - usual.width / 2,
              y: gesture.from.y - usual.height / 2,
            }
      const to = dragged
        ? gesture.to
        : line
          ? { x: gesture.from.x + usual.width / 2, y: gesture.from.y }
          : {
              x: gesture.from.x + usual.width / 2,
              y: gesture.from.y + usual.height / 2,
            }
      let object = makeObject(tool, from, to, styles, newId)
      if (!dragged) {
        const kept = keepOnPage(reach(object), view.size, SMALLEST)
        const was = reach(object)
        object = moved(object, kept.x - was.x, kept.y - was.y)
      }
      return {
        // What was made is selected, with the selection tool, to be adjusted.
        state: {
          tool: "select",
          selection: { page, ids: [newId] },
          gesture: null,
        },
        change: {
          label: `Add ${nameOf(object)}`,
          ops: [{ do: "add", page, object }],
        },
      }
    }
    case "move": {
      if (!gesture.begun) return { state: idle, change: null }
      const dx = gesture.to.x - gesture.from.x
      const dy = gesture.to.y - gesture.from.y
      const chosen = selectedOn(state, view)
      if (!chosen.length || (dx === 0 && dy === 0))
        return { state: idle, change: null }
      return {
        state: idle,
        change: {
          label: label("Move", chosen),
          ops: chosen.map((object) => ({
            do: "change" as const,
            page,
            object: moved(object, dx, dy),
          })),
        },
      }
    }
    case "pull": {
      const object = view.objects.find((one) => one.id === gesture.id)
      if (!object) return { state: idle, change: null }
      return {
        state: idle,
        change: {
          label: label("Resize", [object]),
          ops: [
            {
              do: "change",
              page,
              object: pulled(
                object,
                gesture.handle,
                gesture.to,
                gesture.keepShape
              ),
            },
          ],
        },
      }
    }
    case "turn": {
      const object = view.objects.find((one) => one.id === gesture.id)
      if (!object || gesture.angle === object.rotation)
        return { state: idle, change: null }
      return {
        state: idle,
        change: {
          label: label("Turn", [object]),
          ops: [
            { do: "change", page, object: turnedTo(object, gesture.angle) },
          ],
        },
      }
    }
  }
}

/** The selected things nudged by the arrow keys. */
export function nudge(
  state: EditorState,
  view: PageView,
  dx: number,
  dy: number
): Change | null {
  const chosen = selectedOn(state, view)
  if (!chosen.length) return null
  return {
    label: label("Move", chosen),
    ops: chosen.map((object) => ({
      do: "change" as const,
      page: view.page,
      object: moved(object, dx, dy),
    })),
  }
}

/** The selected things taken away. */
export function removeSelected(state: EditorState, view: PageView): Outcome {
  const chosen = selectedOn(state, view)
  if (!chosen.length) return { state, change: null }
  return {
    state: { ...state, selection: null, gesture: null },
    change: {
      label: label("Delete", chosen),
      ops: chosen.map((object) => ({
        do: "remove" as const,
        page: view.page,
        id: object.id,
      })),
    },
  }
}

/**
 * Copies of some things put on a page, selected.
 * @param names A new name for each, in order.
 * @param shift How far from the originals they land.
 */
export function paste(
  state: EditorState,
  view: PageView,
  objects: readonly EditorObject[],
  names: readonly string[],
  shift = 12
): Outcome {
  if (!objects.length) return { state, change: null }
  const copies = objects.map((object, index) => {
    const copy = copyOf(object, names[index], shift)
    // Something copied from a larger page still lands on this one.
    const was = reach(copy)
    const kept = keepOnPage(was, view.size, SMALLEST)
    return moved(copy, kept.x - was.x, kept.y - was.y)
  })
  return {
    state: {
      tool: "select",
      selection: { page: view.page, ids: copies.map((copy) => copy.id) },
      gesture: null,
    },
    change: {
      label: label("Paste", copies),
      ops: copies.map((object) => ({
        do: "add" as const,
        page: view.page,
        object,
      })),
    },
  }
}

/** The selected things moved up or down among the others. */
export function reorder(
  state: EditorState,
  view: PageView,
  to: "front" | "back" | "forward" | "backward"
): Change | null {
  const chosen = selectedOn(state, view)
  if (!chosen.length) return null
  // Going up, the topmost goes first, so that they keep their own order.
  const order =
    to === "front" || to === "backward" ? chosen : [...chosen].reverse()
  return {
    label: to === "front" || to === "forward" ? "Bring forward" : "Send back",
    ops: order.map((object) => ({
      do: "order" as const,
      page: view.page,
      id: object.id,
      to,
    })),
  }
}

/**
 * The selected things given another look.
 * @param restyle What each becomes; a thing it returns unchanged is left out.
 */
export function restyle(
  state: EditorState,
  view: PageView,
  restyle: (object: EditorObject) => EditorObject
): Change | null {
  const ops = selectedOn(state, view)
    .map((object) => ({ was: object, now: restyle(object) }))
    .filter(({ was, now }) => was !== now)
    .map(({ now }) => ({ do: "change" as const, page: view.page, object: now }))
  return ops.length ? { label: "Change the look", ops } : null
}

/** Every thing on a page selected, or nothing when the page has none. */
export const selectAll = (state: EditorState, view: PageView): EditorState => ({
  ...state,
  tool: "select",
  gesture: null,
  selection: view.objects.length
    ? { page: view.page, ids: view.objects.map((object) => object.id) }
    : null,
})

/**
 * The next thing on a page, for the Tab key: after the selected one, or the
 * first; null past the last, so that Tab can leave the page.
 */
export function nextThing(
  state: EditorState,
  view: PageView,
  step: 1 | -1
): Selection | null {
  if (!view.objects.length) return null
  const chosen = selectedOn(state, view)
  const at = chosen.length
    ? view.objects.findIndex(
        (object) => object.id === chosen[chosen.length - 1].id
      )
    : step === 1
      ? -1
      : view.objects.length
  const next = view.objects[at + step]
  return next ? { page: view.page, ids: [next.id] } : null
}

/** Another tool is taken up: whatever was under way is dropped. */
export const pick = (state: EditorState, tool: Tool): EditorState => ({
  tool,
  gesture: null,
  selection: tool === "select" ? state.selection : null,
})

/** A turn of a point about the centre of a thing, for placing what is drawn over it. */
export const about = (object: EditorObject, point: Point) =>
  turnAbout(point, centreOf(object.box), object.rotation)

/**
 * What the pages hold once a change has been made, worked out here so that
 * the screen can show it before the file has answered. The file's own answer
 * replaces it. Pages the change does not name are the very lists they were.
 */
export function applied(
  pages: readonly (readonly EditorObject[])[],
  change: Change
): EditorObject[][] {
  const next = pages.map((page) => page as EditorObject[])
  for (const op of change.ops) {
    const list = [...(next[op.page] ?? [])]
    const at = list.findIndex(
      (object) =>
        object.id ===
        (op.do === "add" || op.do === "change" ? op.object.id : op.id)
    )
    if (op.do === "add") {
      if (at < 0) list.push(op.object)
      else list[at] = op.object
    } else if (at < 0) continue
    else if (op.do === "change") list[at] = op.object
    else if (op.do === "remove") list.splice(at, 1)
    else {
      const [object] = list.splice(at, 1)
      const to =
        op.to === "front"
          ? list.length
          : op.to === "back"
            ? 0
            : op.to === "forward"
              ? Math.min(list.length, at + 1)
              : Math.max(0, at - 1)
      list.splice(to, 0, object)
    }
    next[op.page] = list
  }
  return next
}
