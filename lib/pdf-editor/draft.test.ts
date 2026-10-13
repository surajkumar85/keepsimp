import { describe, expect, it } from "vitest"
import {
  canBeKept,
  DRAFT_LIMIT,
  draftLine,
  fontsOf,
  MOST_OPS,
  MOST_STEPS,
  picturesOf,
  readDraft,
  readOp,
  readStep,
  type Draft,
} from "./draft"
import type { Step } from "./mupdf-edit"
import { BLACK, type EditorObject } from "./objects"

const box: EditorObject = {
  id: "b1",
  kind: "box",
  rotation: 0,
  opacity: 1,
  box: { x: 10, y: 10, width: 40, height: 30 },
  stroke: BLACK,
  fill: null,
  weight: 1,
}
const words: EditorObject = {
  id: "t1",
  kind: "text",
  rotation: 0,
  opacity: 1,
  box: { x: 10, y: 60, width: 100, height: 20 },
  text: "Hello",
  lines: ["Hello"],
  font: "serif",
  bold: true,
  italic: false,
  size: 12,
  colour: BLACK,
  align: "left",
}
const photo: EditorObject = {
  id: "p1",
  kind: "picture",
  picture: "photo-1",
  rotation: 0,
  opacity: 1,
  box: { x: 10, y: 90, width: 50, height: 40 },
}

const things = (...ops: unknown[]) => ({
  done: { kind: "things", change: { label: "Add", ops } },
  label: "Add",
  touched: [0],
})
const added = (object: EditorObject, page = 0) => ({ do: "add", page, object })

describe("a change to things, read back", () => {
  it("reads each kind of change", () => {
    expect(readOp(added(box))).toEqual({ do: "add", page: 0, object: box })
    expect(readOp({ do: "change", page: 2, object: words })).toEqual({
      do: "change",
      page: 2,
      object: words,
    })
    expect(readOp({ do: "remove", page: 1, id: "b1", more: true })).toEqual({
      do: "remove",
      page: 1,
      id: "b1",
    })
    expect(readOp({ do: "order", page: 0, id: "b1", to: "front" })).toEqual({
      do: "order",
      page: 0,
      id: "b1",
      to: "front",
    })
  })

  it("refuses what is not one", () => {
    for (const value of [
      null,
      "add",
      { do: "add", page: -1, object: box },
      { do: "add", page: 0.5, object: box },
      { do: "add", page: 0, object: { ...box, kind: "blob" } },
      { do: "change", page: 0 },
      { do: "remove", page: 0, id: "" },
      { do: "remove", page: 0, id: 4 },
      { do: "remove", page: 0, id: "x".repeat(65) },
      { do: "order", page: 0, id: "b1", to: "sideways" },
      { do: "explode", page: 0, id: "b1" },
    ])
      expect(readOp(value)).toBeNull()
  })
})

describe("a step, read back", () => {
  it("reads steps of every kind, keeping only what a step is", () => {
    expect(readStep({ ...things(added(box)), extra: 1 })).toEqual(
      things(added(box))
    )
    const fill = { do: "fill", page: 0, id: "f12", value: "Ada" }
    expect(
      readStep({
        done: { kind: "fields", change: { label: "x", ops: [fill] } },
        label: "Fill in Name",
        touched: [0, 3],
      })
    ).toEqual({
      done: { kind: "fields", change: { label: "Fill in Name", ops: [fill] } },
      label: "Fill in Name",
      touched: [0, 3],
    })
    const comment = readStep({
      done: {
        kind: "comments",
        change: { ops: [{ do: "drop", page: 0, id: "c7" }] },
      },
      label: "Remove comment",
      touched: [],
    })
    expect(comment?.done.kind).toBe("comments")
  })

  it("refuses a step with anything wrong in it", () => {
    const good = things(added(box))
    for (const value of [
      null,
      7,
      { ...good, done: null },
      { ...good, done: { kind: "scripts", change: { ops: [] } } },
      { ...good, done: { kind: "things", change: null } },
      { ...good, done: { kind: "things", change: { ops: "all" } } },
      { ...good, label: "" },
      { ...good, label: 3 },
      { ...good, label: "x".repeat(201) },
      { ...good, touched: "0" },
      { ...good, touched: [0, -1] },
      things(added(box), { do: "add", page: 0, object: null }),
      things(...Array.from({ length: MOST_OPS + 1 }, () => added(box))),
    ])
      expect(readStep(value)).toBeNull()
  })
})

describe("a draft, read back", () => {
  const draft = (change: Record<string, unknown> = {}) => ({
    name: "contract.pdf",
    size: 2048,
    when: 1_000,
    steps: [things(added(box)), things(added(words))],
    position: 1,
    ...change,
  })

  it("reads a draft and what it needs", () => {
    const read = readDraft({ ...draft(), file: "ignored" })
    expect(read).toEqual(draft())
    expect(readDraft(draft({ steps: [], position: 0 }))?.steps).toEqual([])
  })

  it("refuses what is not a draft", () => {
    for (const value of [
      null,
      "draft",
      draft({ name: "" }),
      draft({ name: 3 }),
      draft({ name: "x".repeat(301) }),
      draft({ size: 0 }),
      draft({ size: "big" }),
      draft({ size: DRAFT_LIMIT + 1 }),
      draft({ when: Infinity }),
      draft({ when: "today" }),
      draft({ steps: "none" }),
      draft({ steps: [things(added(box)), { label: "?" }] }),
      draft({ steps: Array.from({ length: MOST_STEPS + 1 }, () => 0) }),
      draft({ position: 3 }),
      draft({ position: -1 }),
      draft({ position: 0.5 }),
    ])
      expect(readDraft(value)).toBeNull()
  })

  it("says which fonts and pictures its steps need, each once", () => {
    const steps = [
      things(added(words), added(box), added(photo)),
      things(
        { do: "change", page: 0, object: words },
        { do: "remove", page: 0, id: "b1" }
      ),
      {
        done: { kind: "fields", change: { label: "x", ops: [] } },
        label: "x",
        touched: [],
      },
      things(
        added({ ...photo, id: "p2" }),
        added({ ...photo, id: "p3", picture: "photo-2" })
      ),
    ] as Step[]
    expect(fontsOf(steps)).toEqual(["serif-bold"])
    // A change to the page's own text says which of the editor's fonts it was written with.
    const retext = (fonts: unknown) =>
      readStep({
        done: {
          kind: "text",
          change: {
            ops: [
              {
                do: "retext",
                page: 0,
                box: { x: 1, y: 2, width: 3, height: 4 },
                was: "a",
                text: "b",
              },
            ],
            fonts,
          },
        },
        label: "Change text",
        touched: [0],
      })!
    expect(
      fontsOf([
        ...steps,
        retext(["mono", "serif-bold", "comic", 7, "own-0123456789ab", "own-1"]),
      ])
    ).toEqual(["serif-bold", "mono", "own-0123456789ab"])
    expect(fontsOf([retext(undefined)])).toEqual([])
    // A change to a paragraph is kept with what it wrote, which a download reads the result against.
    const place = { x: 1, y: 2, width: 3, height: 4 }
    const flowed = (wrote: unknown) =>
      readStep({
        done: {
          kind: "text",
          change: {
            ops: [
              {
                do: "reflow",
                page: 0,
                lines: [{ box: place, was: "a b" }],
                text: "a c",
              },
            ],
            wrote,
          },
        },
        label: "Change text",
        touched: [0],
      })!
    const wrote = [{ from: 0, lines: [{ box: place, text: "a c" }] }]
    expect(flowed(wrote).done.change).toMatchObject({
      ops: [{ do: "reflow", text: "a c" }],
      wrote,
    })
    // What is not that is left out, and the change is still a change.
    expect(flowed([null, null]).done.change).not.toHaveProperty("wrote")
    expect(flowed("all").done.change).not.toHaveProperty("wrote")
    expect(retext("mono").done.change).not.toHaveProperty("fonts")
    // Fonts are only said of changes to text.
    expect(
      readStep({
        ...things(added(box)),
        done: {
          kind: "things",
          change: { ops: [added(box)], fonts: ["mono"] },
        },
      })!.done.change
    ).not.toHaveProperty("fonts")
    expect(picturesOf(steps)).toEqual(["photo-1", "photo-2"])
    expect(fontsOf([])).toEqual([])
  })

  it("knows which files a draft is kept of", () => {
    expect(canBeKept(1)).toBe(true)
    expect(canBeKept(DRAFT_LIMIT)).toBe(true)
    expect(canBeKept(DRAFT_LIMIT + 1)).toBe(false)
    expect(canBeKept(0)).toBe(false)
  })
})

describe("what the page says about a draft", () => {
  const kept = (position: number, when: number): Draft => ({
    name: "a.pdf",
    size: 1,
    when,
    steps: [],
    position,
  })
  const minute = 60_000

  it("says how much was done and when it was kept", () => {
    const now = 100 * 24 * 60 * minute
    expect(draftLine(kept(1, now), now)).toBe("1 change, kept just now")
    expect(draftLine(kept(1200, now - minute), now)).toBe(
      "1,200 changes, kept 1 minute ago"
    )
    expect(draftLine(kept(0, now - 59 * minute), now)).toBe(
      "no changes in force, kept 59 minutes ago"
    )
    expect(draftLine(kept(2, now - 60 * minute), now)).toBe(
      "2 changes, kept 1 hour ago"
    )
    expect(draftLine(kept(2, now - 5 * 60 * minute), now)).toBe(
      "2 changes, kept 5 hours ago"
    )
    expect(draftLine(kept(2, now - 24 * 60 * minute), now)).toBe(
      "2 changes, kept 1 day ago"
    )
    expect(draftLine(kept(2, now - 72 * 60 * minute), now)).toBe(
      "2 changes, kept 3 days ago"
    )
    // A clock that was set back does not make a draft come from the future.
    expect(draftLine(kept(2, now + 5 * minute), now)).toBe(
      "2 changes, kept just now"
    )
  })
})
