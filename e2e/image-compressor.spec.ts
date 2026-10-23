import { readFile } from "node:fs/promises"
import { test, expect, type Download, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import sharp from "sharp"
import { openGroups } from "./settings"

const ROUTE = "/dashboard/image-compressor/"

async function bytesOf(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function upload(page: Page, name: string, buffer: Buffer, mimeType = "") {
  // The same input is labelled "Replace image" once an image is open.
  await page
    .locator("#compressor-file")
    .setInputFiles({ name, mimeType, buffer })
}

/** Wait until the shown result was produced from the current settings. */
async function settled(page: Page) {
  await expect(page.getByTestId("image-compressor")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 120_000 }
  )
}

async function download(page: Page) {
  await settled(page)
  const pending = page.waitForEvent("download")
  await page
    .getByRole("link", { name: /^Download (JPEG|PNG|WebP|AVIF)/ })
    .click()
  const file = await pending
  const buffer = await bytesOf(file)
  return {
    buffer,
    name: file.suggestedFilename(),
    meta: await sharp(buffer).metadata(),
  }
}

function chip(page: Page, group: string, name: string) {
  return page
    .getByRole("radiogroup", { name: group, exact: true })
    .getByRole("radio", { name, exact: true })
}

const photo = (width: number, height: number, quality = 95) =>
  sharp("public/images/coastline.jpg")
    .resize(width, height, { fit: "fill" })
    .jpeg({ quality })
    .toBuffer()

/** 64×48, transparent left half and opaque teal right half. */
const transparentPng = () => {
  const data = Buffer.alloc(64 * 48 * 4)
  for (let i = 0; i < 64 * 48; i++)
    if (i % 64 >= 32) data.set([0, 120, 111, 255], i * 4)
  return sharp(data, { raw: { width: 64, height: 48, channels: 4 } })
    .png()
    .toBuffer()
}

test.describe.configure({ timeout: 180_000 })

test("compresses a photo with smart defaults and compares before downloading", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "Drop an image to compress" })
  ).toBeVisible()
  const source = await photo(1600, 1200)
  await upload(page, "holiday.jpg", source, "image/jpeg")
  await expect(page.getByTestId("file-bar")).toContainText("holiday.jpg")
  await expect(page.getByTestId("file-bar")).toContainText("1600 × 1200 px")
  const { buffer, name, meta } = await download(page)
  await expect(
    page.getByTestId("toast").filter({ hasText: "Download started" })
  ).toBeVisible()
  expect(name).toBe("holiday-keepsimp.jpg")
  expect(meta).toMatchObject({ format: "jpeg", width: 1600, height: 1200 })
  expect(buffer.byteLength).toBeLessThan(source.byteLength)
  await expect(
    page.getByTestId("image-compressor").getByText("Detail kept")
  ).toBeVisible()
  await expect(page.getByRole("img", { name: "Original image" })).toBeVisible()
  await expect(
    page.getByRole("img", { name: "Compressed result" })
  ).toBeVisible()

  const slider = page.getByRole("slider", { name: "Comparison position" })
  const result = page.getByRole("img", { name: "Compressed result" })
  await slider.focus()
  await page.keyboard.press("ArrowLeft")
  await expect(slider).toHaveValue("49")
  await page.keyboard.press("Home")
  await expect(slider).toHaveValue("0")
  await expect(result).toHaveAttribute(
    "style",
    /inset\(0(px)? 0(px)? 0(px)? 0%\)/
  )
  await page.keyboard.press("End")
  await expect(result).toHaveAttribute("style", /100%/)

  const frame = page.getByTestId("compare-frame")
  await frame.scrollIntoViewIfNeeded()
  const box = (await frame.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2)
  expect(Number(await slider.inputValue())).toBeLessThan(35)
})

test("every output format writes real bytes and handles transparency", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, "badge.png", await transparentPng(), "image/png")
  for (const [label, format] of [
    ["WebP", "webp"],
    ["AVIF", "heif"],
    ["PNG", "png"],
    ["JPEG", "jpeg"],
  ] as const) {
    await chip(page, "Output format", label).click()
    const { buffer, meta, name } = await download(page)
    expect(meta.format).toBe(format)
    expect([meta.width, meta.height]).toEqual([64, 48])
    expect(name).toMatch(/^badge-keepsimp\.(webp|avif|png|jpg)$/)
    const { data } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (format === "jpeg")
      expect([...data.subarray(0, 3)].every((value) => value > 245)).toBe(true)
    else expect(data[3]).toBe(0)
  }
  await chip(page, "Output format", "Auto (smallest)").click()
  const auto = await download(page)
  expect(["png", "webp", "heif"]).toContain(auto.meta.format)

  await chip(page, "Output format", "PNG").click()
  await chip(page, "Compression level", "Lossless").click()
  const lossless = await download(page)
  const original = await sharp(await transparentPng())
    .raw()
    .toBuffer()
  expect((await sharp(lossless.buffer).raw().toBuffer()).equals(original)).toBe(
    true
  )
  await chip(page, "Output format", "JPEG").click()
  await expect(chip(page, "Compression level", "Lossless")).toHaveAttribute(
    "aria-disabled",
    "true"
  )
  await expect(chip(page, "Compression level", "Smart")).toBeChecked()
})

test("resizes, crops and rotates to exact pixel sizes", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, "scene.jpg", await photo(800, 600, 90), "image/jpeg")
  // Size and crop wait under their summaries until opened.
  await expect(page.getByTestId("file-bar")).toContainText("800 × 600 px")
  await openGroups(page)
  const sizeOf = async () => {
    const { meta } = await download(page)
    return [meta.width, meta.height]
  }
  await chip(page, "Output size", "50%").click()
  expect(await sizeOf()).toEqual([400, 300])
  await chip(page, "Output size", "Long edge").click()
  await chip(page, "Long edge in pixels", "640").click()
  expect(await sizeOf()).toEqual([640, 480])

  await chip(page, "Output size", "Custom").click()
  await page.getByLabel("Width (px)").fill("200")
  await expect(page.getByLabel("Height (px)")).toHaveValue("150")
  expect(await sizeOf()).toEqual([200, 150])
  await page.getByRole("switch", { name: "Keep proportions" }).click()
  await page.getByLabel("Height (px)").fill("200")
  await chip(page, "Fit", "Fill and crop").click()
  expect(await sizeOf()).toEqual([200, 200])
  await chip(page, "Fit", "Stretch").click()
  await page.getByLabel("Width (px)").fill("123")
  expect(await sizeOf()).toEqual([123, 200])
  await chip(page, "Units", "Percent").click()
  await page.getByLabel("Width (%)").fill("10")
  await page.getByLabel("Height (%)").fill("10")
  expect(await sizeOf()).toEqual([80, 60])
  await page.getByLabel("Width (%)").fill("0")
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "greater than zero"
  )

  await chip(page, "Output size", "Original").click()
  await chip(page, "Crop shape", "1:1").click()
  expect(await sizeOf()).toEqual([600, 600])
  await page.getByRole("button", { name: "Crop on image" }).click()
  await page.getByLabel("Width (px)").fill("300")
  await page.getByLabel("Width (px)").press("Enter")
  await expect(page.getByLabel("Height (px)")).toHaveValue("300")
  await page.getByTestId("crop-box").focus()
  await page.keyboard.press("Shift+ArrowRight")
  await expect(page.getByLabel("Left (px)")).toHaveValue("110")
  await page.getByRole("button", { name: "Done cropping" }).click()
  expect(await sizeOf()).toEqual([300, 300])

  await page.getByRole("button", { name: "Clear crop" }).click()
  await page.getByRole("button", { name: "Rotate right" }).click()
  expect(await sizeOf()).toEqual([600, 800])
  await page.getByRole("button", { name: "Flip horizontally" }).click()
  await expect(
    page.getByRole("button", { name: "Flip horizontally" })
  ).toHaveAttribute("aria-pressed", "true")
  expect(await sizeOf()).toEqual([600, 800])

  // One press puts every group back to how the image started.
  await page.getByRole("button", { name: "Reset all" }).click()
  await expect(chip(page, "Output size", "Original")).toBeChecked()
  expect(await sizeOf()).toEqual([800, 600])
  await expect(page.getByRole("button", { name: "Reset all" })).toHaveCount(0)
})

test("reaches a file-size target", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, "large.jpg", await photo(1600, 1200), "image/jpeg")
  await chip(page, "Compression level", "Target size").click()
  await page.getByLabel("Maximum file size").fill("60")
  const { buffer, meta } = await download(page)
  expect(buffer.byteLength).toBeLessThanOrEqual(60 * 1024)
  expect(meta.format).toBe("jpeg")
})

test("reads AVIF, GIF, TIFF, SVG and HEIC inputs", async ({ page }) => {
  await page.goto(ROUTE)
  const base = sharp("public/images/coastline.jpg").resize(240, 160)
  const inputs: [string, Buffer, string][] = [
    ["photo.avif", await base.clone().avif().toBuffer(), "AVIF"],
    ["photo.gif", await base.clone().gif().toBuffer(), "GIF"],
    ["photo.tiff", await base.clone().tiff().toBuffer(), "TIFF"],
    [
      "icon.svg",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="teal"/></svg>'
      ),
      "SVG",
    ],
    ["coast.heic", await readFile("e2e/fixtures/coastline-small.heic"), "HEIC"],
  ]
  for (const [name, buffer, label] of inputs) {
    await upload(page, name, buffer)
    await expect(page.getByTestId("file-bar")).toContainText(label, {
      timeout: 60_000,
    })
    const { meta } = await download(page)
    expect(meta.format).toMatch(/jpeg|png|webp|heif/)
    if (label === "SVG") {
      expect([meta.width, meta.height]).toEqual([1024, 512])
      await expect(page.getByText("SVG is vector art")).toBeVisible()
    }
  }
})

test("unsupported and damaged files explain what went wrong", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, "notes.txt", Buffer.from("hello"), "text/plain")
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose a JPEG, PNG, WebP"
  )
  const damaged = Buffer.concat([
    (await photo(64, 64)).subarray(0, 40),
    Buffer.alloc(200),
  ])
  await upload(page, "broken.jpg", damaged, "image/jpeg")
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "could not read"
  )
  await upload(page, "empty.png", Buffer.alloc(0), "image/png")
  await expect(page.getByRole("main").getByRole("alert")).toContainText("empty")
  await expect(page.getByRole("link", { name: /^Download/ })).toHaveCount(0)
})

test("accepts dropped files, cancels long jobs and resumes", async ({
  page,
}) => {
  await page.goto(ROUTE)
  const buffer = await photo(1600, 1200)
  const transfer = await page.evaluateHandle(
    (data) => {
      const dt = new DataTransfer()
      dt.items.add(
        new File([new Uint8Array(data)], "dropped.jpg", { type: "image/jpeg" })
      )
      return dt
    },
    [...buffer]
  )
  await page.getByTestId("drop-zone").dispatchEvent("drop", {
    dataTransfer: transfer,
  })
  await expect(page.getByTestId("file-bar")).toContainText("dropped.jpg")
  await settled(page)
  await chip(page, "Output format", "AVIF").click()
  // The press is answered at once, before the new file is made.
  await expect(page.locator("[data-slot=settings-state]")).toHaveAttribute(
    "data-state",
    "pending"
  )
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByText("Compression cancelled")).toBeVisible()
  await chip(page, "Output format", "WebP").click()
  const { meta } = await download(page)
  expect(meta.format).toBe("webp")
})

test("chips, results and errors stay accessible, local and responsive", async ({
  page,
}) => {
  const external: string[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      ["http:", "https:"].includes(url.protocol) &&
      (url.origin !== "http://127.0.0.1:4173" ||
        !["GET", "HEAD"].includes(request.method()))
    )
      external.push(request.url())
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)

  const format = page.getByRole("radiogroup", { name: "Output format" })
  await format.getByRole("radio", { checked: true }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(chip(page, "Output format", "Auto (smallest)")).toBeChecked()
  const radius = await chip(page, "Output format", "WebP").evaluate((element) =>
    parseFloat(getComputedStyle(element).borderTopLeftRadius)
  )
  expect(radius).toBeGreaterThanOrEqual(9999)
  await chip(page, "Output format", "JPEG").click()
  await settled(page)

  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(results.violations).toEqual([])
  }

  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await expect(page.getByRole("link", { name: /^Download JPEG/ })).toBeVisible()
  await page.getByRole("button", { name: "Remove image" }).click()
  await expect(page.getByTestId("drop-zone")).toBeVisible()
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test("the tutorial video, captions and written guide are available", async ({
  page,
  request,
  browserName,
}) => {
  await page.goto(ROUTE)
  const section = page.getByRole("region", {
    name: "A little help along the way",
  })
  const video = section.locator("video")
  await expect(video).toHaveAttribute(
    "poster",
    "/videos/image-compressor-tutorial-poster.webp"
  )
  await expect(video).toHaveAttribute("preload", "none")
  for (const [path, type] of [
    ["/videos/image-compressor-tutorial.mp4", "video/mp4"],
    ["/videos/image-compressor-tutorial-poster.webp", "image/webp"],
    ["/videos/image-compressor-tutorial.vtt", "text/vtt"],
  ]) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    expect(response.headers()["content-type"]).toContain(type)
  }
  const captions = await (
    await request.get("/videos/image-compressor-tutorial.vtt")
  ).text()
  expect(captions.startsWith("WEBVTT")).toBe(true)
  expect(captions).toContain("Step 6 of 6: Download your image")

  // Playwright's Firefox build has no H.264 decoder; real Firefox uses the system one.
  if (browserName !== "firefox") {
    const metadata = await video.evaluate(
      (element: HTMLVideoElement) =>
        new Promise<{ duration: number; width: number }>((resolve, reject) => {
          element.addEventListener("loadedmetadata", () =>
            resolve({ duration: element.duration, width: element.videoWidth })
          )
          element.addEventListener("error", () => reject(new Error("decode")))
          element.preload = "metadata"
          element.load()
        })
    )
    expect(metadata.width).toBe(1920)
    expect(metadata.duration).toBeGreaterThan(90)
  }

  await expect(section.locator("#tutorial-steps > li")).toHaveCount(6)
  const details = section.locator("details")
  await details.locator("summary").focus()
  await page.keyboard.press("Enter")
  await expect(details).toHaveAttribute("open", "")
  await expect(section.getByText("Target size", { exact: true })).toBeVisible()
})
