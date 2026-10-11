import { describe, expect, it } from "vitest"
import {
  fitTarget,
  levelToTry,
  mostWrites,
  PART_STEPS,
  READABLE_RUNGS,
  ROOM_TO_FILL,
  RUNGS,
  stepCount,
  stepPlan,
  targetSizes,
} from "./target"

describe("the steps", () => {
  it("go from gentle to harsh", () => {
    for (let index = 1; index < RUNGS.length; index++) {
      expect(RUNGS[index].dpi).toBeLessThanOrEqual(RUNGS[index - 1].dpi)
      expect(RUNGS[index].quality).toBeLessThan(RUNGS[index - 1].quality)
    }
  })

  it("stop at what is still easy to read, unless asked to go on", () => {
    expect(stepCount(false)).toBe(READABLE_RUNGS + 1)
    expect(stepCount(true)).toBe(RUNGS.length + 1)
    expect(RUNGS[READABLE_RUNGS - 1]).toEqual({ dpi: 72, quality: 42 })
  })

  it("lose nothing at step 0, and write a fixed quality after that", () => {
    expect(stepPlan(0)).toBeNull()
    expect(stepPlan(3)).toEqual({
      dpi: 150,
      slack: 1.1,
      look: "smallest",
      keepBelow: 80,
      floor: 80,
      fixed: 80,
      again: true,
    })
    expect(stepPlan(RUNGS.length + 1)).toBeNull()
    expect(stepPlan(RUNGS.length + 0.5)).toBeNull()
  })

  it("lie between two rungs for a step with a fraction", () => {
    // Half-way from 180 dpi at 84 to 150 dpi at 80.
    expect(stepPlan(2.5)).toMatchObject({ dpi: 165, fixed: 82, floor: 82 })
    // A quarter of the way back from the third rung.
    expect(stepPlan(2.75)).toMatchObject({ dpi: 158, fixed: 81 })
    // Before the first rung there is a gentler one to measure from.
    expect(stepPlan(0.5)).toMatchObject({ dpi: 260, fixed: 90 })
    expect(stepPlan(1)).toMatchObject({ dpi: 220, fixed: 88 })
  })

  it("offer sizes from small to large", () => {
    const sizes = targetSizes.map((size) => size.bytes)
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
    expect(targetSizes[0]).toEqual({ bytes: 102_400, label: "100 KB" })
  })
})

describe("fitTarget", () => {
  /** A file that weighs 1,000 at step 0 and 100 less with every step. */
  const writer = () => {
    const written: number[] = []
    return {
      written,
      write: async (step: number) => {
        written.push(step)
        return { bytes: 1000 - step * 100, step }
      },
    }
  }

  it("is done at once when nothing needs to be lost", async () => {
    const { written, write } = writer()
    expect(await fitTarget(8, 1000, write)).toEqual({
      step: 0,
      result: { bytes: 1000, step: 0 },
      met: true,
    })
    expect(written).toEqual([0])
  })

  it("finds the gentlest step that fits", async () => {
    for (const [target, step] of [
      [950, 1],
      [640, 4],
      [600, 4],
      [310, 7],
    ]) {
      const { written, write } = writer()
      const fit = await fitTarget(8, target, write)
      expect(fit).toEqual({
        step,
        result: { bytes: 1000 - step * 100, step },
        met: true,
      })
      expect(written.length).toBeLessThanOrEqual(mostWrites(8))
    }
  })

  it("goes part of a step back when the step that fits leaves much of the size unused", async () => {
    /** 300 less with every step, also for parts of a step. */
    const far = () => {
      const written: number[] = []
      return {
        written,
        write: async (step: number) => {
          written.push(step)
          return { bytes: 1000 - step * 300, step }
        },
      }
    }
    // Step 2 weighs 400 of 650. Half a step back weighs 550, still under
    // 85% of the size; a quarter more weighs 625.
    const both = far()
    expect(await fitTarget(4, 650, both.write)).toEqual({
      step: 1.25,
      result: { bytes: 625, step: 1.25 },
      met: true,
    })
    expect(both.written).toEqual([0, 3, 1, 2, 1.5, 1.25])
    // Half a step back is over the size; a quarter fits.
    const quarter = far()
    expect(await fitTarget(4, 500, quarter.write)).toMatchObject({
      step: 1.75,
      result: { bytes: 475 },
    })
    expect(quarter.written).toEqual([0, 3, 1, 2, 1.5, 1.75])
    // One part of a step is enough once the size is well used.
    const once = far()
    expect(await fitTarget(4, 600, once.write)).toMatchObject({
      step: 1.5,
      result: { bytes: 550 },
    })
    expect(once.written).toEqual([0, 3, 1, 2, 1.5])
    expect(PART_STEPS).toBe(2)
    expect(ROOM_TO_FILL).toBe(0.85)
  })

  it("keeps the whole step when no part of a step fits", async () => {
    const written: number[] = []
    const fit = await fitTarget(4, 650, async (step) => {
      written.push(step)
      // Parts of a step weigh what the step before them does.
      return { bytes: 1000 - Math.floor(step) * 300, step }
    })
    expect(fit).toEqual({
      step: 2,
      result: { bytes: 400, step: 2 },
      met: true,
    })
    expect(written).toEqual([0, 3, 1, 2, 1.5, 1.75])
    // One short of the most: the last writing is a level, not a step.
    expect(written.length).toBe(mostWrites(4) - 1)
  })

  it("hands back the last step when nothing fits", async () => {
    const { written, write } = writer()
    expect(await fitTarget(8, 250, write)).toEqual({
      step: 7,
      result: { bytes: 300, step: 7 },
      met: false,
    })
    expect(written).toEqual([0, 7])
  })

  it("has only one thing to try when there is one step", async () => {
    const { written, write } = writer()
    expect(await fitTarget(1, 10, write)).toMatchObject({ step: 0, met: false })
    expect(await fitTarget(1, 5000, write)).toMatchObject({
      step: 0,
      met: true,
    })
    expect(written).toEqual([0, 0])
  })
})

describe("mostWrites", () => {
  it("counts both ends, the halving between them, two parts of a step and a level", () => {
    expect(mostWrites(1)).toBe(1)
    expect(mostWrites(2)).toBe(5)
    expect(mostWrites(11)).toBe(9)
    expect(mostWrites(15)).toBe(9)
  })
})

describe("levelToTry", () => {
  it("names the level that weighs about what the step does", () => {
    expect(levelToTry(0)).toBeNull()
    expect(levelToTry(0.5)).toBe("balanced")
    expect(levelToTry(3)).toBe("balanced")
    expect(levelToTry(5)).toBe("balanced")
    expect(levelToTry(5.25)).toBe("strong")
    expect(levelToTry(9)).toBe("strong")
    expect(levelToTry(9.5)).toBeNull()
    expect(levelToTry(14)).toBeNull()
  })
})
