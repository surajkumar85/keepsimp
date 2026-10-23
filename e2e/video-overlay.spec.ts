import { test, expect } from "@playwright/test"
import {
  download,
  EDITOR,
  frameAt,
  plainClip,
  plainPicture,
  reportWorkerErrors,
  settled,
} from "./video"

reportWorkerErrors()

const isNear = (pixel: number[], colour: number[], within = 60) =>
  pixel.every((value, index) => Math.abs(value - colour[index]) <= within)

test("draws a logo in its corner on every frame, and text only while it shows", async ({
  page,
}) => {
  test.setTimeout(150_000)
  const blue = plainClip("blue.mp4", "blue", 4)
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([blue])
  await settled(page)
  await page.getByLabel("Text at the bottom").fill("KEEPSIMP KEEPSIMP")
  await page.getByLabel("Show from (s)").fill("2")
  await page
    .getByLabel("Choose a logo")
    .setInputFiles([plainPicture("red.png", "red", "100x100")])
  await expect(page.getByTestId("logo")).toContainText("100 × 100")
  await page
    .getByRole("radiogroup", { name: "Logo place" })
    .getByRole("radio", { name: "Top left" })
    .click()
  await page
    .getByRole("radiogroup", { name: "Logo width" })
    .getByRole("radio", { name: "20%" })
    .click()
  await expect(page.getByTestId("video-plan")).toContainText(
    "because text is written on it and a logo is drawn on it"
  )
  await settled(page, 120_000)
  const result = await download(page, "blue.mp4")
  // The logo: 128 px wide, a margin of 14 px from the top left (4% of the shorter side).
  for (const seconds of [0.5, 3]) {
    const frame = frameAt(result.bytes, `overlay-${seconds}.mp4`, seconds)
    expect(isNear(frame.at(78, 78), [255, 0, 0])).toBe(true)
    expect(isNear(frame.at(6, 6), [0, 0, 255])).toBe(true)
    expect(isNear(frame.at(200, 78), [0, 0, 255])).toBe(true)
  }
  // The text, white along the bottom, only from 2 s.
  const whiteIn = (seconds: number) => {
    const frame = frameAt(result.bytes, `text-${seconds}.mp4`, seconds)
    let white = 0
    for (let y = 270; y < 360; y++)
      for (let x = 0; x < 640; x += 2)
        if (isNear(frame.at(x, y), [255, 255, 255], 50)) white++
    return white
  }
  expect(whiteIn(1)).toBe(0)
  expect(whiteIn(3)).toBeGreaterThan(300)
})
