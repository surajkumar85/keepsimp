import { describe, expect, it } from "vitest"
import {
  clock,
  cutOut,
  everyPoints,
  isWhole,
  keepOnly,
  keptLength,
  parseClock,
  retime,
  snapOut,
  snapSaid,
  sourceTime,
  splitAt,
  tidy,
  whole,
} from "./trim"

describe("the parts kept", () => {
  it("are put in order, joined where they meet, held in the file", () => {
    expect(
      tidy(
        [
          { start: 8, end: 12 },
          { start: 1, end: 3 },
          { start: 2.5, end: 4 },
          { start: 5, end: 5.05 },
          { start: -1, end: 0.5 },
          { start: 9, end: 7 },
        ],
        10
      )
    ).toEqual([
      { start: 0, end: 0.5 },
      { start: 1, end: 4 },
      { start: 7, end: 10 },
    ])
    expect(isWhole(whole(10), 10)).toBe(true)
    expect(isWhole([{ start: 0, end: 9 }], 10)).toBe(false)
    expect(isWhole([], 10)).toBe(false)
  })

  it("keeps a stretch, or cuts one out, either way round", () => {
    const start = whole(10)
    expect(keepOnly(start, 6, 2, 10)).toEqual([{ start: 2, end: 6 }])
    const cut = cutOut(start, 3, 5, 10)
    expect(cut).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ])
    expect(cutOut(cut, 9, 2, 10)).toEqual([
      { start: 0, end: 2 },
      { start: 9, end: 10 },
    ])
    expect(keptLength(cut)).toBe(8)
    expect(keepOnly(cut, 2, 6, 10)).toEqual([
      { start: 2, end: 3 },
      { start: 5, end: 6 },
    ])
  })

  it("maps times between the file and the result", () => {
    const parts = [
      { start: 1, end: 3 },
      { start: 5, end: 8 },
    ]
    expect(retime(0.5, parts)).toBeNull()
    expect(retime(2, parts)).toBe(1)
    expect(retime(4, parts)).toBeNull()
    expect(retime(6, parts)).toBe(3)
    expect(retime(9, parts)).toBeNull()
    expect(sourceTime(1, parts)).toBe(2)
    expect(sourceTime(3, parts)).toBe(6)
    expect(sourceTime(99, parts)).toBe(8)
    expect(sourceTime(1, [])).toBe(0)
  })
})

describe("copying without encoding", () => {
  const keys = [0, 2, 4, 6, 8]
  it("moves each part out to the keyframes around it", () => {
    const asked = [
      { start: 2.5, end: 3.5 },
      { start: 6, end: 7.2 },
    ]
    const snapped = snapOut(asked, keys, 10)
    expect(snapped).toEqual([
      { start: 2, end: 4 },
      { start: 6, end: 8 },
    ])
    expect(snapSaid(asked, snapped)).toBe(
      "Copied without encoding, a part can only begin and end where the video holds a whole picture (a keyframe), so 1.8 s more is kept around the cuts. Choose Exact to cut to the frame."
    )
    expect(snapSaid(snapped, snapped)).toBeNull()
    // A part past the last keyframe runs to the end; parts that come to meet are joined.
    expect(snapOut([{ start: 8.5, end: 9 }], keys, 10)).toEqual([
      { start: 8, end: 10 },
    ])
    expect(
      snapOut(
        [
          { start: 1, end: 2.5 },
          { start: 3, end: 3.5 },
        ],
        keys,
        10
      )
    ).toEqual([{ start: 0, end: 4 }])
  })
})

describe("splitting", () => {
  it("makes a part between each point, ignoring points too near an end", () => {
    expect(splitAt([5, 2, 5, 0.05, 9.95], 10)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 5 },
      { start: 5, end: 10 },
    ])
    expect(splitAt([], 10)).toEqual([{ start: 0, end: 10 }])
    expect(everyPoints(3, 10)).toEqual([3, 6, 9])
    expect(everyPoints(5, 10)).toEqual([5])
  })
})

describe("times for people", () => {
  it("writes and reads them", () => {
    expect(clock(67.25)).toBe("1:07.25")
    expect(clock(3723.5)).toBe("1:02:03.50")
    expect(clock(0)).toBe("0:00.00")
    expect(parseClock("7.25")).toBe(7.25)
    expect(parseClock("1:07.25")).toBe(67.25)
    expect(parseClock(" 1:02:03 ")).toBe(3723)
    expect(parseClock("1:2:3:4")).toBeNull()
    expect(parseClock("ten")).toBeNull()
    expect(parseClock("")).toBeNull()
  })
})
