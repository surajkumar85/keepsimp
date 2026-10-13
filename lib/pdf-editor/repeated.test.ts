import { describe, expect, it } from "vitest"
import { textHeight, type PictureObject, type TextObject } from "./objects"
import {
  defaultLine,
  defaultWatermark,
  lineObject,
  lineProblem,
  markObject,
  markProblem,
  repeatedChange,
  SPOTS,
  wordsOn,
  type RepeatedLine,
} from "./repeated"

const page = { width: 400, height: 600 }
const facts = { nth: 0, pages: 12, date: "13 October 2026", name: "plan.pdf" }

describe("wordsOn", () => {
  it("writes the page's number, the count, the date and the file's name", () => {
    const line: RepeatedLine = {
      ...defaultLine,
      text: "{name}, {date}: page {page} of {pages}",
    }
    expect(wordsOn(line, facts)).toBe("plan.pdf, 13 October 2026: page 1 of 12")
    expect(wordsOn({ ...line, from: 5 }, { ...facts, nth: 2 })).toBe(
      "plan.pdf, 13 October 2026: page 7 of 12"
    )
    // Twice in a line is written twice.
    expect(wordsOn({ ...line, text: "{page}/{page}" }, facts)).toBe("1/1")
    expect(wordsOn({ ...line, text: "Private" }, facts)).toBe("Private")
  })

  it("writes a number that runs on, with its figures", () => {
    const bates: RepeatedLine = {
      ...defaultLine,
      text: "ACME-{number}",
      first: 120,
      figures: 6,
    }
    expect(wordsOn(bates, facts)).toBe("ACME-000120")
    expect(wordsOn(bates, { ...facts, nth: 881 })).toBe("ACME-001001")
    // A number longer than its figures is written whole.
    expect(wordsOn({ ...bates, figures: 2 }, { ...facts, nth: 881 })).toBe(
      "ACME-1001"
    )
    // Figures are kept to what can be read.
    expect(wordsOn({ ...bates, figures: 0 }, facts)).toBe("ACME-120")
    expect(wordsOn({ ...bates, figures: 99, first: 1 }, facts)).toBe(
      "ACME-000000000001"
    )
  })
})

describe("lineObject", () => {
  it("lies between the margins, at the top or the foot, set to its side", () => {
    const top = lineObject(
      { ...defaultLine, spot: "top-left", margin: 30, size: 10 },
      "a",
      page,
      "Head"
    )
    expect(top.box).toEqual({
      x: 30,
      y: 30,
      width: 340,
      height: textHeight(1, 10),
    })
    expect(top.align).toBe("left")
    expect(top.text).toBe("Head")
    expect(top.lines).toEqual(["Head"])
    const foot = lineObject(
      { ...defaultLine, spot: "bottom-right", margin: 30, size: 10 },
      "b",
      page,
      "7"
    )
    expect(foot.box.y).toBeCloseTo(600 - 30 - textHeight(1, 10))
    expect(foot.align).toBe("right")
    expect(
      SPOTS.map(
        (spot) => lineObject({ ...defaultLine, spot }, "c", page, "x").align
      )
    ).toEqual(["left", "centre", "right", "left", "centre", "right"])
  })

  it("keeps its size and its margins within bounds", () => {
    expect(lineObject({ ...defaultLine, size: 1 }, "a", page, "x").size).toBe(4)
    expect(lineObject({ ...defaultLine, size: 999 }, "a", page, "x").size).toBe(
      288
    )
    // On a small page a margin takes a third at most; never less than nothing.
    const small = { width: 90, height: 60 }
    const tight = lineObject(
      { ...defaultLine, margin: 500, spot: "top-left" },
      "a",
      small,
      "x"
    )
    expect(tight.box.x).toBe(20)
    expect(tight.box.width).toBe(50)
    expect(
      lineObject(
        { ...defaultLine, margin: -5, spot: "top-left" },
        "a",
        page,
        "x"
      ).box.x
    ).toBe(0)
    // And never more than 200 points, however large the page.
    expect(
      lineObject(
        { ...defaultLine, margin: 500, spot: "top-left" },
        "a",
        { width: 900, height: 900 },
        "x"
      ).box.x
    ).toBe(200)
  })

  it("says what is wrong with a line", () => {
    expect(lineProblem(defaultLine)).toBe("")
    expect(lineProblem({ ...defaultLine, text: "  " })).toBe(
      "Type what is to be written."
    )
    expect(lineProblem({ ...defaultLine, text: "x".repeat(201) })).toBe(
      "That is longer than 200 letters."
    )
  })
})

describe("markObject", () => {
  it("lays words across the middle of the page, from corner to corner", () => {
    const mark = markObject(defaultWatermark, "w", page) as TextObject
    const along = Math.hypot(400, 600) * 0.7
    expect(mark.kind).toBe("text")
    expect(mark.text).toBe("DRAFT")
    expect(mark.box.width).toBeCloseTo(along)
    // In the middle.
    expect(mark.box.x + mark.box.width / 2).toBeCloseTo(200)
    expect(mark.box.y + mark.box.height / 2).toBeCloseTo(300)
    // Up towards the right: 56.3 degrees against the clock.
    expect(mark.rotation).toBeCloseTo(360 - 56.31, 1)
    expect(mark.opacity).toBe(0.2)
    expect(mark.align).toBe("centre")
    // Five bold letters over that length.
    expect(mark.size).toBeCloseTo(along / (0.67 * 5))
    expect(mark.box.height).toBeCloseTo(textHeight(1, mark.size))
  })

  it("lays them level when asked, and keeps their size and look within bounds", () => {
    const level = markObject(
      {
        ...defaultWatermark,
        slanted: false,
        bold: false,
        text: " Confidential ",
      },
      "w",
      page
    ) as TextObject
    expect(level.rotation).toBe(0)
    expect(level.text).toBe("Confidential")
    expect(level.box.width).toBeCloseTo(280)
    expect(level.size).toBeCloseTo(280 / (0.62 * 12))
    expect(
      (markObject({ ...defaultWatermark, text: "A" }, "w", page) as TextObject)
        .size
    ).toBe(288)
    const faint = markObject(
      { ...defaultWatermark, opacity: 0, share: 5, text: "x".repeat(60) },
      "w",
      { width: 30, height: 30 }
    ) as TextObject
    expect(faint.opacity).toBe(0.05)
    expect(faint.size).toBe(4)
    expect(
      markObject({ ...defaultWatermark, opacity: 3, share: 0 }, "w", page)
        .opacity
    ).toBe(1)
  })

  it("lays a picture in the middle, as large as its share of the page allows", () => {
    const wide = markObject(
      {
        ...defaultWatermark,
        share: 0.5,
        picture: { name: "p1", size: { width: 800, height: 200 } },
      },
      "w",
      page
    ) as PictureObject
    expect(wide.kind).toBe("picture")
    expect(wide.picture).toBe("p1")
    expect(wide.box).toEqual({ x: 100, y: 275, width: 200, height: 50 })
    expect(wide.opacity).toBe(0.2)
    // A tall picture is held by the page's height.
    const tall = markObject(
      {
        ...defaultWatermark,
        share: 0.5,
        picture: { name: "p2", size: { width: 100, height: 1000 } },
      },
      "w",
      page
    )
    expect(tall.box).toEqual({ x: 185, y: 150, width: 30, height: 300 })
  })

  it("says what is wrong with a watermark", () => {
    expect(markProblem(defaultWatermark)).toBe("")
    expect(markProblem({ ...defaultWatermark, text: " " })).toBe(
      "Type the words of the watermark."
    )
    expect(markProblem({ ...defaultWatermark, text: "x".repeat(61) })).toBe(
      "A watermark is 60 letters at most."
    )
    // A picture needs no words.
    expect(
      markProblem({
        ...defaultWatermark,
        text: "",
        picture: { name: "p", size: { width: 1, height: 1 } },
      })
    ).toBe("")
  })
})

describe("repeatedChange", () => {
  const sizes = [page, { width: 600, height: 400 }, page, page]
  let made = 0
  const newId = () => `id${made++}`

  it("adds a line to each of the pages, numbered in the order they are given", () => {
    made = 0
    const change = repeatedChange(
      { line: { ...defaultLine, text: "{page} of {pages}", from: 1 } },
      [1, 3],
      sizes,
      { date: "today", name: "f.pdf" },
      newId
    )
    expect(change.label).toBe("Write on 2 pages")
    expect(change.ops.map((op) => [op.do, op.page])).toEqual([
      ["add", 1],
      ["add", 3],
    ])
    const [first, second] = change.ops.map(
      (op) => (op as { object: TextObject }).object
    )
    expect([first.id, second.id]).toEqual(["id0", "id1"])
    expect([first.text, second.text]).toEqual(["1 of 4", "2 of 4"])
    // Each lies on its own page's size.
    expect(first.box.width).toBe(600 - 56)
    expect(second.box.width).toBe(400 - 56)
    expect(
      repeatedChange({ line: defaultLine }, [0], sizes, facts, newId).label
    ).toBe("Write on 1 page")
  })

  it("adds a watermark to each of the pages", () => {
    const change = repeatedChange(
      { mark: defaultWatermark },
      [0, 1, 2],
      sizes,
      facts,
      newId
    )
    expect(change.label).toBe("Add a watermark to 3 pages")
    expect(change.ops).toHaveLength(3)
    const lying = (change.ops[1] as { object: TextObject }).object
    // On a page that lies on its side it rises less steeply.
    expect(lying.rotation).toBeCloseTo(360 - 33.69, 1)
    expect(
      repeatedChange({ mark: defaultWatermark }, [2], sizes, facts, newId).label
    ).toBe("Add a watermark to 1 page")
  })
})
