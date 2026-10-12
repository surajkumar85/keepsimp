import { describe, expect, it } from "vitest"
import type { Quad } from "@/lib/pdf-reader/text"
import {
  boundsOfQuads,
  commentHolds,
  commentName,
  countComments,
  insideQuad,
  letterAt,
  noteBox,
  readCommentOp,
  selectWords,
  wordsUnder,
  type Comment,
  type LetterLine,
} from "./comments"
import { MOST_LETTERS, MOST_POINTS } from "./objects"

/** A line of letters ten points wide and twelve tall, starting at a point. */
function line(words: string, x: number, y: number): LetterLine {
  const letters = [...words]
  return {
    letters,
    quads: letters.map((_, at): Quad => [
      x + at * 10,
      y,
      x + at * 10 + 10,
      y,
      x + at * 10,
      y + 12,
      x + at * 10 + 10,
      y + 12,
    ]),
  }
}

/** The same line standing on end: it runs down the page from a point. */
function upright(words: string, x: number, y: number): LetterLine {
  const letters = [...words]
  return {
    letters,
    quads: letters.map((_, at): Quad => [
      x,
      y + at * 10,
      x,
      y + at * 10 + 10,
      x - 12,
      y + at * 10,
      x - 12,
      y + at * 10 + 10,
    ]),
  }
}

const page = [
  line("The quick brown fox", 100, 100),
  line("jumps over the lazy", 100, 120),
  line("dog.", 100, 140),
]

/** Which letters a mark covers, as the columns its boxes start and end at. */
const spans = (quads: Quad[]) =>
  quads.map((quad) => [(quad[0] - 100) / 10, (quad[2] - 100) / 10, quad[1]])

describe("finding the letter at a point", () => {
  it("finds the letter under a point, and says the point was on the line", () => {
    expect(letterAt(page, { x: 145, y: 105 })).toEqual({
      line: 0,
      at: 4,
      on: true,
    })
  })

  it("takes the nearest letter of the nearest line for a point beside the text", () => {
    // To the left of the second line.
    expect(letterAt(page, { x: 20, y: 126 })).toEqual({
      line: 1,
      at: 0,
      on: false,
    })
    // Past the end of the last line, and below it.
    expect(letterAt(page, { x: 400, y: 300 })).toEqual({
      line: 2,
      at: 3,
      on: false,
    })
    // Above the first line.
    expect(letterAt(page, { x: 205, y: 20 })).toMatchObject({ line: 0, at: 10 })
  })

  it("counts being level with a line for more than being near its end", () => {
    // Level with the short last line though far to its right, and close under the end of the second.
    expect(letterAt(page, { x: 285, y: 146 })).toMatchObject({ line: 2 })
  })

  it("has nothing to find on a page without letters, and passes over empty lines", () => {
    expect(letterAt([], { x: 1, y: 1 })).toBeNull()
    expect(letterAt([{ letters: [], quads: [] }], { x: 1, y: 1 })).toBeNull()
    expect(
      letterAt([{ letters: [], quads: [] }, ...page], { x: 105, y: 105 })
    ).toMatchObject({ line: 1, at: 0 })
  })

  it("measures along a line that is turned", () => {
    const turned = [upright("down the side", 300, 50)]
    expect(letterAt(turned, { x: 294, y: 105 })).toEqual({
      line: 0,
      at: 5,
      on: true,
    })
    expect(letterAt(turned, { x: 350, y: 105 })).toMatchObject({ on: false })
  })

  it("measures a line of spaces, or of one letter with no size, without dividing by nothing", () => {
    // Spaces at the end of a line are not part of its length.
    expect(letterAt([line(" ab  ", 10, 10)], { x: 45, y: 15 })).toEqual({
      line: 0,
      at: 3,
      on: false,
    })
    const spaces = [line("   ", 10, 10)]
    expect(letterAt(spaces, { x: 25, y: 15 })).toMatchObject({ line: 0 })
    const dot: LetterLine = {
      letters: ["x"],
      quads: [[5, 5, 5, 5, 5, 5, 5, 5]],
    }
    expect(letterAt([dot], { x: 5, y: 5 })).toMatchObject({ line: 0, at: 0 })
  })
})

describe("selecting words between two points", () => {
  it("takes whole words on one line", () => {
    // From inside "quick" to inside "brown".
    expect(
      spans(selectWords(page, { x: 155, y: 105 }, { x: 215, y: 108 }))
    ).toEqual([[4, 15, 100]])
  })

  it("is the same whichever end the drag began at", () => {
    const forward = selectWords(page, { x: 155, y: 105 }, { x: 125, y: 125 })
    const back = selectWords(page, { x: 125, y: 125 }, { x: 155, y: 105 })
    expect(back).toEqual(forward)
    // "quick brown fox" on the first line, "jumps" on the second.
    expect(spans(forward)).toEqual([
      [4, 19, 100],
      [0, 5, 120],
    ])
    // On one line as well.
    expect(selectWords(page, { x: 215, y: 105 }, { x: 155, y: 105 })).toEqual(
      selectWords(page, { x: 155, y: 105 }, { x: 215, y: 105 })
    )
  })

  it("takes every line between the first and the last whole", () => {
    expect(
      spans(selectWords(page, { x: 265, y: 105 }, { x: 115, y: 145 }))
    ).toEqual([
      [16, 19, 100],
      [0, 19, 120],
      [0, 4, 140],
    ])
  })

  it("gives the word that was pressed, and nothing for a press beside the text", () => {
    expect(
      spans(selectWords(page, { x: 205, y: 105 }, { x: 205, y: 105 }))
    ).toEqual([[10, 15, 100]])
    expect(selectWords(page, { x: 20, y: 300 }, { x: 20, y: 300 })).toEqual([])
    expect(selectWords([], { x: 0, y: 0 }, { x: 50, y: 50 })).toEqual([])
  })

  it("marks nothing for a drag over empty paper, and words for one that passes over them", () => {
    // Below all the text, from left to right.
    expect(selectWords(page, { x: 20, y: 300 }, { x: 380, y: 330 })).toEqual([])
    // Beside the text, downwards.
    expect(selectWords(page, { x: 20, y: 90 }, { x: 60, y: 200 })).toEqual([])
    // From above the text to below it, across every line.
    expect(
      spans(selectWords(page, { x: 90, y: 80 }, { x: 320, y: 200 }))
    ).toEqual([
      [0, 19, 100],
      [0, 19, 120],
      [0, 4, 140],
    ])
  })

  it("leaves out spaces at the ends, and a line that holds only spaces", () => {
    // From the space after "The" to the space before "fox".
    expect(
      spans(selectWords(page, { x: 135, y: 105 }, { x: 255, y: 105 }))
    ).toEqual([[4, 15, 100]])
    const gap = [
      line("one", 100, 100),
      line("   ", 100, 120),
      line("two", 100, 140),
    ]
    expect(
      spans(selectWords(gap, { x: 105, y: 105 }, { x: 125, y: 145 }))
    ).toEqual([
      [0, 3, 100],
      [0, 3, 140],
    ])
  })
})

describe("what lies under a mark", () => {
  const upper: Quad = [140, 100, 250, 100, 140, 112, 250, 112]
  const lower: Quad = [100, 120, 150, 120, 100, 132, 150, 132]

  it("tells whether a point is inside a box, upright or turned", () => {
    expect(insideQuad({ x: 150, y: 105 }, upper)).toBe(true)
    expect(insideQuad({ x: 139, y: 105 }, upper)).toBe(false)
    expect(insideQuad({ x: 150, y: 113 }, upper)).toBe(false)
    // On its edge counts as inside.
    expect(insideQuad({ x: 140, y: 105 }, upper)).toBe(true)
    const turned = upright("abc", 300, 50).quads[1]
    expect(insideQuad({ x: 294, y: 65 }, turned)).toBe(true)
    expect(insideQuad({ x: 294, y: 75 }, turned)).toBe(false)
  })

  it("reads the words under a mark, line by line", () => {
    expect(wordsUnder(page, [upper, lower])).toBe("quick brown jumps")
    expect(wordsUnder(page, [])).toBe("")
  })

  it("finds the box around some boxes", () => {
    expect(boundsOfQuads([upper, lower])).toEqual({
      x: 100,
      y: 100,
      width: 150,
      height: 32,
    })
  })

  it("puts a note's icon around the point, and keeps it on the page", () => {
    const sheet = { width: 300, height: 400 }
    expect(noteBox({ x: 100, y: 100 }, sheet)).toEqual({
      x: 90,
      y: 90,
      width: 20,
      height: 20,
    })
    expect(noteBox({ x: 2, y: 399 }, sheet)).toMatchObject({ x: 0, y: 380 })
    expect(noteBox({ x: 299, y: 3 }, sheet)).toMatchObject({ x: 280, y: 0 })
    // A page smaller than the icon.
    expect(noteBox({ x: 5, y: 5 }, { width: 10, height: 10 })).toMatchObject({
      x: 0,
      y: 0,
    })
  })
})

describe("words about comments", () => {
  const comment: Comment = {
    id: "c1",
    kind: "highlight",
    type: "Highlight",
    box: { x: 0, y: 0, width: 10, height: 10 },
    quads: [],
    strokes: [],
    colour: [1, 1, 0],
    opacity: 1,
    weight: 1,
    text: "Check this figure",
    author: "Ada",
    when: null,
    replies: [{ id: "c2", author: "Bo", text: "It is right.", when: 5 }],
  }

  it("names a comment by its kind, or by what the file calls it", () => {
    expect(commentName(comment)).toBe("Highlight")
    expect(commentName({ kind: "pen", type: "Ink" })).toBe("Highlighter")
    expect(commentName({ kind: "other", type: "FreeText" })).toBe("Free Text")
    expect(commentName({ kind: "other", type: "Stamp" })).toBe("Stamp")
  })

  it("finds words in the comment, its author, the words it marks, its kind and its replies", () => {
    for (const needle of [
      "FIGURE",
      "ada",
      "quick",
      "highl",
      "right",
      " bo ",
      "",
    ])
      expect(commentHolds(comment, "the quick fox", needle), needle).toBe(true)
    expect(commentHolds(comment, "the quick fox", "zebra")).toBe(false)
  })

  it("counts comments with their replies", () => {
    expect(
      countComments([[comment, { ...comment, replies: [] }], [], [comment]])
    ).toBe(5)
    expect(countComments([])).toBe(0)
  })
})

describe("checking what the page asks for", () => {
  const quad = [1, 2, 3, 4, 5, 6, 7, 8]
  const about = { page: 0, author: "Ada", when: 99 }

  it("refuses what is not a change, or names no page", () => {
    for (const value of [
      null,
      "mark",
      [],
      { do: "mark" },
      { do: "mark", page: -1 },
      { do: "mark", page: 1.5 },
      { do: "nothing", page: 0, colour: [0, 0, 0] },
      { do: "nothing", page: 0 },
    ])
      expect(readCommentOp(value)).toBeNull()
  })

  it("reads a mark, keeps its numbers within bounds and leaves out boxes that are not boxes", () => {
    expect(
      readCommentOp({
        ...about,
        do: "mark",
        kind: "underline",
        quads: [quad, [1, 2], "x", [1, 2, 3, 4, 5, 6, 7, NaN]],
        colour: [2, -1, 0.5],
        opacity: 7,
        extra: true,
      })
    ).toEqual({
      ...about,
      do: "mark",
      kind: "underline",
      quads: [quad],
      colour: [1, 0, 0.5],
      opacity: 1,
    })
    // Without a kind, a colour or a box there is no mark.
    const mark = { ...about, do: "mark", kind: "highlight", quads: [quad] }
    expect(
      readCommentOp({ ...mark, colour: [0, 0, 0], kind: "glow" })
    ).toBeNull()
    expect(readCommentOp(mark)).toBeNull()
    expect(readCommentOp({ ...mark, colour: [0, 0] })).toBeNull()
    expect(readCommentOp({ ...mark, colour: [0, 0, 0], quads: [] })).toBeNull()
    expect(readCommentOp({ ...mark, colour: [0, 0, 0], quads: 4 })).toBeNull()
  })

  it("reads a note, with words cut to a length and no author when none is given", () => {
    expect(
      readCommentOp({
        do: "note",
        page: 2,
        at: { x: 5, y: 6 },
        colour: [1, 1, 0],
        text: "x".repeat(MOST_LETTERS + 5),
        author: 7,
        when: "now",
      })
    ).toEqual({
      do: "note",
      page: 2,
      at: { x: 5, y: 6 },
      colour: [1, 1, 0],
      text: "x".repeat(MOST_LETTERS),
      author: "",
      when: 0,
    })
    expect(
      readCommentOp({ do: "note", page: 0, colour: [1, 1, 0], at: { x: 1 } })
    ).toBeNull()
    expect(
      readCommentOp({ do: "note", page: 0, colour: [1, 1, 0], at: [1, 2] })
    ).toBeNull()
  })

  it("reads the strokes of a pen, and no more points than a file should carry", () => {
    const stroke = [{ x: 1, y: 1 }, { x: 2, y: 2 }, "no", { x: 3 }]
    expect(
      readCommentOp({
        ...about,
        do: "pen",
        strokes: [stroke, [], "no"],
        colour: [1, 1, 0],
        weight: 400,
        opacity: 0.4,
      })
    ).toEqual({
      ...about,
      do: "pen",
      strokes: [
        [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      ],
      colour: [1, 1, 0],
      weight: 40,
      opacity: 0.4,
    })
    const long = Array.from({ length: MOST_POINTS }, (_, at) => ({
      x: at,
      y: 0,
    }))
    const read = readCommentOp({
      do: "pen",
      page: 0,
      strokes: [long, [{ x: 1, y: 1 }]],
      colour: [0, 0, 0],
    })
    expect(read).toMatchObject({ weight: 12, opacity: 1 })
    expect((read as { strokes: unknown[][] }).strokes).toHaveLength(1)
    expect(
      readCommentOp({ do: "pen", page: 0, colour: [0, 0, 0], strokes: [[]] })
    ).toBeNull()
    expect(readCommentOp({ do: "pen", page: 0, colour: [0, 0, 0] })).toBeNull()
  })

  it("reads a reply, which needs words and a comment to answer", () => {
    expect(
      readCommentOp({ ...about, do: "reply", to: "c4", text: " Yes " })
    ).toEqual({ ...about, do: "reply", to: "c4", text: " Yes " })
    expect(
      readCommentOp({ ...about, do: "reply", to: "c4", text: "  " })
    ).toBeNull()
    expect(
      readCommentOp({ ...about, do: "reply", to: "", text: "Yes" })
    ).toBeNull()
    expect(
      readCommentOp({ ...about, do: "reply", to: 4, text: "Yes" })
    ).toBeNull()
  })

  it("reads a change to a comment, with only the parts that were given", () => {
    expect(readCommentOp({ do: "edit", page: 0, id: "c4", when: 5 })).toEqual({
      do: "edit",
      page: 0,
      id: "c4",
      when: 5,
    })
    expect(
      readCommentOp({
        do: "edit",
        page: 0,
        id: "c4",
        when: 5,
        text: "",
        colour: [0, 0.5, 1],
        opacity: 0,
        move: { x: 3, y: -4 },
      })
    ).toEqual({
      do: "edit",
      page: 0,
      id: "c4",
      when: 5,
      text: "",
      colour: [0, 0.5, 1],
      opacity: 0.05,
      move: { x: 3, y: -4 },
    })
    expect(
      readCommentOp({ do: "edit", page: 0, id: "c4", colour: "red", move: 3 })
    ).toEqual({ do: "edit", page: 0, id: "c4", when: 0 })
    expect(readCommentOp({ do: "edit", page: 0 })).toBeNull()
  })

  it("reads a removal by the comment's number", () => {
    expect(readCommentOp({ do: "drop", page: 3, id: "c9", when: 1 })).toEqual({
      do: "drop",
      page: 3,
      id: "c9",
    })
    expect(readCommentOp({ do: "drop", page: 3, id: 9 })).toBeNull()
  })
})
