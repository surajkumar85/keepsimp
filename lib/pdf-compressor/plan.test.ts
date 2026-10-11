import { describe, expect, it } from "vitest"
import {
  planPicture,
  SMALL_BYTES,
  TOP_QUALITY,
  worthIt,
  type PictureFacts,
} from "./plan"
import { levelPlans } from "./settings"

const balanced = levelPlans.balanced
const MAX = 40_000_000

/** A photograph of 2000 by 1500 pixels drawn 400 points wide: 360 dpi. */
const photo: PictureFacts = {
  width: 2000,
  height: 1500,
  bits: 8,
  space: "rgb",
  stored: "jpeg",
  bytes: 900_000,
  stencil: false,
  single: false,
  keyed: false,
  matte: false,
  mask: false,
  drawn: { width: 400, height: 300 },
  quality: 92,
  ours: false,
}
const small = { width: 833, height: 625 }
const plan = (change: Partial<PictureFacts>, level = balanced) =>
  planPicture({ ...photo, ...change }, level, MAX)

describe("planPicture", () => {
  const mono = { bits: 1, single: true, stored: "plain" as const }

  it("packs black-and-white pictures with JBIG2, at every level", () => {
    expect(plan(mono)).toEqual({ do: "bitonal" })
    expect(plan(mono, null)).toEqual({ do: "bitonal" })
    expect(plan({ ...mono, stored: "fax" })).toEqual({ do: "bitonal" })
    expect(plan({ ...mono, stencil: true, keyed: true })).toEqual({
      do: "bitonal",
    })
  })

  it("leaves black-and-white pictures it cannot pack again as they are", () => {
    // Already JBIG2, which may share shapes between letters and be smaller than ours.
    expect(plan({ ...mono, stored: "jbig2" })).toEqual({
      do: "leave",
      why: "bitonal",
    })
    expect(plan({ ...mono, stored: "other" })).toEqual({
      do: "leave",
      why: "bitonal",
    })
    // Three one-bit channels a pixel are not one bit a pixel.
    expect(plan({ ...mono, single: false })).toEqual({
      do: "leave",
      why: "bitonal",
    })
    // A stencil or a fax picture that claims more than one bit is not trusted.
    expect(plan({ stencil: true, single: true, stored: "plain" })).toEqual({
      do: "leave",
      why: "bitonal",
    })
    expect(plan({ stored: "fax", single: true })).toEqual({
      do: "leave",
      why: "bitonal",
    })
    expect(plan({ ...mono, bytes: SMALL_BYTES - 1 })).toEqual({
      do: "leave",
      why: "small",
    })
    expect(plan({ ...mono, width: 9000, height: 9000 })).toEqual({
      do: "leave",
      why: "large",
    })
  })

  it("leaves colours it cannot be sure of", () => {
    expect(plan({ space: "other" })).toEqual({ do: "leave", why: "colours" })
    expect(plan({ stored: "other" })).toEqual({ do: "leave", why: "colours" })
  })

  it("leaves pictures with more than eight bits a channel", () => {
    expect(plan({ bits: 16 })).toEqual({ do: "leave", why: "deep" })
  })

  it("leaves pictures whose see-through parts depend on exact colours", () => {
    expect(plan({ keyed: true })).toEqual({ do: "leave", why: "masked" })
    expect(plan({ matte: true })).toEqual({ do: "leave", why: "masked" })
  })

  it("leaves pictures too small to matter, or too large to hold", () => {
    expect(plan({ width: 60, height: 60 })).toEqual({
      do: "leave",
      why: "small",
    })
    expect(plan({ bytes: SMALL_BYTES - 1 })).toEqual({
      do: "leave",
      why: "small",
    })
    expect(plan({ width: 8000, height: 6000 })).toEqual({
      do: "leave",
      why: "large",
    })
  })

  it("only repacks when nothing may be lost", () => {
    expect(plan({ stored: "plain" }, null)).toEqual({
      do: "repack",
      size: null,
    })
    expect(plan({}, null)).toEqual({ do: "leave", why: "kept" })
    expect(plan({ stored: "jpx" }, null)).toEqual({ do: "leave", why: "kept" })
  })

  it("makes a picture with too many pixels smaller", () => {
    expect(plan({})).toEqual({ do: "encode", size: small, top: TOP_QUALITY })
    expect(plan({ stored: "plain" })).toEqual({
      do: "encode",
      size: small,
      top: TOP_QUALITY,
    })
    expect(plan({ stored: "jpx" })).toEqual({
      do: "encode",
      size: small,
      top: TOP_QUALITY,
    })
  })

  it("keeps a soft mask lossless, at the size its picture needs", () => {
    expect(plan({ mask: true, stored: "plain", space: "grey" })).toEqual({
      do: "repack",
      size: small,
    })
    expect(plan({ mask: true })).toEqual({ do: "leave", why: "kept" })
  })

  const fits = { drawn: { width: 1000, height: 750 } }

  it("leaves JPEG 2000 that needs no resizing", () => {
    expect(plan({ ...fits, stored: "jpx" })).toEqual({
      do: "leave",
      why: "kept",
    })
  })

  it("leaves a JPEG that is already at or below the level's quality", () => {
    expect(plan({ ...fits, quality: 80 })).toEqual({ do: "leave", why: "fine" })
    expect(plan({ ...fits, quality: 40 })).toEqual({ do: "leave", why: "fine" })
  })

  it("leaves a JPEG it wrote itself on an earlier run, unless it must be smaller", () => {
    expect(plan({ ...fits, ours: true })).toEqual({ do: "leave", why: "fine" })
    // Unless the file has to come out under a size.
    expect(
      plan({ ...fits, ours: true }, { ...balanced!, again: true })
    ).toEqual({ do: "encode", size: null, top: 87 })
    expect(plan({ ours: true })).toEqual({
      do: "encode",
      size: small,
      top: TOP_QUALITY,
    })
  })

  it("saves a better JPEG again a step or more below its own quality", () => {
    expect(plan({ ...fits, quality: 90 })).toEqual({
      do: "encode",
      size: null,
      top: 85,
    })
    expect(plan({ ...fits, quality: 100 })).toEqual({
      do: "encode",
      size: null,
      top: TOP_QUALITY,
    })
    expect(plan({ ...fits, quality: null })).toEqual({
      do: "encode",
      size: null,
      top: TOP_QUALITY,
    })
  })

  it("re-encodes lossless pictures that need no resizing, and ones nothing is known about", () => {
    expect(plan({ ...fits, stored: "plain" })).toEqual({
      do: "encode",
      size: null,
      top: TOP_QUALITY,
    })
    expect(plan({ drawn: null, stored: "plain" })).toEqual({
      do: "encode",
      size: null,
      top: TOP_QUALITY,
    })
  })
})

describe("worthIt", () => {
  it("wants a few percent from a lossless or resized picture", () => {
    expect(worthIt(100_000, 96_000, "repacked")).toBe(true)
    expect(worthIt(100_000, 98_000, "repacked")).toBe(false)
    expect(worthIt(100_000, 96_000, "resized")).toBe(true)
  })

  it("wants much more from a JPEG saved again at its own size", () => {
    expect(worthIt(100_000, 90_000, "re-encoded")).toBe(false)
    expect(worthIt(100_000, 84_000, "re-encoded")).toBe(true)
  })

  it("does not bother for a handful of bytes", () => {
    expect(worthIt(3000, 2800, "repacked")).toBe(false)
    expect(worthIt(3000, 2700, "repacked")).toBe(true)
  })
})
