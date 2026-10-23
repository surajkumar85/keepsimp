import { test, expect } from "@playwright/test"
import {
  clip,
  decodesCleanly,
  EDITOR,
  frameHashes,
  probe,
  reportWorkerErrors,
  settled,
  streamSeconds,
} from "./video"
import { bytesOf } from "./pdf"

reportWorkerErrors()

async function joinedFile(page: import("@playwright/test").Page) {
  const panel = page.getByTestId("join-panel")
  await panel.getByRole("button", { name: /^Join \d videos$/ }).click()
  const result = panel.getByTestId("join-result")
  await expect(result).toBeVisible({ timeout: 120_000 })
  const pending = page.waitForEvent("download")
  await result.getByRole("link", { name: /^Download / }).click()
  const download = await pending
  return {
    name: download.suggestedFilename(),
    bytes: await bytesOf(download),
    said: (await result.textContent()) ?? "",
  }
}

test("joins videos written alike by copying their pictures, the sound as long as each", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const first = clip("first.mp4", { size: "320x180", seconds: 2 })
  const second = clip("second.mp4", { size: "320x180", seconds: 3 })
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([first, second])
  await settled(page)
  await expect(page.getByTestId("join-plan")).toContainText(
    "2 videos joined in order, 0:05.00 in all, as MP4."
  )
  const joined = await joinedFile(page)
  expect(joined.name).toBe("first-joined.mp4")
  expect(joined.said).toContain("the pictures copied as they are")
  // Every frame of each, in order.
  expect(frameHashes(joined.bytes, "joined.mp4")).toEqual([
    ...frameHashes(first.buffer, "first-in.mp4"),
    ...frameHashes(second.buffer, "second-in.mp4"),
  ])
  expect(
    Math.abs(streamSeconds(joined.bytes, "joined.mp4", "a") - 5)
  ).toBeLessThan(0.1)
  expect(decodesCleanly(joined.bytes, "joined.mp4")).toBe(true)
})

test("joins videos of different sizes by encoding them at the first's size, in the order chosen", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const wide = clip("wide.mp4", { size: "640x360", seconds: 2 })
  const tall = clip("tall.mp4", { size: "360x640", seconds: 2 })
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([wide, tall])
  await settled(page)
  // The tall one first.
  await page.getByRole("button", { name: "Move tall.mp4 earlier" }).click()
  await expect(page.getByTestId("join-plan")).toContainText(
    "encoded again at 360 × 640, the first video's size"
  )
  const joined = await joinedFile(page)
  expect(joined.said).toContain("the pictures encoded again")
  const said = probe(joined.bytes, "mixed.mp4")
  expect(said.streams.find((one) => one.codec_type === "video")).toMatchObject({
    width: 360,
    height: 640,
  })
  expect(Number(said.format.duration)).toBeCloseTo(4, 0)
  expect(decodesCleanly(joined.bytes, "mixed.mp4")).toBe(true)
})
