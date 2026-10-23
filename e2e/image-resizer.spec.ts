import { test, expect, type Download, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { unzipSync } from "fflate"
import sharp from "sharp"
import { openGroup, openGroups } from "./settings"

const ROUTE = "/dashboard/image-resizer/"

async function bytesOf(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

type Upload = { name: string; mimeType: string; buffer: Buffer }

async function upload(page: Page, ...files: Upload[]) {
  await page.locator("#resizer-file").setInputFiles(files)
  // Groups past the first choices wait under their summaries until opened.
  await expect(
    page.locator("[data-slot=settings-section]").first()
  ).toBeVisible()
  await openGroups(page)
}

/** Wait until every image has a result for the current settings. */
async function settled(page: Page) {
  await expect(page.getByTestId("image-resizer")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 120_000 }
  )
}

/** Download the only output and decode it. */
async function result(page: Page) {
  await settled(page)
  const pending = page.waitForEvent("download")
  await page.getByRole("link", { name: "Download image", exact: true }).click()
  const file = await pending
  const buffer = await bytesOf(file)
  const image = sharp(buffer)
  const meta = await image.metadata()
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    name: file.suggestedFilename(),
    buffer,
    meta,
    size: [meta.width, meta.height],
    at: (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
    ],
  }
}

async function zip(page: Page) {
  await settled(page)
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (ZIP)" }).click()
  const file = await pending
  expect(file.suggestedFilename()).toBe("keepsimp-resized.zip")
  return unzipSync(new Uint8Array(await bytesOf(file)))
}

function chip(page: Page, group: string, name: string) {
  return page
    .getByRole("radiogroup", { name: group, exact: true })
    .getByRole("radio", { name, exact: true })
}

const RED = [220, 30, 30]
const GREEN = [30, 180, 30]
const BLUE = [30, 30, 220]
const YELLOW = [230, 210, 30]

function near(actual: number[], expected: number[], tolerance = 24) {
  expect(
    expected.every(
      (value, index) => Math.abs(actual[index] - value) <= tolerance
    ),
    `expected ${actual} to be near ${expected}`
  ).toBe(true)
}

/** 400×300 PNG with one colour per quadrant: red, green / blue, yellow. */
async function quadrants(name = "quadrants.png"): Promise<Upload> {
  const data = Buffer.alloc(400 * 300 * 4)
  for (let y = 0; y < 300; y++)
    for (let x = 0; x < 400; x++)
      data.set(
        [...(y < 150 ? (x < 200 ? RED : GREEN) : x < 200 ? BLUE : YELLOW), 255],
        (y * 400 + x) * 4
      )
  return {
    name,
    mimeType: "image/png",
    buffer: await sharp(data, { raw: { width: 400, height: 300, channels: 4 } })
      .png()
      .toBuffer(),
  }
}

/** 600×200 flat grey with a busy checker patch on the right. */
async function detailed(): Promise<Upload> {
  const data = Buffer.alloc(600 * 200 * 4)
  for (let y = 0; y < 200; y++)
    for (let x = 0; x < 600; x++) {
      const value =
        x >= 440
          ? (Math.floor(x / 4) + Math.floor(y / 4)) % 2
            ? 20
            : 235
          : 128
      data.set([value, value, value, 255], (y * 600 + x) * 4)
    }
  return {
    name: "detail.png",
    mimeType: "image/png",
    buffer: await sharp(data, { raw: { width: 600, height: 200, channels: 4 } })
      .png()
      .toBuffer(),
  }
}

const photo = async (name = "photo.jpg"): Promise<Upload> => ({
  name,
  mimeType: "image/jpeg",
  buffer: await sharp("public/images/coastline.jpg")
    .resize(600, 400)
    .jpeg({ quality: 90 })
    .toBuffer(),
})

async function exactBox(page: Page, width: string, height: string) {
  await chip(page, "Resize by", "Dimensions").click()
  const lock = page.getByRole("switch", { name: "Keep proportions" })
  if ((await lock.getAttribute("aria-checked")) === "true") await lock.click()
  await page.getByLabel("Width (px)").fill(width)
  await page.getByLabel("Height (px)").fill(height)
  // Fit appears once both sides are set.
  await openGroup(page, "Fit")
}

test.describe.configure({ timeout: 180_000 })

test("resizes by every size mode to exact pixels", async ({ page }) => {
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "Drop images to resize" })
  ).toBeVisible()
  await upload(page, await quadrants())
  await expect(page.getByTestId("queue-item")).toHaveCount(1)
  expect((await result(page)).size).toEqual([1200, 900])

  await page.getByLabel("Width (px)").fill("200")
  // The change is answered at once, before the images are made again.
  await expect(page.locator("[data-slot=settings-state]")).toHaveAttribute(
    "data-state",
    "pending"
  )
  await expect(page.getByLabel("Height (px)")).toHaveValue("150")
  const linked = await result(page)
  expect(linked.size).toEqual([200, 150])
  expect(linked.name).toBe("quadrants-200x150.png")
  near(linked.at(20, 20), RED)
  near(linked.at(180, 130), YELLOW)

  await chip(page, "Resize by", "Height").click()
  await page.getByLabel("Height (px)").fill("60")
  expect((await result(page)).size).toEqual([80, 60])
  await chip(page, "Resize by", "Width").click()
  await page.getByLabel("Width (px)").fill("120")
  expect((await result(page)).size).toEqual([120, 90])
  await chip(page, "Resize by", "Longest side").click()
  await page.getByLabel("Longest side (px)").fill("100")
  expect((await result(page)).size).toEqual([100, 75])
  await chip(page, "Resize by", "Shortest side").click()
  await page.getByLabel("Shortest side (px)").fill("30")
  expect((await result(page)).size).toEqual([40, 30])
  await chip(page, "Resize by", "Percent").click()
  await chip(page, "Common values", "25%").click()
  expect((await result(page)).size).toEqual([100, 75])
  await chip(page, "Resize by", "Megapixels").click()
  await page.getByLabel("Megapixels").fill("0.03")
  expect((await result(page)).size).toEqual([200, 150])
  await page.getByLabel("Megapixels").fill("0")
  await expect(page.getByTestId("size-summary")).toContainText("above zero")
  await expect(page.getByTestId("size-summary")).toHaveAttribute(
    "role",
    "alert"
  )
})

test("fits a frame by cropping, padding, fitting inside and stretching", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await quadrants())
  await exactBox(page, "100", "100")

  // Crop to fill, centred: the square shows 300 of the 400 source columns.
  const centre = await result(page)
  expect(centre.size).toEqual([100, 100])
  near(centre.at(5, 10), RED)
  near(centre.at(60, 10), GREEN)
  near(centre.at(95, 90), YELLOW)

  await page
    .getByRole("radiogroup", { name: "Keep this part" })
    .getByRole("radio", { name: "Top left", exact: true })
    .click()
  near((await result(page)).at(60, 10), RED)
  await page
    .getByRole("radiogroup", { name: "Keep this part" })
    .getByRole("radio", { name: "Top right", exact: true })
    .click()
  near((await result(page)).at(35, 10), GREEN)

  // Drag the picture right: more of its left side comes into the frame.
  const frame = page.getByTestId("output-frame")
  await frame.scrollIntoViewIfNeeded()
  const box = (await frame.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 1.5, box.y + box.height / 2, {
    steps: 6,
  })
  await page.mouse.up()
  near((await result(page)).at(60, 10), RED)
  await page
    .getByRole("button", { name: "Reset this image's position" })
    .click()
  near((await result(page)).at(35, 10), GREEN)

  // The shared position is still "Top right", so the picture sits at the top
  // of the frame and the padding fills the bottom quarter.
  await chip(page, "How the image fills the frame", "Fit with padding").click()
  const white = await result(page)
  expect(white.size).toEqual([100, 100])
  expect(white.at(50, 97)).toEqual([255, 255, 255, 255])
  near(white.at(10, 30), RED)
  await page
    .getByRole("radiogroup", { name: "Place the image" })
    .getByRole("radio", { name: "Bottom", exact: true })
    .click()
  const lowered = await result(page)
  expect(lowered.at(50, 2)).toEqual([255, 255, 255, 255])
  near(lowered.at(10, 97), BLUE)
  await chip(page, "Padding", "Black").click()
  expect((await result(page)).at(50, 2)).toEqual([0, 0, 0, 255])
  await chip(page, "Padding", "Transparent").click()
  expect((await result(page)).at(50, 2)[3]).toBe(0)
  await chip(page, "Padding", "Custom").click()
  await page.getByLabel("Padding colour").fill("#00ff00")
  near((await result(page)).at(50, 2), [0, 255, 0])
  await chip(page, "Padding", "Blurred image").click()
  const blurred = await result(page)
  expect(blurred.at(50, 2)[3]).toBe(255)
  expect(blurred.at(50, 2).slice(0, 3)).not.toEqual([255, 255, 255])
  near(blurred.at(10, 97), BLUE)

  await chip(page, "How the image fills the frame", "Fit inside").click()
  expect((await result(page)).size).toEqual([100, 75])
  await chip(page, "How the image fills the frame", "Cover at least").click()
  expect((await result(page)).size).toEqual([133, 100])
  await chip(page, "How the image fills the frame", "Stretch").click()
  const stretched = await result(page)
  expect(stretched.size).toEqual([100, 100])
  near(stretched.at(10, 10), RED)
  near(stretched.at(90, 90), YELLOW)
})

test("smart focus keeps the detailed part of the picture", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await detailed())
  await exactBox(page, "200", "200")
  const contrast = async () => {
    const { buffer } = await result(page)
    return (await sharp(buffer).stats()).channels[0].stdev
  }
  expect(await contrast()).toBeLessThan(5)
  await chip(page, "Focus", "Smart focus").click()
  expect(await contrast()).toBeGreaterThan(40)
})

test("print sizes use the chosen resolution and can refuse to enlarge", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await quadrants())
  await exactBox(page, "100", "100")
  await chip(page, "Units", "Inches").click()
  await page.getByLabel("Width (in)").fill("1")
  await page.getByLabel("Height (in)").fill("0.5")
  await chip(page, "Print resolution (DPI)", "300").click()
  const print = await result(page)
  expect(print.size).toEqual([300, 150])
  expect(print.meta.density).toBe(300)
  await expect(page.getByTestId("size-summary")).toContainText("2.54 × 1.27 cm")
  await chip(page, "Print resolution (DPI)", "150").click()
  const lower = await result(page)
  expect(lower.size).toEqual([150, 75])
  expect(lower.meta.density).toBe(150)

  await chip(page, "Units", "Pixels").click()
  await chip(page, "Resize by", "Width").click()
  await page.getByLabel("Width (px)").fill("2000")
  expect((await result(page)).size).toEqual([2000, 1500])
  await expect(
    page.getByTestId("image-resizer").getByText("Enlarging adds pixels")
  ).toBeVisible()
  await page.getByRole("switch", { name: "Allow enlarging" }).click()
  expect((await result(page)).size).toEqual([400, 300])
})

test("resizes a batch, reports a bad file and downloads a named ZIP", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await quadrants(), await photo(), {
    name: "broken.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.concat([
      (await photo()).buffer.subarray(0, 40),
      Buffer.alloc(200),
    ]),
  })
  const rows = page.getByTestId("queue-item")
  await expect(rows).toHaveCount(3)
  await chip(page, "Resize by", "Longest side").click()
  await page.getByLabel("Longest side (px)").fill("200")
  await settled(page)
  await expect(rows.nth(2)).toHaveAttribute("data-state", "error")
  await expect(rows.nth(2)).toContainText("could not read")
  await expect(page.getByTestId("summary-bar")).toContainText("2 of 3 ready")

  await page.getByLabel("File names").fill("{index}-{name}-{width}w")
  await expect(page.getByText("Example: 01-quadrants-200w.png")).toBeVisible()
  const files = await zip(page)
  expect(Object.keys(files)).toEqual([
    "01-quadrants-200w.png",
    "02-photo-200w.jpg",
  ])
  expect(await sharp(files["01-quadrants-200w.png"]).metadata()).toMatchObject({
    format: "png",
    width: 200,
    height: 150,
  })
  expect(await sharp(files["02-photo-200w.jpg"]).metadata()).toMatchObject({
    format: "jpeg",
    width: 200,
    height: 133,
  })

  // Selecting another image previews it; removing and clearing work.
  await page.getByRole("button", { name: "Preview photo.jpg" }).click()
  await expect(page.getByTestId("output-size")).toContainText("200 × 133")
  await page.getByRole("button", { name: "Remove broken.jpg" }).click()
  await expect(rows).toHaveCount(2)
  await page.getByRole("button", { name: "Clear all" }).click()
  await expect(page.getByTestId("drop-zone")).toBeVisible()
})

test("exports a responsive set with ready-to-paste HTML", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await quadrants("hero image.png"))
  await page.getByRole("switch", { name: "Export a responsive set" }).click()
  const widths = page.getByRole("group", { name: "Widths (px)" })
  await expect(widths.getByRole("checkbox", { name: "640" })).toBeChecked()
  await widths.getByRole("checkbox", { name: "1920" }).click()
  await page.getByLabel("More widths").fill("100, 250")
  const files = await zip(page)
  expect(Object.keys(files)).toEqual([
    "hero-image-100x75.png",
    "hero-image-250x188.png",
    "hero-image-640x480.png",
    "hero-image-1280x960.png",
  ])
  for (const [name, data] of Object.entries(files)) {
    const meta = await sharp(data).metadata()
    expect(name).toContain(`${meta.width}x${meta.height}`)
  }
  const snippet = page.getByTestId("srcset-snippet")
  await expect(snippet).toContainText("hero-image-100x75.png 100w")
  await expect(snippet).toContainText("hero-image-1280x960.png 1280w")
  await expect(snippet).toContainText('sizes="100vw"')
  await expect(
    page.getByRole("link", { name: "Download hero-image-640x480.png" })
  ).toBeVisible()
})

test("applies presets, formats and rotation", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await photo())
  await chip(page, "Resize by", "Presets").click()
  await expect(chip(page, "Preset", "Instagram square")).toBeChecked()
  const square = await result(page)
  expect(square.size).toEqual([1080, 1080])
  expect(square.meta.format).toBe("jpeg")
  await chip(page, "Preset", "Story or Reel").click()
  await expect(page.getByText("Shaded bands are usually covered")).toBeVisible()
  await chip(page, "Preset group", "Icons").click()
  await chip(page, "Preset", "App icon 192").click()
  await chip(page, "Format", "WebP").click()
  const icon = await result(page)
  expect(icon.size).toEqual([192, 192])
  expect(icon.meta.format).toBe("webp")
  await chip(page, "Quality", "Lossless").click()
  expect((await result(page)).meta.format).toBe("webp")
  await chip(page, "Format", "JPEG").click()
  await expect(chip(page, "Quality", "Lossless")).toHaveAttribute(
    "aria-disabled",
    "true"
  )
  await expect(chip(page, "Quality", "Balanced")).toBeChecked()

  await chip(page, "Preset group", "Print").click()
  const print = await result(page)
  expect(print.size).toEqual([1200, 1800])
  expect(print.meta.density).toBe(300)

  await chip(page, "Resize by", "Width").click()
  await page.getByLabel("Width (px)").fill("150")
  expect((await result(page)).size).toEqual([150, 100])
  await page.getByRole("button", { name: "Rotate right" }).click()
  expect((await result(page)).size).toEqual([150, 225])
})

test("stays accessible, keyboard-friendly, local and responsive", async ({
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
  await expect(page.getByTestId("queue-item")).toHaveCount(2)
  await exactBox(page, "300", "300")
  await settled(page)

  // Chips are radios: arrow keys move the choice.
  const fit = page.getByRole("radiogroup", {
    name: "How the image fills the frame",
  })
  await fit.getByRole("radio", { checked: true }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(
    chip(page, "How the image fills the frame", "Fit with padding")
  ).toBeChecked()
  await chip(page, "How the image fills the frame", "Crop to fill").click()
  const radius = await chip(page, "Format", "WebP").evaluate((element) =>
    parseFloat(getComputedStyle(element).borderTopLeftRadius)
  )
  expect(radius).toBeGreaterThanOrEqual(9999)

  // The frame is focusable and arrow keys move the picture for this image only.
  await page.getByTestId("output-frame").focus()
  await page.keyboard.press("Shift+ArrowLeft")
  await expect(
    page.getByRole("button", { name: "Reset this image's position" })
  ).toBeVisible()
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
  await expect(
    page.getByRole("button", { name: "Download all (ZIP)" })
  ).toBeVisible()
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
    "/videos/image-resizer-tutorial-poster.webp"
  )
  await expect(video).toHaveAttribute("preload", "none")
  for (const [path, type] of [
    ["/videos/image-resizer-tutorial.mp4", "video/mp4"],
    ["/videos/image-resizer-tutorial-poster.webp", "image/webp"],
    ["/videos/image-resizer-tutorial.vtt", "text/vtt"],
  ]) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    expect(response.headers()["content-type"]).toContain(type)
  }
  const captions = await (
    await request.get("/videos/image-resizer-tutorial.vtt")
  ).text()
  expect(captions.startsWith("WEBVTT")).toBe(true)
  expect(captions).toContain("Step 6 of 6: Set the format and download")

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
    expect(Math.round(metadata.duration)).toBe(90)
  }

  await expect(section.locator("#tutorial-steps > li")).toHaveCount(6)
  const details = section.locator("details")
  await details.locator("summary").focus()
  await page.keyboard.press("Enter")
  await expect(details).toHaveAttribute("open", "")
  await expect(
    section.getByText("Several sizes", { exact: true })
  ).toBeVisible()
})
