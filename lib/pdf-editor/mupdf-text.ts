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
import { fontKey, type Colour } from "./objects"
import {
  contentFor,
  familyOf,
  inverse,
  isLine,
  oursAs,
  readTextOp,
  restyled,
  runsOf,
  SPACE,
  spreadLooks,
  type Glyph,
  type LineStyle,
  type Matrix,
  type PageLine,
  type TextChange,
  type TextOp,
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
    const looks = spreadLooks(line.text, text, line.looks)
    // The looks the letters will have: the line's own, with another size or colour laid over them.
    const styles = restyled(line, op.look)
    /** One of the editor's fonts the whole line is to be set in, when that was asked for. */
    const set = op.look?.font
    if (set && !session.fonts.get(set)) throw new FontMissing(set)
    const glyphs: Glyph[] = []
    /** The fonts the letters need a name for on the page: the file's own by number, the editor's by key. */
    const own = new Set<number>()
    const ours = new Set<string>()
    const writes = (look: number, letter: string) => {
      const number = numbers[look]
      return number === null || set
        ? undefined
        : codesOf(mupdf, session, number).letters.get(letter)
    }
    Array.from(text).forEach((letter, at) => {
      let look = looks[at]
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
        glyphs.push({
          ...size,
          font: `KS${number}`,
          code: has.code,
          advance: has.advance * style.size,
        })
        return
      }
      // A gap between words. A font the whole line is set in writes its own
      // space, so the words are apart by as much as that font means and are
      // read as words; where a file's font has no space, the gap is only room.
      const spaced =
        !letter.trim() && set
          ? session.fonts.get(set)?.encodeCharacter(letter.codePointAt(0)!)
          : 0
      if (!letter.trim() && !spaced) {
        glyphs.push({
          ...size,
          font: "",
          code: "",
          advance: SPACE * style.size,
        })
        return
      }
      const font = session.fonts.get(lent)
      if (!font) throw new FontMissing(lent)
      const glyph = font.encodeCharacter(letter.codePointAt(0)!)
      if (!glyph)
        throw new Error(
          `No font here has the letter “${letter}”. Nothing was changed.`
        )
      ours.add(lent)
      glyphs.push({
        ...size,
        font: oursAs(lent),
        code: glyph.toString(16).padStart(4, "0"),
        advance: font.advanceGlyph(glyph) * style.size,
      })
    })
    return {
      line,
      bands,
      text,
      // Where it is written: where it was, or as far from there as it is moved.
      origin: {
        x: line.origin.x + (op.move?.x ?? 0),
        y: line.origin.y + (op.move?.y ?? 0),
      },
      glyphs,
      own: [...own],
      ours: [...ours],
      others: before
        .filter((one) => one !== target)
        .map((one) => mark(one.line))
        .sort(),
    }
  })
  if (!plan) return null
  const { line, text, glyphs } = plan

  // Out with the old letters, and nothing else: no picture, no drawing, and
  // nothing put in their place.
  withPage(doc, index, (page) => {
    const notes = page.getObject().get("Annots")
    const links: Obj[] = []
    if (notes.isArray())
      notes.forEach((note) => {
        if (note.get("Subtype").asName() === "Link") links.push(note)
      })
    // Marks for taking out that the file came with are not ours to apply.
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
    const cut = page.createAnnotation("Redact")
    cut.setQuadPoints(plan.bands)
    page.applyRedactions(
      false,
      mupdf.PDFPage.REDACT_IMAGE_NONE,
      mupdf.PDFPage.REDACT_LINE_ART_NONE,
      mupdf.PDFPage.REDACT_TEXT_REMOVE
    )
    // Links that lay over the line stay links, and marks that were waiting wait on.
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
  })

  withPage(doc, index, (page) => {
    const left = read(mupdf, session, page)
      .map((one) => mark(one.line))
      .sort()
    if (left.join("\n") !== plan.others.join("\n"))
      throw new Error(
        "This line cannot be changed without touching the text beside it. Nothing was changed."
      )
    if (!glyphs.length) return
    const object = page.getObject()
    const names = fontNames(doc, object)
    for (const number of plan.own)
      names.put(`KS${number}`, doc.newIndirect(number))
    for (const key of plan.ours)
      names.put(oursAs(key), doc.addFont(session.fonts.get(key)!))
    const written = contentFor(
      runsOf(glyphs, plan.origin, line.along),
      inverse(page.getTransform() as Matrix)
    )
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
  })

  // The proof: the page is read again, and the new words must be there.
  if (glyphs.length)
    withPage(doc, index, (page) => {
      const wanted = text.replace(/\s+/g, "")
      const found = read(mupdf, session, page).some(
        (one) =>
          // On the line it was written on: beside or beyond where it starts,
          // and no higher or lower than that.
          Math.abs(
            (one.line.origin.x - plan.origin.x) * line.along.y -
              (one.line.origin.y - plan.origin.y) * line.along.x
          ) < 2 && one.line.text.replace(/\s+/g, "").includes(wanted)
      )
      if (!found)
        throw new Error(
          "The new words could not be read back from the page. Nothing was changed."
        )
    })
  return plan.ours
}

/**
 * Change the words of lines, as one step that can be undone.
 * @returns The pages that changed, counted from 0.
 * @throws When the change holds something that is not a change to a line,
 * or a line cannot be changed; the file is then as it was.
 */
export function applyText(
  mupdf: Engine,
  session: EditSession,
  change: TextChange
): number[] {
  const ops = change.ops.map((op) => {
    const read = readTextOp(op)
    if (!read) throw new Error("That is not a change to a line.")
    return read
  })
  const fonts = new Set<string>()
  const done: TextChange = { label: change.label, ops, fonts: [] }
  return inStep(
    session,
    change.label,
    (touch) => {
      for (const op of ops) {
        if (op.page >= session.doc.countPages()) continue
        const used = carryOut(mupdf, session, op.page, op)
        if (!used) continue
        touch(op.page)
        for (const key of used) fonts.add(key)
      }
      done.fonts = [...fonts]
    },
    { kind: "text", change: done }
  )
}
canDo("text", applyText)
