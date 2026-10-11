/**
 * Compressing with MuPDF. The file is changed in place, in memory, and
 * written out again, so everything that is not touched stays exactly as it
 * was: text, links, bookmarks, forms, tags and layers.
 *
 * Pictures are taken one at a time. Each is read, perhaps made smaller,
 * saved again, and only swapped in when the new one is smaller and has been
 * read back from the file and found to be what was meant.
 */
import type * as MuPDF from "mupdf"
import type { Size } from "@/lib/image-compressor/geometry"
import {
  qualityRange,
  searchQuality,
  similarityScore,
  ssimTarget,
} from "@/lib/image-compressor/quality"
import {
  contentKind,
  similarity,
  type ContentKind,
  type Pixels,
} from "@/lib/image-compressor/ssim"
import { drawPage, PasswordNeeded } from "@/lib/pdf-merger/mupdf-engine"
import {
  checkResult,
  pagesToCheck,
  type CheckResult,
  type PageScore,
} from "./check"
import { bitsFromSamples, encodeJbig2 } from "./jbig2"
import { inkMask, inkShare, rebuild, splitLayers } from "./layers"
import { readJpeg, tagJpeg } from "./jpeg"
import { auditPdf, eachObject, type Audit } from "./mupdf-audit"
import {
  fromRgba,
  greyMatches,
  joinCmyk,
  sameBytes,
  samplePixels,
  splitCmyk,
  tight,
  toRgba,
} from "./pixels"
import {
  planPicture,
  TOP_QUALITY,
  worthIt,
  type Change,
  type PictureFacts,
  type Space,
  type Step,
  type Stored,
} from "./plan"
import { filterUp, greyPalette, readPng, samplesOf } from "./png"
import type { Stage } from "./report"
import {
  layerStep,
  levelPlans,
  outcome,
  pageMarks,
  SCAN_COVERS,
  scanMarks,
  scanSettings,
  TARGET_MARK,
  type Level,
  type LevelPlan,
  type ScanChoice,
} from "./settings"
import { fitTarget, stepCount, stepPlan } from "./target"
import {
  drawnSize,
  largest,
  resolution,
  sizeFor,
  type DrawMatrix,
} from "./usage"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

/** The picture codecs, handed in so the same code runs in the worker and in Node. */
export interface Codecs {
  /** A JPEG of RGBA pixels; a grey one stores a single channel. */
  jpeg(pixels: Pixels, quality: number, grey: boolean): Promise<Uint8Array>
  /** `linear` resizes in linear light, which is right for photographs and wrong for masks. */
  resize(pixels: Pixels, size: Size, linear: boolean): Promise<Pixels>
  /** A PNG that loses nothing, packed as tightly as it goes. */
  png(pixels: Pixels): Promise<Uint8Array>
  deflate(bytes: Uint8Array): Promise<Uint8Array>
}

export type { Stage } from "./report"

export interface CompressOptions {
  level: Level
  codecs: Codecs
  password?: string
  /** The file as it was, already open, for the pictures of "before"; opened from the bytes when left out. */
  pristine?: Doc
  /** Pictures with more pixels than this are left as they are. */
  maxPixels?: number
  /** What to do with scanned pages; they are treated like any picture when left out. */
  scans?: ScanChoice
  /** The most pages to draw before and after. */
  checkBudget?: number
  /** Called between pages and pictures; it may pause, or throw to stop. */
  checkpoint?: () => Promise<void>
  /** `attempt` counts from 1 when the file is written several times to reach a size. */
  progress?: (
    stage: Stage,
    done: number,
    total: number,
    attempt?: number
  ) => void
}

/** A size to come out under, for `compressToSize`. */
export interface TargetOptions extends Omit<CompressOptions, "level"> {
  /** The size to stay within, in bytes. */
  target: number
  /** Go on past what is easy to read, if that is what the size takes. */
  further: boolean
}

export interface CompressReport {
  before: number
  /** The size of the result; the size of the original when the result was not worth keeping. */
  after: number
  /** False when nothing worth keeping came of it. The original is then the answer. */
  smaller: boolean
  pictures: {
    found: number
    /** Swapped for a smaller one. */
    changed: number
    /** Of those, how many were also brought down in size. */
    resized: number
  }
  /** Fonts were cut down to the letters in use. */
  fontsCut: boolean
  /** Page thumbnails and entries of private app data taken out. */
  dropped: { thumbnails: number; private: number }
  check: CheckResult
  /** What the result's bytes are spent on; null when there is no result. */
  audit: Audit | null
  /** Scanned pages that were rebuilt, and how. */
  scans?: { how: ScanChoice; pictures: number }
  /** For a file that was to come out under a size: the size, and whether it did. */
  target?: {
    wanted: number
    met: boolean
    /** How many times the file was written to find out. */
    writes: number
  }
}

export interface Compressed {
  /** The result; null when the original is already as small. */
  bytes: Uint8Array | null
  report: CompressReport
}

const DEFAULT_MAX_PIXELS = 40_000_000
const DEFAULT_CHECK_BUDGET = 24
/** The longer side, in pixels, of the pages drawn for the check. */
const CHECK_EDGE = 900
/** The quality is searched for on this many pixels of a large picture. */
const SAMPLE_PIXELS = 400_000
/** How many times a picture is saved while its quality is searched for. */
const SEARCH_STEPS = 5
/** A picture saved with loss may score this much under its mark when the whole of it is read back. */
const SAMPLE_LEEWAY = 0.03
/** A drawing is saved as a JPEG only when that takes at most this share of its lossless size. */
const DRAWING_AS_JPEG = 0.6
/** Fonts stored whole are only cut when they add up to this many bytes. */
const FONTS_WORTH_CUTTING = 32 * 1024
/** The most pages compared to make sure cut fonts still write the same. */
const FONT_CHECK_PAGES = 24
const FONT_CHECK_EDGE = 500

const nameOf = (object: Obj) => (object.isName() ? object.asName() : "")
const numberOf = (object: Obj) => (object.isNumber() ? object.asNumber() : 0)

function open(mupdf: Engine, bytes: Uint8Array, password?: string) {
  const doc = new mupdf.PDFDocument(bytes)
  if (
    doc.needsPassword() &&
    (password === undefined || !doc.authenticatePassword(password))
  ) {
    doc.destroy()
    throw new PasswordNeeded(password !== undefined)
  }
  return doc
}

/** One picture of the file. */
interface Entry {
  ref: Obj
  number: number
  image: MuPDF.Image
  drawn: Size | null
  pages: Set<number>
  mask: boolean
  matte: boolean
  /** The largest share of a page it covers where it is drawn, from 0 to 1. */
  covers: number
}

const PLAIN_FILTERS = new Set([
  "FlateDecode",
  "Fl",
  "LZWDecode",
  "LZW",
  "RunLengthDecode",
  "RL",
  "ASCIIHexDecode",
  "AHx",
  "ASCII85Decode",
  "A85",
])

/** How a picture is stored, from the filters its stream names. */
function storedAs(ref: Obj): Stored {
  const filter = ref.get("Filter")
  const names: string[] = []
  if (filter.isArray())
    filter.forEach((entry) => void names.push(nameOf(entry)))
  else if (!filter.isNull()) names.push(nameOf(filter))
  const last = names.at(-1)
  if (last === "DCTDecode" || last === "DCT") return "jpeg"
  if (last === "JPXDecode") return "jpx"
  if (last === "CCITTFaxDecode" || last === "CCF") return "fax"
  if (last === "JBIG2Decode") return "jbig2"
  return names.every((name) => PLAIN_FILTERS.has(name)) ? "plain" : "other"
}

/**
 * The colours of a picture, and the colour space its pixels are in once a
 * palette has been looked up.
 */
function spaceOf(space: Obj): { space: Space; base: Obj } {
  const other = { space: "other" as Space, base: space }
  if (space.isName()) {
    const name = space.asName()
    if (name === "DeviceGray" || name === "G")
      return { space: "grey", base: space }
    if (name === "DeviceRGB" || name === "RGB")
      return { space: "rgb", base: space }
    if (name === "DeviceCMYK" || name === "CMYK")
      return { space: "cmyk", base: space }
    return other
  }
  if (!space.isArray() || space.length < 2) return other
  const kind = nameOf(space.get(0))
  if (kind === "CalGray") return { space: "grey", base: space }
  if (kind === "CalRGB") return { space: "rgb", base: space }
  if (kind === "ICCBased") {
    const channels = numberOf(space.get(1).get("N"))
    if (channels === 1) return { space: "grey", base: space }
    if (channels === 3) return { space: "rgb", base: space }
    if (channels === 4) return { space: "cmyk", base: space }
    return other
  }
  if (kind === "Indexed" || kind === "I") {
    const base = spaceOf(space.get(1))
    // A palette of palettes does not exist; anything else odd is left alone.
    return base.space === "other" ? other : base
  }
  return other
}

/** True when a colour space stores one value a pixel: a grey, or a place in a palette. */
function onePerPixel(space: Obj) {
  if (space.isArray() && space.length > 1) {
    const kind = nameOf(space.get(0))
    if (kind === "Indexed" || kind === "I") return true
  }
  return spaceOf(space).space === "grey"
}

const CHANNELS: Record<Exclude<Space, "other">, 1 | 3 | 4> = {
  grey: 1,
  rgb: 3,
  cmyk: 4,
}

function factsOf(entry: Entry): PictureFacts {
  const { ref } = entry
  const stencil =
    ref.get("ImageMask").isBoolean() && ref.get("ImageMask").asBoolean()
  const stored = storedAs(ref)
  let quality: number | null = null
  let ours = false
  if (stored === "jpeg") {
    const raw = ref.readRawStream()
    try {
      const read = readJpeg(raw.asUint8Array())
      quality = read?.quality ?? null
      ours = Boolean(read?.ours)
    } finally {
      raw.destroy()
    }
  }
  return {
    width: numberOf(ref.get("Width")),
    height: numberOf(ref.get("Height")),
    bits: stencil ? 1 : numberOf(ref.get("BitsPerComponent")),
    space: stencil ? "grey" : spaceOf(ref.get("ColorSpace")).space,
    stored,
    bytes: numberOf(ref.get("Length")),
    stencil,
    single: stencil || onePerPixel(ref.get("ColorSpace")),
    keyed: ref.get("Mask").isArray(),
    matte: entry.matte,
    mask: entry.mask,
    drawn: entry.drawn,
    quality,
    ours,
  }
}

/** Every picture of the file, held so the engine keeps each one at the same place in memory. */
function findPictures(doc: Doc) {
  const entries = new Map<number, Entry>()
  eachObject(doc, (ref, number) => {
    if (!ref.isStream() || nameOf(ref.get("Subtype")) !== "Image") return
    try {
      entries.set(number, {
        ref,
        number,
        image: doc.loadImage(ref),
        drawn: null,
        pages: new Set(),
        mask: false,
        matte: false,
        covers: 0,
      })
    } catch {
      // A picture the engine cannot read is left as it is.
    }
  })
  return entries
}

/**
 * Note how large every picture is drawn, by going through each page the way
 * a viewer would and listening for the pictures it paints.
 */
async function measureUse(
  mupdf: Engine,
  doc: Doc,
  entries: Map<number, Entry>,
  options: Omit<CompressOptions, "level">,
  attempt?: number
) {
  const byImage = new Map<number, Entry>()
  for (const entry of entries.values())
    byImage.set(entry.image.pointer as unknown as number, entry)
  const total = doc.countPages()
  for (let index = 0; index < total; index++) {
    await options.checkpoint?.()
    options.progress?.("reading", index, total, attempt)
    let sheet = 0
    const note = (image: MuPDF.Image, matrix: number[]) => {
      const entry = byImage.get(image.pointer as unknown as number)
      if (!entry) return
      const size = drawnSize(matrix as unknown as DrawMatrix)
      entry.drawn = largest(entry.drawn ?? undefined, size)
      entry.pages.add(index)
      if (sheet > 0)
        entry.covers = Math.max(
          entry.covers,
          Math.min(1, (size.width * size.height) / sheet)
        )
    }
    const device = new mupdf.Device({
      fillImage: (image, matrix) => note(image, matrix),
      fillImageMask: (image, matrix) => note(image, matrix),
    })
    try {
      const page = doc.loadPage(index)
      try {
        const [left, top, right, bottom] = page.getBounds()
        sheet = (right - left) * (bottom - top)
        page.run(device, mupdf.Matrix.identity)
        device.close()
      } finally {
        page.destroy()
      }
    } catch {
      // A page that cannot be gone through tells nothing; its pictures keep their size.
    } finally {
      device.destroy()
    }
  }
  // A soft mask is never painted itself: it is used wherever its picture is.
  for (const entry of entries.values()) {
    const soft = entry.ref.get("SMask")
    if (!soft.isStream()) continue
    const mask = entries.get(soft.asIndirect())
    if (!mask) continue
    mask.mask = true
    if (entry.drawn) mask.drawn = largest(mask.drawn ?? undefined, entry.drawn)
    for (const page of entry.pages) mask.pages.add(page)
    if (!soft.get("Matte").isNull()) entry.matte = mask.matte = true
  }
}

/** A picture's pixels as the engine decodes them, with nothing between the rows. */
function decode(image: MuPDF.Image) {
  const pixmap = image.toPixmap()
  try {
    const width = pixmap.getWidth()
    const height = pixmap.getHeight()
    const channels = pixmap.getNumberOfComponents()
    // A stencil comes as coverage alone, which is one channel like any other.
    if (pixmap.getAlpha() && channels !== 1) return null
    return {
      width,
      height,
      channels,
      bytes: tight(
        pixmap.getPixels(),
        width,
        height,
        pixmap.getStride(),
        channels
      ),
    }
  } finally {
    pixmap.destroy()
  }
}

/** Picture bytes of 1, 3 or 4 channels in the engine's own picture type. */
function toPixmap(
  mupdf: Engine,
  bytes: Uint8Array,
  size: Size,
  channels: 1 | 3 | 4
) {
  const space =
    channels === 1
      ? mupdf.ColorSpace.DeviceGray
      : channels === 3
        ? mupdf.ColorSpace.DeviceRGB
        : mupdf.ColorSpace.DeviceCMYK
  const pixmap = new mupdf.Pixmap(space, [0, 0, size.width, size.height], false)
  const stride = pixmap.getStride()
  const target = pixmap.getPixels()
  const row = size.width * channels
  for (let y = 0; y < size.height; y++)
    target.set(bytes.subarray(y * row, (y + 1) * row), y * stride)
  return pixmap
}

/** CMYK bytes as RGBA, converted by the engine, to be looked at and compared. */
function cmykToRgba(mupdf: Engine, bytes: Uint8Array, size: Size) {
  const pixmap = toPixmap(mupdf, bytes, size, 4)
  try {
    const rgb = pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB)
    try {
      return toRgba(
        tight(rgb.getPixels(), size.width, size.height, rgb.getStride(), 3),
        size.width,
        size.height,
        3
      )
    } finally {
      rgb.destroy()
    }
  } finally {
    pixmap.destroy()
  }
}

/** What a picture's description has to say once its data is replaced. */
interface Described {
  bytes: Uint8Array
  size: Size
  bits: number
  filter: "DCTDecode" | "FlateDecode"
  /** For deflated rows stored the way a PNG stores them: how many samples a pixel has. */
  predictor: number | null
  /** The colour space to write; null to keep the one it has. */
  space: Obj | null
  change: Change
  /** True when the pixels must come back exactly. */
  exact: boolean
}

const KEYS_REPLACED = new Set([
  "Length",
  "Filter",
  "DecodeParms",
  "Decode",
  "Width",
  "Height",
  "BitsPerComponent",
  "ColorSpace",
  "DL",
])

/** Write a picture's new description onto `target`, which already holds the rest. */
function describe(doc: Doc, target: Obj, to: Described, space: Obj) {
  target.put("Width", to.size.width)
  target.put("Height", to.size.height)
  target.put("BitsPerComponent", to.bits)
  target.put("ColorSpace", to.space ?? space)
  target.put("Filter", doc.newName(to.filter))
  if (to.predictor !== null) {
    const parms = doc.newDictionary()
    // 15 says each row names its own PNG filter.
    parms.put("Predictor", 15)
    parms.put("Colors", to.predictor)
    parms.put("BitsPerComponent", to.bits)
    parms.put("Columns", to.size.width)
    target.put("DecodeParms", parms)
  }
}

interface Work {
  mupdf: Engine
  doc: Doc
  codecs: Codecs
  plan: LevelPlan | null
}

/** A picture's pixels in the shape each step needs. */
interface Decoded {
  size: Size
  channels: 1 | 3 | 4
  /** The channels as stored: the truth a lossless result is held to. */
  bytes: Uint8Array
  /** The picture as RGBA, for looking at and for the grey and colour codecs. */
  rgba: Pixels
}

async function resized(work: Work, from: Decoded, size: Size, mask: boolean) {
  const { codecs, mupdf } = work
  if (from.channels === 4) {
    const parts = splitCmyk(from.bytes, from.size.width, from.size.height)
    const bytes = joinCmyk(
      await codecs.resize(parts.colour, size, false),
      await codecs.resize(parts.black, size, false)
    )
    return {
      size,
      channels: 4,
      bytes,
      rgba: cmykToRgba(mupdf, bytes, size),
    } satisfies Decoded
  }
  const rgba = await codecs.resize(from.rgba, size, !mask)
  return {
    size,
    channels: from.channels,
    bytes: fromRgba(rgba, from.channels),
    rgba,
  } satisfies Decoded
}

/** The picture saved without loss as plain deflated rows, with or without a filter, whichever is smaller. */
async function deflated(work: Work, from: Decoded, change: Change) {
  const row = from.size.width * from.channels
  const [plain, filtered] = await Promise.all([
    work.codecs.deflate(from.bytes),
    work.codecs.deflate(filterUp(from.bytes, row)),
  ])
  const best = filtered.length < plain.length
  return {
    bytes: best ? filtered : plain,
    size: from.size,
    bits: 8,
    filter: "FlateDecode",
    predictor: best ? from.channels : null,
    space: null,
    change,
    exact: true,
  } satisfies Described
}

/**
 * The picture saved without loss through the PNG optimiser, whose data a
 * PDF can hold as it is. Falls back to plain deflated rows when the PNG
 * comes out in a shape the picture's colour space cannot take.
 */
async function repacked(
  work: Work,
  entry: Entry,
  from: Decoded,
  change: Change
): Promise<Described> {
  const plain = () => deflated(work, from, change)
  if (from.channels === 4 || entry.mask) return plain()
  const png = readPng(await work.codecs.png(from.rgba))
  if (!png || png.width !== from.size.width || png.height !== from.size.height)
    return plain()
  const { doc } = work
  const { base } = spaceOf(entry.ref.get("ColorSpace"))
  let space: Obj | null = null
  if (png.colour === "palette") {
    // The palette is in the picture's own colour space: grey pictures get one byte a colour.
    const table = from.channels === 1 ? greyPalette(png.palette!) : png.palette!
    if (!table) return plain()
    space = doc.newArray()
    space.push(doc.newName("Indexed"))
    space.push(base)
    space.push(table.length / from.channels - 1)
    space.push(doc.newByteString(table))
  } else if (png.colour === "grey" && from.channels === 3) {
    // Only plain RGB may become plain grey; a colour profile would be lost.
    if (nameOf(base) !== "DeviceRGB") return plain()
    space = doc.newName("DeviceGray")
  } else if (samplesOf(png.colour) !== from.channels) return plain()
  else space = base
  return {
    bytes: png.data,
    size: from.size,
    bits: png.bits,
    filter: "FlateDecode",
    predictor: samplesOf(png.colour),
    space,
    change,
    exact: true,
  }
}

/** A JPEG of the picture at the lowest quality that still looks the same; null when none does. */
async function asJpeg(
  work: Work,
  from: Decoded,
  kind: ContentKind,
  top: number,
  change: Change,
  /** Take the best quality when no quality reaches the mark. */
  settle: boolean
): Promise<Described | null> {
  const { mupdf, codecs } = work
  const plan = work.plan!
  const range = { ...qualityRange.jpeg, min: plan.floor }
  if (top < range.min) return null
  const encode = async (pixels: Pixels, bytes: Uint8Array, quality: number) => {
    if (from.channels !== 4)
      return codecs.jpeg(pixels, quality, from.channels === 1)
    const pixmap = toPixmap(mupdf, bytes, pixels, 4)
    try {
      return pixmap.asJPEG(quality, false).slice()
    } finally {
      pixmap.destroy()
    }
  }
  /** What a viewer will see of a JPEG, as RGBA. */
  const look = (jpeg: Uint8Array, size: Size) => {
    const image = new mupdf.Image(jpeg)
    try {
      const seen = decode(image)
      if (!seen || seen.channels !== from.channels) return null
      return seen.channels === 4
        ? cmykToRgba(mupdf, seen.bytes, size)
        : toRgba(seen.bytes, size.width, size.height, seen.channels as 1 | 3)
    } finally {
      image.destroy()
    }
  }
  // The search runs on a sample; CMYK keeps its own bytes beside what it looks like.
  const sample = samplePixels(from.rgba, SAMPLE_PIXELS)
  const whole = sample === from.rgba
  const sampleBytes =
    from.channels === 4
      ? whole
        ? from.bytes
        : new Uint8Array(
            samplePixels(
              {
                data: new Uint8ClampedArray(from.bytes),
                width: from.size.width,
                height: from.size.height,
              },
              SAMPLE_PIXELS
            ).data
          )
      : from.bytes
  // A drawing is held to the strictest mark at every level: ringing along
  // its edges is what gives a JPEG away.
  const threshold = ssimTarget(
    kind === "graphic" ? "high" : plan.look,
    "jpeg",
    kind
  )
  const described = (bytes: Uint8Array): Described => ({
    bytes: tagJpeg(bytes),
    size: from.size,
    bits: 8,
    filter: "DCTDecode",
    predictor: null,
    space: null,
    change,
    exact: false,
  })
  // When the file has to come out under a size, the size decides the quality.
  if (plan.fixed !== undefined)
    return described(
      await encode(from.rgba, from.bytes, Math.min(top, plan.fixed))
    )
  const found = await searchQuality({
    min: range.min,
    max: top,
    start: Math.min(top, Math.max(range.min, range.start)),
    steps: SEARCH_STEPS,
    threshold,
    encode: async (quality) => {
      const bytes = await encode(sample, sampleBytes, quality)
      return { bytes: bytes.buffer as ArrayBuffer, view: bytes }
    },
    measure: async (result) => {
      const seen = look(result.view, sample)
      return seen ? similarityScore(similarity(sample, seen), kind) : 0
    },
  })
  // Grain and noise can keep even the best JPEG under the mark. A picture
  // being made smaller, or leaving a lossless store, still gains from the
  // best quality; a JPEG saved again at its own size would gain nothing.
  if (!found.met && !settle) return null
  const bytes = whole
    ? found.result.view
    : await encode(from.rgba, from.bytes, found.quality)
  if (!whole && found.met) {
    const seen = look(bytes, from.size)
    if (
      !seen ||
      similarityScore(similarity(from.rgba, seen), kind) <
        threshold - SAMPLE_LEEWAY
    )
      return null
  }
  return described(bytes)
}

const smallest = (candidates: (Described | null)[]) =>
  candidates.reduce<Described | null>(
    (best, next) =>
      next && (!best || next.bytes.length < best.bytes.length) ? next : best,
    null
  )

/**
 * Read a candidate back out of the file itself and make sure it is what was
 * meant: the right size and channels, and for a lossless one the very same
 * pixels.
 */
function holds(work: Work, entry: Entry, to: Described, truth: Decoded) {
  const { doc } = work
  const dict = doc.newDictionary()
  entry.ref.forEach((value, key) => {
    if (!KEYS_REPLACED.has(String(key))) dict.put(String(key), value)
  })
  describe(doc, dict, to, spaceOf(entry.ref.get("ColorSpace")).base)
  const trial = doc.addRawStream(to.bytes, dict)
  try {
    const image = doc.loadImage(trial)
    try {
      const seen = decode(image)
      if (
        !seen ||
        seen.width !== to.size.width ||
        seen.height !== to.size.height
      )
        return false
      if (!to.exact) return seen.channels === truth.channels
      return seen.channels === truth.channels
        ? sameBytes(seen.bytes, truth.bytes)
        : seen.channels === 1 && greyMatches(truth.bytes, seen.bytes)
    } finally {
      image.destroy()
    }
  } catch {
    return false
  } finally {
    // The trial is left with nothing in it; writing the file drops it, as
    // nothing points at it. Deleting it here would leave a hole that every
    // later pass over the file's objects trips on.
    trial.writeRawStream(new Uint8Array(0))
  }
}

/** Carry out a step on one picture. Returns how it was changed, or null when it was left. */
async function shrink(
  work: Work,
  entry: Entry,
  step: Exclude<Step, { do: "leave" | "bitonal" }>
) {
  const facts = spaceOf(entry.ref.get("ColorSpace"))
  if (facts.space === "other") return null
  const seen = decode(entry.image)
  const channels = CHANNELS[facts.space]
  if (!seen || seen.channels !== channels) return null
  const size = { width: seen.width, height: seen.height }
  const original: Decoded = {
    size,
    channels,
    bytes: seen.bytes,
    rgba:
      channels === 4
        ? cmykToRgba(work.mupdf, seen.bytes, size)
        : toRgba(seen.bytes, size.width, size.height, channels),
  }
  const from = step.size
    ? await resized(work, original, step.size, entry.mask)
    : original
  const before = numberOf(entry.ref.get("Length"))
  const plain = storedAs(entry.ref) === "plain"
  /** What the candidate must match when it is read back. */
  let truth = from
  let to: Described | null
  if (step.do === "repack")
    to = await repacked(work, entry, from, step.size ? "resized" : "repacked")
  else {
    const kind = contentKind(from.rgba)
    const change: Change = step.size ? "resized" : "re-encoded"
    const jpeg = await asJpeg(
      work,
      from,
      kind,
      step.top,
      change,
      // A drawing under its mark shows ringing; it goes lossless instead.
      kind === "photo" && (Boolean(step.size) || plain)
    )
    // Drawings keep sharper edges without loss, and are often smaller that way too.
    const lossless =
      kind === "graphic" || !jpeg
        ? plain || step.size
          ? await repacked(
              work,
              entry,
              from,
              step.size ? "resized" : "repacked"
            )
          : null
        : null
    // A drawing only becomes a JPEG when that is far smaller than keeping it exact.
    to =
      kind === "graphic" &&
      jpeg &&
      lossless &&
      jpeg.bytes.length > lossless.bytes.length * DRAWING_AS_JPEG
        ? lossless
        : smallest([jpeg, lossless])
    // Flat colour often packs tightest with every pixel it has: fewer pixels
    // mean soft edges, and soft edges pack badly.
    if (kind === "graphic" && plain && step.size) {
      const whole = await repacked(work, entry, original, "repacked")
      if (!to || whole.bytes.length <= to.bytes.length) {
        to = whole
        truth = original
      }
    }
  }
  if (!to || !worthIt(before, to.bytes.length, to.change)) return null
  if (!holds(work, entry, to, truth)) return null
  const { base } = facts
  entry.ref.writeRawStream(to.bytes)
  for (const key of ["DecodeParms", "Decode", "DL"]) entry.ref.delete(key)
  describe(work.doc, entry.ref, to, base)
  return to.change
}

/** A scan with a smaller share of ink than this holds no print worth layering. */
const LEAST_INK = 0.0005
/** With more ink than this, it is not print on paper. */
const MOST_INK = 0.35
/** How alike the layers, put back together, must be to the scan (mean SSIM). */
const LAYERS_MARK = 0.9
/** Scans smaller than this each way are not worth rebuilding. */
const SMALLEST_SCAN = 400
/** What a picture keeps of its description when it becomes a drawing of layers. */
const KEPT_BY_A_FORM = new Set(["Type", "OC", "StructParent", "Name"])

/** True for a picture that is a scan of a whole page, and plain enough to rebuild. */
function isScan(entry: Entry, facts: PictureFacts, maxPixels: number) {
  const { ref } = entry
  return (
    entry.covers >= SCAN_COVERS &&
    !entry.mask &&
    !facts.stencil &&
    !facts.keyed &&
    !facts.matte &&
    facts.bits === 8 &&
    (facts.space === "grey" || facts.space === "rgb") &&
    (facts.stored === "jpeg" ||
      facts.stored === "plain" ||
      facts.stored === "jpx") &&
    facts.width >= SMALLEST_SCAN &&
    facts.height >= SMALLEST_SCAN &&
    facts.width * facts.height <= maxPixels &&
    ref.get("SMask").isNull() &&
    ref.get("Mask").isNull()
  )
}

/** A colour picture with its colour taken out. */
function greyOf(from: Decoded): Decoded {
  const count = from.size.width * from.size.height
  const bytes = new Uint8Array(count)
  for (let index = 0; index < count; index++) {
    const at = index * 3
    bytes[index] =
      (from.bytes[at] * 77 +
        from.bytes[at + 1] * 150 +
        from.bytes[at + 2] * 29 +
        128) >>
      8
  }
  return {
    size: from.size,
    channels: 1,
    bytes,
    rgba: toRgba(bytes, from.size.width, from.size.height, 1),
  }
}

/** True when a stored picture reads back with this size and, if given, exactly these one-channel bytes. */
function readsBack(doc: Doc, ref: Obj, size: Size, bytes?: Uint8Array) {
  try {
    const image = doc.loadImage(ref)
    try {
      const seen = decode(image)
      return Boolean(
        seen &&
        seen.width === size.width &&
        seen.height === size.height &&
        (!bytes || sameBytes(seen.bytes, bytes))
      )
    } finally {
      image.destroy()
    }
  } catch {
    return false
  }
}

/**
 * Rebuild a scanned page: in greyscale, in black and white, or as sharp
 * letters over soft paper. Returns what was done, or null when the scan is
 * better left to the usual way with pictures.
 */
async function rebuildScan(
  work: Work,
  entry: Entry,
  how: Exclude<ScanChoice, "keep">
): Promise<Change | null> {
  const { doc, codecs } = work
  const plan = work.plan!
  const { ref } = entry
  const found = spaceOf(ref.get("ColorSpace"))
  const seen = decode(entry.image)
  if (!seen || (seen.channels !== 1 && seen.channels !== 3)) return null
  if (found.space !== (seen.channels === 1 ? "grey" : "rgb")) return null
  const size = { width: seen.width, height: seen.height }
  const original: Decoded = {
    size,
    channels: seen.channels,
    bytes: seen.bytes,
    rgba: toRgba(seen.bytes, size.width, size.height, seen.channels),
  }
  const before = numberOf(ref.get("Length"))
  const settings = scanSettings(plan)

  if (how === "grey") {
    // A scan that is grey already goes the usual way.
    if (original.channels === 1) return null
    const smaller = sizeFor(size, entry.drawn, plan.dpi, plan.slack)
    const grey = greyOf(original)
    const from = smaller ? await resized(work, grey, smaller, false) : grey
    const to = await asJpeg(work, from, "photo", TOP_QUALITY, "resized", true)
    if (!to || !worthIt(before, to.bytes.length, "resized")) return null
    const described = { ...to, space: doc.newName("DeviceGray") }
    if (!holds(work, entry, described, from)) return null
    ref.writeRawStream(described.bytes)
    for (const key of ["DecodeParms", "Decode", "DL"]) ref.delete(key)
    describe(doc, ref, described, found.base)
    return "resized"
  }

  // Letters are kept at the scan's own sharpness, up to a limit.
  const sharp = sizeFor(size, entry.drawn, settings.maskDpi, 1.1)
  const at = sharp ? await resized(work, original, sharp, false) : original
  const dpi =
    (entry.drawn && resolution(at.size, entry.drawn)) ?? settings.maskDpi
  const picture = (bytes: Uint8Array, extra: Record<string, unknown>) =>
    doc.addRawStream(bytes, {
      Type: doc.newName("XObject"),
      Subtype: doc.newName("Image"),
      ...extra,
    })

  if (how === "mono") {
    const mask = inkMask(at.rgba, true)
    const coded = encodeJbig2(mask, at.size.width, at.size.height)
    if (!worthIt(before, coded.length, "resized")) return null
    const expected = new Uint8Array(mask.length)
    for (let index = 0; index < mask.length; index++)
      expected[index] = mask[index] ? 0 : 255
    const trial = picture(coded, {
      Width: at.size.width,
      Height: at.size.height,
      BitsPerComponent: 1,
      ColorSpace: doc.newName("DeviceGray"),
      Filter: doc.newName("JBIG2Decode"),
    })
    const good = readsBack(doc, trial, at.size, expected)
    trial.writeRawStream(new Uint8Array(0))
    if (!good) return null
    ref.writeRawStream(coded)
    for (const key of ["DecodeParms", "Decode", "DL"]) ref.delete(key)
    ref.put("Width", at.size.width)
    ref.put("Height", at.size.height)
    ref.put("BitsPerComponent", 1)
    ref.put("ColorSpace", doc.newName("DeviceGray"))
    ref.put("Filter", doc.newName("JBIG2Decode"))
    return "resized"
  }

  const paperStep = layerStep(dpi, settings.paperDpi)
  const layers = splitLayers(at.rgba, paperStep, paperStep * 3)
  const share = inkShare(layers.mask)
  if (share < LEAST_INK || share > MOST_INK) return null
  if (similarity(at.rgba, rebuild(layers)).mean < LAYERS_MARK) return null
  const grey = at.channels === 1
  const mask = encodeJbig2(layers.mask, layers.width, layers.height)
  const paper = tagJpeg(
    await codecs.jpeg(layers.paper, settings.paperQuality, grey)
  )
  // The ink's colours are stored without loss: there are few of them, and a
  // JPEG would smear one letter's colour into the next.
  const channels = grey ? 1 : 3
  const colours = fromRgba(layers.ink, channels)
  const [plain, filtered] = await Promise.all([
    codecs.deflate(colours),
    codecs.deflate(filterUp(colours, layers.ink.width * channels)),
  ])
  const ink = filtered.length < plain.length ? filtered : plain
  if (
    !worthIt(before, mask.length + paper.length + ink.length + 200, "resized")
  )
    return null
  const soft = (bytes: Uint8Array, of: Pixels, extra = {}) =>
    picture(bytes, {
      Width: of.width,
      Height: of.height,
      BitsPerComponent: 8,
      ColorSpace: found.base,
      ...extra,
    })
  const maskRef = picture(mask, {
    Width: layers.width,
    Height: layers.height,
    ImageMask: true,
    BitsPerComponent: 1,
    Filter: doc.newName("JBIG2Decode"),
  })
  const paperRef = soft(paper, layers.paper, {
    Filter: doc.newName("DCTDecode"),
    // Few pixels drawn large: a viewer should blend them, not show squares.
    Interpolate: true,
  })
  const parms = doc.newDictionary()
  parms.put("Predictor", 15)
  parms.put("Colors", channels)
  parms.put("BitsPerComponent", 8)
  parms.put("Columns", layers.ink.width)
  const inkRef = soft(ink, layers.ink, {
    Filter: doc.newName("FlateDecode"),
    ...(ink === filtered ? { DecodeParms: parms } : null),
    Mask: maskRef,
  })
  if (
    !readsBack(doc, maskRef, layers) ||
    !readsBack(doc, paperRef, layers.paper) ||
    !readsBack(doc, inkRef, layers.ink, colours)
  ) {
    for (const made of [maskRef, paperRef, inkRef])
      made.writeRawStream(new Uint8Array(0))
    return null
  }
  // The picture becomes a drawing of its layers. It keeps its number, so the
  // page that shows it needs no change, and text hidden over it stays put.
  const keys: string[] = []
  ref.forEach((_value, key) => void keys.push(String(key)))
  for (const key of keys) if (!KEPT_BY_A_FORM.has(key)) ref.delete(key)
  ref.put("Type", doc.newName("XObject"))
  ref.put("Subtype", doc.newName("Form"))
  ref.put("BBox", [0, 0, 1, 1])
  const names = doc.newDictionary()
  names.put("Paper", paperRef)
  names.put("Ink", inkRef)
  const resources = doc.newDictionary()
  resources.put("XObject", names)
  ref.put("Resources", resources)
  ref.writeStream(new TextEncoder().encode("/Paper Do /Ink Do"))
  return "resized"
}

const KEYS_OF_A_PACKING = new Set(["Length", "Filter", "DecodeParms", "DL"])

/**
 * Pack a one-bit picture with JBIG2. The stored bits are coded as they are,
 * so nothing about what they stand for changes: only the packing does.
 */
function toJbig2(work: Work, entry: Entry): Change | null {
  const { doc } = work
  const { ref } = entry
  const width = numberOf(ref.get("Width"))
  const height = numberOf(ref.get("Height"))
  const truth = decode(entry.image)
  if (!truth) return null
  let coded: Uint8Array
  const stream = ref.readStream()
  try {
    const packed = stream.asUint8Array()
    if (packed.length < Math.ceil(width / 8) * height) return null
    coded = encodeJbig2(bitsFromSamples(packed, width, height), width, height)
  } finally {
    stream.destroy()
  }
  if (!worthIt(numberOf(ref.get("Length")), coded.length, "repacked"))
    return null
  const dict = doc.newDictionary()
  ref.forEach((value, key) => {
    if (!KEYS_OF_A_PACKING.has(String(key))) dict.put(String(key), value)
  })
  dict.put("Filter", doc.newName("JBIG2Decode"))
  const trial = doc.addRawStream(coded, dict)
  try {
    const image = doc.loadImage(trial)
    try {
      const seen = decode(image)
      if (
        !seen ||
        seen.width !== truth.width ||
        seen.height !== truth.height ||
        !sameBytes(seen.bytes, truth.bytes)
      )
        return null
    } finally {
      image.destroy()
    }
  } catch {
    return null
  } finally {
    trial.writeRawStream(new Uint8Array(0))
  }
  ref.writeRawStream(coded)
  ref.delete("DecodeParms")
  ref.delete("DL")
  ref.put("Filter", doc.newName("JBIG2Decode"))
  return "repacked"
}

/** How many bytes of fonts a file stores whole, with every letter they have. */
function wholeFonts(doc: Doc) {
  const files = new Map<number, number>()
  eachObject(doc, (ref) => {
    if (nameOf(ref.get("Type")) !== "FontDescriptor") return
    // A font already cut down carries six capitals and a plus before its name.
    if (/^[A-Z]{6}\+/.test(nameOf(ref.get("FontName")))) return
    for (const key of ["FontFile", "FontFile2", "FontFile3"]) {
      const file = ref.get(key)
      if (file.isStream())
        files.set(file.asIndirect(), numberOf(file.get("Length")))
    }
  })
  let bytes = 0
  for (const size of files.values()) bytes += size
  return bytes
}

/** True when two documents write the same text and draw the same picture on a page. */
function samePage(mupdf: Engine, a: Doc, b: Doc, index: number) {
  const text = (doc: Doc) => {
    const page = doc.loadPage(index)
    try {
      const words = page.toStructuredText("preserve-whitespace")
      try {
        return words.asText()
      } finally {
        words.destroy()
      }
    } finally {
      page.destroy()
    }
  }
  if (text(a) !== text(b)) return false
  const before = drawPage(mupdf, a, index, FONT_CHECK_EDGE)
  const after = drawPage(mupdf, b, index, FONT_CHECK_EDGE)
  return (
    before.width === after.width &&
    before.height === after.height &&
    sameBytes(
      new Uint8Array(before.data.buffer),
      new Uint8Array(after.data.buffer)
    )
  )
}

/**
 * Cut the fonts of a freshly opened file down to the letters in use, and
 * make sure pages still read and look the same. The engine calls this step
 * experimental, so a file that changes in any way is not cut.
 * @returns The document to go on with, and whether its fonts were cut.
 */
function cutFonts(
  mupdf: Engine,
  bytes: Uint8Array,
  pristine: Doc,
  options: Omit<CompressOptions, "level">
) {
  const doc = open(mupdf, bytes, options.password)
  const root = doc.getTrailer().get("Root")
  const fields = root.get("AcroForm", "Fields")
  // A field someone types into needs every letter of its font.
  if (fields.isArray() && fields.length > 0) return { doc, cut: false }
  if (wholeFonts(doc) < FONTS_WORTH_CUTTING) return { doc, cut: false }
  try {
    doc.subsetFonts()
    const total = doc.countPages()
    const pages = pagesToCheck(
      Array.from({ length: total }, (_, page) => page),
      total,
      FONT_CHECK_PAGES
    )
    if (pages.every((page) => samePage(mupdf, pristine, doc, page)))
      return { doc, cut: true }
  } catch {
    // Fall through to a fresh copy with its fonts whole.
  }
  doc.destroy()
  return { doc: open(mupdf, bytes, options.password), cut: false }
}

/** Take out what no viewer shows: page thumbnails and private data of the app that made the file. */
function dropHidden(doc: Doc) {
  const dropped = { thumbnails: 0, private: 0 }
  eachObject(doc, (ref) => {
    if (!ref.get("Thumb").isNull()) {
      ref.delete("Thumb")
      dropped.thumbnails++
    }
    if (!ref.get("PieceInfo").isNull()) {
      ref.delete("PieceInfo")
      dropped.private++
    }
  })
  return dropped
}

/** Draw pages before and after and say how alike they are. */
async function compare(
  mupdf: Engine,
  before: Doc,
  after: Doc,
  pages: readonly number[],
  options: Omit<CompressOptions, "level">,
  attempt?: number
) {
  const scores: PageScore[] = []
  for (const [done, page] of pages.entries()) {
    await options.checkpoint?.()
    options.progress?.("checking", done, pages.length, attempt)
    let score = 0
    try {
      const was = drawPage(mupdf, before, page, CHECK_EDGE)
      const is = drawPage(mupdf, after, page, CHECK_EDGE)
      if (was.width === is.width && was.height === is.height)
        score = similarity(was, is).mean
    } catch {
      // A page that cannot be drawn counts as changed.
    }
    scores.push({ page, score })
  }
  return scores
}

/** A file as one attempt left it, before anyone has looked at the result. */
interface Written {
  out: Uint8Array
  pages: number
  pictures: CompressReport["pictures"]
  fontsCut: boolean
  dropped: CompressReport["dropped"]
  changedPages: number[]
  /** How many scanned pages were rebuilt, and the pages they are. */
  scans: number
  scanPages: number[]
}

/** Change a fresh copy of the file by a plan and write it out. */
async function write(
  mupdf: Engine,
  bytes: Uint8Array,
  pristine: Doc,
  plan: LevelPlan | null,
  options: Omit<CompressOptions, "level">,
  attempt?: number
): Promise<Written> {
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS
  const entries = new Map<number, Entry>()
  const cut = cutFonts(mupdf, bytes, pristine, options)
  const doc = cut.doc
  try {
    const pages = doc.countPages()
    for (const [number, entry] of findPictures(doc)) entries.set(number, entry)
    await measureUse(mupdf, doc, entries, options, attempt)
    const work: Work = { mupdf, doc, codecs: options.codecs, plan }
    const pictures = { found: entries.size, changed: 0, resized: 0 }
    const changedPages = new Set<number>()
    const scanPages = new Set<number>()
    const how = plan && options.scans !== "keep" ? options.scans : undefined
    let scans = 0
    let done = 0
    for (const entry of entries.values()) {
      await options.checkpoint?.()
      options.progress?.("pictures", done++, entries.size, attempt)
      const facts = factsOf(entry)
      let change: Change | null = null
      try {
        if (how && isScan(entry, facts, maxPixels)) {
          change = await rebuildScan(work, entry, how)
          if (change) {
            scans++
            for (const page of entry.pages) scanPages.add(page)
          }
        }
        // A scan that could not be rebuilt goes the usual way.
        if (!change) {
          const step = planPicture(facts, plan, maxPixels)
          if (step.do === "bitonal") change = toJbig2(work, entry)
          else if (step.do !== "leave") change = await shrink(work, entry, step)
        }
      } catch (error) {
        // Running out of memory ends the job; any other trouble with one
        // picture leaves that picture as it is.
        if (error instanceof RangeError) throw error
      }
      if (!change) continue
      pictures.changed++
      if (change === "resized") pictures.resized++
      for (const page of entry.pages) changedPages.add(page)
    }
    for (const entry of entries.values()) entry.image.destroy()
    entries.clear()
    const dropped = dropHidden(doc)
    options.progress?.("writing", 0, 1, attempt)
    await options.checkpoint?.()
    // Objects nothing points at are dropped, identical ones are stored once,
    // and the rest is packed into compressed streams. A locked file stays locked.
    const buffer = doc.saveToBuffer({
      garbage: 4,
      compress: "yes",
      objstms: "yes",
    })
    try {
      return {
        out: buffer.asUint8Array().slice(),
        pages,
        pictures,
        fontsCut: cut.cut,
        dropped,
        changedPages: [...changedPages],
        scans,
        scanPages: [...scanPages],
      }
    } finally {
      buffer.destroy()
    }
  } finally {
    for (const entry of entries.values()) entry.image.destroy()
    doc.destroy()
  }
}

/**
 * Look at what was written: is it smaller, does it have every page, and do
 * its pages look as they did?
 * @param mark How alike a page must look before and after.
 * @param strict A result with any page under the mark is not handed over.
 */
async function verify(
  mupdf: Engine,
  before: number,
  pristine: Doc,
  written: Written,
  mark: number,
  strict: boolean,
  options: Omit<CompressOptions, "level">,
  attempt?: number
): Promise<Compressed> {
  const { out } = written
  const how = options.scans && options.scans !== "keep" ? options.scans : null
  const scans =
    how && written.scans ? { how, pictures: written.scans } : undefined
  // A rebuilt scan is held to a mark of its own: it differs by design.
  const rebuilt = new Set(written.scanPages)
  const scanMark = how ? scanMarks[how] : null
  const markOf = (page: number) =>
    scanMark !== null && rebuilt.has(page) ? Math.min(mark, scanMark) : mark
  const unchanged = (check: CheckResult): Compressed => ({
    bytes: null,
    report: {
      before,
      after: before,
      smaller: false,
      pictures: written.pictures,
      fontsCut: written.fontsCut,
      dropped: written.dropped,
      check,
      audit: null,
      scans,
    },
  })
  if (!outcome(before, out.length).smaller)
    return unchanged(checkResult([], written.changedPages.length, 0))
  const result = open(mupdf, out, options.password)
  try {
    const pages =
      result.countPages() === written.pages
        ? pagesToCheck(
            written.changedPages,
            written.pages,
            options.checkBudget ?? DEFAULT_CHECK_BUDGET
          )
        : []
    const check = checkResult(
      await compare(mupdf, pristine, result, pages, options, attempt),
      written.changedPages.length,
      markOf
    )
    // A result that lost a page, or a lossless one that looks different, is not handed over.
    if (!pages.length || (strict && check.low.length)) return unchanged(check)
    return {
      bytes: out,
      report: {
        before,
        after: out.length,
        smaller: true,
        pictures: written.pictures,
        fontsCut: written.fontsCut,
        dropped: written.dropped,
        check,
        audit: auditPdf(result, out.length),
        scans,
      },
    }
  } finally {
    result.destroy()
  }
}

/**
 * Compress a PDF.
 * @throws PasswordNeeded when the file is locked and the password is missing or wrong.
 */
export async function compressPdf(
  mupdf: Engine,
  bytes: Uint8Array,
  options: CompressOptions
): Promise<Compressed> {
  const plan = levelPlans[options.level]
  const own = options.pristine ? null : open(mupdf, bytes, options.password)
  const pristine = options.pristine ?? own!
  try {
    return await verify(
      mupdf,
      bytes.length,
      pristine,
      await write(mupdf, bytes, pristine, plan, options),
      pageMarks[options.level],
      !plan,
      options
    )
  } finally {
    own?.destroy()
  }
}

/**
 * Compress a PDF so that it comes out under a size, losing as little as that
 * takes. The file is written a few times at different strengths; the
 * gentlest one that fits is kept. When none fits, the smallest is handed
 * back and the report says the size was missed.
 * @throws PasswordNeeded when the file is locked and the password is missing or wrong.
 */
export async function compressToSize(
  mupdf: Engine,
  bytes: Uint8Array,
  options: TargetOptions
): Promise<Compressed> {
  const own = options.pristine ? null : open(mupdf, bytes, options.password)
  const pristine = options.pristine ?? own!
  try {
    let writes = 0
    const fit = await fitTarget(
      stepCount(options.further),
      options.target,
      async (step) => {
        const written = await write(
          mupdf,
          bytes,
          pristine,
          stepPlan(step),
          options,
          ++writes
        )
        // A step that grows the file leaves the file as it was.
        return { ...written, bytes: Math.min(written.out.length, bytes.length) }
      }
    )
    const checked = await verify(
      mupdf,
      bytes.length,
      pristine,
      fit.result,
      fit.step ? TARGET_MARK : pageMarks.lossless,
      !fit.step,
      options,
      writes
    )
    return {
      ...checked,
      report: {
        ...checked.report,
        target: { wanted: options.target, met: fit.met, writes },
      },
    }
  } finally {
    own?.destroy()
  }
}
