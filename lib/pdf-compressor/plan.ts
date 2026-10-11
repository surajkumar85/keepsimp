/**
 * What to do with one picture of a file. The decision is made from facts
 * alone, before any pixel is read, and it errs towards leaving a picture as
 * it is: a picture is only touched when the result is sure to mean the same.
 */
import type { Size } from "@/lib/image-compressor/geometry"
import type { LevelPlan } from "./settings"
import { sizeFor } from "./usage"

/** The colours of a picture once it is decoded. */
export type Space = "grey" | "rgb" | "cmyk" | "other"

/**
 * How a picture is stored: as a JPEG, as JPEG 2000, without loss ("plain":
 * deflated or not packed at all), in one of the two black-and-white packings
 * (fax or JBIG2), or in a way that is left alone.
 */
export type Stored = "jpeg" | "jpx" | "plain" | "fax" | "jbig2" | "other"

export interface PictureFacts extends Size {
  /** Bits per colour channel, as stored. */
  bits: number
  space: Space
  stored: Stored
  /** Its stored size in bytes. */
  bytes: number
  /** It is a stencil: one bit per pixel that says where to paint. */
  stencil: boolean
  /** Each pixel is one stored value: a shade of grey, a place in a palette, or a stencil's bit. */
  single: boolean
  /** One of its colours is see-through by a colour key, which any change of colour would break. */
  keyed: boolean
  /** It is blended with a soft mask ahead of time, so picture and mask must change together. */
  matte: boolean
  /** It is the soft mask of another picture: shades of grey that say how see-through that picture is. */
  mask: boolean
  /** The largest size it is drawn, in points; null when no page draws it in a way that can be measured. */
  drawn: Size | null
  /** For a JPEG, the quality its tables suggest; null when unknown. */
  quality: number | null
  /** It is a JPEG this compressor wrote, on an earlier run. */
  ours: boolean
}

export type Leave =
  | "bitonal"
  | "colours"
  | "deep"
  | "masked"
  | "small"
  | "large"
  | "kept"
  | "fine"

export type Step =
  | { do: "leave"; why: Leave }
  /** Store it again without loss, more tightly, at `size` if that is set. */
  | { do: "repack"; size: Size | null }
  /** Save it again, with loss allowed, at `size` if that is set, with a JPEG quality of at most `top`. */
  | { do: "encode"; size: Size | null; top: number }
  /** Pack its one bit a pixel with JBIG2, which loses nothing. */
  | { do: "bitonal" }

/** Pictures with fewer pixels or bytes than this are not worth the work. */
export const SMALL_PIXELS = 64 * 64
export const SMALL_BYTES = 2048
/** The best JPEG quality the compressor writes. */
export const TOP_QUALITY = 92
/** A JPEG saved again at its own size must drop at least this much in quality, or there is nothing to gain. */
const STEP_DOWN = 5

const leave = (why: Leave): Step => ({ do: "leave", why })

/**
 * Decide what to do with a picture.
 * @param plan The level's plan; null for the level that loses nothing.
 * @param maxPixels Pictures with more pixels than the device can hold at once are left.
 */
export function planPicture(
  facts: PictureFacts,
  plan: LevelPlan | null,
  maxPixels: number
): Step {
  const pixels = facts.width * facts.height
  const tiny = pixels < SMALL_PIXELS || facts.bytes < SMALL_BYTES
  if (
    facts.stencil ||
    facts.bits === 1 ||
    facts.stored === "fax" ||
    facts.stored === "jbig2"
  ) {
    // The stored bits are packed again as they are, so what they stand for
    // (grey, a palette, a stencil, either way up) does not come into it.
    if (
      facts.bits !== 1 ||
      !facts.single ||
      (facts.stored !== "plain" && facts.stored !== "fax")
    )
      return leave("bitonal")
    if (tiny) return leave("small")
    if (pixels > maxPixels) return leave("large")
    return { do: "bitonal" }
  }
  if (facts.space === "other" || facts.stored === "other")
    return leave("colours")
  if (facts.bits > 8) return leave("deep")
  if (facts.keyed || facts.matte) return leave("masked")
  if (tiny) return leave("small")
  if (pixels > maxPixels) return leave("large")
  const plain = facts.stored === "plain"
  if (!plan) return plain ? { do: "repack", size: null } : leave("kept")
  const size = sizeFor(facts, facts.drawn, plan.dpi, plan.slack)
  // A soft mask keeps hard edges only when nothing is lost.
  if (facts.mask) return plain ? { do: "repack", size } : leave("kept")
  if (facts.stored === "jpx")
    return size ? { do: "encode", size, top: TOP_QUALITY } : leave("kept")
  if (facts.stored === "jpeg" && !size) {
    // Its quality was chosen by measuring against the picture it came from.
    if (facts.ours && !plan.again) return leave("fine")
    if (facts.quality === null)
      return { do: "encode", size: null, top: TOP_QUALITY }
    if (facts.quality <= plan.keepBelow) return leave("fine")
    return {
      do: "encode",
      size: null,
      top: Math.min(TOP_QUALITY, facts.quality - STEP_DOWN),
    }
  }
  return { do: "encode", size, top: TOP_QUALITY }
}

/** How a picture was changed, for judging whether the change is worth keeping. */
export type Change = "repacked" | "resized" | "re-encoded"

/**
 * The share a picture must shrink by to be swapped in. Saving a JPEG again
 * at its own size costs a little quality every time, so it has to pay well.
 */
const MUST_SAVE: Record<Change, number> = {
  repacked: 0.03,
  resized: 0.03,
  "re-encoded": 0.15,
}
const MUST_SAVE_BYTES = 256

/** True when the new picture is enough smaller to replace the old one. */
export function worthIt(before: number, after: number, change: Change) {
  return (
    before - after >= MUST_SAVE_BYTES &&
    after <= before * (1 - MUST_SAVE[change])
  )
}
