import { describe, expect, it } from "vitest"
import { editedBy, lengthOf } from "./edits"
import { FADE_OUT, ringtonePart, ringtoneSteps, RINGTONES } from "./ringtone"

describe("ringtonePart", () => {
  it("takes the selection, cut to the longest the phone takes", () => {
    expect(ringtonePart("iphone", 0, { from: 10, to: 30 }, 200)).toEqual({
      from: 10,
      to: 30,
    })
    expect(ringtonePart("alert", 0, { from: 10, to: 90 }, 200)).toEqual({
      from: 10,
      to: 40,
    })
  })

  it("with no selection, takes that long from the playhead, inside the sound", () => {
    expect(ringtonePart("iphone", 5, null, 200)).toEqual({ from: 5, to: 45 })
    expect(ringtonePart("iphone", 190, null, 200)).toEqual({
      from: 160,
      to: 200,
    })
    // A sound shorter than a ringtone is taken whole.
    expect(ringtonePart("android", 3, null, 12)).toEqual({ from: 0, to: 12 })
    // An empty selection counts as none.
    expect(ringtonePart("android", 0, { from: 4, to: 4 }, 100)).toEqual({
      from: 0,
      to: 30,
    })
  })
})

describe("ringtoneSteps", () => {
  it("keeps the part and fades its ends", () => {
    const steps = ringtoneSteps({ from: 20, to: 60 }, 200)
    expect(steps[0]).toEqual({ do: "keep", from: 20, to: 60 })
    const edited = editedBy(200, steps)
    expect(lengthOf(edited)).toBe(40)
    expect(steps[2]).toMatchObject({ from: 40 - FADE_OUT, to: 40 })
    expect(steps).toHaveLength(3)
  })

  it("keeps nothing out when the part is the whole sound, and fades a short one less", () => {
    const steps = ringtoneSteps({ from: 0, to: 4 }, 4)
    expect(steps.map((step) => step.do)).toEqual(["fade", "fade"])
    expect(steps[1]).toMatchObject({ from: 3, to: 4 })
  })

  it("names what each phone takes", () => {
    expect(RINGTONES.iphone).toMatchObject({ format: "m4r", seconds: 40 })
    expect(RINGTONES.alert.seconds).toBe(30)
    expect(RINGTONES.android).toMatchObject({ format: "mp3", limit: false })
  })
})
