import { describe, expect, it } from "vitest"
import {
  HANDOFF_TIMEOUT,
  handOver,
  plainPath,
  takeHandedFiles,
} from "./handoff"

const file = new File(["a"], "a.pdf", { type: "application/pdf" })

describe("handing files to the next page", () => {
  it("compares paths without their query, fragment or last slash", () => {
    expect(plainPath("/dashboard/json-formatter/#convert")).toBe(
      "/dashboard/json-formatter"
    )
    expect(plainPath("/dashboard/sign-pdf?x=1")).toBe("/dashboard/sign-pdf")
    expect(plainPath("/")).toBe("/")
    expect(plainPath("")).toBe("/")
  })

  it("gives the files to their page once", () => {
    handOver("/dashboard/sign-pdf/", [file], 1000)
    expect(takeHandedFiles("/dashboard/sign-pdf", 2000)).toEqual([file])
    expect(takeHandedFiles("/dashboard/sign-pdf", 2000)).toEqual([])
  })

  it("keeps them from another page", () => {
    handOver("/dashboard/sign-pdf/", [file], 1000)
    expect(takeHandedFiles("/dashboard/pdf-editor/", 1000)).toEqual([])
    expect(takeHandedFiles("/dashboard/sign-pdf/", 1000)).toEqual([file])
  })

  it("drops them when they have waited too long", () => {
    handOver("/dashboard/sign-pdf/", [file], 0)
    expect(
      takeHandedFiles("/dashboard/sign-pdf/", HANDOFF_TIMEOUT + 1)
    ).toEqual([])
    // They are gone, not only refused.
    expect(takeHandedFiles("/dashboard/sign-pdf/", 0)).toEqual([])
  })

  it("keeps nothing when no files are given", () => {
    handOver("/dashboard/sign-pdf/", [file], 0)
    handOver("/dashboard/sign-pdf/", [], 0)
    expect(takeHandedFiles("/dashboard/sign-pdf/", 0)).toEqual([])
  })

  it("uses the clock when no time is given", () => {
    handOver("/dashboard/sign-pdf/", [file])
    expect(takeHandedFiles("/dashboard/sign-pdf/")).toEqual([file])
  })
})
