import { describe, expect, it } from "vitest"
import {
  cueAt,
  drawCue,
  MOST_CUES,
  parseSubtitles,
  placedCues,
  subtitlesSaid,
} from "./subtitles"

const SRT = `﻿1
00:00:01,000 --> 00:00:02,500
<i>Hello</i> there

2
00:00:03,000 --> 00:00:04,000
{\\an8}Two
lines &amp; more

3
00:00:05,000 --> 00:00:04,000
Backwards
`

const VTT = `WEBVTT

NOTE a note

00:01.000 --> 00:02.000 align:start position:10%
<c.red>Short</c>

1:00:00.5 --> 1:00:01.25
Late

00:03.000 --> 00:04.000

`

describe("reading subtitles", () => {
  it("reads SRT, taking tags out and leaving out cues running backwards", () => {
    expect(parseSubtitles(SRT)).toEqual([
      { start: 1, end: 2.5, text: "Hello there" },
      { start: 3, end: 4, text: "Two\nlines & more" },
    ])
  })

  it("reads WebVTT, its settings and notes passed over", () => {
    expect(parseSubtitles(VTT.replace(/\n/g, "\r\n"))).toEqual([
      { start: 1, end: 2, text: "Short" },
      { start: 3600.5, end: 3601.25, text: "Late" },
    ])
    expect(parseSubtitles("not subtitles\n\n00:01 --> 00:02\nNo")).toEqual([])
    expect(parseSubtitles("x --> 00:00:01,000\nNo")).toEqual([])
  })

  it("keeps at most so many cues, in order of time", () => {
    const many = Array.from(
      { length: MOST_CUES + 5 },
      (_, index) =>
        `00:00:${String(index % 60).padStart(2, "0")},000 --> 00:00:${String((index % 60) + 1).padStart(2, "0")},000\nLine ${index}`
    ).join("\n\n")
    const cues = parseSubtitles(many)
    expect(cues).toHaveLength(MOST_CUES)
    expect(
      cues.every(
        (cue, index) => index === 0 || cues[index - 1].start <= cue.start
      )
    ).toBe(true)
    expect(
      parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\n&lt;&gt;&nbsp;x")
    ).toEqual([{ start: 1, end: 2, text: "<> x" }])
  })
})

describe("placing subtitles on the result", () => {
  const cues = [
    { start: 1, end: 2, text: "one" },
    { start: 3, end: 5, text: "two" },
    { start: 7, end: 8, text: "three" },
  ]
  it("follows the speed", () => {
    expect(placedCues(cues, null, 2)).toEqual([
      { start: 0.5, end: 1, text: "one" },
      { start: 1.5, end: 2.5, text: "two" },
      { start: 3.5, end: 4, text: "three" },
    ])
  })

  it("follows the parts kept, leaving out what is cut and cutting across a cut", () => {
    const parts = [
      { start: 0.5, end: 4 },
      { start: 7.5, end: 9 },
    ]
    expect(placedCues(cues, parts, 1)).toEqual([
      { start: 0.5, end: 1.5, text: "one" },
      { start: 2.5, end: 3.5, text: "two" },
      { start: 3.5, end: 4, text: "three" },
    ])
  })

  it("finds the cue showing at a time, an earlier longer one too", () => {
    const placed = [
      { start: 0, end: 10, text: "long" },
      { start: 2, end: 3, text: "short" },
      { start: 4, end: 5, text: "later" },
    ]
    expect(cueAt(placed, 2.5)?.text).toBe("short")
    expect(cueAt(placed, 3.5)?.text).toBe("long")
    expect(cueAt(placed, 4.5)?.text).toBe("later")
    expect(cueAt(placed, 11)).toBeNull()
    expect(cueAt([], 1)).toBeNull()
    expect(cueAt(placed, -1)).toBeNull()
  })

  it("is said in words", () => {
    expect(subtitlesSaid("film.srt", 12, 12)).toBe(
      "12 subtitles from film.srt are written on the picture."
    )
    expect(subtitlesSaid("film.srt", 3, 1)).toBe(
      "1 subtitle from film.srt is written on the picture; 2 in parts cut out are left out."
    )
    expect(subtitlesSaid("film.srt", 2, 1)).toMatch(
      /; 1 in parts cut out is left out\.$/
    )
  })
})

describe("drawing a cue", () => {
  it("writes each row wrapped, outlined, along the bottom, smaller when a word will not fit", () => {
    const calls: unknown[][] = []
    const context = {
      font: "",
      save: () => calls.push(["save"]),
      restore: () => calls.push(["restore"]),
      // Ten pixels a letter at 100 px; scaled with the size.
      measureText: (text: string) => ({
        width: text.length * Number(/(\d+)px/.exec(context.font)![1]) * 0.1,
      }),
      strokeText: (text: string, x: number, y: number) =>
        calls.push(["stroke", text, x, Math.round(y)]),
      fillText: (text: string, x: number, y: number) =>
        calls.push(["fill", text, x, Math.round(y)]),
    } as unknown as OffscreenCanvasRenderingContext2D
    drawCue(context, "Hello world\nAgain", 200, 100, "large", "Outfit")
    expect(calls[0]).toEqual(["save"])
    expect(calls.at(-1)).toEqual(["restore"])
    const filled = calls
      .filter((call) => call[0] === "fill")
      .map((call) => call[1])
    expect(filled).toEqual(["Hello world", "Again"])
    expect((context as unknown as { font: string }).font).toBe(
      "700 10px Outfit"
    )
    // A word wider than the picture shrinks the text.
    drawCue(
      context,
      "Unbreakablewordthatisverylong",
      200,
      100,
      "small",
      "Outfit"
    )
    expect((context as unknown as { font: string }).font).toMatch(
      /^700 \d+px Outfit$/
    )
  })
})
