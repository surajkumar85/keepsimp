import { test, expect, type Page } from "@playwright/test"
import { bytesOf } from "./pdf"
import {
  clip,
  CONVERTER,
  decodesCleanly,
  download,
  frameHashes,
  probe,
  reportWorkerErrors,
  settled,
  streamSeconds,
  TRIMMER,
} from "./video"

reportWorkerErrors()

/** Six seconds at 30 fps with a keyframe every second, so cuts can be checked frame by frame. */
const source = () =>
  clip("keyed.mp4", {
    size: "640x360",
    seconds: 6,
    args: [
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "30",
      "-bf",
      "2",
      "-c:a",
      "aac",
    ],
  })

const panel = (page: Page) => page.getByTestId("trim-panel")

async function select(page: Page, start: string, end: string) {
  await panel(page).getByLabel("Start", { exact: true }).fill(start)
  await panel(page).getByLabel("Start", { exact: true }).press("Enter")
  await panel(page).getByLabel("End", { exact: true }).fill(end)
  await panel(page).getByLabel("End", { exact: true }).press("Enter")
}

test("keeps a part without encoding: an unbroken run of the source's frames, starting where asked", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const original = source()
  await page.goto(TRIMMER)
  await expect(page.getByTestId("video-focused")).toContainText(
    "This page is the Video editor, opened for trimming."
  )
  await page.locator("#video-file").setInputFiles([original])
  await settled(page)
  await select(page, "1.5", "4.2")
  await panel(page).getByRole("button", { name: "Keep the selection" }).click()
  await expect(page.getByTestId("trim-summary")).toHaveText(
    "Keeping 1 part: 0:02.70 of 0:06.00."
  )
  await expect(page.getByTestId("video-plan")).toContainText(
    "the file says where to start playing"
  )
  await settled(page)
  await expect(page.getByTestId("video-plan")).toContainText(
    "Written and checked"
  )
  const result = await download(page, "keyed.mp4")
  expect(result.name).toBe("keyed-trimmed.mp4")
  const all = frameHashes(original.buffer, "keyed-source.mp4")
  const kept = frameHashes(result.bytes, "keyed-kept.mp4")
  const first = all.indexOf(kept[0])
  // Copied, not encoded: the source's own frames, from the frame asked
  // for to the keyframe at 5 s, none skipped.
  expect(kept).toEqual(all.slice(first, first + kept.length))
  expect(Math.abs(first / 30 - 1.5)).toBeLessThanOrEqual(1 / 30)
  expect((first + kept.length) / 30).toBeCloseTo(5, 5)
  expect(
    Math.abs(streamSeconds(result.bytes, "keyed-kept.mp4", "a") - 3.5)
  ).toBeLessThan(0.05)
})

test("cuts a part out exactly with the keys, undoes it, and saves a frame", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto(TRIMMER)
  await page.locator("#video-file").setInputFiles([source()])
  await settled(page)
  // The keys work while the panel has the focus.
  await panel(page).getByRole("button", { name: "Start here (I)" }).focus()
  const keys = page.keyboard
  await keys.press("Shift+ArrowRight")
  await keys.press("Shift+ArrowRight")
  await keys.press("i")
  await keys.press("Shift+ArrowRight")
  await keys.press("o")
  await expect(panel(page).getByLabel("Start", { exact: true })).toHaveValue(
    "0:02.00"
  )
  await expect(panel(page).getByLabel("End", { exact: true })).toHaveValue(
    "0:03.00"
  )
  await keys.press("Delete")
  await expect(page.getByTestId("trim-summary")).toHaveText(
    "Keeping 2 parts: 0:05.00 of 0:06.00."
  )
  await keys.press("ControlOrMeta+z")
  await expect(page.getByTestId("trim-summary")).toHaveText(
    "The whole video: 0:06.00."
  )
  await keys.press("ControlOrMeta+Shift+z")
  await expect(page.getByTestId("trim-summary")).toHaveText(
    "Keeping 2 parts: 0:05.00 of 0:06.00."
  )
  await panel(page).getByRole("radio", { name: "Exact", exact: true }).click()
  await expect(page.getByTestId("video-plan")).toContainText(
    "it is cut exactly where asked"
  )
  await settled(page, 150_000)
  const result = await download(page, "keyed.mp4")
  const said = probe(result.bytes, "keyed-exact.mp4")
  const picture = said.streams.find((one) => one.codec_type === "video")!
  expect(Number(picture.nb_read_frames)).toBe(150)
  expect(
    Math.abs(streamSeconds(result.bytes, "keyed-exact.mp4", "a") - 5)
  ).toBeLessThan(0.05)
  expect(decodesCleanly(result.bytes, "keyed-exact.mp4")).toBe(true)

  // A frame, read from the file at its own size.
  await page
    .getByTestId("video-selected")
    .getByRole("radio", { name: "Original", exact: true })
    .click()
  const pending = page.waitForEvent("download")
  await panel(page).getByRole("button", { name: "Save this frame" }).click()
  const frame = await pending
  expect(frame.suggestedFilename()).toMatch(/^keyed-0-0\d\.\d\d\.png$/)
  const png = await bytesOf(frame)
  const view = new DataView(png.buffer, png.byteOffset)
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([640, 360])
})

test("has the trimmer one press away in the converter", async ({ page }) => {
  await page.goto(CONVERTER)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(panel(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Trim", exact: true }).click()
  await expect(panel(page)).toBeVisible()
  await expect(page.getByTestId("trim-summary")).toHaveText(
    "The whole video: 0:06.00."
  )
})

test("splits a video into files at marks, each the source's own frames, with pictures along the timeline", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const original = source()
  await page.goto(TRIMMER)
  await page.locator("#video-file").setInputFiles([original])
  await settled(page)
  // Pictures of frames along the timeline, read from the file.
  await expect(page.getByTestId("trim-timeline").locator("img")).toHaveCount(10)
  await panel(page).getByRole("button", { name: "Start here (I)" }).focus()
  const keys = page.keyboard
  await keys.press("Shift+ArrowRight")
  await keys.press("Shift+ArrowRight")
  await keys.press("s")
  await keys.press("Shift+ArrowRight")
  await keys.press("Shift+ArrowRight")
  await keys.press("s")
  await expect(page.getByTestId("split-said")).toHaveText(
    "2 splits: 3 files, each written and checked on its own, with what is kept here."
  )
  await panel(page).getByRole("button", { name: "Make 3 files" }).click()
  await expect(page.getByTestId("queue-item")).toHaveCount(3)
  await settled(page)
  const all = frameHashes(original.buffer, "split-source.mp4")
  for (const [index, [start, end]] of [
    [0, 2],
    [2, 4],
    [4, 6],
  ].entries()) {
    const part = await download(page, `keyed-part-${index + 1}.mp4`)
    expect(part.name).toBe(`keyed-part-${index + 1}.mp4`)
    // Split at keyframes: exactly the source's frames between the marks.
    expect(frameHashes(part.bytes, `split-${index}.mp4`)).toEqual(
      all.slice(start * 30, end * 30)
    )
  }
  // The splitting is said in the list too: a ZIP of the three.
  await expect(page.getByRole("button", { name: /ZIP/ })).toBeVisible()
})

test("splits every so many seconds", async ({ page }) => {
  await page.goto(TRIMMER)
  await page.locator("#video-file").setInputFiles([source()])
  await settled(page)
  await panel(page).getByLabel("Every (seconds or m:ss)").fill("2.5")
  await panel(page).getByRole("button", { name: "Split every" }).click()
  await expect(page.getByTestId("split-said")).toHaveText(
    "2 splits: 3 files, each written and checked on its own, with what is kept here."
  )
  await panel(page).getByRole("button", { name: "Clear the splits" }).click()
  await expect(
    panel(page).getByRole("button", { name: "Make files" })
  ).toBeDisabled()
})
