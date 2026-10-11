import { describe, expect, it } from "vitest"
import {
  fitTarget,
  mostWrites,
  READABLE_RUNGS,
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
  it("counts both ends and the halving between them", () => {
    expect(mostWrites(1)).toBe(1)
    expect(mostWrites(2)).toBe(2)
    expect(mostWrites(11)).toBe(6)
    expect(mostWrites(15)).toBe(6)
  })
})
