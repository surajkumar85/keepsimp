import { test, expect, type Download, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { unzipSync } from "fflate"
import sharp from "sharp"
import UPNG from "upng-js"

const ROUTE = "/dashboard/animation-converter/"
const WIDTH = 64
const HEIGHT = 48

type Upload = { name: string; mimeType: string; buffer: Buffer }
type Format = "gif" | "webp" | "apng"

async function bytesOf(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

/** A red square that moves right over a striped backdrop; `clear` leaves the backdrop see-through. */
function scene(count: number, clear = false) {
  return Array.from({ length: count }, (_, frame) => {
    const data = Buffer.alloc(WIDTH * HEIGHT * 4)
    for (let y = 0; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) {
        const inside =
          x >= 4 + frame * 4 && x < 16 + frame * 4 && y >= 16 && y < 32
        data.set(
          inside
            ? [220, 40, 40, 255]
            : clear
              ? [0, 0, 0, 0]
              : [20, 60 + (y >> 3) * 16, 120, 255],
          (y * WIDTH + x) * 4
        )
      }
    return data
  })
}

/** An animation written by other software: sharp for GIF and WebP, UPNG for APNG. */
async function animation(
  format: Format,
  name: string,
  options: { frames?: number; delay?: number; clear?: boolean } = {}
): Promise<Upload> {
  const frames = scene(options.frames ?? 6, options.clear)
  const delay = frames.map(() => options.delay ?? 80)
  const stacked = sharp(Buffer.concat(frames), {
    raw: {
      width: WIDTH,
      height: HEIGHT * frames.length,
      channels: 4,
      pageHeight: HEIGHT,
    },
  })
  if (format === "gif")
    return {
      name,
      mimeType: "image/gif",
      buffer: await stacked.gif({ delay, loop: 0, effort: 1 }).toBuffer(),
    }
  if (format === "webp")
    return {
      name,
      mimeType: "image/webp",
      buffer: await stacked.webp({ delay, loop: 0, lossless: true }).toBuffer(),
    }
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(
      UPNG.encode(
        frames.map(
          (frame) =>
            frame.buffer.slice(
              frame.byteOffset,
              frame.byteOffset + frame.length
            ) as ArrayBuffer
        ),
        WIDTH,
        HEIGHT,
        0,
        delay
      )
    ),
  }
}

/** Read a downloaded animation with other software. */
async function read(format: Format, bytes: Buffer) {
  if (format === "apng") {
    const image = UPNG.decode(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.length
      ) as ArrayBuffer
    )
    return {
      width: image.width,
      height: image.height,
      frames: UPNG.toRGBA8(image).map((frame) => Buffer.from(frame)),
      delays: image.frames.map((frame) => frame.delay),
      plays: bytes.readUInt32BE(bytes.indexOf("acTL") + 8),
    }
  }
  const image = sharp(bytes, { animated: true })
  const meta = await image.metadata()
  expect(meta.format).toBe(format)
  const height = meta.pageHeight!
  const raw = await image.ensureAlpha().raw().toBuffer()
  const size = meta.width! * height * 4
  return {
    width: meta.width!,
    height,
    frames: Array.from({ length: meta.pages! }, (_, index) =>
      raw.subarray(index * size, (index + 1) * size)
    ),
    delays: meta.delay!,
    plays: meta.loop!,
  }
}

async function upload(page: Page, ...files: Upload[]) {
  await page.locator("#animation-file").setInputFiles(files)
}

/** Wait until every animation has a result for the current settings. */
async function settled(page: Page) {
  await expect(page.getByTestId("animation-converter")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 150_000 }
  )
}

function chip(page: Page, group: string, name: string) {
  return page
    .getByRole("radiogroup", { name: group, exact: true })
    .getByRole("radio", { name, exact: true })
}

/** Choose a setting, then wait for the batch to be converted again. */
async function choose(page: Page, group: string, name: string) {
  await chip(page, group, name).click()
  await expect(page.getByTestId("animation-converter")).not.toHaveAttribute(
    "data-settled",
    "true"
  )
  await settled(page)
}

async function result(page: Page, format: Format) {
  await settled(page)
  const pending = page.waitForEvent("download")
  await page
    .getByRole("link", { name: "Download animation", exact: true })
    .click()
  const file = await pending
  const buffer = await bytesOf(file)
  return {
    name: file.suggestedFilename(),
    buffer,
    ...(await read(format, buffer)),
  }
}

/** The x position of the red square's left edge in a frame, or -1. */
function squareAt(frame: Buffer, width = WIDTH, row = 24) {
  for (let x = 0; x < width; x++) {
    const at = (row * width + x) * 4
    if (frame[at] > 150 && frame[at + 1] < 110 && frame[at + 3] > 128) return x
  }
  return -1
}

test.describe.configure({ timeout: 240_000 })

test("converts between GIF, WebP and APNG and keeps every frame moving", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "Drop animations to convert" })
  ).toBeVisible()
  await upload(page, await animation("gif", "walk cycle.gif"))
  const facts = page.getByTestId("facts")
  await expect(facts).toContainText("GIF · 64 × 48 · 6 frames · 0.48 s")
  await expect(facts).toContainText("loops forever")

  // WebP is the default; lossless makes it exact, so frames can be compared.
  await chip(page, "Quality", "Lossless").click()
  const source = await read("gif", (await animation("gif", "x.gif")).buffer)
  for (const [label, format, extension] of [
    ["WebP", "webp", "webp"],
    ["APNG", "apng", "png"],
    ["GIF", "gif", "gif"],
  ] as const) {
    await chip(page, "Format", label).click()
    const file = await result(page, format)
    expect(file.name, label).toBe(`walk-cycle.${extension}`)
    expect([file.width, file.height], label).toEqual([WIDTH, HEIGHT])
    expect(file.frames, label).toHaveLength(6)
    expect(file.delays, label).toEqual([80, 80, 80, 80, 80, 80])
    expect(file.plays, label).toBe(0)
    // The square is where the original had it in every frame.
    file.frames.forEach((frame, index) =>
      expect(squareAt(frame), `${label} frame ${index}`).toBe(
        squareAt(source.frames[index])
      )
    )
    await expect(facts).toContainText(`${label} · 64 × 48 · 6 frames`)
  }
  // GIF cannot be lossless, and the page says so.
  await expect(page.getByText("it cannot be lossless")).toBeVisible()
})

test("trims, changes speed, limits frames, reverses and sets the loop", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await animation("apng", "steps.png", { frames: 10, delay: 100 })
  )
  await chip(page, "Format", "APNG").click()
  await chip(page, "Quality", "Lossless").click()
  await settled(page)
  const original = scene(10)

  // Keep 0.2 s to 0.8 s: frames 2 to 7.
  const start = page.getByLabel("Start (s)")
  await start.fill("0.2")
  await start.press("Enter")
  const end = page.getByLabel("End (s)")
  await end.fill("0.8")
  await end.press("Enter")
  await expect(page.getByTestId("trim-bar")).toContainText(
    "Keeping 0.60 s of 1.00 s"
  )
  let file = await result(page, "apng")
  expect(file.delays).toEqual([100, 100, 100, 100, 100, 100])
  expect(file.frames.map((frame) => squareAt(frame))).toEqual(
    [2, 3, 4, 5, 6, 7].map((index) => squareAt(original[index]))
  )

  // Twice as fast, backwards.
  await chip(page, "Speed", "2×").click()
  await page.getByRole("switch", { name: "Reverse" }).click()
  await expect(page.getByTestId("facts")).toContainText("6 frames · 0.3 s")
  file = await result(page, "apng")
  expect(file.delays).toEqual([50, 50, 50, 50, 50, 50])
  expect(file.frames.map((frame) => squareAt(frame))).toEqual(
    [7, 6, 5, 4, 3, 2].map((index) => squareAt(original[index]))
  )

  // There and back, three times, at no more than 10 frames a second.
  await page.getByRole("switch", { name: "Reverse" }).click()
  await chip(page, "Speed", "1×").click()
  await page.getByRole("switch", { name: "Boomerang" }).click()
  await chip(page, "Frames per second", "10").click()
  await chip(page, "Loop", "A set number").click()
  await page.getByLabel("Times to play").fill("3")
  await expect(page.getByTestId("facts")).toContainText("plays 3 times")
  file = await result(page, "apng")
  expect(file.plays).toBe(3)
  expect(file.frames.map((frame) => squareAt(frame))).toEqual(
    [2, 3, 4, 5, 6, 7, 6, 5, 4, 3].map((index) => squareAt(original[index]))
  )

  // Half the frame rate drops every other frame and keeps the length.
  await page.getByRole("switch", { name: "Boomerang" }).click()
  await chip(page, "Frames per second", "Custom").click()
  await page.getByLabel("Frames per second", { exact: true }).last().fill("5")
  await chip(page, "Loop", "Play once").click()
  file = await result(page, "apng")
  expect(file.delays).toEqual([200, 200, 200])
  expect(file.plays).toBe(1)

  // "Keep everything" undoes the trim.
  await page.getByRole("button", { name: "Keep everything" }).click()
  await chip(page, "Frames per second", "Original").click()
  file = await result(page, "apng")
  expect(file.frames).toHaveLength(10)

  // A setting that cannot work is explained and nothing is converted with it.
  await chip(page, "Loop", "A set number").click()
  await page.getByLabel("Times to play").fill("1")
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "2 or more"
  )
  await expect(page.getByTestId("queue-item").first()).toContainText(
    "Waiting for settings"
  )
})

test("resizes, turns and fills see-through areas", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await animation("webp", "sticker.webp", { clear: true }))
  await chip(page, "Format", "APNG").click()
  await chip(page, "Quality", "Lossless").click()
  let file = await result(page, "apng")
  // See-through stays see-through; the square stays solid.
  expect(file.frames[0][3]).toBe(0)
  expect(file.frames[0][(24 * WIDTH + 8) * 4 + 3]).toBe(255)

  await chip(page, "Resize", "Width").click()
  await page.getByLabel("Width (px)").fill("32")
  await page.getByRole("button", { name: "Rotate right" }).click()
  await chip(page, "Background", "Custom").click()
  await page.getByLabel("Background colour").fill("#00786f")
  file = await result(page, "apng")
  // Turned, 64 × 48 becomes 48 × 64; 32 wide makes it 32 × 43.
  expect([file.width, file.height]).toEqual([32, 43])
  expect([...file.frames[0].subarray(0, 4)]).toEqual([0, 120, 111, 255])
  await expect(page.getByTestId("facts")).toContainText("APNG · 32 × 43")

  // GIF keeps the see-through backdrop, hard-edged, and the page explains it.
  await chip(page, "Background", "Keep transparency").click()
  await chip(page, "Format", "GIF").click()
  await expect(page.getByText("soft edges become hard")).toBeVisible()
  file = await result(page, "gif")
  expect(file.frames[0][3]).toBe(0)
  expect(file.frames).toHaveLength(6)

  await page.getByLabel("Width (px)").fill("0")
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "whole pixels"
  )
})

test("makes smaller files at lower quality, and gifski writes a GIF", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(page.getByTestId("queue-item")).toHaveCount(2)
  await settled(page)
  const sizeOf = async (name: string) => {
    await settled(page)
    const pending = page.waitForEvent("download")
    await page
      .getByRole("link", { name: `Download ${name}`, exact: true })
      .click()
    return (await bytesOf(await pending)).length
  }
  // The sample GIF as WebP: Balanced is far smaller than the GIF it came from.
  const balanced = await sizeOf("coastline-pan.webp")
  expect(balanced).toBeLessThan(450_000)
  await choose(page, "Quality", "Small file")
  expect(await sizeOf("coastline-pan.webp")).toBeLessThan(balanced)
  // Flat artwork is kept lossless when that is smaller, so it does not grow much.
  await choose(page, "Quality", "Balanced")
  expect(await sizeOf("keepsimp-pulse.webp")).toBeLessThan(60_000)

  await page.getByRole("button", { name: "Remove coastline-pan.gif" }).click()
  await chip(page, "Format", "GIF").click()
  await choose(page, "GIF encoder", "Best (gifski)")
  const file = await result(page, "gif")
  expect(file.name).toBe("keepsimp-pulse.gif")
  expect(file.frames).toHaveLength(20)
  expect(file.plays).toBe(0)
  expect([file.width, file.height]).toEqual([192, 192])
})

test("converts a batch, explains bad files and names the ZIP entries", async ({
  page,
}) => {
  await page.goto(ROUTE)
  const still = {
    name: "still.png",
    mimeType: "image/png",
    buffer: await sharp(scene(1)[0], {
      raw: { width: WIDTH, height: HEIGHT, channels: 4 },
    })
      .png()
      .toBuffer(),
  }
  // An animated WebP whose first frame has been overwritten with noise.
  const damaged = await animation("webp", "broken.webp")
  damaged.buffer.fill(
    0x5a,
    damaged.buffer.indexOf("VP8L") + 8,
    damaged.buffer.indexOf("VP8L") + 40
  )
  await upload(
    page,
    await animation("gif", "one.gif"),
    still,
    await animation("apng", "two.png", { frames: 4 }),
    damaged,
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }
  )
  const rows = page.getByTestId("queue-item")
  await expect(rows).toHaveCount(5)
  await settled(page)
  await expect(page.getByTestId("summary-bar")).toContainText("2 of 5 ready")
  await expect(rows.nth(1)).toContainText("does not move")
  await expect(rows.nth(1)).toContainText("image converter")
  await expect(rows.nth(3)).toContainText("could not read this animation")
  await expect(rows.nth(4)).toContainText(
    "Choose an animated GIF, APNG or WebP file."
  )

  await page.getByLabel("Name pattern").fill("{index}-{name}-{width}w")
  await expect(page.getByText("01-one-64w.webp")).toBeVisible()
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (ZIP)" }).click()
  const zip = await pending
  expect(zip.suggestedFilename()).toBe("keepsimp-animations.zip")
  const files = unzipSync(new Uint8Array(await bytesOf(zip)))
  expect(Object.keys(files)).toEqual(["01-one-64w.webp", "03-two-64w.webp"])
  expect(
    (await read("webp", Buffer.from(files["03-two-64w.webp"]))).frames
  ).toHaveLength(4)

  // Each animation keeps its own trim.
  await page.getByRole("button", { name: "Preview two.png" }).click()
  await expect(page.getByText("Applies to two.png only.")).toBeVisible()
  const end = page.getByLabel("End (s)")
  await end.fill("0.16")
  await end.press("Enter")
  await settled(page)
  await expect(rows.nth(2)).toContainText("WebP · 64 × 48")
  await page.getByRole("button", { name: "Preview one.gif" }).click()
  await expect(page.getByTestId("trim-bar")).toContainText(
    "Keeping 0.48 s of 0.48 s"
  )
  const again = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (ZIP)" }).click()
  const second = unzipSync(new Uint8Array(await bytesOf(await again)))
  expect(
    (await read("webp", Buffer.from(second["03-two-64w.webp"]))).frames
  ).toHaveLength(2)
  expect(
    (await read("webp", Buffer.from(second["01-one-64w.webp"]))).frames
  ).toHaveLength(6)

  await page.getByRole("button", { name: "Remove still.png" }).click()
  await expect(rows).toHaveCount(4)
  await page.getByRole("button", { name: "Clear all" }).click()
  await expect(
    page.getByRole("heading", { name: "Drop animations to convert" })
  ).toBeVisible()
})

test("plays, pauses on a frame and compares it before and after", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await animation("gif", "walk.gif", { frames: 6, delay: 200 })
  )
  await settled(page)
  const player = page.getByTestId("player")
  await expect(player).toHaveAttribute("data-playing", "true")
  // Playing shows the file itself, as the browser plays it.
  const playing = player.getByRole("img", {
    name: "The converted animation, playing",
  })
  await expect(playing).toBeVisible()
  expect(
    await playing.evaluate(
      (image: HTMLImageElement) => image.complete && image.naturalWidth
    )
  ).toBe(WIDTH)
  await chip(page, "Show", "Original").click()
  await expect(
    player.getByRole("img", { name: "The original animation, playing" })
  ).toBeVisible()

  // Paused, one frame is drawn before and after, under a slider.
  await page.getByRole("button", { name: "Pause" }).click()
  await expect(player).toHaveAttribute("data-playing", "false")
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible()
  const time = page.getByTestId("player-time")
  const position = page.getByRole("slider", { name: "Position", exact: true })
  await position.fill("450")
  await expect(time).toContainText("frame 3 of 6")
  const drawn = (label: string) =>
    player.getByRole("img", { name: label }).evaluate((canvas) => {
      const element = canvas as HTMLCanvasElement
      const data = element
        .getContext("2d")!
        .getImageData(0, 24, element.width, 1).data
      for (let x = 0; x < element.width; x++)
        if (data[x * 4] > 150 && data[x * 4 + 1] < 110) return x
      return -1
    })
  // Frame 3 has the square 8 pixels further right than frame 1.
  await expect.poll(() => drawn("Original image")).toBe(12)
  await expect.poll(() => drawn("Compressed result")).toBe(12)
  await expect(
    page.getByRole("slider", { name: "Comparison position" })
  ).toBeAttached()

  await page.getByRole("button", { name: "Next frame" }).click()
  await expect(time).toContainText("frame 4 of 6")
  await expect.poll(() => drawn("Original image")).toBe(16)
  await page.getByRole("button", { name: "Previous frame" }).click()
  await page.getByRole("button", { name: "Previous frame" }).click()
  await expect(time).toContainText("frame 2 of 6")
  await expect.poll(() => drawn("Compressed result")).toBe(8)

  // Reversed, the first frame of the result is the last of the original.
  await page.getByRole("switch", { name: "Reverse" }).click()
  await settled(page)
  await position.fill("0")
  await expect(time).toContainText("frame 1 of 6")
  await expect.poll(() => drawn("Original image")).toBe(24)
  await expect.poll(() => drawn("Compressed result")).toBe(24)

  await page.getByRole("button", { name: "Play" }).click()
  await expect(player).toHaveAttribute("data-playing", "true")
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

  // With reduced motion the preview starts paused, on a single frame.
  await expect(page.getByTestId("player")).toHaveAttribute(
    "data-playing",
    "false"
  )
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible()

  // Format chips are radios: arrow keys move the choice.
  await page
    .getByRole("radiogroup", { name: "Format", exact: true })
    .getByRole("radio", { checked: true })
    .focus()
  await page.keyboard.press("ArrowLeft")
  await expect(chip(page, "Format", "GIF")).toBeChecked()
  await settled(page)

  // The trim handles are sliders that answer to the keyboard.
  const startHandle = page.getByRole("slider", {
    name: "Start of the kept part",
  })
  await startHandle.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await expect(page.getByLabel("Start (s)")).toHaveValue("0.02")
  await expect(startHandle).toHaveAttribute("aria-valuetext", "0.02 seconds")
  await page.keyboard.press("Home")
  await expect(page.getByLabel("Start (s)")).toHaveValue("0.00")

  // The position bar steps through the animation from the keyboard.
  const position = page.getByRole("slider", { name: "Position", exact: true })
  await position.focus()
  await page.keyboard.press("End")
  await expect(page.getByTestId("player-time")).toContainText("frame 20 of 20")
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

test("the written guide explains every option", async ({ page }) => {
  await page.goto(ROUTE)
  const section = page.getByRole("region", {
    name: "A little help along the way",
  })
  await expect(section.locator("#tutorial-steps > li")).toHaveCount(6)
  // There is no video yet, and the page does not pretend there is.
  await expect(section.locator("video")).toHaveCount(0)
  const details = section.locator("details")
  await details.locator("summary").focus()
  await page.keyboard.press("Enter")
  await expect(details).toHaveAttribute("open", "")
  await expect(
    section.getByText("Which format should I choose?", { exact: true })
  ).toBeVisible()
})
