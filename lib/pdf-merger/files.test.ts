import { describe, expect, it } from "vitest"
import {
  chosenPages,
  filesReducer,
  mergeStatus,
  noFiles,
  type FileFacts,
  type FilesAction,
  type FilesState,
} from "./files"
import { desktopLimits } from "./settings"

const facts = (pages: number, more: Partial<FileFacts> = {}): FileFacts => ({
  pages,
  width: 595,
  height: 842,
  title: "",
  bookmarks: 0,
  repaired: false,
  unlocked: false,
  restricted: false,
  signed: false,
  tagged: false,
  forms: false,
  ...more,
})

const item = (id: string, name = `${id}.pdf`, size = 100, modified = 0) => ({
  id,
  file: new Blob([id]),
  name,
  size,
  modified,
})

const run = (actions: FilesAction[], from: FilesState = noFiles) =>
  actions.reduce(filesReducer, from)
const ids = (state: FilesState) => state.files.map((file) => file.id)

/** Three files, read, with 3, 5 and 2 pages. */
const three = run([
  { type: "add", items: [item("a"), item("b"), item("c")] },
  { type: "opened", id: "a", facts: facts(3) },
  { type: "opened", id: "b", facts: facts(5) },
  { type: "opened", id: "c", facts: facts(2) },
])

describe("adding and reading", () => {
  it("adds files as they arrive, waiting to be read", () => {
    const state = run([{ type: "add", items: [item("a"), item("b")] }])
    expect(state.files).toMatchObject([
      { id: "a", added: 0, status: "reading", range: "", rotation: 0 },
      { id: "b", added: 1, status: "reading" },
    ])
    expect(state.arrivals).toBe(2)
    expect(state.order).toBe("added")
  })

  it("records what the engine found", () => {
    expect(three.files[1]).toMatchObject({
      status: "ready",
      facts: { pages: 5 },
    })
  })

  it("marks a locked file, a wrong password and the retry", () => {
    let state = run([
      { type: "add", items: [item("a")] },
      { type: "locked", id: "a", wrong: false },
    ])
    expect(state.files[0]).toMatchObject({
      status: "locked",
      wrongPassword: false,
    })
    state = run([{ type: "unlocking", id: "a" }], state)
    expect(state.files[0].status).toBe("reading")
    state = run([{ type: "locked", id: "a", wrong: true }], state)
    expect(state.files[0]).toMatchObject({
      status: "locked",
      wrongPassword: true,
    })
    state = run(
      [
        { type: "unlocking", id: "a" },
        { type: "opened", id: "a", facts: facts(1, { unlocked: true }) },
      ],
      state
    )
    expect(state.files[0]).toMatchObject({ status: "ready" })
    expect(state.files[0].wrongPassword).toBeUndefined()
  })

  it("keeps the reason a file could not be read", () => {
    const state = run([
      { type: "add", items: [item("a")] },
      { type: "failed", id: "a", message: "This file is damaged." },
    ])
    expect(state.files[0]).toMatchObject({
      status: "error",
      error: "This file is damaged.",
    })
  })

  it("ignores news about a file that has been removed", () => {
    const state = run([{ type: "opened", id: "gone", facts: facts(1) }], three)
    expect(state.files).toEqual(three.files)
  })
})

describe("removing", () => {
  it("removes one file, or all of them", () => {
    expect(ids(run([{ type: "remove", id: "b" }], three))).toEqual(["a", "c"])
    const cleared = run([{ type: "clear" }], three)
    expect(cleared.files).toEqual([])
    // Arrival numbers keep counting, so ids made from them stay unique.
    expect(cleared.arrivals).toBe(3)
    expect(cleared.order).toBe("added")
  })
})

describe("ordering", () => {
  it("moves a file and remembers the order is now the person's own", () => {
    const state = run([{ type: "move", id: "c", to: 0 }], three)
    expect(ids(state)).toEqual(["c", "a", "b"])
    expect(state.order).toBe("custom")
    expect(ids(run([{ type: "move", id: "a", to: 2 }], three))).toEqual([
      "b",
      "c",
      "a",
    ])
  })

  it("keeps a move inside the list, and ignores one that changes nothing", () => {
    expect(ids(run([{ type: "move", id: "a", to: 99 }], three))).toEqual([
      "b",
      "c",
      "a",
    ])
    expect(ids(run([{ type: "move", id: "c", to: -5 }], three))).toEqual([
      "c",
      "a",
      "b",
    ])
    expect(run([{ type: "move", id: "a", to: 0 }], three)).toBe(three)
    expect(run([{ type: "move", id: "gone", to: 1 }], three)).toBe(three)
  })

  const mixed = run([
    {
      type: "add",
      items: [
        item("x", "Chapter 10.pdf", 1, 300),
        item("y", "chapter 2.pdf", 1, 100),
        item("z", "Appendix.pdf", 1, 200),
        item("w", "chapter 2.pdf", 1, 100),
      ],
    },
  ])

  it("sorts by name with numbers in their natural order", () => {
    const state = run([{ type: "sort", order: "name" }], mixed)
    // Same names keep their order of arrival.
    expect(ids(state)).toEqual(["z", "y", "w", "x"])
    expect(state.order).toBe("name")
    expect(ids(run([{ type: "sort", order: "name-desc" }], mixed))).toEqual([
      "x",
      "y",
      "w",
      "z",
    ])
  })

  it("sorts by date, and back to the order of arrival", () => {
    expect(ids(run([{ type: "sort", order: "oldest" }], mixed))).toEqual([
      "y",
      "w",
      "z",
      "x",
    ])
    expect(ids(run([{ type: "sort", order: "newest" }], mixed))).toEqual([
      "x",
      "z",
      "y",
      "w",
    ])
    expect(
      ids(
        run(
          [
            { type: "sort", order: "newest" },
            { type: "sort", order: "added" },
          ],
          mixed
        )
      )
    ).toEqual(["x", "y", "z", "w"])
  })

  it("puts new files in their sorted place, or at the end of a hand-made order", () => {
    const byName = run(
      [
        { type: "sort", order: "name" },
        { type: "add", items: [item("n", "Bibliography.pdf")] },
      ],
      mixed
    )
    expect(ids(byName)).toEqual(["z", "n", "y", "w", "x"])
    const byHand = run(
      [
        { type: "move", id: "z", to: 0 },
        { type: "add", items: [item("n", "Aardvark.pdf")] },
      ],
      mixed
    )
    expect(ids(byHand)).toEqual(["z", "x", "y", "w", "n"])
  })
})

describe("pages, turning and adding a file again", () => {
  it("keeps the range as typed, and turns a quarter at a time", () => {
    let state = run([{ type: "range", id: "b", text: "2-3" }], three)
    expect(state.files[1].range).toBe("2-3")
    state = run(
      [
        { type: "rotate", id: "b", direction: "right" },
        { type: "rotate", id: "b", direction: "right" },
      ],
      state
    )
    expect(state.files[1].rotation).toBe(180)
    state = run(
      [
        { type: "rotate", id: "a", direction: "left" },
        { type: "rotate", id: "b", direction: "left" },
      ],
      state
    )
    expect(state.files.map((file) => file.rotation)).toEqual([270, 90, 0])
  })

  it("adds a file again straight after itself, to be read afresh", () => {
    const state = run(
      [
        { type: "range", id: "a", text: "1" },
        { type: "rotate", id: "a", direction: "right" },
        { type: "again", id: "a", newId: "a2" },
      ],
      three
    )
    expect(ids(state)).toEqual(["a", "a2", "b", "c"])
    expect(state.files[1]).toMatchObject({
      name: "a.pdf",
      status: "reading",
      range: "",
      rotation: 0,
      added: 3,
    })
    expect(state.files[1].file).toBe(state.files[0].file)
    expect(state.files[1].facts).toBeUndefined()
    expect(state.order).toBe("custom")
    expect(state.arrivals).toBe(4)
    expect(run([{ type: "again", id: "gone", newId: "n" }], three)).toBe(three)
  })
})

describe("chosenPages and mergeStatus", () => {
  it("has no pages for a file that is not read", () => {
    const state = run([{ type: "add", items: [item("a")] }])
    expect(chosenPages(state.files[0])).toBeNull()
    expect(mergeStatus(state.files)).toEqual({
      parts: [],
      pages: 0,
      bytes: 0,
      leftOut: 0,
      reading: true,
      problem: null,
    })
  })

  it("takes every ready file in order, with its pages and its turn", () => {
    const state = run(
      [
        { type: "range", id: "b", text: "5, 1-2" },
        { type: "rotate", id: "c", direction: "left" },
        { type: "move", id: "c", to: 0 },
      ],
      three
    )
    expect(mergeStatus(state.files)).toEqual({
      parts: [
        { id: "c", pages: [0, 1], rotation: 270 },
        { id: "a", pages: [0, 1, 2], rotation: 0 },
        { id: "b", pages: [4, 0, 1], rotation: 0 },
      ],
      pages: 8,
      bytes: 300,
      leftOut: 0,
      reading: false,
      problem: null,
    })
  })

  it("leaves out files that could not be read, and counts them", () => {
    const state = run([{ type: "failed", id: "b", message: "Damaged." }], three)
    const status = mergeStatus(state.files)
    expect(status.parts.map((part) => part.id)).toEqual(["a", "c"])
    expect(status).toMatchObject({
      pages: 5,
      bytes: 200,
      leftOut: 1,
      problem: null,
    })
  })

  it("waits for a locked file's password", () => {
    let state = run([{ type: "locked", id: "b", wrong: false }], three)
    expect(mergeStatus(state.files).problem).toBe(
      "Enter the password for b.pdf, or remove it."
    )
    state = run([{ type: "locked", id: "c", wrong: true }], state)
    expect(mergeStatus(state.files).problem).toBe(
      "Enter the passwords for the 2 locked files, or remove them."
    )
    // The readable file still shows what it would give.
    expect(mergeStatus(state.files).pages).toBe(3)
  })

  it("points at the file whose pages cannot be read", () => {
    const state = run(
      [
        { type: "range", id: "a", text: "9" },
        { type: "range", id: "c", text: "x" },
      ],
      three
    )
    const status = mergeStatus(state.files)
    expect(status.problem).toBe("Check the pages for a.pdf.")
    expect(status.parts.map((part) => part.id)).toEqual(["b"])
    // A missing password comes first: it is the one thing that blocks reading.
    const locked = run([{ type: "locked", id: "b", wrong: false }], state)
    expect(mergeStatus(locked.files).problem).toMatch(/password for b\.pdf/)
  })

  it("stops at the page limit", () => {
    const state = run([
      { type: "add", items: [item("a"), item("b")] },
      { type: "opened", id: "a", facts: facts(desktopLimits.pages) },
      { type: "opened", id: "b", facts: facts(1) },
    ])
    expect(mergeStatus(state.files).problem).toBe(
      "The result would have 5,001 pages. Up to 5,000 can be merged at once."
    )
    const fits = run([{ type: "remove", id: "b" }], state)
    expect(mergeStatus(fits.files).problem).toBeNull()
    // A device with a lower limit is told its own number.
    expect(mergeStatus(three.files, 9).problem).toBe(
      "The result would have 10 pages. Up to 9 can be merged at once."
    )
  })
})
