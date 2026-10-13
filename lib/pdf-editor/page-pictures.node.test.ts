// @vitest-environment node
/**
 * The pictures a page already has, changed with the real engine. Results
 * are read back by pdf.js and pdf-lib: where each picture is painted, how
 * many the file still holds, and that the page's words are as they were.
 */
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { installNodeCodecShims } from "@/tests/node-codecs"
import {
  chart,
  jpegOf,
  makePicturePdf,
  paintedPictures,
  pictureText,
  pngOf,
  readPictures,
  scene,
} from "@/tests/pdf-pictures"
import { danglingRefs, readPdf, storedPictures } from "@/tests/pdf-reader"
import { picturesOf, readDraft } from "./draft"
import {
  addPicture,
  exportEdited,
  historyOf,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  type EditSession,
} from "./mupdf-edit"
import { applyPictures, picturesOn } from "./mupdf-pictures"
import {
  moved,
  scaledAbout,
  turnedAbout,
  type PagePicture,
  type PictureOp,
} from "./page-pictures"

installNodeCodecShims()

/** A photograph 240 points wide, a chart 100 wide under it, and the chart again, 60 wide, at the foot of the page. */
async function start() {
  const photo = await jpegOf(scene(200, 120))
  const drawing = await pngOf(chart(100, 100))
  const bytes = await makePicturePdf([
    { bytes: photo, type: "jpeg", width: 240 },
    { bytes: drawing, type: "png", width: 100, again: 60 },
  ])
  return { bytes, session: startEditing(mupdf, bytes) }
}

const change = (
  session: EditSession,
  picture: PagePicture,
  what: Partial<PictureOp>,
  label = "Change a picture"
) =>
  applyPictures(mupdf, session, {
    label,
    ops: [
      {
        do: "picture",
        page: 0,
        index: picture.index,
        at: picture.at,
        ...what,
      } as PictureOp,
    ],
  })

const boxes = (session: EditSession) =>
  picturesOn(session, 0).map(({ box }) =>
    [box.x, box.y, box.width, box.height].map((value) => Math.round(value))
  )

async function exported(session: EditSession) {
  const { bytes } = await exportEdited(mupdf, session)
  expect(await danglingRefs(bytes)).toEqual([])
  expect((await readPdf(bytes)).pages[0].text).toContain(pictureText(1))
  return bytes
}

const rounded = (painted: {
  x: number
  y: number
  width: number
  height: number
}) =>
  [painted.x, painted.y, painted.width, painted.height].map((value) =>
    Math.round(value)
  )

describe("the pictures of a page", () => {
  it("are read with where they are, in the order the page draws them", async () => {
    const { session, bytes } = await start()
    const pictures = picturesOn(session, 0)
    expect(pictures.map((one) => one.index)).toEqual([0, 1, 2])
    expect(boxes(session)).toEqual([
      [40, 72, 240, 144],
      [40, 226, 100, 100],
      [300, 762, 60, 60],
    ])
    expect(pictures[0]).toMatchObject({
      upright: true,
      cut: false,
      width: 200,
      height: 120,
    })
    // As pdf.js finds them in the file as it came.
    expect((await paintedPictures(bytes))[0].map(rounded)).toEqual(
      boxes(session)
    )
    // Reading is no change.
    expect(historyOf(session).steps).toHaveLength(0)
    stopEditing(session)
  })
})

describe("changing a picture of a page", () => {
  it("moves it, and leaves the others and the words where they were", async () => {
    const { session } = await start()
    const [photo] = picturesOn(session, 0)
    expect(change(session, photo, { by: moved({ x: 200, y: 300 }) })).toEqual([
      0,
    ])
    expect(boxes(session)).toEqual([
      [240, 372, 240, 144],
      [40, 226, 100, 100],
      [300, 762, 60, 60],
    ])
    const [painted] = await paintedPictures(await exported(session))
    expect(painted.map(rounded)).toEqual(boxes(session))
    expect(painted[0].dots).toEqual({ width: 200, height: 120 })
    // Moved again, from where it now is.
    change(session, picturesOn(session, 0)[0], { by: moved({ x: -10, y: 0 }) })
    expect(boxes(session)[0]).toEqual([230, 372, 240, 144])
    stopEditing(session)
  })

  it("makes it smaller about a corner, and turns it about its middle", async () => {
    const { session } = await start()
    const [, drawn] = picturesOn(session, 0)
    change(session, drawn, {
      by: scaledAbout({ x: drawn.box.x, y: drawn.box.y }, 0.5),
    })
    expect(boxes(session)[1]).toEqual([40, 226, 50, 50])
    const [photo] = picturesOn(session, 0)
    const middle = {
      x: photo.box.x + photo.box.width / 2,
      y: photo.box.y + photo.box.height / 2,
    }
    change(session, photo, { by: turnedAbout(middle, 1) })
    // On its side: as wide as it was high, about the same middle.
    expect(boxes(session)[0]).toEqual([88, 24, 144, 240])
    const turned = picturesOn(session, 0)[0]
    expect(turned.upright).toBe(false)
    // A picture that is turned is not cut to a part here.
    expect(() =>
      change(session, turned, {
        cut: { left: 0.1, top: 0, right: 0, bottom: 0 },
      })
    ).toThrow(/turned or mirrored/)
    // Three more quarters, and it stands as it stood.
    change(session, turned, { by: turnedAbout(middle, 3) })
    expect(boxes(session)[0]).toEqual([40, 72, 240, 144])
    expect(picturesOn(session, 0)[0].upright).toBe(true)
    const [painted] = await paintedPictures(await exported(session))
    expect(painted.map(rounded)).toEqual(boxes(session))
    stopEditing(session)
  })

  it("cuts it to a part, to a part of that, and shows it whole again", async () => {
    const { session } = await start()
    const [photo] = picturesOn(session, 0)
    change(session, photo, {
      cut: { left: 0.25, top: 0, right: 0.25, bottom: 0.5 },
    })
    // The middle half of its width, the upper half of its height.
    expect(boxes(session)[0]).toEqual([100, 72, 120, 72])
    const cut = picturesOn(session, 0)[0]
    expect(cut.cut).toBe(true)
    expect((await exportEdited(mupdf, session)).report.pictures).toEqual({
      steps: 1,
      cut: true,
    })
    // The picture itself is where it was; a clip shows the part.
    let [painted] = await paintedPictures(await exported(session))
    expect(rounded(painted[0])).toEqual([40, 72, 240, 144])
    expect(painted.map((one) => one.clipped)).toEqual([true, false, false])
    // Half of what shows, from the left.
    change(session, cut, { cut: { left: 0.5, top: 0, right: 0, bottom: 0 } })
    expect(boxes(session)[0]).toEqual([160, 72, 60, 72])
    // Moved, it is still that part.
    change(session, picturesOn(session, 0)[0], { by: moved({ x: 0, y: 400 }) })
    expect(boxes(session)[0]).toEqual([160, 472, 60, 72])
    expect(picturesOn(session, 0)[0].cut).toBe(true)
    change(session, picturesOn(session, 0)[0], { cut: null })
    expect(boxes(session)[0]).toEqual([40, 472, 240, 144])
    ;[painted] = await paintedPictures(await exported(session))
    expect(painted.map((one) => one.clipped)).toEqual([false, false, false])
    expect(rounded(painted[0])).toEqual([40, 472, 240, 144])
    stopEditing(session)
  })

  it("puts another picture in its place, whole and undistorted", async () => {
    const { session, bytes: original } = await start()
    expect(await storedPictures(original)).toBe(2)
    const tall = await pngOf(chart(50, 100))
    const [photo] = picturesOn(session, 0)
    // A picture that was not handed over is not put anywhere.
    expect(() => change(session, photo, { picture: "tall" })).toThrow(
      /has not been handed over/
    )
    addPicture(mupdf, session, "tall", tall)
    change(session, photo, { picture: "tall" })
    // Twice as high as wide, as high as the photograph was, in its middle.
    expect(boxes(session)[0]).toEqual([124, 72, 72, 144])
    expect(picturesOn(session, 0)[0]).toMatchObject({ width: 50, height: 100 })
    const bytes = await exported(session)
    const [painted] = await paintedPictures(bytes)
    expect(painted.map(rounded)).toEqual(boxes(session))
    expect(painted[0].dots).toEqual({ width: 50, height: 100 })
    // The photograph is no longer in the file: the page was the only one to draw it.
    expect(await storedPictures(bytes)).toBe(2)
    expect((await readPictures(bytes)).map((one) => one.width)).toEqual([
      50, 100, 100,
    ])
    stopEditing(session)
  })

  it("takes it out, and out of the file once nothing draws it", async () => {
    const { session } = await start()
    const [, first] = picturesOn(session, 0)
    change(session, first, { remove: true }, "Take out a picture")
    expect(boxes(session)).toEqual([
      [40, 72, 240, 144],
      [300, 762, 60, 60],
    ])
    // The chart is still drawn at the foot of the page, so the file keeps it.
    let bytes = await exported(session)
    expect(await storedPictures(bytes)).toBe(2)
    expect((await paintedPictures(bytes))[0]).toHaveLength(2)
    change(session, picturesOn(session, 0)[1], { remove: true })
    bytes = await exported(session)
    expect(await storedPictures(bytes)).toBe(1)
    expect((await paintedPictures(bytes))[0].map(rounded)).toEqual([
      [40, 72, 240, 144],
    ])
    change(session, picturesOn(session, 0)[0], { remove: true })
    expect(picturesOn(session, 0)).toEqual([])
    bytes = await exported(session)
    expect(await storedPictures(bytes)).toBe(0)
    stopEditing(session)
  })

  it("refuses a picture that is not where it was said to be, and what is no change", async () => {
    const { session } = await start()
    const [photo] = picturesOn(session, 0)
    const elsewhere = { ...photo, at: moved({ x: 5, y: 5 }) }
    expect(() =>
      change(session, elsewhere, { by: moved({ x: 1, y: 1 }) })
    ).toThrow(/not on the page as it was/)
    expect(() =>
      change(session, { ...photo, index: 7 }, { remove: true })
    ).toThrow(/not on the page as it was/)
    expect(() => change(session, photo, {})).toThrow(
      /not a change to a picture/
    )
    expect(historyOf(session).steps).toHaveLength(0)
    expect(boxes(session)[0]).toEqual([40, 72, 240, 144])
    stopEditing(session)
  })
})

describe("undoing and keeping", () => {
  it("undoes and makes again, and comes back from a draft with the picture that was put in", async () => {
    const { session, bytes: original } = await start()
    const tall = await pngOf(chart(50, 100))
    addPicture(mupdf, session, "tall", tall)
    change(session, picturesOn(session, 0)[0], { by: moved({ x: 100, y: 0 }) })
    change(session, picturesOn(session, 0)[1], { picture: "tall" })
    change(session, picturesOn(session, 0)[2], { remove: true })
    const after = boxes(session)
    stepBack(session)
    stepBack(session)
    expect(boxes(session)).toEqual([
      [140, 72, 240, 144],
      [40, 226, 100, 100],
      [300, 762, 60, 60],
    ])
    stepForward(session)
    stepForward(session)
    expect(boxes(session)).toEqual(after)
    const first = await exported(session)

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
    expect(picturesOf(draft.steps)).toEqual(["tall"])
    const again = startEditing(mupdf, original)
    // Without the picture it cannot be taken up, and the file stays as it came.
    expect(() => takeUp(again, draft.steps, draft.position)).toThrow()
    expect(historyOf(again).steps).toHaveLength(0)
    addPicture(mupdf, again, "tall", tall)
    takeUp(again, draft.steps, draft.position)
    expect(boxes(again)).toEqual(after)
    const second = await exported(again)
    expect((await paintedPictures(second))[0].map(rounded)).toEqual(
      (await paintedPictures(first))[0].map(rounded)
    )
    stopEditing(again)
    stopEditing(session)
  })
})
