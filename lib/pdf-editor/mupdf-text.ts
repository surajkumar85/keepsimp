/**
 * Changing the words of a page in the engine.
 *
 * A line is read with the font, size and colour of each letter. To change
 * it, its letters are taken out of the page's content (the engine's
 * redaction, with nothing drawn in their place and nothing else touched),
 * and the new letters are written after the page's content, with the very
 * font object the old ones were written with. No font is copied and none is
 * added for a letter the file's font has. A letter it lacks is written in
 * one of the editor's fonts.
 *
 * What a font can write is found by asking the engine: in a second copy of
 * the file, which is read and never changed, every number a letter can have
 * in that font is shown once, and the engine says which letter each one is.
 *
 * After each change the page is read again. The other lines must be what
 * they were and the new words must be there, or the change is not made.
 */
import type * as MuPDF from "mupdf"
import { open } from "@/lib/pdf-compressor/mupdf-compress"
import {
  canDo,
  FontMissing,
  inStep,
  withPage,
  type EditSession,
} from "./mupdf-edit"
import { findIn, MOST_FOUND, type Found, type Query } from "./find"
import type { Box, Point } from "./geometry"
import { fontKey, type Colour } from "./objects"
import {
  blocksOf,
  carry,
  firstChanged,
  flow,
  glyphOf,
  joined,
  readTextChange,
  shapeOf,
  SOFT,
  wordsOf,
  type FlowOp,
  type Piece,
} from "./paragraphs"
import {
  contentFor,
  familyOf,
  inverse,
  isLine,
  mainStyle,
  oursAs,
  restyled,
  runsOf,
  SPACE,
  spreadLooks,
  type Glyph,
  type LineStyle,
  type Matrix,
  type PageLine,
  type Run,
  type TextChange,
  type TextOp,
  type Wrote,
} from "./retext"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

/** What a font of the file can write: for each letter, its number in the font and how far it moves on at a size of one. */
interface Codes {
  /** Two figures of hexadecimal for a letter, or four. */
  digits: 2 | 4
  letters: Map<string, { code: string; advance: number }>
}

const DOWNWARDS =
  "Text that is written downwards, a letter under a letter, can be taken out, but its words cannot be changed here."
const SHAPED =
  "Text in this script can be taken out, but its words cannot be changed here: its letters join and change shape."
/** Hebrew, Arabic and the scripts of India and South-East Asia, whose letters are shaped as they are written. */
const NEEDS_SHAPING = /[֐-ࣿऀ-෿฀-࿿יִ-﷿ﹰ-﻿]/

const rounded = (value: number, to = 100) => Math.round(value * to) / to

/** A colour as the engine gives it (grey, RGB or CMYK) as red, green and blue. */
function rgbOf(colour: readonly number[]): Colour {
  if (colour.length === 3) return [colour[0], colour[1], colour[2]]
  if (colour.length === 4) {
    const [c, m, y, k] = colour
    return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]
  }
  const grey = colour[0] ?? 0
  return [grey, grey, grey]
}

/**
 * The editor's font that is closest to one of the file's, by its key. The
 * name is asked first: what a file says of its fonts' kind is often wrong,
 * and a well-known name is not.
 */
function standInFor(font: MuPDF.Font) {
  const name = font.getName()
  return fontKey({
    font: familyOf(name, font.isMono(), font.isSerif()),
    bold: font.isBold() || /bold|black|heavy|medi|demi/i.test(name),
    italic: font.isItalic() || /ital|obli/i.test(name),
  })
}

/** The fonts a page is written with, by name: the page's own and those of what is drawn into it. */
function fontsOf(page: Obj) {
  const fonts = new Map<string, Obj>()
  const seen = new Set<number>()
  const look = (resources: Obj, depth: number) => {
    if (!resources.isDictionary() || depth > 4) return
    const dict = resources.get("Font")
    if (dict.isDictionary())
      dict.forEach((font) => {
        const name = font.get("BaseFont")
        if (name.isName() && font.isIndirect() && !fonts.has(name.asName()))
          fonts.set(name.asName(), font)
      })
    const drawn = resources.get("XObject")
    if (drawn.isDictionary())
      drawn.forEach((form) => {
        const number = form.isIndirect() ? form.asIndirect() : 0
        if (!number || seen.has(number)) return
        seen.add(number)
        look(form.get("Resources"), depth + 1)
      })
  }
  look(page.getInheritable("Resources"), 0)
  return fonts
}

/** The copy of the file that is read from, opened when it is first wanted, and what was learnt from it. */
function readingOf(mupdf: Engine, session: EditSession) {
  session.reading ??= {
    doc: open(mupdf, session.original, session.password),
    fonts: new Map(),
  }
  return session.reading as { doc: Doc; fonts: Map<number, Codes> }
}

/**
 * What one of the file's fonts can write. Every number a letter can have
 * in the font is shown once, each at a place of its own, on a page that is
 * added to the copy that is read from, and the engine is asked what it
 * sees there.
 */
function codesOf(mupdf: Engine, session: EditSession, number: number): Codes {
  const reading = readingOf(mupdf, session)
  const known = reading.fonts.get(number)
  if (known) return known
  const codes: Codes = { digits: 2, letters: new Map() }
  reading.fonts.set(number, codes)
  const { doc } = reading
  try {
    const font = doc.newIndirect(number)
    const wide = font.get("Subtype").asName() === "Type0"
    // A font whose letters are one or two bytes as it pleases is not one that can be written with here.
    const encoding = font.get("Encoding")
    if (
      wide &&
      !(encoding.isName() && /^Identity-[HV]$/.test(encoding.asName()))
    )
      return codes
    codes.digits = wide ? 4 : 2
    const count = wide ? 65536 : 256
    const shown: string[] = ["BT /F 1 Tf"]
    for (let code = 0; code < count; code++)
      shown.push(
        `1 0 0 1 ${code} 0 Tm <${code.toString(16).padStart(codes.digits, "0")}> Tj`
      )
    shown.push("ET")
    const resources = doc.newDictionary()
    const fonts = doc.newDictionary()
    fonts.put("F", font)
    resources.put("Font", fonts)
    doc.insertPage(
      -1,
      doc.addPage([0, 0, 10, 10], 0, resources, shown.join("\n"))
    )
    const last = doc.countPages() - 1
    const page = doc.loadPage(last)
    try {
      /** The number that was last taken for a letter, and the letter. */
      let last: { letter: string; code: string } | null = null
      const device = new mupdf.Device({
        fillText(text) {
          text.walk({
            showGlyph(shape, matrix, glyph, unicode) {
              // A shape that stands for several letters at once ("fi") is
              // told as its first letter, then the others without a shape.
              // It is not that first letter: written for it, it would add
              // letters nobody typed.
              if (glyph < 0) {
                if (last && codes.letters.get(last.letter)?.code === last.code)
                  codes.letters.delete(last.letter)
                last = null
                return
              }
              last = null
              // Where it was shown says which number it is.
              const code = Math.round(matrix[4])
                .toString(16)
                .padStart(codes.digits, "0")
              const letter = String.fromCodePoint(unicode)
              if (
                glyph === 0 ||
                unicode <= 0 ||
                unicode === 0xfffd ||
                // Not a letter anyone types: a place of private use.
                (unicode >= 0xe000 && unicode <= 0xf8ff) ||
                codes.letters.has(letter)
              )
                return
              codes.letters.set(letter, {
                code,
                advance: shape.advanceGlyph(glyph),
              })
              last = { letter, code }
            },
          })
        },
      })
      try {
        page.run(device, mupdf.Matrix.identity)
        device.close()
      } finally {
        device.destroy()
      }
    } finally {
      page.destroy()
      doc.deletePage(last)
    }
  } catch {
    // A font that cannot be asked writes nothing; the editor's own stands in.
    codes.letters.clear()
  }
  return codes
}

/** A line as it was read, with what is needed to write it again. */
interface Read {
  line: PageLine
  /** The number the file knows the font of each of the line's looks by; null for a font that could not be found. */
  numbers: (number | null)[]
  /**
   * A thin band through the middle of each letter, by which the line is
   * taken out. The engine takes out every letter a band touches, and the
   * boxes of letters reach into the lines above and below where lines are
   * set close; their middles do not.
   */
  bands: MuPDF.Quad[]
}

/** A band through the middle of a letter's box: a fifth of its height and most of its width, whichever way it is turned. */
function bandOf(quad: MuPDF.Quad): MuPDF.Quad {
  // Upper left, upper right, lower left, lower right.
  const [ulx, uly, urx, ury, llx, lly, lrx, lry] = quad
  const between = (a: number, b: number, share: number) => a + (b - a) * share
  const point = (across: number, down: number) => [
    between(between(ulx, urx, across), between(llx, lrx, across), down),
    between(between(uly, ury, across), between(lly, lry, across), down),
  ]
  return [
    ...point(0.2, 0.4),
    ...point(0.8, 0.4),
    ...point(0.2, 0.6),
    ...point(0.8, 0.6),
  ] as MuPDF.Quad
}

/** The lines of a page's own content, from the top of the page down, without what the editor or anyone else laid over it. */
function read(mupdf: Engine, session: EditSession, page: MuPDF.PDFPage) {
  const fonts = fontsOf(page.getObject())
  const list = new mupdf.DisplayList(page.getBounds())
  const device = new mupdf.DisplayListDevice(list)
  const lines: Read[] = []
  try {
    // Reading can change a file. A file that says how it is built (a
    // tagged one) and says it not quite rightly is mended by the engine as
    // the page is run, and the engine lets nothing be changed outside an
    // operation: it gives up half way and leaves a file that can no longer
    // be written. So the page is run inside one, its own when no step is
    // being made.
    const own = !session.working
    if (own) session.doc.beginOperation("Read the page")
    try {
      page.runPageContents(device, mupdf.Matrix.identity)
      device.close()
    } catch (error) {
      if (own) session.doc.abandonOperation()
      throw error
    }
    if (own) session.doc.endOperation()
    const text = list.toStructuredText("preserve-whitespace")
    try {
      interface Letter {
        letter: string
        x: number
        y: number
        quad: MuPDF.Quad
        key: string
        style: Omit<LineStyle, "rise" | "letters"> & { number: number | null }
      }
      let letters: Letter[] = []
      /** Written a letter under a letter, as some Asian text is. */
      let downwards = false
      /** The way the line runs, as the page is shown, as one point along it. */
      let along = { x: 1, y: 0 }
      text.walk({
        beginLine(_box, wmode, direction) {
          letters = []
          downwards = wmode !== 0
          const long = Math.hypot(direction[0], direction[1]) || 1
          along = { x: direction[0] / long, y: direction[1] / long }
          // What runs across to within a hair runs across.
          if (Math.abs(along.y) < 0.005 && along.x > 0) along = { x: 1, y: 0 }
        },
        onChar(letter, origin, font, size, quad, colour) {
          const name = font.getName()
          const style = {
            font: name,
            size: rounded(size),
            colour: rgbOf(colour),
            standIn: standInFor(font),
            number: fonts.get(name)?.asIndirect() ?? null,
          }
          letters.push({
            letter,
            x: origin[0],
            y: origin[1],
            quad,
            key: `${name}/${style.size}/${style.colour.map((part) => rounded(part, 1000)).join(",")}`,
            style,
          })
        },
        endLine() {
          // Spaces at the end are no part of what a line says.
          while (letters.length && !letters[letters.length - 1].letter.trim())
            letters.pop()
          while (letters.length && !letters[0].letter.trim()) letters.shift()
          if (!letters.length) return
          // The line is written where most of its letters stand; a raised mark stands above that.
          const heights = new Map<number, number>()
          for (const { y } of letters)
            heights.set(rounded(y, 10), (heights.get(rounded(y, 10)) ?? 0) + 1)
          const [base] = [...heights].sort((a, b) => b[1] - a[1])[0]
          const styles: LineStyle[] = []
          const numbers: (number | null)[] = []
          const keys: string[] = []
          const looks = letters.map((one) => {
            // Only a line that runs across has a height its letters are raised from.
            const rise = along.x === 1 ? rounded(base - one.y, 10) : 0
            const key = `${one.key}/${rise}`
            let at = keys.indexOf(key)
            if (at < 0) {
              at = keys.push(key) - 1
              const { number, ...style } = one.style
              numbers.push(number)
              styles.push({
                ...style,
                rise,
                letters:
                  number === null
                    ? ""
                    : [...codesOf(mupdf, session, number).letters.keys()].join(
                        ""
                      ),
              })
            }
            return at
          })
          const xs = letters.flatMap(({ quad }) => [
            quad[0],
            quad[2],
            quad[4],
            quad[6],
          ])
          const ys = letters.flatMap(({ quad }) => [
            quad[1],
            quad[3],
            quad[5],
            quad[7],
          ])
          const said = letters.map((one) => one.letter).join("")
          lines.push({
            numbers,
            bands: letters.map(({ quad }) => bandOf(quad)),
            line: {
              text: said,
              first: rounded(
                (letters.find((one) => !one.letter.trim())?.x ??
                  Math.max(...xs)) - letters[0].x
              ),
              box: {
                x: Math.min(...xs),
                y: Math.min(...ys),
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys),
              },
              // A line that is turned starts where its first letter does.
              origin: {
                x: letters[0].x,
                y: along.x === 1 ? base : letters[0].y,
              },
              along,
              styles,
              looks,
              ...(downwards
                ? { fixed: DOWNWARDS }
                : NEEDS_SHAPING.test(said)
                  ? { fixed: SHAPED }
                  : null),
            },
          })
        },
      })
    } finally {
      text.destroy()
    }
  } finally {
    device.destroy()
    list.destroy()
  }
  // From the top down and from the left: the order a page's content has
  // them in changes when a line is written again.
  return lines.sort(
    (a, b) => a.line.box.y - b.line.box.y || a.line.box.x - b.line.box.x
  )
}

/** The lines of a page that can be changed, from the top of the page down. */
export function linesOn(
  mupdf: Engine,
  session: EditSession,
  index: number
): PageLine[] {
  return withPage(session.doc, index, (page) =>
    read(mupdf, session, page).map(({ line }) => line)
  )
}

/** The dictionary a page's fonts are named in, made where the page has none. */
function fontNames(doc: Doc, page: Obj) {
  let resources = page.getInheritable("Resources")
  if (!resources.isDictionary()) {
    resources = doc.newDictionary()
    page.put("Resources", resources)
  }
  let fonts = resources.get("Font")
  if (!fonts.isDictionary()) {
    fonts = doc.newDictionary()
    resources.put("Font", fonts)
  }
  return fonts
}

/** How a line that was read is told from the others: about where it is, and what it says without its spaces. */
const mark = ({ box, text }: PageLine) =>
  `${Math.round(box.x)},${Math.round(box.y)}:${text.replace(/\s+/g, "")}`

/** What the lines of a page say and about where, each as one mark, sorted: what a change that is not to text must leave as it was. */
export function marksOn(mupdf: Engine, session: EditSession, index: number) {
  return withPage(session.doc, index, (page) =>
    read(mupdf, session, page)
      .map((one) => mark(one.line))
      .sort()
  )
}

/** The letters of some new words as they will be written, and the fonts they need a name for on the page. */
interface Resolved {
  pieces: Piece[]
  /** The file's own fonts, by number. */
  own: number[]
  /** The editor's, by key. */
  ours: string[]
}

/**
 * How each letter of some new words is written: in the font of the look it
 * was given where that font has it, and in one of the editor's where not.
 * @param looks A look for each letter, as a number into `styles`.
 * @param numbers The number the file knows the font of each look by.
 * @param set One of the editor's fonts everything is to be set in, when that was asked for.
 */
function resolve(
  mupdf: Engine,
  session: EditSession,
  text: string,
  looks: readonly number[],
  styles: readonly LineStyle[],
  numbers: readonly (number | null)[],
  set: string | undefined
): Resolved {
  if (set && !session.fonts.get(set)) throw new FontMissing(set)
  const pieces: Piece[] = []
  const own = new Set<number>()
  const ours = new Set<string>()
  const writes = (look: number, letter: string) => {
    const number = numbers[look]
    return number === null || number === undefined || set
      ? undefined
      : codesOf(mupdf, session, number).letters.get(letter)
  }
  /** One letter in one look. */
  const one = (letter: string, given: number): Piece => {
    let look = given
    // A mark that the look it was given cannot write, and another look of
    // the line can (a star that is always set in a font of its own),
    // takes that look whole: its font, its size and its height.
    if (letter.trim() && !writes(look, letter)) {
      const other = styles.findIndex((_style, index) => writes(index, letter))
      if (other >= 0) look = other
    }
    const style = styles[look]
    const lent = set ?? style.standIn
    const number = numbers[look]
    const size = { size: style.size, colour: style.colour, rise: style.rise }
    const has = writes(look, letter)
    if (has && number !== null) {
      own.add(number)
      return {
        ...size,
        letter,
        font: `KS${number}`,
        code: has.code,
        advance: has.advance * style.size,
      }
    }
    // A gap between words. A font everything is set in writes its own
    // space, so the words are apart by as much as that font means and are
    // read as words; where a file's font has no space, the gap is only room.
    const spaced =
      !letter.trim() && set
        ? session.fonts.get(set)?.encodeCharacter(letter.codePointAt(0)!)
        : 0
    if (!letter.trim() && !spaced)
      return {
        ...size,
        letter,
        font: "",
        code: "",
        advance: letter === "\n" ? 0 : SPACE * style.size,
      }
    const font = session.fonts.get(lent)
    if (!font) throw new FontMissing(lent)
    const glyph = font.encodeCharacter(letter.codePointAt(0)!)
    if (!glyph)
      throw new Error(
        `No font here has the letter “${letter}”. Nothing was changed.`
      )
    ours.add(lent)
    return {
      ...size,
      letter,
      font: oursAs(lent),
      code: glyph.toString(16).padStart(4, "0"),
      advance: font.advanceGlyph(glyph) * style.size,
    }
  }
  Array.from(text).forEach((letter, at) => {
    const look = looks[at] ?? 0
    if (letter !== SOFT) {
      pieces.push(one(letter, look))
      return
    }
    // A place where a word may be broken: nothing, unless a line ends
    // there, and then the hyphen of the letters around it.
    const soft = glyphOf(one("-", look))
    pieces.push({
      ...soft,
      letter,
      font: "",
      code: "",
      advance: 0,
      soft,
    })
  })
  return { pieces, own: [...own], ours: [...ours] }
}

/**
 * Take letters out of a page, and nothing else: no picture, no drawing,
 * and nothing put in their place.
 * @param bands A band through each letter that is to go.
 */
function takeOut(
  mupdf: Engine,
  doc: Doc,
  page: MuPDF.PDFPage,
  bands: MuPDF.Quad[]
) {
  const notes = page.getObject().get("Annots")
  const links: Obj[] = []
  /** The order the page's notes are in, by their numbers: the order a reader goes through them. */
  const order: number[] = []
  if (notes.isArray())
    notes.forEach((note) => {
      order.push(note.asIndirect())
      if (note.get("Subtype").asName() === "Link") links.push(note)
    })
  // Marks for taking out, the file's own and those made here that are not
  // applied yet, are not for this to apply.
  const waiting = page
    .getAnnotations()
    .filter((annot) => annot.getType() === "Redact")
    .map((annot) => annot.getObject())
  if (waiting.length && notes.isArray())
    for (let at = notes.length - 1; at >= 0; at--)
      if (
        waiting.some((one) => one.asIndirect() === notes.get(at).asIndirect())
      )
        notes.delete(at)
  // Taking them off the page's list is not enough: the engine applies the
  // marks of the page as it has it open. While the letters are taken out,
  // a mark that waits goes by another kind's name, and is no mark to it.
  for (const note of waiting) note.put("Subtype", doc.newName("KeepSimpWaits"))
  const cut = page.createAnnotation("Redact")
  cut.setQuadPoints(bands)
  page.applyRedactions(
    false,
    mupdf.PDFPage.REDACT_IMAGE_NONE,
    mupdf.PDFPage.REDACT_LINE_ART_NONE,
    mupdf.PDFPage.REDACT_TEXT_REMOVE
  )
  for (const note of waiting) note.put("Subtype", doc.newName("Redact"))
  // Links that lay over the letters stay links, and marks that were waiting wait on.
  const object = page.getObject()
  let now = object.get("Annots")
  const back = [...links, ...waiting]
  if (back.length && !now.isArray()) {
    now = doc.newArray()
    object.put("Annots", now)
  }
  const there = new Set<number>()
  if (now.isArray()) now.forEach((note) => void there.add(note.asIndirect()))
  for (const note of back) if (!there.has(note.asIndirect())) now.push(note)
  // And in the order they were in: what was put back went to the end, and
  // the order of a page's links is the order the Tab key visits them in.
  if (!now.isArray() || order.some((number) => !number)) return
  const kept: Obj[] = []
  now.forEach((note) => void kept.push(note))
  if (kept.some((note) => !note.asIndirect())) return
  const place = (note: Obj) => {
    const at = order.indexOf(note.asIndirect())
    return at < 0 ? order.length : at
  }
  const sorted = [...kept].sort((a, b) => place(a) - place(b))
  if (sorted.every((note, at) => note === kept[at])) return
  const fresh = doc.newArray()
  for (const note of sorted) fresh.push(note)
  object.put("Annots", fresh)
}

/** Write runs of letters into a page, after its own content, with the fonts they need named in it. */
function writeRuns(
  session: EditSession,
  page: MuPDF.PDFPage,
  runs: Run[],
  fonts: Pick<Resolved, "own" | "ours">
) {
  const { doc } = session
  const object = page.getObject()
  const names = fontNames(doc, object)
  for (const number of fonts.own)
    names.put(`KS${number}`, doc.newIndirect(number))
  for (const key of fonts.ours)
    names.put(oursAs(key), doc.addFont(session.fonts.get(key)!))
  const written = contentFor(runs, inverse(page.getTransform() as Matrix))
  // The page's own content is closed off, so that what is written starts
  // from nothing, whatever that content left behind.
  const all = doc.newArray()
  all.push(doc.addStream("q\n", {}))
  const content = object.get("Contents")
  if (content.isArray()) content.forEach((part) => void all.push(part))
  else if (!content.isNull()) all.push(content)
  all.push(doc.addStream("Q\n", {}))
  all.push(doc.addStream(written, {}))
  object.put("Contents", all)
}

/**
 * Whether some words are read from a page on the line that starts at a
 * place and runs a way. What stands on that line is read together, from
 * its start on: words set far apart are read as pieces.
 */
const readsAt = (
  lines: readonly Read[],
  origin: Point,
  along: Point,
  words: string
) => {
  const far = (one: Read) =>
    (one.line.origin.x - origin.x) * along.x +
    (one.line.origin.y - origin.y) * along.y
  return lines
    .filter(
      (one) =>
        // On the line it was written on: beside or beyond where it starts,
        // and no higher or lower than that.
        Math.abs(
          (one.line.origin.x - origin.x) * along.y -
            (one.line.origin.y - origin.y) * along.x
        ) < 2
    )
    .sort((a, b) => far(a) - far(b))
    .map((one) => one.line.text.replace(/\s+/g, ""))
    .join("")
    .includes(words)
}

/** A letter that was on the page: where its middle was, and where it is now; null when it is gone. */
interface Moved {
  was: Point
  now: Box | null
}

/** The middle of the band that was laid through a letter, which is the middle of the letter. */
const middleOf = (band: MuPDF.Quad): Point => ({
  x: (band[0] + band[2] + band[4] + band[6]) / 4,
  y: (band[1] + band[3] + band[5] + band[7]) / 4,
})

/**
 * Take the links of a page along with the words they lie over. A link
 * that lay over letters that were written anew is put over those letters
 * where they now stand: on the line most of them are on, when they are on
 * more than one. A link whose letters are all gone stays where it was,
 * and so does one that also lies over letters that were not touched.
 * @param stay The middles of the letters that were left as they are.
 */
function followLinks(
  doc: Doc,
  page: MuPDF.PDFPage,
  moved: readonly Moved[],
  stay: readonly Point[]
) {
  const notes = page.getObject().get("Annots")
  if (!moved.length || !notes.isArray()) return
  // A link says where it lies in the page's own measure; letters are read
  // as the page is shown. (The engine's own way of moving a link writes
  // the one for the other.)
  const shown = page.getTransform() as Matrix
  const back = inverse(shown)
  const through = (matrix: Matrix, x: number, y: number) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  })
  notes.forEach((note) => {
    const rect = note.get("Rect")
    if (
      note.get("Subtype").asName() !== "Link" ||
      !rect.isArray() ||
      rect.length !== 4
    )
      return
    const one = through(shown, rect.get(0).asNumber(), rect.get(1).asNumber())
    const two = through(shown, rect.get(2).asNumber(), rect.get(3).asNumber())
    const left = Math.min(one.x, two.x)
    const right = Math.max(one.x, two.x)
    const top = Math.min(one.y, two.y)
    const bottom = Math.max(one.y, two.y)
    const under = (point: Point) =>
      point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
    if (stay.some(under)) return
    const letters = moved.filter((letter) => under(letter.was))
    if (!letters.length) return
    const rows = new Map<number, (Moved & { now: Box })[]>()
    for (const letter of letters) {
      if (!letter.now) continue
      const row = Math.round(letter.now.y)
      rows.set(row, [...(rows.get(row) ?? []), { ...letter, now: letter.now }])
    }
    const [most] = [...rows.values()].sort((a, b) => b.length - a.length)
    if (!most) return
    // As far around its letters as it was: the first and the last of them
    // are as far from its edges as they were, when they are still its first
    // and its last, and it is as far above and below them.
    most.sort((a, b) => a.now.x - b.now.x)
    const lead = most[0]
    const tail = most[most.length - 1]
    const middle = (box: Box) => box.x + box.width / 2
    const were = letters.map((letter) => letter.was.x)
    const before =
      lead.was.x === Math.min(...were)
        ? lead.was.x - left
        : lead.now.width / 2 + 1
    const after =
      tail.was.x === Math.max(...were)
        ? right - tail.was.x
        : tail.now.width / 2 + 1
    const down = lead.now.y + lead.now.height / 2 - lead.was.y
    const from = through(back, middle(lead.now) - before, top + down)
    const to = through(back, middle(tail.now) + after, bottom + down)
    const fresh = doc.newArray()
    for (const value of [
      Math.min(from.x, to.x),
      Math.min(from.y, to.y),
      Math.max(from.x, to.x),
      Math.max(from.y, to.y),
    ])
      fresh.push(doc.newReal(Math.round(value * 100) / 100))
    note.put("Rect", fresh)
    // Corners that were said for where it lay before say nothing now.
    note.delete("QuadPoints")
  })
}

/**
 * Change one line.
 * @returns The editor's fonts it was written with, by key; null when it already is what is asked.
 */
function carryOut(
  mupdf: Engine,
  session: EditSession,
  index: number,
  op: TextOp
) {
  const { doc } = session
  // The line, and the letters to be written, before anything is touched:
  // what cannot be done is found out while the page is still whole.
  const plan = withPage(doc, index, (page) => {
    const before = read(mupdf, session, page)
    const target = before.find(({ line }) => isLine(line, op))
    if (!target)
      throw new Error(
        "That line is not on the page as it was. Nothing was changed."
      )
    const { line, numbers, bands } = target
    const text = op.text.trim()
    const same = text.replace(/\s+/g, " ") === line.text.replace(/\s+/g, " ")
    if (same && !op.look && !op.move) return null
    if (line.fixed && text) throw new Error(line.fixed)
    const resolved = resolve(
      mupdf,
      session,
      text,
      spreadLooks(line.text, text, line.looks),
      // The looks the letters will have: the line's own, with another size or colour laid over them.
      restyled(line, op.look),
      numbers,
      op.look?.font
    )
    return {
      line,
      bands,
      text,
      // Where it is written: where it was, or as far from there as it is moved.
      origin: {
        x: line.origin.x + (op.move?.x ?? 0),
        y: line.origin.y + (op.move?.y ?? 0),
      },
      resolved,
      others: before
        .filter((one) => one !== target)
        .map((one) => mark(one.line))
        .sort(),
    }
  })
  if (!plan) return null
  const { line, text, resolved } = plan
  const glyphs: Glyph[] = resolved.pieces

  withPage(doc, index, (page) => takeOut(mupdf, doc, page, plan.bands))

  withPage(doc, index, (page) => {
    const left = read(mupdf, session, page)
      .map((one) => mark(one.line))
      .sort()
    if (left.join("\n") !== plan.others.join("\n"))
      throw new Error(
        "This line cannot be changed without touching the text beside it. Nothing was changed."
      )
    if (glyphs.length)
      writeRuns(
        session,
        page,
        runsOf(glyphs, plan.origin, line.along),
        resolved
      )
    // Links over its letters go where the letters went.
    if (line.along.x === 1) {
      const to = carry(line.text, text)
      let far = plan.origin.x
      const places = resolved.pieces.map((piece) => {
        const box = {
          x: far,
          y: plan.origin.y - (line.origin.y - line.box.y),
          width: piece.advance,
          height: line.box.height,
        }
        far += piece.advance
        return box
      })
      followLinks(
        doc,
        page,
        plan.bands.map((band, at) => {
          const now = to(at)
          return { was: middleOf(band), now: now === null ? null : places[now] }
        }),
        []
      )
    }
  })

  // The proof: the page is read again, and the new words must be there.
  if (glyphs.length)
    withPage(doc, index, (page) => {
      if (
        !readsAt(
          read(mupdf, session, page),
          plan.origin,
          line.along,
          text.replace(/\s+/g, "")
        )
      )
        throw new Error(
          "The new words could not be read back from the page. Nothing was changed."
        )
    })
  return { fonts: resolved.ours, wrote: null }
}

const ACROSS = { x: 1, y: 0 }

/**
 * Change a paragraph: its lines are taken out from the first one the
 * change touches, and its words are laid out again from there within the
 * width it had.
 * @returns The editor's fonts it was written with and the lines that were written; null when it already is what is asked.
 */
function reflow(
  mupdf: Engine,
  session: EditSession,
  index: number,
  op: FlowOp
) {
  const { doc } = session
  const plan = withPage(doc, index, (page) => {
    const before = read(mupdf, session, page)
    const targets = op.lines.map((given) => {
      const found = before.find(({ line }) =>
        isLine(line, { box: given.box, was: given.was })
      )
      if (!found)
        throw new Error(
          "That paragraph is not on the page as it was. Nothing was changed."
        )
      return found
    })
    if (new Set(targets).size !== targets.length)
      throw new Error("That is not a change to a paragraph.")
    const lines = targets.map((target) => target.line)
    const text = op.text
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
      .join("\n")
      .replace(/^\n+|\n+$/g, "")
    for (const line of lines) {
      if (line.along.x !== 1)
        throw new Error(
          "A paragraph whose lines are turned on the page is changed line by line."
        )
      if (line.fixed && text) throw new Error(line.fixed)
    }
    const old = joined(lines, wordsOf(before.map((one) => one.line)))
    const shape = shapeOf(lines)
    const align = op.align ?? shape.align
    const afresh = Boolean(op.look || op.move || align !== shape.align)
    const from = afresh ? 0 : firstChanged(old.starts, old.text, text)
    if (from === lines.length) return null

    // The looks of all the lines, one line's after another's, as the text counts them.
    const all = {
      styles: lines.flatMap((line) => line.styles),
      looks: old.looks,
    }
    const main = mainStyle(all)
    const by = op.look?.size && main ? op.look.size / main.size : 1
    const leading = shape.leading * by
    const resolved = resolve(
      mupdf,
      session,
      text,
      spreadLooks(old.text, text, old.looks),
      restyled(all, op.look),
      targets.flatMap((target) => target.numbers),
      op.look?.font
    )
    // How far apart the words of the paragraph stand. A file does not say:
    // many fonts in files have no space at all and words are simply placed,
    // and where there is a space, letters and words are often set a hair
    // closer or wider than the font says. So it is measured: what is left
    // of each line's width when its letters are taken off, shared among its
    // gaps. Laid out with that, a line that was not changed comes out as
    // wide as it was, and breaks where it broke.
    let width = shape.right - shape.left
    const fresh = resolved.pieces.find((piece) => piece.letter === " ")
    const usual = fresh?.advance ?? SPACE * (main?.size ?? 12) * by
    let gap = usual
    if (!op.look?.font) {
      const measured: { solid: number; gaps: number; wide: number }[] = []
      for (const target of targets) {
        try {
          const { pieces } = resolve(
            mupdf,
            session,
            target.line.text,
            target.line.looks,
            target.line.styles,
            target.numbers,
            undefined
          )
          const blank = pieces.filter((piece) => !piece.letter.trim())
          measured.push({
            solid:
              pieces.reduce((far, piece) => far + piece.advance, 0) -
              blank.reduce((far, piece) => far + piece.advance, 0),
            gaps: blank.length,
            wide: target.line.box.width,
          })
        } catch {
          // A line with a letter no font here has tells nothing.
        }
      }
      const gaps = measured
        .filter((line) => line.gaps > 0)
        .map((line) => ((line.wide - line.solid) / line.gaps) * by)
        .filter((one) => one > usual * 0.4 && one < usual * 3)
        .sort((a, b) => a - b)
      if (gaps.length)
        gap =
          align === "justify" || shape.align === "justify"
            ? // Lines that were spread to both edges have wider gaps than the words need.
              Math.min(usual, gaps[0])
            : gaps[Math.floor(gaps.length / 2)]
      // A space the font writes is written where it is as wide as the gap
      // that was measured, to within a hair; else the gap is only room.
      const written =
        Boolean(fresh?.font) &&
        Math.abs(usual - gap) < 0.02 * (main?.size ?? 12) * by
      if (written) gap = usual
      // No narrower than any of its lines is with that gap: a line that fitted before must fit again.
      if (by === 1 && shape.align !== "justify")
        measured.forEach((line, at) => {
          const setIn = at === 0 && align === "left" ? shape.indent : 0
          width = Math.max(width, line.solid + line.gaps * gap + setIn)
        })
      resolved.pieces = resolved.pieces.map((piece) =>
        piece.letter.trim() || piece.letter === "\n" || (written && piece.font)
          ? piece
          : { ...piece, font: "", code: "", advance: gap }
      )
    }
    const set =
      align === "left" || align === "justify"
        ? (line: number) => (from + line === 0 ? shape.indent : 0)
        : () => 0
    const flowed = flow(
      resolved.pieces.slice(old.starts[from]),
      (line) => width - set(line),
      align,
      // The engine reads a gap of four fifths of the letters' height as the end of a line.
      (main?.size ?? 12) * by * 0.7
    )
    const start = lines[from]
    const move = op.move ?? { x: 0, y: 0 }
    /** How far a line's letters reach above and below the line they are written on. */
    const up = (start.origin.y - start.box.y) * by
    const down = (start.box.y + start.box.height - start.origin.y) * by
    const written = flowed.map((line, at) => {
      const origin = {
        x: shape.left + set(at) + line.shift + move.x,
        y: start.origin.y + at * leading + move.y,
      }
      return {
        ...line,
        origin,
        box: {
          x: origin.x,
          y: origin.y - up,
          width: line.width,
          height: up + down,
        },
      }
    })

    // Nothing may be written over text that is not the paragraph's: the
    // page could no longer be read line by line, and nobody could read it.
    const others = before.filter((one) => !targets.includes(one))
    const size = (main?.size ?? 12) * by
    const bounds = page.getBounds()
    const collides = (line: (typeof written)[number]) =>
      line.origin.y + down > bounds[3] + 0.5 ||
      others.some(({ line: other }) => {
        const tall = mainStyle(other)?.size ?? size
        return (
          Math.min(line.box.x + line.box.width, other.box.x + other.box.width) -
            Math.max(line.box.x, other.box.x) >
            1 &&
          other.along.x === 1 &&
          // The middles of the two lines' letters, where they are densest.
          Math.min(line.origin.y, other.origin.y) -
            Math.max(line.origin.y - size * 0.6, other.origin.y - tall * 0.6) >
            0
        )
      })
    const over = written.findIndex(collides)
    if (over >= 0) {
      const needs = from + written.length
      const room = from + over
      throw new Error(
        needs > lines.length && room >= lines.length
          ? `This paragraph now needs ${needs} lines, and there is room for ${room} before it would run over what is below. Make it shorter, or its letters smaller. Nothing was changed.`
          : "The paragraph would lie over other text on the page. Nothing was changed."
      )
    }
    // Every letter that is taken out, by its number in the old text, and where it is written again.
    const to = carry(old.text, text)
    const places = new Map<number, Box>()
    for (const line of written)
      for (const place of line.places)
        places.set(old.starts[from] + place.at, {
          x: line.origin.x + place.x,
          y: line.box.y,
          width: place.advance,
          height: line.box.height,
        })
    const moved: Moved[] = targets.slice(from).flatMap((target, at) =>
      target.bands.map((band, letter) => {
        const now = to(old.starts[from + at] + letter)
        return {
          was: middleOf(band),
          now: now === null ? null : (places.get(now) ?? null),
        }
      })
    )
    return {
      from,
      written,
      resolved,
      moved,
      stay: targets
        .slice(0, from)
        .flatMap((target) => target.bands.map(middleOf)),
      bands: targets.slice(from).flatMap((target) => target.bands),
      others: others.map((one) => mark(one.line)).sort(),
      kept: targets.slice(0, from).map((one) => mark(one.line)),
    }
  })
  if (!plan) return null
  const { written, resolved } = plan

  withPage(doc, index, (page) => takeOut(mupdf, doc, page, plan.bands))

  withPage(doc, index, (page) => {
    const left = read(mupdf, session, page)
      .map((one) => mark(one.line))
      .sort()
    if (left.join("\n") !== [...plan.others, ...plan.kept].sort().join("\n"))
      throw new Error(
        "This paragraph cannot be changed without touching the text beside it. Nothing was changed."
      )
    const runs = written.flatMap((line) => runsOf(line.glyphs, line.origin))
    if (runs.length) writeRuns(session, page, runs, resolved)
    followLinks(doc, page, plan.moved, plan.stay)
  })

  // The proof: the page is read again, and every line that was written must be there.
  withPage(doc, index, (page) => {
    const now = read(mupdf, session, page)
    for (const line of written) {
      const words = line.text.replace(/\s+/g, "")
      if (words && !readsAt(now, line.origin, ACROSS, words))
        throw new Error(
          "The new words could not be read back from the page. Nothing was changed."
        )
    }
  })
  return {
    fonts: resolved.ours,
    wrote: {
      from: plan.from,
      lines: written
        .filter((line) => line.text.trim())
        .map((line) => ({ box: line.box, text: line.text })),
    } as Wrote,
  }
}

/**
 * Change the words of lines and of paragraphs, as one step that can be undone.
 * @returns The pages that changed, counted from 0.
 * @throws When the change holds something that is not a change to text,
 * or a line cannot be changed; the file is then as it was.
 */
export function applyText(
  mupdf: Engine,
  session: EditSession,
  change: TextChange
): number[] {
  const ops = change.ops.map((op) => {
    const read = readTextChange(op)
    if (!read) throw new Error("That is not a change to a line.")
    return read
  })
  const fonts = new Set<string>()
  const done: TextChange = { label: change.label, ops, fonts: [] }
  return inStep(
    session,
    change.label,
    (touch) => {
      const wrote: (Wrote | null)[] = []
      for (const [at, op] of ops.entries()) {
        wrote.push(null)
        if (op.page >= session.doc.countPages()) continue
        let made: { fonts: string[]; wrote: Wrote | null } | null
        try {
          made =
            op.do === "reflow"
              ? reflow(mupdf, session, op.page, op)
              : carryOut(mupdf, session, op.page, op)
        } catch (error) {
          // Which of several changes it was that could not be made.
          throw Object.assign(
            error instanceof Error ? error : new Error(String(error)),
            { failed: at }
          )
        }
        if (!made) continue
        touch(op.page)
        for (const key of made.fonts) fonts.add(key)
        wrote[wrote.length - 1] = made.wrote
      }
      done.fonts = [...fonts]
      if (wrote.some(Boolean)) done.wrote = wrote
    },
    { kind: "text", change: done }
  )
}
canDo("text", applyText)

/**
 * Every place some words are in the file's own text, page by page. They
 * are looked for in each paragraph as one text and in each line that is no
 * part of one. Lines whose words cannot be changed are passed over.
 * @returns The lines and paragraphs with the words in them, and whether there are more places than are listed.
 */
export function findText(mupdf: Engine, session: EditSession, query: Query) {
  const found: Found[] = []
  let places = 0
  const pages = session.doc.countPages()
  for (let index = 0; index < pages; index++) {
    const lines = withPage(session.doc, index, (page) =>
      read(mupdf, session, page).map((one) => one.line)
    )
    const blocks = blocksOf(lines)
    const inBlock = new Set(blocks.flatMap((block) => block.lines))
    const known = wordsOf(lines)
    const units: { kind: Found["kind"]; of: PageLine[]; text: string }[] = [
      ...blocks.map((block) => {
        const of = block.lines.map((at) => lines[at])
        return { kind: "block" as const, of, text: joined(of, known).text }
      }),
      ...lines
        .filter((line, at) => !inBlock.has(at) && !line.fixed)
        .map((line) => ({
          kind: "line" as const,
          of: [line],
          text: line.text,
        })),
    ].sort(
      (a, b) => a.of[0].box.y - b.of[0].box.y || a.of[0].box.x - b.of[0].box.x
    )
    for (const unit of units) {
      const spans = findIn(unit.text, query)
      if (!spans.length) continue
      found.push({
        page: index,
        kind: unit.kind,
        lines: unit.of.map((line) => ({ box: line.box, was: line.text })),
        text: unit.text,
        spans,
        fonts: [
          ...new Set(
            unit.of.flatMap((line) => line.styles.map((style) => style.standIn))
          ),
        ],
      })
      places += spans.length
      if (places >= MOST_FOUND) return { found, more: true }
    }
  }
  return { found, more: false }
}

/**
 * Change the words of many lines and paragraphs as one step, and leave
 * out those that cannot be changed: a paragraph that would grow over what
 * is below it, a line that cannot be taken out without its neighbour.
 * @returns The pages that changed, and why each change that was left out could not be made.
 */
export function replaceText(
  mupdf: Engine,
  session: EditSession,
  change: TextChange
): { pages: number[]; refused: string[] } {
  const ops = [...change.ops]
  const refused: string[] = []
  while (ops.length) {
    try {
      return {
        pages: applyText(mupdf, session, { label: change.label, ops }),
        refused,
      }
    } catch (error) {
      const failed = (error as { failed?: unknown }).failed
      if (typeof failed !== "number") throw error
      // The file is as it was before the step; the step is tried again without that change.
      refused.push((error as Error).message)
      ops.splice(failed, 1)
    }
  }
  return { pages: [], refused }
}
