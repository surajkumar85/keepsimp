/**
 * What a page already has, as the editor's in-page tools change it: the
 * page's own lines and paragraphs ("Change text"), the pictures it draws
 * ("Pictures of the page") and its links ("Links"). Each is found as those
 * tools find it, and changed by the same steps.
 */
import type { Box } from "@/lib/pdf-editor/geometry"
import {
  LONGEST_ADDRESS,
  SMALLEST_LINK,
  targetFrom,
  targetText,
  type LinkOp,
  type PageLink,
} from "@/lib/pdf-editor/links"
import { fontKey, type BuiltIn } from "@/lib/pdf-editor/objects"
import {
  moved as movedBy,
  scaledAbout,
  turnedAbout,
  type Cut,
  type PagePicture,
  type PictureOp,
} from "@/lib/pdf-editor/page-pictures"
import {
  ALIGNS,
  asLine,
  blocksOf,
  type Align,
  type FlowOp,
} from "@/lib/pdf-editor/paragraphs"
import {
  LONGEST_LINE,
  mainStyle,
  standIns,
  type LineLook,
  type PageLine,
  type TextOp,
} from "@/lib/pdf-editor/retext"
import { lock, pagesOf, password, plural, type LockInput } from "./pdf"
import type { PdfEngine } from "./pdf-engine"
import {
  colour,
  colourOf,
  editKit,
  FONTS,
  keepEditable,
  newId,
  type EditText,
  type Session,
} from "./pdf-kit"
import {
  asTool,
  fileProperty,
  ToolError,
  type AgentTool,
  type JsonSchema,
} from "./registry"

/** The most pages read in one listing. */
export const MOST_LISTED = 200

/** A line or a paragraph of a page, as "Change text" offers it. */
interface Place {
  id: string
  page: number
  kind: "line" | "paragraph"
  /** The paragraph as one line, or the line itself. */
  whole: PageLine
  /** Its lines from the top down. */
  lines: PageLine[]
}

/** The lines and paragraphs of a page, each with an id that names it on that page. */
export function placesOf(
  page: number,
  lines: readonly PageLine[],
  paragraphs: boolean
): Place[] {
  const blocks = paragraphs ? blocksOf(lines) : []
  const inBlock = new Set(blocks.flatMap((block) => block.lines))
  const places: Place[] = []
  blocks.forEach((block, at) => {
    const own = block.lines.map((line) => lines[line])
    places.push({
      id: `p${page + 1}-b${at + 1}`,
      page,
      kind: "paragraph",
      whole: asLine(own),
      lines: own,
    })
  })
  lines.forEach((line, at) => {
    if (inBlock.has(at)) return
    places.push({
      id: `p${page + 1}-l${at + 1}`,
      page,
      kind: "line",
      whole: line,
      lines: [line],
    })
  })
  // In the order they are read: from the top of the page down.
  return places.sort(
    (one, other) =>
      one.whole.box.y - other.whole.box.y || one.whole.box.x - other.whole.box.x
  )
}

/** How many lines or paragraphs, in words. */
const texts = (count: number) =>
  `${count.toLocaleString("en")} ${count === 1 ? "line or paragraph" : "lines or paragraphs"}`

const pictureId = (page: number, index: number) => `p${page + 1}-i${index + 1}`
const linkId = (page: number, index: number) => `p${page + 1}-k${index + 1}`

/** The page and the place on it an id names, or a ToolError that says what ids look like. */
export function readId(id: string, kind: "b|l" | "i" | "k", pages: number) {
  const found = new RegExp(`^p(\\d+)-(${kind})(\\d+)$`).exec(id)
  if (!found)
    throw new ToolError(
      `"${id}" is not an id read_pdf_page_content gives for this.`
    )
  const page = Number(found[1]) - 1
  if (page >= pages)
    throw new ToolError(
      `"${id}" names page ${page + 1}; the file has ${pages}.`
    )
  return { page, kind: found[2], index: Number(found[3]) - 1 }
}

const box = (value: Box) => ({
  x: Math.round(value.x * 10) / 10,
  y: Math.round(value.y * 10) / 10,
  width: Math.round(value.width * 10) / 10,
  height: Math.round(value.height * 10) / 10,
})

export function pdfContentTools(
  engine: PdfEngine,
  text: EditText
): AgentTool[] {
  const { editing, fontReady, ownFont } = editKit(engine, text)

  const pagesWanted = (session: Session, given: string | undefined) => {
    const pages = given
      ? [...new Set(pagesOf(given, session.pages, "pages"))]
      : Array.from({ length: session.pages }, (_, page) => page)
    if (pages.length > MOST_LISTED)
      throw new ToolError(
        `That is ${pages.length} pages; read at most ${MOST_LISTED} at a time with "pages".`
      )
    return pages
  }

  const read: AgentTool<{
    file: string
    password?: string
    pages?: string
    paragraphs?: boolean
  }> = {
    name: "read_pdf_page_content",
    title: "Read what a PDF's pages hold",
    description:
      "Lists what the editor can change on a page as it stands: the page's own lines of text and paragraphs (lines that belong together, judged by their look: set paragraphs false to have every line alone), with their words, place, font, size and colour, and why one cannot be retyped; the pictures each page draws, with their place and size in dots; and its links, with where they lead. Each has an id for edit_pdf_text, edit_pdf_pictures and edit_pdf_links. Places are in points from the page's top-left corner as it is shown.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        pages: {
          type: "string",
          maxLength: 20000,
          description: `The pages to read, such as "1-3, 7"; every page by default, at most ${MOST_LISTED}.`,
        },
        paragraphs: { type: "boolean" },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "" },
        async (session) => {
          const pages: {
            page: number
            text: object[]
            pictures: object[]
            links: object[]
          }[] = []
          for (const page of pagesWanted(session, input.pages)) {
            const lines = await engine.linesOf(session.id, page)
            const pictures = await engine.pagePictures(session.id, page)
            const links = await engine.pageLinks(session.id, page)
            pages.push({
              page: page + 1,
              text: placesOf(page, lines, input.paragraphs ?? true).map(
                (place) => {
                  const style = mainStyle(place.whole)
                  return {
                    id: place.id,
                    kind: place.kind,
                    text: place.whole.text,
                    box: box(place.whole.box),
                    ...(style
                      ? {
                          font: style.font,
                          size: Math.round(style.size * 10) / 10,
                          colour: `#${style.colour
                            .map((part) =>
                              Math.round(part * 255)
                                .toString(16)
                                .padStart(2, "0")
                            )
                            .join("")}`,
                        }
                      : {}),
                    ...(place.lines.some((line) => line.fixed)
                      ? { fixed: place.lines.find((line) => line.fixed)!.fixed }
                      : {}),
                  }
                }
              ),
              pictures: pictures.map((picture) => ({
                id: pictureId(page, picture.index),
                box: box(picture.box),
                dots: { width: picture.width, height: picture.height },
                ...(picture.cut ? { cut: true } : {}),
                ...(picture.upright ? {} : { upright: false }),
              })),
              links: links.map((link) => ({
                id: linkId(page, link.index),
                box: box(link.box),
                to: link.to ? targetText(link.to) : null,
              })),
            })
          }
          const count = (what: "text" | "pictures" | "links") =>
            pages.reduce((sum, page) => sum + page[what].length, 0)
          return {
            answerOnly: true,
            said: [
              `${plural(pages.length, "page")}: ${texts(count("text"))}, ${plural(count("pictures"), "picture")}, ${plural(count("links"), "link")}.`,
            ],
            data: { pages },
          }
        }
      ),
  }

  /** The lines and paragraphs of the pages ids name, read once. */
  async function placesNamed(
    session: Session,
    ids: readonly string[],
    paragraphs: boolean
  ) {
    const read = new Map<number, Place[]>()
    const found = new Map<string, Place>()
    for (const id of ids) {
      const { page } = readId(id, "b|l", session.pages)
      if (!read.has(page))
        read.set(
          page,
          placesOf(page, await engine.linesOf(session.id, page), paragraphs)
        )
      const place = read.get(page)!.find((one) => one.id === id)
      if (!place)
        throw new ToolError(
          `There is no ${id.includes("-b") ? "paragraph" : "line"} "${id}" on page ${page + 1}${paragraphs ? "" : " with paragraphs off"}. read_pdf_page_content gives the ids.`
        )
      found.set(id, place)
    }
    return found
  }

  const textFonts = [...FONTS, "own"] as const
  const editText: AgentTool<{
    file: string
    password?: string
    paragraphs?: boolean
    changes: {
      id: string
      text?: string
      delete?: boolean
      size?: number
      colour?: string
      font?: (typeof textFonts)[number]
      bold?: boolean
      italic?: boolean
      align?: Align
      dx?: number
      dy?: number
    }[]
    fontFile?: string
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "edit_pdf_text",
    title: "Change a PDF's own text",
    description:
      "Changes the words a page already has, as the editor's Change text does: the old letters are taken out and the new ones written with the line's own font (letters it lacks in the closest of the editor's fonts); a paragraph flows again within its width. Also another size, colour or font (one of the editor's or a font file of your own), another alignment for a paragraph, a move, or taking it out. Every change is read back, and one that would touch another line is refused. Ids come from read_pdf_page_content (with the same paragraphs choice). Text that is written downwards, or in scripts whose letters join, cannot be retyped.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        paragraphs: {
          type: "boolean",
          description: "As given to read_pdf_page_content (true by default).",
        },
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          items: {
            type: "object",
            properties: {
              id: { type: "string", maxLength: 40 },
              text: {
                type: "string",
                maxLength: 20000,
                description:
                  "What it is to say; a new line where one must begin.",
              },
              delete: { type: "boolean" },
              size: { type: "number", minimum: 4, maximum: 288 },
              colour,
              font: {
                type: "string",
                enum: [...textFonts],
                description:
                  "Set the whole line in one of the editor's fonts, or in fontFile (own); the line's own font by default.",
              },
              bold: { type: "boolean" },
              italic: { type: "boolean" },
              align: { type: "string", enum: [...ALIGNS] },
              dx: { type: "number", minimum: -5000, maximum: 5000 },
              dy: { type: "number", minimum: -5000, maximum: 5000 },
            },
            required: ["id"],
            additionalProperties: false,
          },
        },
        fontFile: fileProperty(
          'A TrueType or OpenType font of your own, for font "own".'
        ),
        keepEditable,
        lock,
      },
      required: ["file", "changes"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-edited" },
        async (session) => {
          const places = await placesNamed(
            session,
            input.changes.map((change) => change.id),
            input.paragraphs ?? true
          )
          let own: { key: string; name: string } | null = null
          if (input.changes.some((change) => change.font === "own")) {
            if (!input.fontFile)
              throw new ToolError('Give "fontFile" for font "own".')
            const held = context.files.get(input.fontFile)
            own = await ownFont(session, held.blob, held.ref.name)
          }
          const ops: (TextOp | FlowOp)[] = []
          const lent = new Set<string>()
          for (const change of input.changes) {
            const place = places.get(change.id)!
            const words = change.delete ? "" : (change.text ?? place.whole.text)
            if (change.align && place.kind === "line")
              throw new ToolError(
                `${change.id} is a line: only a paragraph is aligned.`
              )
            if ((change.bold || change.italic) && !change.font)
              throw new ToolError(
                `${change.id}: bold and italic come with a font of the editor's ("font").`
              )
            const fixed = place.lines.find((line) => line.fixed)?.fixed
            if (fixed && words && words !== place.whole.text)
              throw new ToolError(`${change.id} cannot be retyped: ${fixed}`)
            const look: LineLook = {
              ...(change.size ? { size: change.size } : {}),
              ...(change.colour ? { colour: colourOf(change.colour) } : {}),
              ...(change.font
                ? {
                    font:
                      change.font === "own"
                        ? own!.key
                        : fontKey({
                            font: change.font as BuiltIn,
                            bold: Boolean(change.bold),
                            italic: Boolean(change.italic),
                          }),
                  }
                : {}),
            }
            const move =
              change.dx || change.dy
                ? { x: change.dx ?? 0, y: change.dy ?? 0 }
                : undefined
            const restyle = Object.keys(look).length ? look : undefined
            if (
              words === place.whole.text &&
              !restyle &&
              !move &&
              !change.align
            )
              throw new ToolError(`${change.id}: nothing to change.`)
            if (words.length > LONGEST_LINE * place.lines.length)
              throw new ToolError(
                `${change.id}: that is too many words for it.`
              )
            // The fonts the change is written in: the one chosen, or those that stand in for letters the line's own lacks.
            if (look.font) lent.add(look.font)
            else if (standIns(place.whole, words).length)
              for (const style of place.whole.styles) lent.add(style.standIn)
            ops.push(
              place.kind === "paragraph"
                ? {
                    do: "reflow",
                    page: place.page,
                    lines: place.lines.map((line) => ({
                      box: line.box,
                      was: line.text,
                    })),
                    text: words,
                    ...(restyle ? { look: restyle } : {}),
                    ...(change.align ? { align: change.align } : {}),
                    ...(move ? { move } : {}),
                  }
                : {
                    do: "retext",
                    page: place.page,
                    box: place.whole.box,
                    was: place.whole.text,
                    text: words,
                    ...(restyle ? { look: restyle } : {}),
                    ...(move ? { move } : {}),
                  }
            )
          }
          for (const key of lent) await fontReady(session, key)
          await engine.editText(session.id, { label: "Change text", ops })
          const taken = input.changes.filter((change) => change.delete).length
          const said = [
            `${texts(ops.length - taken)} changed${taken ? `, ${taken} taken out` : ""}, each read back from the page.`,
          ]
          if (own)
            said.push(
              `Set in ${own.name}, embedded with only the letters used.`
            )
          return { said }
        }
      ),
  }

  type PictureAsked = {
    id: string
    dx?: number
    dy?: number
    scale?: number
    turn?: 90 | 180 | 270
    cut?: Cut
    whole?: boolean
    replace?: string
    delete?: boolean
  }
  const sides: JsonSchema = {
    type: "object",
    properties: Object.fromEntries(
      ["left", "top", "right", "bottom"].map((side) => [
        side,
        { type: "number", minimum: 0, exclusiveMaximum: 1 },
      ])
    ),
    additionalProperties: false,
    description:
      "How much of what shows to cut away at each side, as a share from 0 to 1. It hides; the whole picture stays in the file.",
  }

  /** A page's picture or link by its index, as the page now has it. */
  async function current<T extends { index: number }>(
    list: (id: string, page: number) => Promise<T[]>,
    session: Session,
    page: number,
    index: number,
    id: string,
    what: string
  ) {
    const found = (await list(session.id, page)).find(
      (one) => one.index === index
    )
    if (!found)
      throw new ToolError(
        `There is no ${what} "${id}" on page ${page + 1}. read_pdf_page_content gives the ids.`
      )
    return found
  }

  const editPictures: AgentTool<{
    file: string
    password?: string
    changes: PictureAsked[]
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "edit_pdf_pictures",
    title: "Change the pictures a PDF's pages draw",
    description:
      "Changes pictures a page already draws, as the editor's Pictures of the page does: moves them (in points), makes them larger or smaller about their top-left corner, turns them by quarters about their middle, cuts them to a part or shows them whole again (cutting hides and does not remove: redact_pdf removes), puts another picture in their place (whole and undistorted, as large as fits), or takes them out of the file. The picture's own data is never decoded or saved again, and every change is read back: the other pictures and the text stay where they were. Ids come from read_pdf_page_content.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          items: {
            type: "object",
            properties: {
              id: { type: "string", maxLength: 40 },
              dx: { type: "number", minimum: -5000, maximum: 5000 },
              dy: { type: "number", minimum: -5000, maximum: 5000 },
              scale: { type: "number", minimum: 0.05, maximum: 20 },
              turn: { type: "integer", enum: [90, 180, 270] },
              cut: sides,
              whole: {
                type: "boolean",
                description: "Show all of a picture that was cut.",
              },
              replace: fileProperty(
                "A PNG, JPEG, WebP or AVIF picture to put in its place."
              ),
              delete: { type: "boolean" },
            },
            required: ["id"],
            additionalProperties: false,
          },
        },
        keepEditable,
        lock,
      },
      required: ["file", "changes"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-edited" },
        async (session) => {
          const asked = input.changes.map((change) => ({
            change,
            ...readId(change.id, "i", session.pages),
          }))
          const list = (id: string, page: number) =>
            engine.pagePictures(id, page)
          const made: string[] = []
          const step = async (
            page: number,
            index: number,
            id: string,
            what: Pick<PictureOp, "by" | "cut" | "picture" | "remove">,
            label: string
          ) => {
            const picture: PagePicture = await current(
              list,
              session,
              page,
              index,
              id,
              "picture"
            )
            await engine.editPagePicture(session.id, {
              label,
              ops: [{ do: "picture", page, index, at: picture.at, ...what }],
            })
            made.push(label.toLowerCase())
            return picture
          }
          // Taken out last, from the highest place on each page, so that the others keep theirs.
          const order = [
            ...asked.filter((one) => !one.change.delete),
            ...asked
              .filter((one) => one.change.delete)
              .sort(
                (one, other) => other.page - one.page || other.index - one.index
              ),
          ]
          for (const { change, page, index } of order) {
            const { id } = change
            let did = false
            if (change.delete) {
              await step(
                page,
                index,
                id,
                { remove: true },
                "Take out a picture"
              )
              continue
            }
            if (change.replace) {
              const name = newId()
              await engine.editPicture(
                session.id,
                name,
                context.files.get(change.replace).blob
              )
              await step(
                page,
                index,
                id,
                { picture: name },
                "Put another picture in its place"
              )
              did = true
            }
            if (change.whole) {
              await step(page, index, id, { cut: null }, "Show a whole picture")
              did = true
            }
            if (change.cut) {
              const { left = 0, top = 0, right = 0, bottom = 0 } = change.cut
              if (left + right >= 1 || top + bottom >= 1)
                throw new ToolError(`${id}: that cut leaves nothing showing.`)
              await step(
                page,
                index,
                id,
                { cut: { left, top, right, bottom } },
                "Cut a picture to a part"
              )
              did = true
            }
            if (change.scale && change.scale !== 1) {
              const picture = await current(
                list,
                session,
                page,
                index,
                id,
                "picture"
              )
              await step(
                page,
                index,
                id,
                {
                  by: scaledAbout(
                    { x: picture.box.x, y: picture.box.y },
                    change.scale
                  ),
                },
                "Resize a picture"
              )
              did = true
            }
            if (change.turn) {
              const picture = await current(
                list,
                session,
                page,
                index,
                id,
                "picture"
              )
              await step(
                page,
                index,
                id,
                {
                  by: turnedAbout(
                    {
                      x: picture.box.x + picture.box.width / 2,
                      y: picture.box.y + picture.box.height / 2,
                    },
                    change.turn / 90
                  ),
                },
                "Turn a picture"
              )
              did = true
            }
            if (change.dx || change.dy) {
              await step(
                page,
                index,
                id,
                { by: movedBy({ x: change.dx ?? 0, y: change.dy ?? 0 }) },
                "Move a picture"
              )
              did = true
            }
            if (!did) throw new ToolError(`${id}: nothing to change.`)
          }
          const said = [
            `${plural(input.changes.length, "picture")} changed: ${[...new Set(made)].join(", ")}. Each change was read back: the other pictures and the text are where they were.`,
          ]
          if (input.changes.some((change) => change.cut))
            said.push(
              "A picture cut to a part is still whole in the file: anyone can show it again. redact_pdf takes it out."
            )
          return { said }
        }
      ),
  }

  type LinkAsked = {
    id?: string
    page?: number
    x?: number
    y?: number
    width?: number
    height?: number
    to?: string
    delete?: boolean
  }
  const editLinks: AgentTool<{
    file: string
    password?: string
    changes: LinkAsked[]
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "edit_pdf_links",
    title: "Add and change a PDF's links",
    description: `Adds links to a page (a box in points and where it leads), leads links elsewhere, moves or resizes them, or takes them away, as the editor's Links does. A link leads to a page ("3", "page 3") or to an address of the web, e-mail (mailto:) or telephone (tel:); nothing that runs anything. Where an address leads is not checked, and nothing is asked of the network. Ids come from read_pdf_page_content; a change without an id adds a link.`,
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 500,
          items: {
            type: "object",
            properties: {
              id: { type: "string", maxLength: 40 },
              page: {
                type: "integer",
                minimum: 1,
                description: "For a new link.",
              },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number", minimum: SMALLEST_LINK },
              height: { type: "number", minimum: SMALLEST_LINK },
              to: { type: "string", minLength: 1, maxLength: LONGEST_ADDRESS },
              delete: { type: "boolean" },
            },
            additionalProperties: false,
          },
        },
        keepEditable,
        lock,
      },
      required: ["file", "changes"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-edited" },
        async (session) => {
          const leadsTo = (typed: string) => {
            const to = targetFrom(typed, session.pages)
            if (!to)
              throw new ToolError(
                /^(?:page|p\.?)?\s*\d+$/i.test(typed.trim())
                  ? `"${typed}" is not a page of this file, which has ${session.pages}.`
                  : `"${typed}" is not an address a link is given: the web, mailto: or tel:, nothing that runs anything.`
              )
            return to
          }
          const placeOf = (change: LinkAsked) => {
            const given = [change.x, change.y, change.width, change.height]
            if (given.every((one) => one === undefined)) return undefined
            if (given.some((one) => one === undefined))
              throw new ToolError(
                "A link's place needs x, y, width and height."
              )
            return {
              x: change.x!,
              y: change.y!,
              width: change.width!,
              height: change.height!,
            }
          }
          const list = (id: string, page: number) => engine.pageLinks(id, page)
          let added = 0
          let changed = 0
          let removed = 0
          const named = input.changes
            .filter((change) => change.id)
            .map((change) => ({
              change,
              ...readId(change.id!, "k", session.pages),
            }))
          // Changed first, then added (at the end of each page's list), then taken away from the highest place down.
          for (const { change, page, index } of named.filter(
            (one) => !one.change.delete
          )) {
            const link: PageLink = await current(
              list,
              session,
              page,
              index,
              change.id!,
              "link"
            )
            const place = placeOf(change)
            if (!place && !change.to)
              throw new ToolError(`${change.id}: nothing to change.`)
            const op: LinkOp = {
              do: "link",
              page,
              index,
              at: link.box,
              ...(place ? { box: place } : {}),
              ...(change.to ? { to: leadsTo(change.to) } : {}),
            }
            await engine.editPageLink(session.id, {
              label: "Change a link",
              ops: [op],
            })
            changed++
          }
          for (const change of input.changes.filter((one) => !one.id)) {
            if (change.delete)
              throw new ToolError("Give the id of the link to take away.")
            const place = placeOf(change)
            if (!change.page || !place || !change.to)
              throw new ToolError(
                "A new link needs a page, x, y, width, height and where it leads (to)."
              )
            if (change.page > session.pages)
              throw new ToolError(
                `There are ${session.pages} pages; page ${change.page} is not one of them.`
              )
            await engine.editPageLink(session.id, {
              label: "Add a link",
              ops: [
                {
                  do: "link",
                  page: change.page - 1,
                  box: place,
                  to: leadsTo(change.to),
                },
              ],
            })
            added++
          }
          for (const { change, page, index } of named
            .filter((one) => one.change.delete)
            .sort(
              (one, other) => other.page - one.page || other.index - one.index
            )) {
            const link: PageLink = await current(
              list,
              session,
              page,
              index,
              change.id!,
              "link"
            )
            await engine.editPageLink(session.id, {
              label: "Take away a link",
              ops: [{ do: "link", page, index, at: link.box, remove: true }],
            })
            removed++
          }
          return {
            said: [
              `${[
                added ? `${plural(added, "link")} added` : "",
                changed ? `${plural(changed, "link")} changed` : "",
                removed ? `${plural(removed, "link")} taken away` : "",
              ]
                .filter(Boolean)
                .join(
                  ", "
                )}. Each was read back; where an address leads is not checked.`,
            ],
          }
        }
      ),
  }

  return [read, editText, editPictures, editLinks].map((tool) =>
    asTool(tool as AgentTool<never>)
  )
}
