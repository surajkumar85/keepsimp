import { describe, expect, it } from "vitest"
import type { TesseractBlock } from "./ocr"
import { ocrLabel, readPages, type OcrRunHooks } from "./ocr-run"

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  x0,
  y0,
  x1,
  y1,
})
/** One line of words as Tesseract gives it. */
const lineOf = (words: [string, number][]): TesseractBlock[] => [
  {
    paragraphs: [
      {
        lines: [
          {
            bbox: box(0, 0, 400, 40),
            baseline: box(0, 40, 400, 40),
            words: words.map(([text, confidence], at) => ({
              text,
              bbox: box(at * 100, 0, at * 100 + 90, 40),
              confidence,
            })),
          },
        ],
      },
    ],
  },
]

/** Pages that are each something: a scan with words, text already, blank, broken. */
function hooks(
  kinds: Record<
    number,
    "scan" | "text" | "blank" | "undrawn" | "fails" | "stop"
  >
) {
  let stopped = false
  const said: number[] = []
  const run: OcrRunHooks = {
    async picture(page) {
      if (kinds[page] === "undrawn") return null
      return {
        png: Uint8Array.of(page),
        scale: 0.5,
        letters: kinds[page] === "text" ? 10 : 0,
      }
    },
    async read(png) {
      const kind = kinds[png[0]]
      if (kind === "fails") throw new Error("Tesseract failed")
      if (kind === "stop") {
        stopped = true
        return null
      }
      return kind === "blank"
        ? []
        : lineOf([
            ["Hello", 95],
            ["there", 40],
          ])
    },
    stopped: () => stopped,
    onPage: (_done, _total, page) => said.push(page),
  }
  return { run, said, stop: () => (stopped = true) }
}

describe("reading pages", () => {
  it("reads scans, leaves pages with text, and tells what it found", async () => {
    const { run, said } = hooks({
      0: "scan",
      1: "text",
      2: "blank",
      3: "undrawn",
      4: "fails",
      5: "scan",
    })
    const { ops, tally } = await readPages([0, 1, 2, 3, 4, 5], false, run)
    expect(said).toEqual([0, 1, 2, 3, 4, 5])
    expect(ops.map((op) => op.page)).toEqual([0, 5])
    expect(tally).toEqual({
      read: [0, 5],
      words: 4,
      unsure: 2,
      hadText: [1],
      blank: [2],
      failed: [3, 4],
      confidence: expect.any(Number),
    })
    expect(tally.confidence).toBeGreaterThan(40)
    expect(tally.confidence).toBeLessThan(95)
    expect(ocrLabel(ops)).toBe("Recognise text on 2 pages")
    expect(ocrLabel(ops.slice(0, 1))).toBe("Recognise text on page 1")
  })

  it("reads pages with text too when asked, and finds nothing on none", async () => {
    const { run } = hooks({ 0: "text" })
    expect((await readPages([0], true, run)).tally.read).toEqual([0])
    expect((await readPages([], false, run)).tally.confidence).toBe(0)
  })

  it("stops before a page, after drawing one, and while one is read", async () => {
    const before = hooks({ 0: "scan" })
    before.stop()
    expect((await readPages([0], false, before.run)).ops).toEqual([])

    const drawn = hooks({ 0: "scan", 1: "scan" })
    const picture = drawn.run.picture
    drawn.run.picture = async (page) => {
      drawn.stop()
      return picture(page)
    }
    expect((await readPages([0, 1], false, drawn.run)).tally.read).toEqual([])

    const reading = hooks({ 0: "scan", 1: "stop", 2: "scan" })
    expect((await readPages([0, 1, 2], false, reading.run)).tally.read).toEqual(
      [0]
    )

    // Tesseract let go of in the middle of a page fails; that is a stop, not a fault.
    const letGo = hooks({ 0: "fails", 1: "scan" })
    letGo.run.read = async () => {
      letGo.stop()
      throw new Error("terminated")
    }
    expect((await readPages([0, 1], false, letGo.run)).tally.failed).toEqual([])
  })
})
