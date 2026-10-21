import { describe, expect, it } from "vitest"
import {
  clock,
  doubtful,
  found,
  inSound,
  keptFrom,
  LANGUAGES,
  segmentAt,
  stamp,
  tidy,
  toSrt,
  toText,
  toVtt,
  withoutLoops,
  type Segment,
} from "./transcript"

const heard = (text: string, from: number, to: number | null) => ({
  text,
  timestamp: [from, to] as [number, number | null],
})

describe("windows", () => {
  it("keeps what it is sure of and seeks to where that ended", () => {
    const { kept, next } = keptFrom(
      60,
      30,
      [
        heard(" One. ", 0, 4.2),
        heard("Two.", 4.2, 12),
        heard("Three", 12, null),
      ],
      false
    )
    expect(kept).toEqual([
      { start: 60, end: 64.2, text: "One." },
      { start: 64.2, end: 72, text: "Two." },
    ])
    expect(next).toBe(72)
  })

  it("leaves a last segment that ends too near the window's end for the next", () => {
    const { kept, next } = keptFrom(
      0,
      30,
      [heard("A", 0, 10), heard("B", 10, 29.5)],
      false
    )
    expect(kept.map((one) => one.text)).toEqual(["A"])
    expect(next).toBe(10)
    // One that ends well inside is kept.
    expect(
      keptFrom(0, 30, [heard("A", 0, 10), heard("B", 10, 20)], false).next
    ).toBe(20)
  })

  it("keeps everything of the sound's last window, an open end at its end", () => {
    const { kept, next } = keptFrom(
      90,
      12.5,
      [heard("A", 0, 5), heard("B", 5, null)],
      true
    )
    expect(kept).toEqual([
      { start: 90, end: 95, text: "A" },
      { start: 95, end: 102.5, text: "B" },
    ])
    expect(next).toBe(102.5)
    // The last window hears the sound to its end, even after its last word.
    expect(keptFrom(0, 8.3, [heard("All", 0, 8)], true).next).toBe(8.3)
  })

  it("goes on through a window that is one long segment, or silence", () => {
    const long = keptFrom(30, 30, [heard("All of it", 0, null)], false)
    expect(long.kept).toEqual([{ start: 30, end: 60, text: "All of it" }])
    expect(long.next).toBe(60)
    expect(keptFrom(30, 30, [heard("  ", 0, 5)], false)).toEqual({
      kept: [],
      next: 60,
    })
    expect(keptFrom(30, 30, [], false).next).toBe(60)
    // Never stuck: a segment that ends where the window starts still moves on.
    expect(
      keptFrom(30, 30, [heard("Hm", 0, 0), heard("x", 0, null)], false).next
    ).toBe(31)
    // Times out of order are put right.
    expect(keptFrom(0, 30, [heard("Odd", 5, 2)], true).kept).toEqual([
      { start: 5, end: 5, text: "Odd" },
    ])
    expect(keptFrom(0, 30, [heard("Early", -1, 2)], true).kept[0].start).toBe(0)
    // Times past what was heard end where the sound does.
    expect(
      keptFrom(10, 9.5, [heard("Past", 8, 11.7), heard("Later", 12, 14)], true)
        .kept
    ).toEqual([
      { start: 18, end: 19.5, text: "Past" },
      { start: 19.5, end: 19.5, text: "Later" },
    ])
  })
})

describe("transcripts", () => {
  const segments: Segment[] = [
    { start: 0, end: 3.4, text: "The quick brown fox." },
    { start: 3.4, end: 9.84, text: "Café --> Straße" },
    { start: 3725.5, end: 3727, text: "Late" },
  ]

  it("tidies text", () => {
    expect(tidy("  a \n b  ")).toBe("a b")
  })

  it("folds loops of the same text, keeping a pair", () => {
    const loop = (text: string, at: number) => ({
      start: at,
      end: at + 1,
      text,
    })
    expect(
      withoutLoops([
        loop("Hi", 0),
        loop("hi", 1),
        loop("HI", 2),
        loop("Next", 3),
        loop("La", 4),
        loop("La", 5),
      ])
    ).toEqual([
      { start: 0, end: 3, text: "Hi" },
      loop("Next", 3),
      loop("La", 4),
      loop("La", 5),
    ])
    expect(withoutLoops([])).toEqual([])
  })

  it("writes times as SRT, WebVTT and the page do", () => {
    expect(stamp(3725.5, ",")).toBe("01:02:05,500")
    expect(stamp(0.0004, ".")).toBe("00:00:00.000")
    expect(stamp(-1, ",")).toBe("00:00:00,000")
    expect(clock(65.9)).toBe("1:05")
    expect(clock(3725.5)).toBe("1:02:05")
    expect(clock(-3)).toBe("0:00")
  })

  it("writes SRT, WebVTT and text", () => {
    expect(toSrt(segments.slice(0, 2))).toBe(
      "1\n00:00:00,000 --> 00:00:03,400\nThe quick brown fox.\n\n2\n00:00:03,400 --> 00:00:09,840\nCafé --> Straße\n"
    )
    expect(toVtt(segments.slice(0, 2))).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:03.400\nThe quick brown fox.\n\n00:00:03.400 --> 00:00:09.840\nCafé -> Straße\n"
    )
    expect(toText(segments)).toBe(
      "The quick brown fox.\nCafé --> Straße\nLate\n"
    )
    expect(toText(segments, true)).toBe(
      "[0:00] The quick brown fox.\n[0:03] Café --> Straße\n[1:02:05] Late\n"
    )
  })

  it("finds words without minding case or accents", () => {
    expect(found(segments, "CAFE")).toEqual([1])
    expect(found(segments, "strasse")).toEqual([])
    expect(found(segments, "e")).toEqual([0, 1, 2])
    expect(found(segments, "   ")).toEqual([])
  })

  it("follows the sound as it plays", () => {
    expect(segmentAt(segments, 0)).toBe(0)
    expect(segmentAt(segments, 3.4)).toBe(1)
    expect(segmentAt(segments, 100)).toBe(-1)
    expect(segmentAt(segments, 3726)).toBe(2)
    expect(segmentAt(segments, -1)).toBe(-1)
    expect(segmentAt([], 1)).toBe(-1)
  })

  it("offers to find the language itself first", () => {
    expect(LANGUAGES[0].code).toBe("")
    expect(new Set(LANGUAGES.map((one) => one.code)).size).toBe(
      LANGUAGES.length
    )
  })
})

describe("doubtful phrases", () => {
  it("marks what Whisper writes over silence, and nothing else", () => {
    for (const text of [
      "Thank you.",
      " thank you ",
      "Thanks for watching!",
      "Bye.",
      "you",
      "Subtitles by the Amara.org community",
    ])
      expect(doubtful(text), text).toBe(true)
    for (const text of [
      "Thank you for coming tonight.",
      "Goodbye",
      "Thank",
      "",
    ])
      expect(doubtful(text), text).toBe(false)
  })
})

describe("silence", () => {
  it("drops what Whisper wrote over silence, and keeps quiet speech", () => {
    // Two seconds of a tone at −20 dBFS, then two of nothing, from 10 s.
    const audio = new Float32Array(16000 * 4)
    for (let index = 0; index < 32000; index++)
      audio[index] = 0.1414 * Math.sin(index / 5)
    const segments = [
      { start: 10, end: 12, text: "Said" },
      { start: 12, end: 14, text: "Made up" },
      { start: 13.5, end: 14, text: "Also made up" },
    ]
    expect(inSound(segments, audio, 10).map((one) => one.text)).toEqual([
      "Said",
    ])
    // A quiet recording (speech near −50 dBFS) keeps its speech, and drops
    // only what lies in its silence.
    const quiet = audio.map((value) => value / 30)
    expect(inSound(segments, quiet, 10).map((one) => one.text)).toEqual([
      "Said",
    ])
    // Speech everywhere at −50 dBFS: all of it kept.
    const low = new Float32Array(16000 * 4).map(
      (_, index) => 0.0047 * Math.sin(index / 5)
    )
    expect(inSound(segments, low, 10)).toHaveLength(3)
    // A segment of no length, or past the window, is silent.
    expect(inSound([{ start: 20, end: 21, text: "Past" }], audio, 10)).toEqual(
      []
    )
    // A window that is all silence keeps nothing.
    expect(inSound(segments, new Float32Array(0), 10)).toEqual([])
    expect(inSound(segments, new Float32Array(16000), 10)).toEqual([])
  })
})
