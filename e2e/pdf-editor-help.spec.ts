import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { SHORTCUTS } from "../lib/pdf-editor/shortcuts"
import { pdf, readerReady } from "./pdf"

test("? shows every key the editor answers to, readable in both themes and on a phone", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/pdf-editor/")
  await page
    .locator("#editor-file")
    .setInputFiles(await pdf("keys.pdf", "K", { pages: 2 }))
  await readerReady(page)
  const sheet = page.getByTestId("editor-shortcuts")
  await page.keyboard.press("Shift+?")
  await expect(sheet).toBeVisible()
  await expect(
    sheet.getByRole("heading", { name: "Keyboard shortcuts" })
  ).toBeVisible()
  for (const group of SHORTCUTS)
    await expect(
      sheet.getByRole("region", { name: group.title, exact: true })
    ).toBeVisible()
  await expect(sheet.getByText("Change the words that are there")).toBeVisible()
  const axe = async () =>
    (
      await new AxeBuilder({ page })
        .include("[data-testid=editor-shortcuts]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  expect(await axe()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await axe()).toEqual([])
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  // The editor is still open, and its keys still work.
  await expect(page.getByTestId("pdf-editor")).toBeVisible()
  if (isMobile) {
    // No keyboard to speak of: the button is left out.
    await expect(page.getByTestId("editor-keys")).toBeHidden()
    return
  }
  await page.getByTestId("editor-keys").click()
  await expect(sheet).toBeVisible()
  await page.setViewportSize({ width: 768, height: 600 })
  const box = (await sheet.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(768)
})

for (const [route, film, last] of [
  [
    "/dashboard/pdf-editor/",
    "pdf-editor-tutorial",
    "Step 6 of 6: Checked, then downloaded",
  ],
  [
    "/dashboard/ocr-pdf/",
    "ocr-pdf-tutorial",
    "Step 5 of 5: Checked, then downloaded",
  ],
  [
    "/dashboard/verify-pdf-signature/",
    "verify-pdf-signature-tutorial",
    "Step 4 of 4: What changed after",
  ],
  [
    "/dashboard/redact-pdf/",
    "redact-pdf-tutorial",
    "Step 4 of 4: Checked before you send it",
  ],
] as const)
  test(`${route} has its tutorial video, with captions and a poster`, async ({
    page,
    request,
  }) => {
    await page.goto(route)
    const help = page.getByRole("region", {
      name: "A little help along the way",
    })
    const video = help.locator("video")
    await expect(video).toHaveAttribute("poster", `/videos/${film}-poster.webp`)
    await expect(video).toHaveAttribute("preload", "none")
    for (const [path, type] of [
      [`/videos/${film}.mp4`, "video/mp4"],
      [`/videos/${film}-poster.webp`, "image/webp"],
      [`/videos/${film}.vtt`, "text/vtt"],
    ]) {
      const response = await request.get(path)
      expect(response.ok()).toBe(true)
      expect(response.headers()["content-type"]).toContain(type)
    }
    const captions = await (await request.get(`/videos/${film}.vtt`)).text()
    expect(captions.startsWith("WEBVTT")).toBe(true)
    expect(captions).toContain(last)
  })
