import { describe, expect, it } from "vitest"
import { editedBy, untouched } from "./edits"
import { playFrom } from "./playback"

describe("playFrom", () => {
  it("plays kept parts, jumps what was cut, and ends after the last", () => {
    const edited = editedBy(10, [
      { do: "cut", from: 0, to: 1 },
      { do: "cut", from: 2, to: 3 },
    ])
    // Kept: 1–3 and 4–10 of the source.
    expect(playFrom(edited, 0)).toBe(1)
    expect(playFrom(edited, 2)).toBe(2)
    expect(playFrom(edited, 3.5)).toBe(4)
    expect(playFrom(edited, 2.999)).toBe(4)
    expect(playFrom(edited, 9.9995)).toBeNull()
    expect(playFrom(untouched(10), 5)).toBe(5)
    expect(playFrom(untouched(0), 0)).toBeNull()
  })
})
