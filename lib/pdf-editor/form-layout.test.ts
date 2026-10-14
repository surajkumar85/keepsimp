import { describe, expect, it } from "vitest"
import {
  aligned,
  EDGE_NAMES,
  EDGES,
  nudged,
  readingOrder,
  sized,
  spread,
  type Placed,
} from "./form-layout"

const at = (id: string, x: number, y: number, width = 100, height = 20) => ({
  id,
  box: { x, y, width, height },
})
const boxes = (items: Placed[]) =>
  Object.fromEntries(items.map(({ id, box }) => [id, box]))

describe("aligned", () => {
  const items = [
    at("a", 10, 10),
    at("b", 40, 60, 60),
    at("c", 25, 100, 120, 30),
  ]

  it("lines fields up along each edge and middle of the space they take", () => {
    expect(boxes(aligned(items, "left"))).toEqual({
      b: { x: 10, y: 60, width: 60, height: 20 },
      c: { x: 10, y: 100, width: 120, height: 30 },
    })
    // The rightmost edge is 25 + 120 = 145.
    expect(boxes(aligned(items, "right"))).toEqual({
      a: { x: 45, y: 10, width: 100, height: 20 },
      b: { x: 85, y: 60, width: 60, height: 20 },
    })
    expect(boxes(aligned(items, "centre"))).toEqual({
      a: { x: 27.5, y: 10, width: 100, height: 20 },
      b: { x: 47.5, y: 60, width: 60, height: 20 },
      c: { x: 17.5, y: 100, width: 120, height: 30 },
    })
    expect(boxes(aligned(items, "top"))).toEqual({
      b: { x: 40, y: 10, width: 60, height: 20 },
      c: { x: 25, y: 10, width: 120, height: 30 },
    })
    expect(boxes(aligned(items, "bottom"))).toEqual({
      a: { x: 10, y: 110, width: 100, height: 20 },
      b: { x: 40, y: 110, width: 60, height: 20 },
    })
    expect(boxes(aligned(items, "middle"))).toEqual({
      a: { x: 10, y: 60, width: 100, height: 20 },
      c: { x: 25, y: 55, width: 120, height: 30 },
    })
  })

  it("moves nothing for one field, or for fields already in line", () => {
    expect(aligned([items[0]], "left")).toEqual([])
    expect(aligned([at("a", 5, 0), at("b", 5, 50)], "left")).toEqual([])
    for (const edge of EDGES) expect(EDGE_NAMES[edge]).toMatch(/^Align /)
  })
})

describe("spread", () => {
  it("keeps the first and the last, and makes the room between the others equal", () => {
    // Across: 0..100, 130..230, 400..500; 500 - 300 taken = 200 of room, 100 each.
    const items = [at("c", 400, 0), at("a", 0, 0), at("b", 130, 0)]
    expect(boxes(spread(items, "across"))).toEqual({
      b: { x: 200, y: 0, width: 100, height: 20 },
    })
    // Down, with fields of other heights.
    const down = [
      at("a", 0, 0, 50, 10),
      at("b", 0, 15, 50, 30),
      at("c", 0, 100, 50, 20),
    ]
    expect(boxes(spread(down, "down"))).toEqual({
      b: { x: 0, y: 40, width: 50, height: 30 },
    })
  })

  it("needs three fields, and moves none that are evenly spaced already", () => {
    expect(spread([at("a", 0, 0), at("b", 300, 0)], "across")).toEqual([])
    expect(
      spread([at("a", 0, 0), at("b", 150, 0), at("c", 300, 0)], "across")
    ).toEqual([])
    // Two that start at one place keep the order of their names.
    expect(
      spread([at("b", 0, 0), at("a", 0, 0), at("c", 300, 0)], "across")
    ).toEqual([at("b", 150, 0)])
  })
})

describe("sized", () => {
  const items = [at("a", 0, 0, 100, 20), at("b", 50, 50, 60, 40)]

  it("gives fields the width, the height or both of one of them", () => {
    expect(sized(items, "a", "width")).toEqual([at("b", 50, 50, 100, 40)])
    expect(sized(items, "a", "height")).toEqual([at("b", 50, 50, 60, 20)])
    expect(sized(items, "b", "both")).toEqual([at("a", 0, 0, 60, 40)])
  })

  it("changes nothing when the model is not among them", () => {
    expect(sized(items, "z", "both")).toEqual([])
  })
})

describe("readingOrder", () => {
  it("reads rows from the top down and each row from the left", () => {
    expect(
      readingOrder([
        at("second-row-right", 200, 52),
        at("first-row-right", 200, 12),
        at("first-row-left", 10, 10),
        at("second-row-left", 10, 50),
        at("alone", 50, 200, 100, 60),
      ])
    ).toEqual([
      "first-row-left",
      "first-row-right",
      "second-row-left",
      "second-row-right",
      "alone",
    ])
    expect(readingOrder([])).toEqual([])
    // Two at one height are read from the left.
    expect(readingOrder([at("b", 50, 10), at("a", 5, 10)])).toEqual(["a", "b"])
  })

  it("takes a field whose middle is below the first of a row for the next row", () => {
    expect(
      readingOrder([at("high", 300, 0, 50, 20), at("low", 0, 15, 50, 20)])
    ).toEqual(["high", "low"])
  })
})

describe("nudged", () => {
  it("moves an entry a place earlier or later, and not past an end", () => {
    expect(nudged(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"])
    expect(nudged(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"])
    expect(nudged(["a", "b"], "a", -1)).toEqual(["a", "b"])
    expect(nudged(["a", "b"], "b", 1)).toEqual(["a", "b"])
    expect(nudged(["a"], "z", 1)).toEqual(["a"])
  })
})
