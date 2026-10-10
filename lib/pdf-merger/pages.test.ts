import { describe, expect, it } from "vitest"
import {
  filesReducer,
  noFiles,
  type FileFacts,
  type FilesAction,
} from "./files"
import {
  alternatePages,
  appendFile,
  derivePages,
  dropFile,
  duplicatePages,
  insertBlank,
  keysBetween,
  movePages,
  nudgePages,
  record,
  redo,
  removePages,
  reversePages,
  rewrite,
  rotatePages,
  startHistory,
  undo,
  type PageEntry,
} from "./pages"

/** Pages "a" to "f" of one file. */
const list: PageEntry[] = ["a", "b", "c", "d", "e", "f"].map((key, page) => ({
  key,
  kind: "page",
  file: "x",
  page,
  rotation: 0,
}))
const keys = (entries: readonly PageEntry[]) =>
  entries.map((entry) => entry.key).join("")
const set = (text: string) => new Set(text.split(""))

describe("derivePages", () => {
  const facts = (pages: number) => ({ pages }) as FileFacts
  const file = (id: string) => ({
    id,
    file: new Blob([id]),
    name: `${id}.pdf`,
    size: 1,
    modified: 0,
  })
  const files = (
    [
      { type: "add", items: [file("a"), file("b"), file("c"), file("d")] },
      { type: "opened", id: "a", facts: facts(3) },
      { type: "opened", id: "b", facts: facts(4) },
      { type: "locked", id: "c", wrong: false },
      { type: "opened", id: "d", facts: facts(2) },
      { type: "range", id: "a", text: "3, 1, 1" },
      { type: "rotate", id: "a", direction: "right" },
      { type: "range", id: "d", text: "9" },
    ] as FilesAction[]
  ).reduce(filesReducer, noFiles).files

  it("lists every ready file's chosen pages in order, with the file's turn", () => {
    expect(derivePages(files)).toEqual([
      { key: "a/0", kind: "page", file: "a", page: 2, rotation: 90 },
      { key: "a/1", kind: "page", file: "a", page: 0, rotation: 90 },
      { key: "a/2", kind: "page", file: "a", page: 0, rotation: 90 },
      { key: "b/0", kind: "page", file: "b", page: 0, rotation: 0 },
      { key: "b/1", kind: "page", file: "b", page: 1, rotation: 0 },
      { key: "b/2", kind: "page", file: "b", page: 2, rotation: 0 },
      { key: "b/3", kind: "page", file: "b", page: 3, rotation: 0 },
    ])
  })

  it("has nothing for an empty list", () => {
    expect(derivePages([])).toEqual([])
    expect(derivePages([], true)).toEqual([])
  })

  it("adds a blank page after an odd file for double-sided printing, but not after the last", () => {
    const sized = (pages: number) =>
      ({ pages, width: 300, height: 400 }) as FileFacts
    const list = (
      [
        { type: "add", items: [file("a"), file("b"), file("c"), file("d")] },
        { type: "opened", id: "a", facts: sized(3) },
        { type: "opened", id: "b", facts: sized(2) },
        { type: "opened", id: "c", facts: sized(1) },
        { type: "opened", id: "d", facts: sized(1) },
        { type: "rotate", id: "c", direction: "right" },
      ] as FilesAction[]
    ).reduce(filesReducer, noFiles).files
    const shape = (entries: PageEntry[]) =>
      entries.map((entry) =>
        entry.kind === "blank"
          ? `blank ${entry.width}x${entry.height}`
          : entry.key
      )
    expect(shape(derivePages(list, true))).toEqual([
      "a/0",
      "a/1",
      "a/2",
      "blank 300x400",
      "b/0",
      "b/1",
      "c/0",
      // The third file is turned on its side, and so is its blank page.
      "blank 400x300",
      "d/0",
    ])
    expect(derivePages(list, true)[3].key).toBe("a/blank")
    expect(shape(derivePages(list))).toEqual([
      "a/0",
      "a/1",
      "a/2",
      "b/0",
      "b/1",
      "c/0",
      "d/0",
    ])
    // An even last file leaves nothing to take away.
    expect(shape(derivePages(list.slice(0, 2), true))).toEqual([
      "a/0",
      "a/1",
      "a/2",
      "blank 300x400",
      "b/0",
      "b/1",
    ])
  })
})

describe("movePages", () => {
  it("puts one page before another", () => {
    expect(keys(movePages(list, set("e"), 1))).toBe("aebcdf")
    expect(keys(movePages(list, set("b"), 4))).toBe("acdbef")
    expect(keys(movePages(list, set("a"), 6))).toBe("bcdefa")
    expect(keys(movePages(list, set("f"), 0))).toBe("fabcde")
  })

  it("moves scattered pages together, in their own order", () => {
    expect(keys(movePages(list, set("bdf"), 0))).toBe("bdface")
    expect(keys(movePages(list, set("fa"), 3))).toBe("bcafde")
    expect(keys(movePages(list, set("ace"), 6))).toBe("bdface")
  })

  it("counts the gap among the pages that stay", () => {
    // Dropping "b" and "c" before "d": nothing changes.
    expect(keys(movePages(list, set("bc"), 3))).toBe("abcdef")
    // Dropping them onto themselves changes nothing either.
    expect(keys(movePages(list, set("bc"), 2))).toBe("abcdef")
  })

  it("keeps a move inside the list and ignores an empty selection", () => {
    expect(keys(movePages(list, set("c"), -9))).toBe("cabdef")
    expect(keys(movePages(list, set("c"), 99))).toBe("abdefc")
    expect(movePages(list, new Set(), 2)).toEqual(list)
    expect(movePages(list, set("z"), 2)).toEqual(list)
  })
})

describe("nudgePages", () => {
  it("steps a page over its neighbour", () => {
    expect(keys(nudgePages(list, set("c"), "earlier"))).toBe("acbdef")
    expect(keys(nudgePages(list, set("c"), "later"))).toBe("abdcef")
  })

  it("stops at the ends", () => {
    expect(keys(nudgePages(list, set("a"), "earlier"))).toBe("abcdef")
    expect(keys(nudgePages(list, set("f"), "later"))).toBe("abcdef")
  })

  it("moves several pages as one block, closing any gaps between them", () => {
    expect(keys(nudgePages(list, set("cd"), "earlier"))).toBe("acdbef")
    expect(keys(nudgePages(list, set("cd"), "later"))).toBe("abecdf")
    expect(keys(nudgePages(list, set("be"), "earlier"))).toBe("beacdf")
    expect(keys(nudgePages(list, set("be"), "later"))).toBe("acdfbe")
    expect(nudgePages(list, new Set(), "later")).toEqual(list)
  })
})

describe("turning, removing and copying", () => {
  it("turns only the chosen pages, a quarter at a time", () => {
    let turned = rotatePages(list, set("bc"), "right")
    expect(
      turned.map((entry) => entry.kind === "page" && entry.rotation)
    ).toEqual([0, 90, 90, 0, 0, 0])
    turned = rotatePages(turned, set("c"), "left")
    turned = rotatePages(turned, set("a"), "left")
    expect(
      turned.map((entry) => entry.kind === "page" && entry.rotation)
    ).toEqual([270, 90, 0, 0, 0, 0])
    expect(list[1]).toMatchObject({ rotation: 0 })
  })

  it("leaves a blank page as it is when turned", () => {
    const withBlank = insertBlank(list, "a", { width: 10, height: 20 }, "blank")
    expect(rotatePages(withBlank, set("blank"), "right")[1]).toEqual({
      key: "blank",
      kind: "blank",
      width: 10,
      height: 20,
    })
  })

  it("removes the chosen pages", () => {
    expect(keys(removePages(list, set("ace")))).toBe("bdf")
    expect(keys(removePages(list, set("abcdef")))).toBe("")
  })

  it("puts a copy after each chosen page, with a key of its own", () => {
    let made = 0
    const copied = duplicatePages(list, set("bd"), () => `n${++made}`)
    expect(copied.map((entry) => entry.key)).toEqual([
      "a",
      "b",
      "n1",
      "c",
      "d",
      "n2",
      "e",
      "f",
    ])
    expect(copied[2]).toMatchObject({ kind: "page", file: "x", page: 1 })
  })

  it("reverses the chosen pages where they stand", () => {
    expect(keys(reversePages(list, set("abcdef")))).toBe("fedcba")
    expect(keys(reversePages(list, set("bce")))).toBe("aecdbf")
    expect(keys(reversePages(list, set("c")))).toBe("abcdef")
  })
})

describe("blank pages and files", () => {
  it("adds a blank page after a page, or at the start", () => {
    const size = { width: 300, height: 400 }
    expect(keys(insertBlank(list, "c", size, "_"))).toBe("abc_def")
    expect(keys(insertBlank(list, "f", size, "_"))).toBe("abcdef_")
    expect(keys(insertBlank(list, null, size, "_"))).toBe("_abcdef")
    expect(insertBlank([], null, size, "_")).toEqual([
      { key: "_", kind: "blank", width: 300, height: 400 },
    ])
    // A key that is not there puts the page at the start.
    expect(keys(insertBlank(list, "z", size, "_"))).toBe("_abcdef")
  })

  it("adds a new file's pages at the end, and takes a removed file's away", () => {
    const more = appendFile(list.slice(0, 2), { id: "y", pages: 2 })
    expect(more.slice(2)).toEqual([
      { key: "y/0", kind: "page", file: "y", page: 0, rotation: 0 },
      { key: "y/1", kind: "page", file: "y", page: 1, rotation: 0 },
    ])
    const withBlank = insertBlank(more, "a", { width: 1, height: 1 }, "_")
    expect(keys(dropFile(withBlank, "x"))).toBe("_y/0y/1")
    expect(keys(dropFile(withBlank, "none"))).toBe("a_by/0y/1")
  })
})

describe("alternatePages", () => {
  const group = (text: string) =>
    text.split("").map((key): PageEntry => ({
      key,
      kind: "page",
      file: "x",
      page: 0,
      rotation: 0,
    }))

  it("deals pages out in turn", () => {
    expect(keys(alternatePages([group("135"), group("246")], false))).toBe(
      "123456"
    )
    expect(
      keys(alternatePages([group("ad"), group("be"), group("cf")], false))
    ).toBe("abcdef")
  })

  it("carries on with the longer file when one runs out", () => {
    expect(keys(alternatePages([group("1357"), group("2")], false))).toBe(
      "12357"
    )
    expect(keys(alternatePages([group("1"), group("2468")], false))).toBe(
      "12468"
    )
  })

  it("reads the last file from its end, for backs scanned in reverse", () => {
    expect(keys(alternatePages([group("135"), group("642")], true))).toBe(
      "123456"
    )
    // One file alone has nothing to alternate with.
    expect(keys(alternatePages([group("abc")], true))).toBe("abc")
    expect(alternatePages([], true)).toEqual([])
  })
})

describe("undo and redo", () => {
  it("steps back and forward through what was done", () => {
    let history = startHistory("a")
    history = record(history, "b")
    history = record(history, "c")
    expect(history).toEqual({ past: ["a", "b"], present: "c", future: [] })
    history = undo(history)
    expect(history).toEqual({ past: ["a"], present: "b", future: ["c"] })
    history = undo(history)
    expect(history.present).toBe("a")
    expect(undo(history)).toBe(history)
    history = redo(history)
    history = redo(history)
    expect(history).toEqual({ past: ["a", "b"], present: "c", future: [] })
    expect(redo(history)).toBe(history)
  })

  it("forgets what was undone once something new is done", () => {
    let history = record(record(startHistory(1), 2), 3)
    history = record(undo(history), 9)
    expect(history).toEqual({ past: [1, 2], present: 9, future: [] })
  })

  it("applies an outside change to every remembered step", () => {
    const history = undo(record(record(startHistory(1), 2), 3))
    expect(rewrite(history, (value) => value * 10)).toEqual({
      past: [10],
      present: 20,
      future: [30],
    })
  })

  it("keeps the last hundred steps", () => {
    let history = startHistory(0)
    for (let step = 1; step <= 150; step++) history = record(history, step)
    expect(history.past).toHaveLength(100)
    expect(history.past[0]).toBe(50)
    expect(history.present).toBe(150)
  })
})

describe("keysBetween", () => {
  it("gives every page between two, whichever comes first", () => {
    expect(keysBetween(list, "b", "e")).toEqual(["b", "c", "d", "e"])
    expect(keysBetween(list, "e", "b")).toEqual(["b", "c", "d", "e"])
    expect(keysBetween(list, "c", "c")).toEqual(["c"])
  })

  it("starts afresh when the place it began has gone", () => {
    expect(keysBetween(list, "z", "d")).toEqual(["d"])
    expect(keysBetween(list, "b", "z")).toEqual([])
    expect(keysBetween(list, "z", "y")).toEqual([])
  })
})
