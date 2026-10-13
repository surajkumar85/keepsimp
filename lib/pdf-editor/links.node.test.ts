// @vitest-environment node
/**
 * Links with the real engine: read, added, led somewhere else, moved and
 * taken away. Results are read back by pdf.js: where each link lies and
 * where it leads.
 */
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { danglingRefs, linkBoxes, readPdf } from "@/tests/pdf-reader"
import { makeTextPdf, TEXT } from "@/tests/pdf-text"
import { readDraft } from "./draft"
import type { LinkOp, PageLink } from "./links"
import {
  exportEdited,
  historyOf,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  type EditSession,
} from "./mupdf-edit"
import { applyLinks, linksOn } from "./mupdf-links"

const change = (
  session: EditSession,
  what: Omit<LinkOp, "do" | "page">,
  page = 0,
  label = "Change a link"
) => applyLinks(mupdf, session, { label, ops: [{ do: "link", page, ...what }] })

const named = (link: PageLink) => ({ index: link.index, at: link.box })

async function exported(session: EditSession) {
  const { bytes } = await exportEdited(mupdf, session)
  expect(await danglingRefs(bytes)).toEqual([])
  const read = await readPdf(bytes)
  expect(read.pages[0].text).toContain(TEXT.title)
  return { bytes, links: read.pages.map((page) => page.links) }
}

const rounded = (box: {
  x: number
  y: number
  width: number
  height: number
}) => [box.x, box.y, box.width, box.height].map((value) => Math.round(value))

describe("the links of a page", () => {
  it("are read with where they lie and lead", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const links = linksOn(session, 0)
    expect(links).toHaveLength(1)
    expect(links[0].to).toEqual({ url: "https://example.org/terms" })
    // 38 to 160 across, 376 to 392 up from the foot of a page 600 high.
    expect(rounded(links[0].box)).toEqual([38, 208, 122, 16])
    expect(linksOn(session, 1)).toEqual([])
    expect(historyOf(session).steps).toHaveLength(0)
    stopEditing(session)
  })
})

describe("changing links", () => {
  it("adds a link to an address and a link to a page", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    expect(
      change(session, {
        box: { x: 40, y: 55, width: 150, height: 22 },
        to: { url: "https://keepsimp.vercel.app/" },
      })
    ).toEqual([0])
    change(session, {
      box: { x: 40, y: 95, width: 120, height: 14 },
      to: { page: 1 },
    })
    const links = linksOn(session, 0)
    expect(links.map((link) => link.to)).toEqual([
      { url: "https://example.org/terms" },
      { url: "https://keepsimp.vercel.app/" },
      { page: 1 },
    ])
    expect(rounded(links[1].box)).toEqual([40, 55, 150, 22])
    const { bytes, links: read } = await exported(session)
    expect(read[0]).toEqual([
      "https://example.org/terms",
      "https://keepsimp.vercel.app/",
      2,
    ])
    const boxes = (await linkBoxes(bytes))[0]
    expect(boxes.map(rounded)).toEqual([
      [38, 208, 122, 16],
      [40, 55, 150, 22],
      [40, 95, 120, 14],
    ])
    stopEditing(session)
  })

  it("adds a link on a page the file shows turned, where it was put", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    change(
      session,
      { box: { x: 100, y: 50, width: 200, height: 30 }, to: { page: 0 } },
      1
    )
    expect(rounded(linksOn(session, 1)[0].box)).toEqual([100, 50, 200, 30])
    const { bytes, links } = await exported(session)
    expect(links[1]).toEqual([1])
    expect((await linkBoxes(bytes))[1].map(rounded)).toEqual([
      [100, 50, 200, 30],
    ])
    stopEditing(session)
  })

  it("leads a link somewhere else, moves it and makes it larger", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    let [link] = linksOn(session, 0)
    change(session, { ...named(link), to: { page: 1 } })
    ;[link] = linksOn(session, 0)
    expect(link.to).toEqual({ page: 1 })
    expect(rounded(link.box)).toEqual([38, 208, 122, 16])
    change(session, {
      ...named(link),
      box: { x: 60, y: 300, width: 200, height: 40 },
    })
    ;[link] = linksOn(session, 0)
    expect(rounded(link.box)).toEqual([60, 300, 200, 40])
    expect(link.to).toEqual({ page: 1 })
    // Both at once, and back to an address: a letter's.
    change(session, {
      ...named(link),
      box: { x: 38, y: 208, width: 122, height: 16 },
      to: { url: "mailto:ada@example.org" },
    })
    const { bytes, links } = await exported(session)
    expect(links[0]).toEqual(["mailto:ada@example.org"])
    expect((await linkBoxes(bytes))[0].map(rounded)).toEqual([
      [38, 208, 122, 16],
    ])
    stopEditing(session)
  })

  it("takes a link away, and leaves the words it lay over", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const [link] = linksOn(session, 0)
    change(session, { ...named(link), remove: true }, 0, "Take away a link")
    expect(linksOn(session, 0)).toEqual([])
    const { bytes, links } = await exported(session)
    expect(links[0]).toEqual([])
    expect((await readPdf(bytes)).pages[0].text).toContain(TEXT.linked)
    stopEditing(session)
  })

  it("refuses a link that is not where it was said to be, a page the file has not, and what is no change", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const [link] = linksOn(session, 0)
    expect(() =>
      change(session, {
        index: 0,
        at: { ...link.box, y: link.box.y + 40 },
        remove: true,
      })
    ).toThrow(/not on the page as it was/)
    expect(() =>
      change(session, { index: 3, at: link.box, remove: true })
    ).toThrow(/not on the page as it was/)
    expect(() => change(session, { ...named(link), to: { page: 9 } })).toThrow(
      /no such page/
    )
    expect(() =>
      change(session, {
        box: { x: 1, y: 1, width: 50, height: 20 },
        to: { url: "javascript:alert(1)" },
      })
    ).toThrow(/not a change to a link/)
    expect(() => change(session, named(link))).toThrow(/not a change to a link/)
    expect(historyOf(session).steps).toHaveLength(0)
    expect(linksOn(session, 0)).toHaveLength(1)
    stopEditing(session)
  })
})

describe("undoing and keeping", () => {
  it("undoes and makes again, and comes back from a draft", async () => {
    const original = await makeTextPdf()
    const session = startEditing(mupdf, original)
    change(session, {
      box: { x: 40, y: 55, width: 150, height: 22 },
      to: { url: "https://keepsimp.vercel.app/" },
    })
    change(session, { ...named(linksOn(session, 0)[0]), remove: true })
    expect(linksOn(session, 0).map((link) => link.to)).toEqual([
      { url: "https://keepsimp.vercel.app/" },
    ])
    stepBack(session)
    expect(linksOn(session, 0)).toHaveLength(2)
    stepBack(session)
    expect(linksOn(session, 0)).toHaveLength(1)
    stepForward(session)
    stepForward(session)
    const first = await exported(session)
    expect(first.links[0]).toEqual(["https://keepsimp.vercel.app/"])

    const draft = readDraft(
      JSON.parse(
        JSON.stringify({
          name: "a.pdf",
          size: 10,
          when: 1,
          steps: session.steps,
          position: session.position,
        })
      )
    )!
    const again = startEditing(mupdf, original)
    takeUp(again, draft.steps, draft.position)
    expect((await exported(again)).links).toEqual(first.links)
    stopEditing(again)
    stopEditing(session)
  })
})
