import { describe, expect, it } from "vitest"
import {
  carried,
  changedBy,
  chosenAfter,
  chosenWith,
  blankSize,
  cutSize,
  edgesFor,
  labelOf,
  LEAST_SHOWN,
  lostIn,
  MOST_PAGES,
  moveTo,
  nudge,
  pagesNamed,
  planOf,
  readLost,
  runsAfter,
  readPageOp,
  SHEETS,
  shownEdges,
  storedEdges,
  whereNow,
  whyNot,
  type PageOp,
  type Plan,
} from "./pages"

/** A plan as a line: the place a page was at, "c2" for a copy of 2, "b" for a blank, "3>" for 3 turned. */
const said = (plan: Plan | null) =>
  plan
    ?.map((page) =>
      "was" in page
        ? `${page.was}${page.by ? ">" : ""}${page.other ? "*" : ""}`
        : "copy" in page
          ? `c${page.copy}`
          : "from" in page
            ? `f${page.page}`
            : "b"
    )
    .join(" ") ?? null

describe("readPageOp", () => {
  it("takes each kind of change, with its pages in order", () => {
    expect(readPageOp({ do: "move", pages: [3, 1], to: 0 })).toEqual({
      do: "move",
      pages: [1, 3],
      to: 0,
    })
    expect(readPageOp({ do: "delete", pages: [0] })).toEqual({
      do: "delete",
      pages: [0],
    })
    expect(readPageOp({ do: "copy", pages: [2, 0], extra: 1 })).toEqual({
      do: "copy",
      pages: [0, 2],
    })
    expect(readPageOp({ do: "turn", pages: [1], by: 270 })).toEqual({
      do: "turn",
      pages: [1],
      by: 270,
    })
    expect(
      readPageOp({ do: "blank", at: 2, size: { ...SHEETS.A4, more: 1 } })
    ).toEqual({ do: "blank", at: 2, size: SHEETS.A4 })
    expect(
      readPageOp({ do: "insert", at: 1, file: "pdf-k1a", count: 3, more: 1 })
    ).toEqual({ do: "insert", at: 1, file: "pdf-k1a", count: 3 })
    const off = { left: 10, top: 0, right: 0.5, bottom: 20 }
    expect(
      readPageOp({ do: "crop", pages: [1, 0], off: { ...off, more: 1 } })
    ).toEqual({ do: "crop", pages: [0, 1], off })
    expect(readPageOp({ do: "whole", pages: [2], off })).toEqual({
      do: "whole",
      pages: [2],
    })
    expect(
      readPageOp({
        do: "size",
        pages: [0],
        size: { ...SHEETS.Letter, more: 1 },
      })
    ).toEqual({ do: "size", pages: [0], size: SHEETS.Letter })
  })

  it("refuses what is not a change to pages", () => {
    for (const bad of [
      null,
      "move",
      {},
      { do: "shuffle", pages: [0] },
      { do: "delete" },
      { do: "delete", pages: [] },
      { do: "delete", pages: [0, 0] },
      { do: "delete", pages: [-1] },
      { do: "delete", pages: [0.5] },
      { do: "delete", pages: ["0"] },
      {
        do: "delete",
        pages: Array.from({ length: MOST_PAGES + 1 }, (_, n) => n),
      },
      { do: "move", pages: [0] },
      { do: "move", pages: [0], to: -1 },
      { do: "turn", pages: [0], by: 45 },
      { do: "turn", pages: [0] },
      { do: "blank", at: 0 },
      { do: "blank", at: 0, size: null },
      { do: "blank", at: -1, size: SHEETS.A4 },
      { do: "blank", at: 0, size: { width: 2, height: 100 } },
      { do: "blank", at: 0, size: { width: 100, height: 20_000 } },
      { do: "blank", at: 0, size: { width: "100", height: 100 } },
      { do: "crop", pages: [0] },
      { do: "crop", pages: [0], off: null },
      { do: "crop", pages: [0], off: { left: 0, top: 0, right: 0, bottom: 0 } },
      {
        do: "crop",
        pages: [0],
        off: { left: -1, top: 0, right: 0, bottom: 0 },
      },
      { do: "crop", pages: [0], off: { left: 1, top: 0, right: 0 } },
      {
        do: "crop",
        pages: [0],
        off: { left: "1", top: 0, right: 0, bottom: 0 },
      },
      {
        do: "crop",
        pages: [0],
        off: { left: 1e9, top: 0, right: 0, bottom: 0 },
      },
      { do: "crop", pages: [], off: { left: 1, top: 0, right: 0, bottom: 0 } },
      { do: "size", pages: [0] },
      { do: "size", pages: [0], size: null },
      { do: "size", pages: [0], size: { width: 1, height: 100 } },
      { do: "size", pages: [0], size: { width: 100, height: "100" } },
      { do: "insert", at: 0, file: "pdf-k1", count: 0 },
      { do: "insert", at: 0, file: "pdf-k1", count: MOST_PAGES + 1 },
      { do: "insert", at: 0, file: "k1", count: 2 },
      { do: "insert", at: 0, file: 7, count: 2 },
      { do: "insert", at: -1, file: "pdf-k1", count: 2 },
      { do: "insert", at: 0, file: "pdf-../x", count: 2 },
    ])
      expect(readPageOp(bad)).toBeNull()
  })
})

describe("readLost", () => {
  it("takes a count of each for every change, or nothing", () => {
    const lost = [{ links: 1, bookmarks: 2, fields: 0 }]
    expect(readLost([{ ...lost[0], more: 1 }], 1)).toEqual(lost)
    expect(readLost(lost, 2)).toBeUndefined()
    expect(readLost(undefined, 1)).toBeUndefined()
    expect(readLost([null], 1)).toBeUndefined()
    expect(readLost([{ links: 1, bookmarks: 2 }], 1)).toBeUndefined()
    expect(
      readLost([{ links: -1, bookmarks: 2, fields: 0 }], 1)
    ).toBeUndefined()
    expect(
      readLost([{ links: 1, bookmarks: 0.5, fields: 0 }], 1)
    ).toBeUndefined()
  })

  it("is added up over changes", () => {
    expect(
      lostIn([
        { label: "a", ops: [], lost: [{ links: 1, bookmarks: 2, fields: 3 }] },
        { label: "b", ops: [] },
        {
          label: "c",
          ops: [],
          lost: [
            { links: 1, bookmarks: 0, fields: 0 },
            { links: 0, bookmarks: 1, fields: 1 },
          ],
        },
      ])
    ).toEqual({ links: 2, bookmarks: 3, fields: 4 })
    expect(lostIn([])).toEqual({ links: 0, bookmarks: 0, fields: 0 })
  })
})

describe("planOf", () => {
  it("moves pages together, in their order, to before another", () => {
    expect(said(planOf(5, { do: "move", pages: [3], to: 0 }))).toBe("3 0 1 2 4")
    expect(said(planOf(5, { do: "move", pages: [0], to: 5 }))).toBe("1 2 3 4 0")
    expect(said(planOf(5, { do: "move", pages: [1, 3], to: 5 }))).toBe(
      "0 2 4 1 3"
    )
    // Before a page that is itself moved: before the next that stays.
    expect(said(planOf(5, { do: "move", pages: [0, 2, 4], to: 2 }))).toBe(
      "1 0 2 4 3"
    )
    expect(said(planOf(5, { do: "move", pages: [4], to: 2 }))).toBe("0 1 4 2 3")
  })

  it("says nothing changes when pages are put where they are", () => {
    expect(planOf(5, { do: "move", pages: [2], to: 2 })).toBeNull()
    expect(planOf(5, { do: "move", pages: [2], to: 3 })).toBeNull()
    expect(planOf(5, { do: "move", pages: [1, 2], to: 1 })).toBeNull()
    expect(planOf(1, { do: "move", pages: [0], to: 1 })).toBeNull()
    expect(planOf(5, { do: "move", pages: [0, 1, 2, 3, 4], to: 3 })).toBeNull()
  })

  it("takes pages out, copies them, turns them and puts a blank between", () => {
    expect(said(planOf(5, { do: "delete", pages: [0, 3] }))).toBe("1 2 4")
    expect(said(planOf(4, { do: "copy", pages: [1] }))).toBe("0 1 c1 2 3")
    expect(said(planOf(4, { do: "copy", pages: [0, 2] }))).toBe("0 1 2 c0 c2 3")
    expect(said(planOf(3, { do: "copy", pages: [2] }))).toBe("0 1 2 c2")
    expect(said(planOf(3, { do: "turn", pages: [0, 2], by: 90 }))).toBe(
      "0> 1 2>"
    )
    expect(said(planOf(2, { do: "blank", at: 0, size: SHEETS.A4 }))).toBe(
      "b 0 1"
    )
    expect(said(planOf(2, { do: "blank", at: 2, size: SHEETS.A4 }))).toBe(
      "0 1 b"
    )
    expect(
      said(planOf(2, { do: "insert", at: 1, file: "pdf-a", count: 3 }))
    ).toBe("0 f0 f1 f2 1")
    expect(
      said(planOf(2, { do: "insert", at: 2, file: "pdf-a", count: 1 }))
    ).toBe("0 1 f0")
  })

  it("leaves pages where they are when they are cut, shown whole or made another size", () => {
    const off = { left: 10, top: 10, right: 10, bottom: 10 }
    expect(said(planOf(3, { do: "crop", pages: [0, 2], off }))).toBe("0* 1 2*")
    expect(said(planOf(3, { do: "whole", pages: [1] }))).toBe("0 1* 2")
    expect(said(planOf(3, { do: "size", pages: [2], size: SHEETS.A4 }))).toBe(
      "0 1 2*"
    )
    expect(planOf(3, { do: "crop", pages: [3], off })).toBeNull()
    // Such a page is not what it was: nothing known of it is carried along.
    const plan = planOf(3, { do: "crop", pages: [1], off })!
    expect(changedBy(3, plan)).toEqual([1])
    expect(carried(["a", "b", "c"], plan, "new")).toEqual(["a", "new", "c"])
    expect(chosenAfter(plan, [1])).toEqual([1])
  })

  it("refuses what the file cannot take, and says why", () => {
    const refused: [number, PageOp, string][] = [
      [3, { do: "delete", pages: [3] }, "That page is not in the file."],
      [
        3,
        { do: "turn", pages: [0, 5], by: 90 },
        "That page is not in the file.",
      ],
      [3, { do: "move", pages: [0], to: 4 }, "That page is not in the file."],
      [
        3,
        { do: "blank", at: 4, size: SHEETS.Letter },
        "That page is not in the file.",
      ],
      [
        2,
        { do: "delete", pages: [0, 1] },
        "A file needs at least one page. Leave one page in it.",
      ],
      [
        MOST_PAGES,
        { do: "copy", pages: [0] },
        "A file can have 20,000 pages at most here.",
      ],
      [
        MOST_PAGES,
        { do: "blank", at: 0, size: SHEETS.A4 },
        "A file can have 20,000 pages at most here.",
      ],
      [
        MOST_PAGES - 2,
        { do: "insert", at: 0, file: "pdf-a", count: 3 },
        "A file can have 20,000 pages at most here.",
      ],
      [
        3,
        { do: "insert", at: 4, file: "pdf-a", count: 3 },
        "That page is not in the file.",
      ],
    ]
    for (const [count, op, why] of refused) {
      expect(whyNot(count, op)).toBe(why)
      expect(planOf(count, op)).toBeNull()
    }
    expect(whyNot(3, { do: "delete", pages: [0, 1] })).toBe("")
    expect(whyNot(3, { do: "copy", pages: [0, 1] })).toBe("")
    expect(whyNot(3, { do: "move", pages: [0], to: 3 })).toBe("")
    expect(whyNot(3, { do: "blank", at: 3, size: SHEETS.A4 })).toBe("")
    expect(whyNot(3, { do: "turn", pages: [2], by: 180 })).toBe("")
    expect(whyNot(3, { do: "insert", at: 3, file: "pdf-a", count: 9 })).toBe("")
  })
})

describe("what follows from a plan", () => {
  it("names the pages that are not what was at their place", () => {
    expect(changedBy(5, planOf(5, { do: "move", pages: [3], to: 1 })!)).toEqual(
      [1, 2, 3]
    )
    expect(changedBy(5, planOf(5, { do: "delete", pages: [2] })!)).toEqual([
      2, 3, 4,
    ])
    expect(changedBy(3, planOf(3, { do: "copy", pages: [0] })!)).toEqual([
      1, 2, 3,
    ])
    expect(
      changedBy(3, planOf(3, { do: "turn", pages: [1], by: 180 })!)
    ).toEqual([1])
    expect(
      changedBy(3, planOf(3, { do: "blank", at: 3, size: SHEETS.A4 })!)
    ).toEqual([3])
  })

  it("says where each page of before is, and carries what was known of it", () => {
    const plan = planOf(4, { do: "move", pages: [3], to: 1 })!
    expect([...whereNow(plan)]).toEqual([
      [0, 0],
      [3, 1],
      [1, 2],
      [2, 3],
    ])
    // A copy is no page of before.
    expect([...whereNow(planOf(2, { do: "copy", pages: [0] })!)]).toEqual([
      [0, 0],
      [1, 2],
    ])
    expect(whereNow(planOf(3, { do: "delete", pages: [1] })!).has(1)).toBe(
      false
    )
    expect(carried(["a", "b", "c", "d"], plan, "new")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ])
    // A page that was turned, copied or made is as good as new.
    expect(
      carried(["a", "b"], planOf(2, { do: "turn", pages: [1], by: 90 })!, "new")
    ).toEqual(["a", "new"])
    expect(
      carried(["a", "b"], planOf(2, { do: "copy", pages: [0] })!, "new")
    ).toEqual(["a", "new", "b"])
    expect(
      carried(["a"], planOf(1, { do: "blank", at: 0, size: SHEETS.A4 })!, "new")
    ).toEqual(["new", "a"])
  })

  it("keeps the pages that were chosen chosen, or chooses what was made", () => {
    expect(
      chosenAfter(planOf(5, { do: "move", pages: [3, 4], to: 0 })!, [3, 4])
    ).toEqual([0, 1])
    expect(
      chosenAfter(planOf(5, { do: "turn", pages: [2], by: 90 })!, [2])
    ).toEqual([2])
    expect(chosenAfter(planOf(5, { do: "delete", pages: [2] })!, [2])).toEqual(
      []
    )
    expect(
      chosenAfter(planOf(5, { do: "copy", pages: [0, 2] })!, [0, 2])
    ).toEqual([3, 4])
    expect(
      chosenAfter(planOf(5, { do: "blank", at: 5, size: SHEETS.A4 })!, [1])
    ).toEqual([5])
    expect(
      chosenAfter(
        planOf(5, { do: "insert", at: 1, file: "pdf-a", count: 2 })!,
        [4]
      )
    ).toEqual([1, 2])
  })
})

describe("runsAfter", () => {
  // Two pages numbered i and ii, then four numbered from 1.
  const starts = [0, 2]
  const runs = (op: PageOp, moved: number[] = []) =>
    runsAfter(starts, planOf(6, op)!, moved)
      .map(({ run, at }) => `${run}@${at}`)
      .join(" ")

  it("lets a run grow and shrink with its pages", () => {
    expect(runs({ do: "delete", pages: [0] })).toBe("0@0 1@1")
    expect(runs({ do: "delete", pages: [3] })).toBe("0@0 1@2")
    expect(runs({ do: "copy", pages: [1] })).toBe("0@0 1@3")
    expect(runs({ do: "blank", at: 3, size: SHEETS.A4 })).toBe("0@0 1@2")
    expect(runs({ do: "turn", pages: [2], by: 90 })).toBe("0@0 1@2")
  })

  it("lets a run go when its last page does", () => {
    expect(runs({ do: "delete", pages: [0, 1] })).toBe("1@0")
    expect(runs({ do: "delete", pages: [2, 3, 4, 5] })).toBe("0@0")
  })

  it("puts a page that is moved, copied or added into the run where it lands", () => {
    // From the second run to the very front: it joins the first.
    expect(runs({ do: "move", pages: [4], to: 0 }, [4])).toBe("0@0 1@3")
    expect(runs({ do: "blank", at: 0, size: SHEETS.A4 })).toBe("0@0 1@3")
    // From the first run to the end: it joins the second.
    expect(runs({ do: "move", pages: [0], to: 6 }, [0])).toBe("0@0 1@1")
    // Both pages of the first run to the end: only the second run is left.
    expect(runs({ do: "move", pages: [0, 1], to: 6 }, [0, 1])).toBe("1@0")
    // Pages of another file join the run they are put into.
    expect(runs({ do: "insert", at: 0, file: "pdf-a", count: 2 })).toBe(
      "0@0 1@4"
    )
    expect(runs({ do: "insert", at: 6, file: "pdf-a", count: 2 })).toBe(
      "0@0 1@2"
    )
    // The page a run began with is moved into the other: the run begins with the next.
    expect(runs({ do: "move", pages: [2], to: 0 }, [2])).toBe("0@0 1@3")
  })

  it("counts pages on from the start in a file with one run", () => {
    expect(
      runsAfter([0], planOf(3, { do: "move", pages: [2], to: 0 })!, [2])
    ).toEqual([{ run: 0, at: 0 }])
    expect(runsAfter([0], [])).toEqual([])
  })
})

describe("cutting a page", () => {
  const size = { width: 400, height: 600 }

  it("says what is left of a page, or that too little would be", () => {
    expect(cutSize(size, { left: 10, top: 20, right: 30, bottom: 40 })).toEqual(
      { width: 360, height: 540 }
    )
    expect(
      cutSize(size, { left: 200, top: 0, right: 200 - LEAST_SHOWN, bottom: 0 })
    ).toEqual({ width: LEAST_SHOWN, height: 600 })
    expect(
      cutSize(size, { left: 200, top: 0, right: 190, bottom: 0 })
    ).toBeNull()
    expect(
      cutSize(size, { left: 0, top: 300, right: 0, bottom: 290 })
    ).toBeNull()
  })

  it("works out what a frame cuts off, keeping it on the page and large enough", () => {
    expect(edgesFor({ x: 50, y: 100, width: 300, height: 400 }, size)).toEqual({
      left: 50,
      top: 100,
      right: 50,
      bottom: 100,
    })
    // A frame that hangs over the page cuts nothing there.
    expect(edgesFor({ x: -20, y: -20, width: 500, height: 700 }, size)).toEqual(
      { left: 0, top: 0, right: 0, bottom: 0 }
    )
    // A frame that is too small, or off the page, is made the least a page may be.
    expect(edgesFor({ x: 100, y: 100, width: 2, height: 2 }, size)).toEqual({
      left: 100,
      top: 100,
      right: 400 - 100 - LEAST_SHOWN,
      bottom: 600 - 100 - LEAST_SHOWN,
    })
    const off = edgesFor({ x: 900, y: 900, width: 10, height: 10 }, size)
    expect(cutSize(size, off)).toEqual({
      width: LEAST_SHOWN,
      height: LEAST_SHOWN,
    })
  })

  it("knows which side of the stored page each edge of the shown page is", () => {
    const off = { left: 1, top: 2, right: 3, bottom: 4 }
    expect(storedEdges(off, 0)).toEqual({
      left: 1,
      top: 2,
      right: 3,
      bottom: 4,
    })
    // Turned a quarter to the right, the stored page's left edge is at the top.
    expect(storedEdges(off, 90)).toEqual({
      left: 2,
      top: 3,
      right: 4,
      bottom: 1,
    })
    expect(storedEdges(off, 180)).toEqual({
      left: 3,
      top: 4,
      right: 1,
      bottom: 2,
    })
    expect(storedEdges(off, 270)).toEqual({
      left: 4,
      top: 1,
      right: 2,
      bottom: 3,
    })
    expect(storedEdges(off, -90)).toEqual(storedEdges(off, 270))
    expect(storedEdges(off, 450)).toEqual(storedEdges(off, 90))
    // And back.
    for (const turn of [0, 90, 180, 270, -90, 720])
      expect(shownEdges(storedEdges(off, turn), turn)).toEqual(off)
  })
})

describe("what a change is called", () => {
  it("names pages as people count them", () => {
    expect(pagesNamed([0])).toBe("page 1")
    expect(pagesNamed([1, 2, 3])).toBe("pages 2 to 4")
    expect(pagesNamed([1, 3])).toBe("2 pages")
    expect(labelOf({ do: "move", pages: [2], to: 0 })).toBe("Move page 3")
    expect(labelOf({ do: "delete", pages: [0, 1] })).toBe("Delete pages 1 to 2")
    expect(labelOf({ do: "copy", pages: [0, 2, 4] })).toBe("Duplicate 3 pages")
    expect(labelOf({ do: "turn", pages: [4], by: 90 })).toBe("Turn page 5")
    expect(labelOf({ do: "blank", at: 0, size: SHEETS.A4 })).toBe(
      "Add a blank page"
    )
    const off = { left: 1, top: 0, right: 0, bottom: 0 }
    expect(labelOf({ do: "crop", pages: [0, 1], off })).toBe(
      "Crop pages 1 to 2"
    )
    expect(labelOf({ do: "whole", pages: [2] })).toBe(
      "Show the whole of page 3"
    )
    expect(labelOf({ do: "size", pages: [0, 2], size: SHEETS.A4 })).toBe(
      "Resize 2 pages"
    )
    expect(labelOf({ do: "insert", at: 0, file: "pdf-a", count: 1 })).toBe(
      "Add a page from a file"
    )
    expect(labelOf({ do: "insert", at: 0, file: "pdf-a", count: 1200 })).toBe(
      "Add 1,200 pages from a file"
    )
  })
})

describe("nudge", () => {
  it("moves the chosen pages one place, together", () => {
    expect(nudge(5, [2], -1)).toEqual({ do: "move", pages: [2], to: 1 })
    expect(said(planOf(5, nudge(5, [2], -1)!))).toBe("0 2 1 3 4")
    expect(said(planOf(5, nudge(5, [2], 1)!))).toBe("0 1 3 2 4")
    // Pages that lie apart come together on the way.
    expect(said(planOf(5, nudge(5, [3, 1], -1)!))).toBe("1 3 0 2 4")
    expect(said(planOf(5, nudge(5, [1, 3], 1)!))).toBe("0 2 4 1 3")
  })

  it("stops at the edges, and with nothing chosen", () => {
    expect(nudge(5, [0], -1)).toBeNull()
    expect(nudge(5, [4], 1)).toBeNull()
    expect(nudge(5, [0, 1], -1)).toBeNull()
    expect(nudge(5, [], 1)).toBeNull()
    // Apart and at the edge, they still come together.
    expect(said(planOf(5, nudge(5, [0, 2], -1)!))).toBe("0 2 1 3 4")
    expect(said(planOf(5, nudge(5, [2, 4], 1)!))).toBe("0 1 3 2 4")
  })
})

describe("moveTo", () => {
  it("makes the first of the chosen pages the page at a place", () => {
    expect(said(planOf(5, moveTo(5, [3], 0)!))).toBe("3 0 1 2 4")
    expect(said(planOf(5, moveTo(5, [0], 4)!))).toBe("1 2 3 4 0")
    expect(said(planOf(5, moveTo(5, [0], 99)!))).toBe("1 2 3 4 0")
    expect(said(planOf(5, moveTo(5, [4, 1], 1)!))).toBe("0 1 4 2 3")
    expect(said(planOf(5, moveTo(5, [1, 4], 2)!))).toBe("0 2 1 4 3")
    expect(said(planOf(5, moveTo(5, [2], -3)!))).toBe("2 0 1 3 4")
  })

  it("is nothing when they are there already, or none is chosen", () => {
    expect(moveTo(5, [2], 2)).toBeNull()
    expect(moveTo(5, [3, 4], 3)).toBeNull()
    expect(moveTo(5, [], 0)).toBeNull()
  })
})

describe("blankSize", () => {
  it("is the size of the page before, or of the first, or A4 in a file without pages", () => {
    const sizes = [
      { width: 100, height: 200 },
      { width: 300, height: 400 },
    ]
    expect(blankSize(sizes, 0)).toEqual(sizes[0])
    expect(blankSize(sizes, 1)).toEqual(sizes[0])
    expect(blankSize(sizes, 2)).toEqual(sizes[1])
    expect(blankSize([], 0)).toEqual(SHEETS.A4)
  })
})

describe("chosenWith", () => {
  it("chooses one, adds or takes one, or all from the page pressed before", () => {
    expect(chosenWith([1, 2], 4, "only", 1)).toEqual([4])
    expect(chosenWith([1, 4], 2, "also", 1)).toEqual([1, 2, 4])
    expect(chosenWith([1, 2, 4], 2, "also", 1)).toEqual([1, 4])
    expect(chosenWith([1], 4, "through", 1)).toEqual([1, 2, 3, 4])
    expect(chosenWith([4], 1, "through", 4)).toEqual([1, 2, 3, 4])
    expect(chosenWith([], 3, "through", null)).toEqual([3])
  })
})
