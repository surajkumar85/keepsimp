import { describe, expect, it } from "vitest"
import type { FileFacts } from "@/lib/pdf-merger/files"
import {
  noFiles,
  splitReducer,
  type SplitAction,
  type SplitState,
} from "./files"

const facts = (pages: number): FileFacts => ({
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
})
const item = (id: string) => ({
  id,
  file: new Blob(["x"]),
  name: `${id}.pdf`,
  size: 1,
})
const run = (actions: SplitAction[], from: SplitState = noFiles) =>
  actions.reduce(splitReducer, from)
/** Two files, the first with 6 pages and the second with 3, both read. */
const two = run([
  { type: "add", items: [item("a"), item("b")] },
  { type: "opened", id: "a", facts: facts(6) },
  { type: "opened", id: "b", facts: facts(3) },
])
const file = (state: SplitState, id: string) =>
  state.files.find((entry) => entry.id === id)!

describe("adding and reading files", () => {
  it("adds files as being read, with nothing chosen, and shows the first", () => {
    const state = run([{ type: "add", items: [item("a"), item("b")] }])
    expect(state.active).toBe("a")
    expect(state.files.map((entry) => entry.status)).toEqual([
      "reading",
      "reading",
    ])
    expect(file(state, "a").cuts.present).toEqual([])
    expect(file(state, "a").selected.size).toBe(0)
  })

  it("shows nothing when nothing is added to nothing", () => {
    expect(run([{ type: "add", items: [] }])).toEqual(noFiles)
  })

  it("keeps showing the same file when more are added", () => {
    const state = run([{ type: "add", items: [item("c")] }], two)
    expect(state.active).toBe("a")
    expect(state.files).toHaveLength(3)
  })

  it("records what a file was found to hold", () => {
    expect(file(two, "a").status).toBe("ready")
    expect(file(two, "a").facts?.pages).toBe(6)
  })

  it("follows a locked file through a wrong password to the right one", () => {
    let state = run([
      { type: "add", items: [item("a")] },
      { type: "locked", id: "a", wrong: false },
    ])
    expect(file(state, "a").status).toBe("locked")
    state = run(
      [
        { type: "unlocking", id: "a" },
        { type: "locked", id: "a", wrong: true },
      ],
      state
    )
    expect(file(state, "a").wrongPassword).toBe(true)
    state = run([{ type: "opened", id: "a", facts: facts(2) }], state)
    expect(file(state, "a").status).toBe("ready")
    expect(file(state, "a").wrongPassword).toBe(false)
  })

  it("records why a file could not be read, and its bookmarks when it could", () => {
    const state = run(
      [
        { type: "failed", id: "a", message: "Broken." },
        {
          type: "headings",
          id: "b",
          headings: [{ title: "One", page: 0, level: 1 }],
        },
      ],
      two
    )
    expect(file(state, "a").status).toBe("error")
    expect(file(state, "a").error).toBe("Broken.")
    expect(file(state, "b").headings).toHaveLength(1)
  })

  it("ignores news of a file that is not there", () => {
    expect(run([{ type: "opened", id: "zz", facts: facts(1) }], two)).toEqual(
      two
    )
  })
})

describe("removing files and choosing which is shown", () => {
  it("shows the file after the one removed, or the last when none follows", () => {
    expect(run([{ type: "remove", id: "a" }], two).active).toBe("b")
    const onB = run([{ type: "activate", id: "b" }], two)
    expect(run([{ type: "remove", id: "b" }], onB).active).toBe("a")
  })

  it("keeps showing the same file when another is removed", () => {
    expect(run([{ type: "remove", id: "b" }], two).active).toBe("a")
  })

  it("shows nothing once the last file is removed", () => {
    const state = run(
      [
        { type: "remove", id: "a" },
        { type: "remove", id: "b" },
      ],
      two
    )
    expect(state).toEqual(noFiles)
  })

  it("ignores removing or showing a file that is not there", () => {
    expect(run([{ type: "remove", id: "zz" }], two)).toBe(two)
    expect(run([{ type: "activate", id: "zz" }], two)).toBe(two)
  })

  it("clears everything", () => {
    expect(run([{ type: "clear" }], two)).toBe(noFiles)
  })
})

describe("cuts", () => {
  it("are placed in one file, tidied, and can be undone and redone", () => {
    let state = run([{ type: "cut", id: "a", cuts: [3, 1, 1, 9] }], two)
    expect(file(state, "a").cuts.present).toEqual([1, 3])
    expect(file(state, "b").cuts.present).toEqual([])
    state = run([{ type: "undo", id: "a" }], state)
    expect(file(state, "a").cuts.present).toEqual([])
    state = run([{ type: "redo", id: "a" }], state)
    expect(file(state, "a").cuts.present).toEqual([1, 3])
  })

  it("are placed in every file that is ready by one rule", () => {
    const state = run(
      [
        { type: "add", items: [item("c")] },
        {
          type: "cut-all",
          rule: (pages) => Array.from({ length: pages }, (_, at) => at),
        },
      ],
      two
    )
    expect(file(state, "a").cuts.present).toEqual([0, 1, 2, 3, 4])
    expect(file(state, "b").cuts.present).toEqual([0, 1])
    // A file still being read has no pages to cut between.
    expect(file(state, "c").cuts.present).toEqual([])
    expect(file(state, "c").cuts.past).toEqual([])
  })

  it("cannot be placed in a file that has not been read", () => {
    const state = run([
      { type: "add", items: [item("a")] },
      { type: "cut", id: "a", cuts: [0, 1] },
    ])
    expect(file(state, "a").cuts.present).toEqual([])
  })
})

describe("selected pages, names and parts left out", () => {
  it("selects pages in one file, or in every file by one rule", () => {
    let state = run(
      [{ type: "select", id: "b", selected: new Set([0, 2]) }],
      two
    )
    expect([...file(state, "b").selected]).toEqual([0, 2])
    expect(file(state, "a").selected.size).toBe(0)
    state = run(
      [
        { type: "add", items: [item("c")] },
        { type: "select-all", rule: (pages) => new Set([pages - 1]) },
      ],
      state
    )
    expect([...file(state, "a").selected]).toEqual([5])
    expect([...file(state, "b").selected]).toEqual([2])
    expect(file(state, "c").selected.size).toBe(0)
  })

  it("remembers a name typed for a part", () => {
    const state = run(
      [
        { type: "name", id: "a", key: "p0", name: "Cover" },
        { type: "name", id: "a", key: "p2", name: "Rest" },
      ],
      two
    )
    expect(file(state, "a").names).toEqual({ p0: "Cover", p2: "Rest" })
  })

  it("leaves a part out and takes it back", () => {
    let state = run([{ type: "skip", id: "a", key: "p2", skipped: true }], two)
    expect([...file(state, "a").skipped]).toEqual(["p2"])
    state = run([{ type: "skip", id: "a", key: "p2", skipped: false }], state)
    expect(file(state, "a").skipped.size).toBe(0)
  })

  it("unticks bookmarks and ticks them again, one or several at a time", () => {
    let state = run(
      [{ type: "tick", id: "a", pages: [1, 3, 5], ticked: false }],
      two
    )
    expect([...file(state, "a").unticked]).toEqual([1, 3, 5])
    state = run([{ type: "tick", id: "a", pages: [3], ticked: true }], state)
    expect([...file(state, "a").unticked]).toEqual([1, 5])
    expect(file(state, "b").unticked.size).toBe(0)
  })
})
