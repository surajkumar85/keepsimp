import { test, expect } from "@playwright/test"
import { bytesOf } from "./pdf"
import { probe, reportWorkerErrors, settled } from "./video"

reportWorkerErrors()

test("makes a GIF and a WebP of the sample on the Video to GIF page", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto("/dashboard/video-to-gif/")
  await expect(page.getByTestId("video-focused")).toContainText(
    "opened for making GIFs."
  )
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  const panel = page.getByTestId("gif-panel")
  await panel.getByRole("button", { name: "Make a GIF" }).click()
  const result = panel.getByTestId("gif-result")
  await expect(result).toContainText(
    "GIF · 480 × 270 · 15 frames a second · 0:06.00",
    { timeout: 120_000 }
  )
  const pending = page.waitForEvent("download")
  await result.getByRole("link", { name: /^Download / }).click()
  const gif = await pending
  expect(gif.suggestedFilename()).toBe("keepsimp-scene.gif")
  const said = probe(await bytesOf(gif), "scene.gif")
  expect(said.streams[0]).toMatchObject({
    codec_name: "gif",
    width: 480,
    height: 270,
  })
  expect(Number(said.streams[0].nb_read_frames)).toBeGreaterThanOrEqual(85)

  // Another kind outdates the one made.
  await panel
    .getByRole("radiogroup", { name: "Kind" })
    .getByRole("radio", { name: "WebP" })
    .click()
  await expect(result).toHaveCount(0)
  await panel.getByRole("button", { name: "Make a WebP" }).click()
  await expect(panel.getByTestId("gif-result")).toContainText(
    "WebP · 480 × 270",
    { timeout: 120_000 }
  )
  const webpPending = page.waitForEvent("download")
  await panel
    .getByTestId("gif-result")
    .getByRole("link", { name: /^Download / })
    .click()
  const webp = await bytesOf(await webpPending)
  expect(Buffer.from(webp.subarray(8, 12)).toString()).toBe("WEBP")
})
