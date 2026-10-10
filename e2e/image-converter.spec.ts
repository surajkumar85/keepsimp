import { readFile } from "node:fs/promises"
import { test, expect, type Download, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { unzipSync } from "fflate"
import sharp from "sharp"

const ROUTE = "/dashboard/image-converter/"

async function bytesOf(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

type Upload = { name: string; mimeType: string; buffer: Buffer }

async function upload(page: Page, ...files: Upload[]) {
  await page.locator("#converter-file").setInputFiles(files)
}

/** Wait until every image has a result for the current settings. */
async function settled(page: Page) {
  await expect(page.getByTestId("image-converter")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 150_000 }
  )
}

async function result(page: Page, label = "Download image") {
  await settled(page)
  const pending = page.waitForEvent("download")
  await page
    .getByRole(label === "Download image" ? "link" : "button", {
      name: label,
      exact: true,
    })
    .click()
  const file = await pending
  return { name: file.suggestedFilename(), buffer: await bytesOf(file) }
}

async function zip(page: Page) {
  await settled(page)
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (ZIP)" }).click()
  const file = await pending
  expect(file.suggestedFilename()).toBe("keepsimp-converted.zip")
  return unzipSync(new Uint8Array(await bytesOf(file)))
}

function chip(page: Page, group: string, name: string) {
  return page
    .getByRole("radiogroup", { name: group, exact: true })
    .getByRole("radio", { name, exact: true })
}

function toggle(page: Page, group: string, name: string) {
  return page
    .getByRole("group", { name: group, exact: true })
    .getByRole("checkbox", { name, exact: true })
}

async function rgba(buffer: Buffer | Uint8Array) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    width: info.width,
    height: info.height,
    at: (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
    ],
  }
}

/** Decode with the browser itself, for formats sharp cannot read. */
async function decodeInBrowser(page: Page, buffer: Buffer, type: string) {
  return page.evaluate(
    async ([bytes, mime]) => {
      try {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes as number[])], {
            type: mime as string,
          })
        )
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext("2d")!
        context.drawImage(bitmap, 0, 0)
        const corner = [...context.getImageData(0, 0, 1, 1).data]
        const right = [...context.getImageData(bitmap.width - 2, 2, 1, 1).data]
        return { width: bitmap.width, height: bitmap.height, corner, right }
      } catch {
        return null
      }
    },
    [[...buffer], type] as const
  )
}

async function pdfPages(buffer: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise
  const views: number[][] = []
  for (let index = 1; index <= document.numPages; index++)
    views.push((await document.getPage(index)).view)
  return views
}

function icoEntries(buffer: Buffer) {
  const count = buffer.readUInt16LE(4)
  return Array.from({ length: count }, (_, index) => {
    const at = 6 + index * 16
    const offset = buffer.readUInt32LE(at + 12)
    return {
      size: buffer[at] || 256,
      png: buffer.subarray(offset, offset + buffer.readUInt32LE(at + 8)),
    }
  })
}

const TEAL = [0, 120, 111]

/** 64×48 PNG: transparent left half, opaque teal right half. */
const badge = async (name = "badge.png"): Promise<Upload> => {
  const data = Buffer.alloc(64 * 48 * 4)
  for (let i = 0; i < 64 * 48; i++)
    if (i % 64 >= 32) data.set([...TEAL, 255], i * 4)
  return {
    name,
    mimeType: "image/png",
    buffer: await sharp(data, { raw: { width: 64, height: 48, channels: 4 } })
      .png()
      .toBuffer(),
  }
}

const photo = async (name = "photo.jpg"): Promise<Upload> => ({
  name,
  mimeType: "image/jpeg",
  buffer: await sharp("public/images/coastline.jpg")
    .resize(600, 400)
    .jpeg({ quality: 92 })
    .toBuffer(),
})

function near(actual: number[], expected: number[], tolerance = 24) {
  expect(
    expected.every(
      (value, index) => Math.abs(actual[index] - value) <= tolerance
    ),
    `expected ${actual} to be near ${expected}`
  ).toBe(true)
}

test.describe.configure({ timeout: 240_000 })

test("converts one image to every format, keeping or filling transparency", async ({
  page,
  browserName,
}) => {
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "Drop images to convert" })
  ).toBeVisible()
  await upload(page, await badge())

  // Formats an independent decoder (sharp) reads.
  for (const [label, format, extension] of [
    ["WebP", "webp", "webp"],
    ["PNG", "png", "png"],
    ["AVIF", "heif", "avif"],
    ["GIF", "gif", "gif"],
    ["TIFF", "tiff", "tiff"],
  ] as const) {
    await chip(page, "Format", label).click()
    const { name, buffer } = await result(page)
    expect(name).toBe(`badge.${extension}`)
    const metadata = await sharp(buffer).metadata()
    expect(metadata.format).toBe(format)
    expect([metadata.width, metadata.height]).toEqual([64, 48])
    const image = await rgba(buffer)
    expect(image.at(2, 2)[3], label).toBeLessThan(8)
    near(image.at(60, 24), [...TEAL, 255])
  }

  await chip(page, "Format", "JPEG").click()
  const jpeg = await result(page)
  expect(jpeg.name).toBe("badge.jpg")
  near((await rgba(jpeg.buffer)).at(2, 2), [255, 255, 255, 255], 10)
  await chip(page, "Background for transparency", "Black").click()
  near((await rgba((await result(page)).buffer)).at(2, 2), [0, 0, 0, 255], 10)

  // BMP is decoded by the browser.
  await chip(page, "Format", "BMP").click()
  const bmp = await result(page)
  expect(bmp.name).toBe("badge.bmp")
  expect(bmp.buffer.subarray(0, 2).toString()).toBe("BM")
  const decodedBmp = await decodeInBrowser(page, bmp.buffer, "image/bmp")
  expect(decodedBmp).not.toBeNull()
  expect([decodedBmp!.width, decodedBmp!.height]).toEqual([64, 48])
  near(decodedBmp!.right, [...TEAL, 255])
  expect(decodedBmp!.corner[3]).toBe(0)

  // ICO: each entry is a PNG of the right size, letterboxed transparently.
  await chip(page, "Format", "ICO").click()
  const ico = await result(page)
  expect(ico.name).toBe("badge.ico")
  const entries = icoEntries(ico.buffer)
  expect(entries.map((entry) => entry.size)).toEqual([16, 32, 48])
  for (const entry of entries) {
    const icon = await rgba(entry.png)
    expect([icon.width, icon.height]).toEqual([entry.size, entry.size])
    expect(icon.at(0, 0)[3]).toBe(0)
  }
  expect(await decodeInBrowser(page, ico.buffer, "image/x-icon")).not.toBeNull()

  // JPEG XL: always a valid signature; decoded where the browser supports it.
  await chip(page, "Format", "JPEG XL").click()
  const jxl = await result(page)
  expect(jxl.name).toBe("badge.jxl")
  const signature = jxl.buffer.subarray(0, 12)
  expect(
    (signature[0] === 0xff && signature[1] === 0x0a) ||
      signature.subarray(4, 8).toString() === "JXL "
  ).toBe(true)
  const decodedJxl =
    browserName === "webkit"
      ? await decodeInBrowser(page, jxl.buffer, "image/jxl")
      : null
  if (decodedJxl)
    expect([decodedJxl.width, decodedJxl.height]).toEqual([64, 48])

  await chip(page, "Format", "PDF").click()
  await chip(page, "Background for transparency", "White").click()
  await chip(page, "Resolution (DPI)", "72").click()
  const pdf = await result(page)
  expect(pdf.name).toBe("badge.pdf")
  expect(await pdfPages(pdf.buffer)).toEqual([[0, 0, 64, 48]])
})

test("saves several formats at once with picture HTML", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await photo("my photo.jpg"))
  // On one-column layouts the first result moves the panel; wait so the tap lands.
  await settled(page)
  await page.getByRole("switch", { name: "Several formats at once" }).click()
  await expect(toggle(page, "Formats", "AVIF")).toBeChecked()
  const files = await zip(page)
  expect(Object.keys(files)).toEqual([
    "my-photo.jpg",
    "my-photo.webp",
    "my-photo.avif",
  ])
  for (const [name, format] of [
    ["my-photo.jpg", "jpeg"],
    ["my-photo.webp", "webp"],
    ["my-photo.avif", "heif"],
  ])
    expect(await sharp(files[name]).metadata()).toMatchObject({
      format,
      width: 600,
      height: 400,
    })
  const snippet = page.getByTestId("picture-snippet")
  await expect(snippet).toContainText(
    'srcset="my-photo.avif" type="image/avif"'
  )
  await expect(snippet).toContainText(
    'srcset="my-photo.webp" type="image/webp"'
  )
  await expect(snippet).toContainText('src="my-photo.jpg"')
  await expect(
    page.getByRole("link", { name: "Download my-photo.webp" })
  ).toBeVisible()

  await toggle(page, "Formats", "AVIF").click()
  await toggle(page, "Formats", "WebP").click()
  await toggle(page, "Formats", "JPEG").click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "at least one format"
  )
  await toggle(page, "Formats", "TIFF").click()
  const tiff = await result(page)
  expect(tiff.name).toBe("my-photo.tiff")
})

test("compares formats with real sizes and applies the choice", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await photo())
  await settled(page)
  await page.getByRole("button", { name: "Compare formats" }).click()
  const table = page.getByTestId("comparison")
  await expect(table).toBeVisible({ timeout: 150_000 })
  const rows = table.locator("tbody tr")
  await expect(rows).toHaveCount(5)
  await expect(rows.first()).toContainText("Smallest")
  const sizes = await rows.evaluateAll((list) =>
    list.map((row) => {
      const text = row.children[1].textContent ?? ""
      const value = parseFloat(text)
      return text.includes("MB") ? value * 1024 : value
    })
  )
  expect(sizes).toEqual([...sizes].sort((a, b) => a - b))

  // Using the winner converts to that format, and the file matches the table.
  const winner = (await rows.first().locator("th").innerText())
    .replace("Smallest", "")
    .trim()
  const size = (await rows.first().locator("td").first().innerText())
    .split("KB")[0]
    .trim()
  await rows
    .first()
    .getByRole("button", { name: `Use ${winner}` })
    .click()
  await expect(chip(page, "Format", winner)).toBeChecked()
  await settled(page)
  await expect(page.getByTestId("queue-item").first()).toContainText(
    `${winner} · ${size} KB`
  )
  await expect(table).toBeVisible()
})

test("makes favicons and PDF documents", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await photo(), await badge())
  await chip(page, "Format", "ICO").click()
  await toggle(page, "Icon sizes (px)", "16").click()
  await toggle(page, "Icon sizes (px)", "256").click()
  const icons = await zip(page)
  expect(Object.keys(icons)).toEqual(["photo.ico", "badge.ico"])
  const entries = icoEntries(Buffer.from(icons["photo.ico"]))
  expect(entries.map((entry) => entry.size)).toEqual([32, 48, 256])
  const large = await rgba(entries[2].png)
  expect([large.width, large.height]).toEqual([256, 256])
  // A 3:2 photo is centred: transparent above, picture in the middle.
  expect(large.at(128, 4)[3]).toBe(0)
  expect(large.at(128, 128)[3]).toBe(255)
  await toggle(page, "Icon sizes (px)", "32").click()
  await toggle(page, "Icon sizes (px)", "48").click()
  await toggle(page, "Icon sizes (px)", "256").click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "icon size"
  )

  await chip(page, "Format", "PDF").click()
  await chip(page, "Resolution (DPI)", "72").click()
  const separate = await zip(page)
  expect(Object.keys(separate)).toEqual(["photo.pdf", "badge.pdf"])
  expect(await pdfPages(Buffer.from(separate["photo.pdf"]))).toEqual([
    [0, 0, 600, 400],
  ])

  await chip(page, "Page size", "A4").click()
  await chip(page, "Margins", "None").click()
  await page.getByRole("switch", { name: "Combine into one PDF" }).click()
  await expect(page.getByTestId("queue-item").first()).toContainText(
    "A page in the combined PDF"
  )
  const combined = await result(page, "Download PDF")
  expect(combined.name).toBe("keepsimp-images.pdf")
  expect(await pdfPages(combined.buffer)).toEqual([
    [0, 0, 841.89, 595.28],
    [0, 0, 841.89, 595.28],
  ])
  await chip(page, "Quality", "Lossless").click()
  const exact = await result(page, "Download PDF")
  expect(exact.buffer.toString("latin1")).toContain("/FlateDecode")
})

test("applies quality, size limit, greyscale and print resolution", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await photo())
  await chip(page, "Format", "JPEG").click()
  await expect(chip(page, "Quality", "Lossless")).toHaveAttribute(
    "aria-disabled",
    "true"
  )
  await chip(page, "Quality", "High").click()
  const high = await result(page)
  await chip(page, "Quality", "Small file").click()
  const small = await result(page)
  expect(small.buffer.byteLength).toBeLessThan(high.buffer.byteLength)

  await chip(page, "Limit the longest side", "Custom").click()
  await page.getByLabel("Longest side (px)").fill("300")
  await page.getByRole("switch", { name: "Convert to greyscale" }).click()
  await page.getByRole("switch", { name: "Save print resolution" }).click()
  const edited = await result(page)
  const metadata = await sharp(edited.buffer).metadata()
  expect([metadata.width, metadata.height, metadata.density]).toEqual([
    300, 200, 300,
  ])
  const pixel = (await rgba(edited.buffer)).at(150, 100)
  expect(Math.abs(pixel[0] - pixel[1])).toBeLessThan(6)
  expect(Math.abs(pixel[1] - pixel[2])).toBeLessThan(6)

  await page.getByLabel("Longest side (px)").fill("5000")
  expect((await sharp((await result(page)).buffer).metadata()).width).toBe(600)
  await page.getByLabel("Longest side (px)").fill("")
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "longest side"
  )

  await chip(page, "Limit the longest side", "Original size").click()
  await chip(page, "Format", "PNG").click()
  await chip(page, "Quality", "Lossless").click()
  const lossless = await result(page)
  expect((await sharp(lossless.buffer).metadata()).density).toBe(300)
  await chip(page, "Format", "BMP").click()
  await expect(page.getByRole("radiogroup", { name: "Quality" })).toHaveCount(0)
})

test("converts a batch, reports bad files and names the ZIP entries", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await photo(), await badge(), {
    name: "broken.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.concat([
      (await photo()).buffer.subarray(0, 40),
      Buffer.alloc(200),
    ]),
  })
  const rows = page.getByTestId("queue-item")
  await expect(rows).toHaveCount(3)
  await settled(page)
  await expect(rows.nth(2)).toHaveAttribute("data-state", "error")
  await expect(rows.nth(2)).toContainText("could not read")
  await expect(page.getByTestId("summary-bar")).toContainText("2 of 3 ready")

  await page.getByLabel("File names").fill("{index}-{name}-{width}w")
  await expect(page.getByText("Example: 01-photo-600w.webp")).toBeVisible()
  const files = await zip(page)
  expect(Object.keys(files)).toEqual([
    "01-photo-600w.webp",
    "02-badge-64w.webp",
  ])

  await upload(page, {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  })
  await expect(rows.nth(3)).toContainText("Choose a JPEG, PNG, WebP")
  await page.getByRole("button", { name: "Preview badge.png" }).click()
  await expect(page.getByText("Original · ")).toBeVisible()
  await page.getByRole("button", { name: "Remove broken.jpg" }).click()
  await page.getByRole("button", { name: "Remove notes.txt" }).click()
  await expect(rows).toHaveCount(2)
  await page.getByRole("button", { name: "Clear all" }).click()
  await expect(page.getByTestId("drop-zone")).toBeVisible()
})

test("reads many input formats and says when an animation loses frames", async ({
  page,
}) => {
  await page.goto(ROUTE)
  const base = sharp("public/images/coastline.jpg").resize(120, 80)
  const frames = Buffer.concat([
    await base.clone().ensureAlpha().raw().toBuffer(),
    await base.clone().negate({ alpha: false }).ensureAlpha().raw().toBuffer(),
  ])
  const animated = await sharp(frames, {
    raw: { width: 120, height: 160, channels: 4, pageHeight: 80 },
  })
    .gif()
    .toBuffer()
  const inputs: [Upload, string][] = [
    [{ name: "moving.gif", mimeType: "image/gif", buffer: animated }, "GIF"],
    [
      {
        name: "photo.avif",
        mimeType: "image/avif",
        buffer: await base.clone().avif().toBuffer(),
      },
      "AVIF",
    ],
    [
      {
        name: "photo.tiff",
        mimeType: "image/tiff",
        buffer: await base.clone().tiff().toBuffer(),
      },
      "TIFF",
    ],
    [
      {
        name: "icon.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="teal"/></svg>'
        ),
      },
      "SVG",
    ],
    [
      {
        name: "coast.heic",
        mimeType: "",
        buffer: await readFile("e2e/fixtures/coastline-small.heic"),
      },
      "HEIC",
    ],
  ]
  await upload(page, ...inputs.map(([file]) => file))
  await chip(page, "Format", "PNG").click()
  const files = await zip(page)
  expect(Object.keys(files)).toEqual([
    "moving.png",
    "photo.png",
    "photo-2.png",
    "icon.png",
    "coast.png",
  ])
  expect(await sharp(files["moving.png"]).metadata()).toMatchObject({
    width: 120,
    height: 80,
  })
  expect(await sharp(files["icon.png"]).metadata()).toMatchObject({
    width: 1024,
    height: 512,
  })
  expect(await sharp(files["coast.png"]).metadata()).toMatchObject({
    width: 320,
    height: 213,
  })
  const rows = page.getByTestId("queue-item")
  for (const [index, [, label]] of inputs.entries())
    await expect(rows.nth(index)).toContainText(label)
  await page.getByRole("button", { name: "Preview moving.gif" }).click()
  await expect(
    page.getByText("Only the first frame is converted.")
  ).toBeVisible()
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
  await settled(page)

  // Format chips are radios: arrow keys move the choice.
  await page
    .getByRole("radiogroup", { name: "Format", exact: true })
    .getByRole("radio", { checked: true })
    .focus()
  await page.keyboard.press("ArrowLeft")
  await expect(chip(page, "Format", "PNG")).toBeChecked()
  await chip(page, "Format", "JPEG").click()
  await settled(page)
  await expect(
    page.getByRole("img", { name: "Compressed result" })
  ).toBeVisible()
  const slider = page.getByRole("slider", { name: "Comparison position" })
  await slider.focus()
  await page.keyboard.press("Home")
  await expect(slider).toHaveValue("0")

  // TIFF cannot be shown by most browsers; the page says so instead of a broken preview.
  await chip(page, "Format", "TIFF").click()
  await settled(page)
  const fallback = page.getByTestId("no-preview")
  const preview = page.getByRole("img", { name: "Compressed result" })
  await expect(fallback.or(preview)).toBeVisible()

  await chip(page, "Format", "JPEG").click()
  await page.getByRole("switch", { name: "Several formats at once" }).click()
  await toggle(page, "Formats", "AVIF").click()
  await settled(page)
  await page.getByRole("button", { name: "Compare formats" }).click()
  await expect(page.getByTestId("comparison")).toBeVisible({ timeout: 150_000 })

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
    "/videos/image-converter-tutorial-poster.webp"
  )
  await expect(video).toHaveAttribute("preload", "none")
  for (const [path, type] of [
    ["/videos/image-converter-tutorial.mp4", "video/mp4"],
    ["/videos/image-converter-tutorial-poster.webp", "image/webp"],
    ["/videos/image-converter-tutorial.vtt", "text/vtt"],
  ]) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    expect(response.headers()["content-type"]).toContain(type)
  }
  const captions = await (
    await request.get("/videos/image-converter-tutorial.vtt")
  ).text()
  expect(captions.startsWith("WEBVTT")).toBe(true)
  expect(captions).toContain("Step 6 of 6: Set the options and download")

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
    expect(Math.round(metadata.duration)).toBe(80)
  }

  await expect(section.locator("#tutorial-steps > li")).toHaveCount(6)
  const details = section.locator("details")
  await details.locator("summary").focus()
  await page.keyboard.press("Enter")
  await expect(details).toHaveAttribute("open", "")
  await expect(
    section.getByText("Which format should I choose?", { exact: true })
  ).toBeVisible()
})
