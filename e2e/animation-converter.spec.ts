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
function scene(count: number, clear = false, scale = 1) {
  const [width, height] = [WIDTH * scale, HEIGHT * scale]
  return Array.from({ length: count }, (_, frame) => {
    const data = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const [u, v] = [Math.floor(x / scale), Math.floor(y / scale)]
        const inside =
          u >= 4 + frame * 4 && u < 16 + frame * 4 && v >= 16 && v < 32
        data.set(
          inside
            ? [220, 40, 40, 255]
            : clear
              ? [0, 0, 0, 0]
              : [20, 60 + (v >> 3) * 16, 120, 255],
          (y * width + x) * 4
        )
      }
    return data
  })
}

/** An animation written by other software: sharp for GIF and WebP, UPNG for APNG. */
async function animation(
  format: Format,
  name: string,
  options: {
    frames?: number
    delay?: number
    clear?: boolean
    /** Draw the same scene this many times larger. */
    scale?: number
  } = {}
): Promise<Upload> {
  const scale = options.scale ?? 1
  const [width, height] = [WIDTH * scale, HEIGHT * scale]
  const frames = scene(options.frames ?? 6, options.clear, scale)
  const delay = frames.map(() => options.delay ?? 80)
  const stacked = sharp(Buffer.concat(frames), {
    raw: {
      width,
      height: height * frames.length,
      channels: 4,
      pageHeight: height,
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
        width,
        height,
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
    page.getByRole("heading", { name: "Drop animations, clips or images" })
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
  await expect(rows.nth(2)).toContainText("could not read this animation")
  await expect(rows.nth(3)).toContainText(
    "Choose an animated GIF, APNG or WebP, a video, or still images."
  )
  // A single still cannot move; it is listed last, with what to do instead.
  await expect(rows.nth(4)).toContainText("does not move")
  await expect(rows.nth(4)).toContainText("Add two or more images together")

  await page.getByLabel("Name pattern").fill("{index}-{name}-{width}w")
  await expect(page.getByText("01-one-64w.webp")).toBeVisible()
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (ZIP)" }).click()
  const zip = await pending
  expect(zip.suggestedFilename()).toBe("keepsimp-animations.zip")
  const files = unzipSync(new Uint8Array(await bytesOf(zip)))
  expect(Object.keys(files)).toEqual(["01-one-64w.webp", "02-two-64w.webp"])
  expect(
    (await read("webp", Buffer.from(files["02-two-64w.webp"]))).frames
  ).toHaveLength(4)

  // Each animation keeps its own trim.
  await page.getByRole("button", { name: "Preview two.png" }).click()
  await expect(page.getByText("Applies to two.png only.")).toBeVisible()
  const end = page.getByLabel("End (s)")
  await end.fill("0.16")
  await end.press("Enter")
  await settled(page)
  await expect(rows.nth(1)).toContainText("WebP · 64 × 48")
  await page.getByRole("button", { name: "Preview one.gif" }).click()
  await expect(page.getByTestId("trim-bar")).toContainText(
    "Keeping 0.48 s of 0.48 s"
  )
  const again = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (ZIP)" }).click()
  const second = unzipSync(new Uint8Array(await bytesOf(await again)))
  expect(
    (await read("webp", Buffer.from(second["02-two-64w.webp"]))).frames
  ).toHaveLength(2)
  expect(
    (await read("webp", Buffer.from(second["01-one-64w.webp"]))).frames
  ).toHaveLength(6)

  await page.getByRole("button", { name: "Remove still.png" }).click()
  await expect(rows).toHaveCount(4)
  await page.getByRole("button", { name: "Clear all" }).click()
  await expect(
    page.getByRole("heading", { name: "Drop animations, clips or images" })
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

test("changes colour, fades in and out and paints a logo on every frame", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await animation("gif", "walk.gif"))
  await chip(page, "Format", "APNG").click()
  await chip(page, "Quality", "Lossless").click()
  const plain = await result(page, "apng")
  const pixel = (frame: Buffer, x: number, y: number) => [
    ...frame.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4),
  ]
  const near = (found: number[], wanted: number[], label: string) =>
    found.forEach((value, index) =>
      expect(Math.abs(value - wanted[index]), label).toBeLessThanOrEqual(3)
    )

  // Greyscale: no pixel has any colour left, and the square still moves.
  let file = await choose(page, "Filter", "Greyscale").then(() =>
    result(page, "apng")
  )
  expect(file.frames).toHaveLength(6)
  for (const frame of file.frames)
    for (let at = 0; at < frame.length; at += 4)
      if (frame[at] !== frame[at + 1] || frame[at] !== frame[at + 2])
        throw new Error(`a coloured pixel at byte ${at}`)
  // The red square is a darker grey than the backdrop beside it.
  near(pixel(file.frames[0], 8, 24), [78, 78, 78, 255], "grey square")
  expect(pixel(file.frames[0], 8, 24)).not.toEqual(pixel(file.frames[5], 8, 24))

  await choose(page, "Filter", "Invert")
  file = await result(page, "apng")
  near(pixel(file.frames[0], 0, 0), [235, 195, 135, 255], "inverted backdrop")
  near(pixel(file.frames[0], 8, 24), [35, 215, 215, 255], "inverted square")

  // Brightness is a slider that answers to the keyboard; "Reset colour" undoes it all.
  const brightness = page.getByRole("slider", { name: /^Brightness/ })
  await brightness.focus()
  await page.keyboard.press("End")
  await expect(page.getByText("+100", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Reset colour" }).click()
  await expect(chip(page, "Filter", "None")).toBeChecked()
  await expect(brightness).toHaveValue("0")
  await expect(page.getByRole("button", { name: "Reset colour" })).toBeHidden()
  file = await result(page, "apng")
  expect(file.frames.map((frame) => pixel(frame, 0, 0))).toEqual(
    plain.frames.map((frame) => pixel(frame, 0, 0))
  )

  // A fade in starts from black and gets lighter; a fade out ends in black.
  await choose(page, "Fade in", "0.5 s")
  file = await result(page, "apng")
  expect(file.delays).toEqual([80, 80, 80, 80, 80, 80])
  expect(pixel(file.frames[0], 0, 0)).toEqual([0, 0, 0, 255])
  expect(pixel(file.frames[0], 8, 24)).toEqual([0, 0, 0, 255])
  const blues = file.frames.map((frame) => pixel(frame, 0, 0)[2])
  for (let index = 1; index < blues.length; index++)
    expect(blues[index], `frame ${index}`).toBeGreaterThan(blues[index - 1])
  expect(blues[5]).toBeLessThan(pixel(plain.frames[5], 0, 0)[2])

  await choose(page, "Fade in", "Off")
  await choose(page, "Fade out", "1 s")
  // With a background colour chosen, that is what the picture fades to.
  await choose(page, "Background", "White")
  file = await result(page, "apng")
  expect(pixel(file.frames[5], 0, 0)).toEqual([255, 255, 255, 255])
  expect(pixel(file.frames[0], 0, 0)[2]).toBeGreaterThan(
    pixel(plain.frames[0], 0, 0)[2]
  )
  await choose(page, "Fade out", "Off")
  await choose(page, "Background", "Keep transparency")

  // A logo: an SVG is refused with a reason, a PNG is painted on every frame.
  const logoInput = page.getByLabel("Choose a logo or watermark image")
  await logoInput.setInputFiles({
    name: "mark.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  })
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "SVG cannot be used as a logo"
  )
  await expect(page.getByRole("radiogroup", { name: "Position" })).toBeHidden()
  await logoInput.setInputFiles({
    name: "mark.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 255, g: 0, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer(),
  })
  await expect(page.getByRole("main").getByRole("alert")).toBeHidden()
  await expect(page.getByText("mark.png")).toBeVisible()
  await expect(chip(page, "Position", "Bottom right")).toBeChecked()
  await settled(page)
  await choose(page, "Position", "Top left")
  await page.getByLabel("Width (%)").fill("50")
  await page.getByLabel("Opacity (%)").fill("100")
  file = await result(page, "apng")
  // Half of 64 px is a 32 px square, 2 px in from the corner.
  for (const frame of file.frames) {
    // Enlarging the logo may move a flat colour by a step.
    near(pixel(frame, 2, 2), [255, 0, 255, 255], "logo corner")
    near(pixel(frame, 33, 33), [255, 0, 255, 255], "logo far corner")
    expect(pixel(frame, 1, 1)).toEqual(pixel(plain.frames[0], 1, 1))
    expect(pixel(frame, 34, 34)).toEqual(pixel(plain.frames[0], 34, 34))
  }
  await page.getByLabel("Opacity (%)").fill("50")
  file = await result(page, "apng")
  const under = pixel(plain.frames[0], 2, 2)
  near(
    pixel(file.frames[0], 2, 2),
    [(255 + under[0]) / 2, under[1] / 2, (255 + under[2]) / 2, 255],
    "half-solid logo"
  )
  await page.getByLabel("Opacity (%)").fill("5")
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "10% to 100%"
  )
  await page.getByLabel("Opacity (%)").fill("50")

  await page.getByRole("button", { name: "Remove the logo" }).click()
  await expect(page.getByText("mark.png")).toBeHidden()
  file = await result(page, "apng")
  expect(pixel(file.frames[0], 2, 2)).toEqual(pixel(plain.frames[0], 2, 2))
})

test("writes captions at the top and bottom, for the times asked", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const [width, height] = [WIDTH * 3, HEIGHT * 3]
  await page.goto(ROUTE)
  await upload(page, await animation("gif", "walk.gif", { scale: 3 }))
  await chip(page, "Format", "APNG").click()
  await chip(page, "Quality", "Lossless").click()
  const plain = await result(page, "apng")
  /** Rows that differ from the plain result, and how light and dark the changed pixels get. */
  const written = (frame: Buffer, index: number) => {
    const rows = new Set<number>()
    let lightest = 0
    let darkest = 255
    let count = 0
    for (let at = 0; at < frame.length; at += 4) {
      if (
        frame[at] === plain.frames[index][at] &&
        frame[at + 1] === plain.frames[index][at + 1] &&
        frame[at + 2] === plain.frames[index][at + 2]
      )
        continue
      count++
      rows.add(Math.floor(at / 4 / width))
      const level = Math.max(frame[at], frame[at + 1], frame[at + 2])
      lightest = Math.max(lightest, level)
      darkest = Math.min(darkest, level)
    }
    const list = [...rows]
    return {
      count,
      top: Math.min(height, ...list),
      bottom: Math.max(-1, ...list),
      lightest,
      darkest,
    }
  }

  // Options for the text appear once there is some.
  await expect(page.getByRole("radiogroup", { name: "Text size" })).toBeHidden()
  await page.getByLabel("Top text").fill("Hello")
  await expect(
    page.getByRole("radiogroup", { name: "Text size" })
  ).toBeVisible()
  let file = await result(page, "apng")
  expect([file.width, file.height]).toEqual([width, height])
  const top = file.frames.map(written)
  for (const [index, frame] of top.entries()) {
    // White letters with a black line around them, in the top quarter only.
    expect(frame.count, `frame ${index}`).toBeGreaterThan(150)
    expect(frame.top, `frame ${index}`).toBeGreaterThanOrEqual(2)
    expect(frame.bottom, `frame ${index}`).toBeLessThan(height / 4)
    expect(frame.lightest, `frame ${index}`).toBe(255)
    expect(frame.darkest, `frame ${index}`).toBe(0)
  }

  await page.getByLabel("Bottom text").fill("the end")
  file = await result(page, "apng")
  const both = written(file.frames[0], 0)
  expect(both.top).toBe(top[0].top)
  expect(both.bottom).toBeGreaterThan((height * 3) / 4)
  expect(both.bottom).toBeLessThan(height - 2)

  // Capitals and a larger size cover more of the picture.
  await page.getByRole("switch", { name: "Capital letters" }).click()
  const capitals = written((await result(page, "apng")).frames[0], 0)
  expect(capitals.count).toBeGreaterThan(both.count)
  await choose(page, "Text size", "Large")
  const large = written((await result(page, "apng")).frames[0], 0)
  expect(large.count).toBeGreaterThan(capitals.count)
  await choose(page, "Text size", "Small")
  const small = written((await result(page, "apng")).frames[0], 0)
  expect(small.count).toBeLessThan(capitals.count)

  // Black letters get a white line; without the outline nothing light is drawn.
  await page.getByLabel("Bottom text").fill("")
  await choose(page, "Text colour", "Black")
  let black = written((await result(page, "apng")).frames[0], 0)
  expect([black.darkest, black.lightest]).toEqual([0, 255])
  await page.getByRole("switch", { name: "Outline" }).click()
  black = written((await result(page, "apng")).frames[0], 0)
  expect(black.darkest).toBe(0)
  expect(black.lightest).toBeLessThan(200)
  expect(black.count).toBeGreaterThan(20)

  // A custom colour is used as chosen.
  await choose(page, "Text colour", "Custom")
  await page.getByLabel("Custom text colour").fill("#ff00ff")
  file = await result(page, "apng")
  let magenta = 0
  for (let at = 0; at < file.frames[0].length; at += 4)
    if (
      file.frames[0][at] === 255 &&
      file.frames[0][at + 1] === 0 &&
      file.frames[0][at + 2] === 255
    )
      magenta++
  expect(magenta).toBeGreaterThan(10)

  // Shown from 0.2 s until 0.3 s: of six 80 ms frames, the third and fourth.
  await page.getByLabel("Show from (s)").fill("0.2")
  await page.getByLabel("Until (s)").fill("0.3")
  file = await result(page, "apng")
  expect(
    file.frames.map((frame, index) => written(frame, index).count > 0)
  ).toEqual([false, false, true, true, false, false])
  await page.getByLabel("Until (s)").fill("0.1")
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "start before the end"
  )
  await page.getByLabel("Until (s)").fill("")
  file = await result(page, "apng")
  expect(
    file.frames.map((frame, index) => written(frame, index).count > 0)
  ).toEqual([false, false, true, true, true, true])

  // A very long word is made smaller instead of running off the picture.
  await page.getByLabel("Show from (s)").fill("")
  await page.getByLabel("Top text").fill("Supercalifragilisticexpialidocious")
  const long = written((await result(page, "apng")).frames[0], 0)
  expect(long.count).toBeGreaterThan(20)
  expect(long.bottom).toBeLessThan(height / 4)
  for (let row = 0; row < height; row++)
    for (const column of [0, width - 1]) {
      const at = (row * width + column) * 4
      expect(file.frames[0][at + 3]).toBe(255)
    }

  // The open options are accessible and fit a narrow screen.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(results.violations).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)

  // Text also goes onto video, where the browser can write it.
  if (await chip(page, "Format", "MP4").isVisible()) {
    await chip(page, "Format", "MP4").click()
    await settled(page)
    await expect(page.getByTestId("facts")).toContainText("MP4 · 192 × 144")
  }
  expect(errors).toEqual([])
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
    "/videos/animation-converter-tutorial-poster.webp"
  )
  await expect(video).toHaveAttribute("preload", "none")
  for (const [path, type] of [
    ["/videos/animation-converter-tutorial.mp4", "video/mp4"],
    ["/videos/animation-converter-tutorial-poster.webp", "image/webp"],
    ["/videos/animation-converter-tutorial.vtt", "text/vtt"],
  ]) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    expect(response.headers()["content-type"]).toContain(type)
  }
  const captions = await (
    await request.get("/videos/animation-converter-tutorial.vtt")
  ).text()
  expect(captions.startsWith("WEBVTT")).toBe(true)
  expect(captions).toContain("Step 6 of 6: Download")

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
    expect(Math.round(metadata.duration)).toBe(74)
  }

  await expect(section.locator("#tutorial-steps > li")).toHaveCount(6)
  const details = section.locator("details")
  await details.locator("summary").focus()
  await page.keyboard.press("Enter")
  await expect(details).toHaveAttribute("open", "")
  await expect(
    section.getByText("Which format should I choose?", { exact: true })
  ).toBeVisible()
  await expect(
    section.getByRole("link", { name: "Read the step-by-step guide" })
  ).toHaveAttribute("href", "/blog/gif-webp-apng-or-video/")
})

/** Load a video file in the page and read what the browser's own decoder makes of it. */
async function playBack(page: Page, bytes: Buffer, type: string) {
  return page.evaluate(
    async ([data, mime]) => {
      const video = document.createElement("video")
      video.muted = true
      video.playsInline = true
      video.src = URL.createObjectURL(
        new Blob([new Uint8Array(data as number[])], { type: mime as string })
      )
      try {
        await new Promise((resolve, reject) => {
          video.onloadeddata = resolve
          video.onerror = () => reject(new Error("decode"))
        })
      } catch {
        return null
      }
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext("2d", { willReadFrequently: true })!
      // Where the red square's left edge is at a moment in time.
      const squareAt = async (time: number) => {
        await new Promise((resolve) => {
          video.onseeked = resolve
          video.currentTime = time
        })
        // A seek is over before every browser has the picture to show:
        // WebKit on Linux draws nothing for a few frames more. Look again
        // for up to a second.
        for (let tries = 0; tries < 60; tries++) {
          context.drawImage(video, 0, 0)
          const row = context.getImageData(
            0,
            Math.floor(canvas.height / 2),
            canvas.width,
            1
          ).data
          for (let x = 0; x < canvas.width; x++)
            if (row[x * 4] > 150 && row[x * 4 + 1] < 110) return x
          await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        return -1
      }
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        start: await squareAt(0.05),
        later: await squareAt(0.85),
      }
    },
    [[...bytes], type] as const
  )
}

async function downloadNamed(page: Page, label: string) {
  await settled(page)
  const pending = page.waitForEvent("download")
  await page.getByRole("link", { name: label, exact: true }).click()
  const file = await pending
  return { name: file.suggestedFilename(), buffer: await bytesOf(file) }
}

const SCALE = 3
const BIG = [WIDTH * SCALE, HEIGHT * SCALE]

test("writes MP4 and WebM video, and turns a video back into an animation", async ({
  page,
  browserName,
}) => {
  await page.goto(ROUTE)
  // Video encoders are unreliable at thumbnail sizes, so the scene is drawn larger.
  await upload(
    page,
    await animation("gif", "walk.gif", { delay: 200, scale: SCALE })
  )
  await settled(page)
  const facts = page.getByTestId("facts")
  const clips: Record<string, Buffer> = {}
  for (const [label, extension, type] of [
    ["MP4", "mp4", "video/mp4"],
    ["WebM", "webm", "video/webm"],
  ] as const) {
    const option = chip(page, "Format", label)
    if (await option.isDisabled()) {
      // A browser that cannot write a format says so and does not offer it.
      await expect(page.getByText(/This browser cannot write/)).toBeVisible()
      continue
    }
    await option.click()
    const file = await downloadNamed(page, "Download video")
    expect(file.name).toBe(`walk.${extension}`)
    expect(file.buffer.length).toBeGreaterThan(500)
    clips[extension] = file.buffer
    await expect(facts).toContainText(
      `${label} · ${BIG[0]} × ${BIG[1]} · 6 frames · 1.2 s`
    )
    // Video has no transparency or loop count, and the page says so.
    await expect(
      page.getByText("A video file has no loop count; the player decides.")
    ).toBeVisible()
    // Playwright's Firefox build has no H.264 decoder for the video element.
    if (browserName === "firefox" && extension === "mp4") continue
    // Its WebKit build on Linux draws no frame of any video onto a canvas:
    // a clip loads with the right size and length, and comes out blank.
    if (browserName === "webkit" && process.platform === "linux") continue
    const played = await playBack(page, file.buffer, type)
    expect(played, label).not.toBeNull()
    expect([played!.width, played!.height], label).toEqual(BIG)
    expect(Math.abs(played!.duration - 1.2), label).toBeLessThan(0.15)
    // The square moves right as the clip plays: four scene pixels a frame, a frame every 0.2 s.
    expect(Math.abs(played!.start - 4 * SCALE), label).toBeLessThanOrEqual(3)
    expect(Math.abs(played!.later - 20 * SCALE), label).toBeLessThanOrEqual(3)
  }
  expect(Object.keys(clips).length).toBeGreaterThan(0)

  // The preview plays a video result in a video player.
  await expect(
    page.getByTestId("player-stage").locator("video")
  ).toHaveAttribute("aria-label", "The converted animation, playing")

  // Video in: the clip just written becomes an exact-frame APNG.
  const [extension, bytes] =
    Object.entries(clips)[Object.keys(clips).length - 1]
  await page.getByRole("button", { name: "Clear all" }).click()
  await upload(page, {
    name: `clip.${extension}`,
    mimeType: `video/${extension}`,
    buffer: bytes,
  })
  await expect(facts).toContainText(
    `Video · ${BIG[0]} × ${BIG[1]} · 6 frames · 1.2 s`
  )
  // A small, slow clip needs no gentler settings, so none are applied.
  await expect(page.getByTestId("tip")).toHaveCount(0)
  await chip(page, "Format", "APNG").click()
  await chip(page, "Quality", "Lossless").click()
  const back = await result(page, "apng")
  expect(back.name).toBe("clip.png")
  expect(back.frames).toHaveLength(6)
  expect(back.delays).toEqual([200, 200, 200, 200, 200, 200])
  back.frames.forEach((frame, index) =>
    expect(
      Math.abs(squareAt(frame, BIG[0], 24 * SCALE) - (4 + index * 4) * SCALE),
      `frame ${index}`
    ).toBeLessThanOrEqual(3)
  )

  // Trim works on video as it does on animations.
  const start = page.getByLabel("Start (s)")
  await start.fill("0.4")
  await start.press("Enter")
  const trimmed = await result(page, "apng")
  expect(trimmed.frames).toHaveLength(4)
  expect(
    Math.abs(squareAt(trimmed.frames[0], BIG[0], 24 * SCALE) - 12 * SCALE)
  ).toBeLessThanOrEqual(3)
})

test("starts fast, large video from gentler settings and says so", async ({
  page,
}) => {
  await page.goto(ROUTE)
  // 25 frames a second: faster than an animated image needs.
  await upload(
    page,
    await animation("gif", "fast.gif", { frames: 10, delay: 40, scale: SCALE })
  )
  await settled(page)
  const option = chip(page, "Format", "WebM")
  test.skip(await option.isDisabled(), "This browser cannot write WebM.")
  await option.click()
  const clip = await downloadNamed(page, "Download video")
  await page.getByRole("button", { name: "Clear all" }).click()
  await upload(page, {
    name: "fast.webm",
    mimeType: "video/webm",
    buffer: clip.buffer,
  })
  await expect(page.getByTestId("tip")).toContainText(
    "the frame rate is set to 15"
  )
  // The clip is small, so its size is left alone.
  await expect(page.getByTestId("tip")).not.toContainText("longest side")
  await expect(chip(page, "Frames per second", "15")).toBeChecked()
  await expect(chip(page, "Resize", "Original")).toBeChecked()
  await chip(page, "Format", "GIF").click()
  const gif = await result(page, "gif")
  expect(gif.frames).toHaveLength(6)
  expect(gif.delays.reduce((total, delay) => total + delay, 0)).toBe(400)
})

test("exports frames as images and as a sprite sheet", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await animation("apng", "walk.png"))
  const original = scene(6)
  await chip(page, "Format", "Frames").click()
  let file = await downloadNamed(page, "Download ZIP")
  expect(file.name).toBe("walk-frames.zip")
  let files = unzipSync(new Uint8Array(file.buffer))
  expect(Object.keys(files)).toEqual(
    [1, 2, 3, 4, 5, 6].map((number) => `frame-00${number}.png`)
  )
  for (const [index, name] of Object.keys(files).entries()) {
    const image = sharp(Buffer.from(files[name]))
    expect(await image.metadata()).toMatchObject({
      format: "png",
      width: WIDTH,
      height: HEIGHT,
    })
    expect(
      Buffer.compare(
        await image.ensureAlpha().raw().toBuffer(),
        original[index]
      )
    ).toBe(0)
  }
  await expect(page.getByTestId("facts")).toContainText(
    "Frames · 6 PNG images of 64 × 48"
  )
  await expect(page.getByText("Separate frames do not loop.")).toBeVisible()

  // Fewer, smaller JPEG frames.
  await chip(page, "Frame format", "JPEG").click()
  await chip(page, "Frames per second", "Custom").click()
  await page.getByLabel("Frames per second", { exact: true }).last().fill("6")
  file = await downloadNamed(page, "Download ZIP")
  files = unzipSync(new Uint8Array(file.buffer))
  expect(Object.keys(files)).toEqual([
    "frame-001.jpg",
    "frame-002.jpg",
    "frame-003.jpg",
  ])
  expect(
    (await sharp(Buffer.from(files["frame-002.jpg"])).metadata()).format
  ).toBe("jpeg")

  // One sheet, with CSS and JSON that agree with it.
  await chip(page, "Frames per second", "Original").click()
  await chip(page, "Format", "Sprite sheet").click()
  await chip(page, "Sheet format", "PNG").click()
  file = await downloadNamed(page, "Download ZIP")
  expect(file.name).toBe("walk-sprite.zip")
  files = unzipSync(new Uint8Array(file.buffer))
  expect(Object.keys(files)).toEqual([
    "sprite.png",
    "sprite.json",
    "sprite.css",
  ])
  const data = JSON.parse(Buffer.from(files["sprite.json"]).toString())
  const sheet = await rgbaOf(Buffer.from(files["sprite.png"]))
  expect([sheet.width, sheet.height]).toEqual([
    data.meta.size.w,
    data.meta.size.h,
  ])
  expect(data.frames).toHaveLength(6)
  data.frames.forEach(
    (
      entry: { frame: { x: number; y: number; w: number; h: number } },
      index: number
    ) => {
      expect([entry.frame.w, entry.frame.h]).toEqual([WIDTH, HEIGHT])
      // The red square sits where frame `index` has it.
      const at =
        ((entry.frame.y + 24) * sheet.width + entry.frame.x + 6 + index * 4) * 4
      expect([...sheet.data.subarray(at, at + 3)]).toEqual([220, 40, 40])
    }
  )
  const css = Buffer.from(files["sprite.css"]).toString()
  expect(css).toContain("width: 64px;")
  expect(css).toContain("sprite-play 0.48s step-end infinite;")
  await expect(page.getByTestId("facts")).toContainText("Sprite sheet · ")
})

async function rgbaOf(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** A still image of one flat colour. */
async function still(
  name: string,
  colour: number[],
  width = WIDTH,
  height = HEIGHT
) {
  return {
    name,
    mimeType: "image/png",
    buffer: await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: colour[0], g: colour[1], b: colour[2] },
      },
    })
      .png()
      .toBuffer(),
  }
}

test("builds an animation from still images", async ({ page }) => {
  await page.goto(ROUTE)
  const RED = [200, 30, 30]
  const GREEN = [30, 160, 60]
  const BLUE = [30, 60, 200]
  // Dropped out of order; they are sorted by name.
  await upload(
    page,
    await still("shot-2.png", GREEN),
    await still("shot-10.png", BLUE, 32, 32),
    await still("shot-1.png", RED)
  )
  const rows = page.getByTestId("queue-item")
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText("3 images")
  await chip(page, "Format", "APNG").click()
  await chip(page, "Quality", "Lossless").click()
  const colourOf = (frame: Buffer, x = 2, y = 2) => [
    ...frame.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 3),
  ]
  let file = await result(page, "apng")
  expect(file.name).toBe("animation.png")
  expect([file.width, file.height]).toEqual([WIDTH, HEIGHT])
  expect(file.delays).toEqual([200, 200, 200])
  expect(colourOf(file.frames[0])).toEqual(RED)
  expect(colourOf(file.frames[1])).toEqual(GREEN)
  // The square third image is fitted inside the first one's shape and centred.
  expect(file.frames[2][3]).toBe(0)
  // Resampling may round a colour by one level.
  const close = (colour: number[], wanted: number[]) =>
    colour.every((value, channel) => Math.abs(value - wanted[channel]) <= 2)
  expect(close(colourOf(file.frames[2], 32, 24), BLUE)).toBe(true)
  await expect(page.getByTestId("facts")).toContainText(
    "3 images · 64 × 48 · 0.6 s"
  )

  const list = page.getByTestId("frame-list")
  await expect(list.getByRole("listitem")).toHaveCount(3)
  await expect(list.getByRole("listitem").first()).toContainText("shot-1.png")

  // The same time for every frame, then a different time for one.
  await chip(page, "Show every frame for", "0.5 s").click()
  const second = list.getByLabel("Seconds for frame 2")
  await second.fill("0.08")
  await second.press("Enter")
  file = await result(page, "apng")
  expect(file.delays).toEqual([500, 80, 500])

  // Reorder, duplicate and remove.
  await list.getByRole("button", { name: "Move frame 3 earlier" }).click()
  await expect(list.getByRole("listitem").nth(1)).toContainText("shot-10.png")
  await list.getByRole("button", { name: "Duplicate frame 1" }).click()
  await expect(list.getByRole("listitem")).toHaveCount(4)
  await list.getByRole("button", { name: "Remove frame 4" }).click()
  file = await result(page, "apng")
  expect(file.frames).toHaveLength(2)
  // Two identical frames in a row are stored once and shown for both their times.
  expect(file.delays).toEqual([1000, 500])
  expect(colourOf(file.frames[0])).toEqual(RED)
  expect(close(colourOf(file.frames[1], 32, 24), BLUE)).toBe(true)
  await expect(
    list.getByRole("button", { name: "Move frame 1 earlier" })
  ).toBeDisabled()

  // One more image added while this animation is selected joins it.
  await page
    .getByLabel("Add images as frames")
    .setInputFiles(await still("shot-3.png", GREEN))
  await expect(list.getByRole("listitem")).toHaveCount(4)
  await expect(rows).toHaveCount(1)
  file = await result(page, "apng")
  expect(file.frames).toHaveLength(3)
  expect(colourOf(file.frames[2])).toEqual(GREEN)

  // The paused preview steps through the images; a frame can be saved on its own.
  await page.getByRole("button", { name: "Pause" }).click()
  await page.getByRole("slider", { name: "Position", exact: true }).fill("0")
  await page.getByRole("button", { name: "Next frame" }).click()
  await expect(page.getByTestId("player-time")).toContainText("frame 2 of 4")
  await expect(
    page.getByRole("button", { name: "Save this frame" })
  ).toBeEnabled()
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Save this frame" }).click()
  const saved = await pending
  expect(saved.suggestedFilename()).toBe("animation-frame-002.png")
  const frame = await rgbaOf(await bytesOf(saved))
  expect([frame.width, frame.height]).toEqual([WIDTH, HEIGHT])
  expect([...frame.data.subarray(0, 3)]).toEqual(RED)

  // The frame list is labelled for assistive technology and fits a narrow phone.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(results.violations).toEqual([])
  const size = page.viewportSize()!
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.setViewportSize(size)

  // Built animations also become GIF or video like any other.
  await chip(page, "Format", "GIF").click()
  const gif = await result(page, "gif")
  expect(gif.name).toBe("animation.gif")
  expect(gif.frames).toHaveLength(3)
})

test("fits a file under a size limit and says what it changed", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(page.getByTestId("queue-item")).toHaveCount(2)
  await page.getByRole("button", { name: "Remove keepsimp-pulse.webp" }).click()
  await chip(page, "Format", "GIF").click()
  const free = await result(page, "gif")
  expect(free.buffer.length).toBeGreaterThan(300_000)

  await chip(page, "Largest file", "128 KB").click()
  const fitted = await result(page, "gif")
  expect(fitted.buffer.length).toBeLessThanOrEqual(128_000)
  // Still the whole animation: the same length, just lighter.
  expect(fitted.delays.reduce((total, delay) => total + delay, 0)).toBe(1600)
  await expect(page.getByText(/^To fit under 128 KB: /)).toBeVisible()

  // A custom limit, typed in.
  await chip(page, "Largest file", "Custom").click()
  const field = page.getByLabel("Largest file (MB)")
  await expect(field).toHaveValue("2")
  await chip(page, "Unit", "KB").click()
  const kilobytes = page.getByLabel("Largest file (KB)")
  await kilobytes.fill("200")
  await kilobytes.press("Enter")
  const custom = await result(page, "gif")
  expect(custom.buffer.length).toBeLessThanOrEqual(200_000)
  expect(custom.buffer.length).toBeGreaterThan(fitted.buffer.length)

  // With no limit the file is as it was.
  await chip(page, "Largest file", "No limit").click()
  expect((await result(page, "gif")).buffer.length).toBe(free.buffer.length)
})

test("destination presets set the format, size and limit, with their sources", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await animation("gif", "wave.gif", { scale: SCALE }))
  await settled(page)
  const destination = page.getByTestId("destination")

  // An exact canvas: the 192 × 144 picture is enlarged to fit 320 wide and centred.
  await chip(page, "Destination", "Discord sticker").click()
  await expect(chip(page, "Format", "APNG")).toBeChecked()
  await expect(chip(page, "Resize", "Exact size")).toBeChecked()
  await expect(page.getByLabel("Height (px)")).toHaveValue("320")
  await expect(chip(page, "Largest file", "512 KB")).toBeChecked()
  await expect(destination).toContainText("exactly 320 × 320 px")
  await expect(destination).toContainText("Checked October 2026")
  await expect(
    destination.getByRole("link", { name: /Discord support/ })
  ).toHaveAttribute(
    "href",
    "https://support.discord.com/hc/articles/4402687377815"
  )
  const sticker = await result(page, "apng")
  expect([sticker.width, sticker.height]).toEqual([320, 320])
  expect(sticker.buffer.length).toBeLessThanOrEqual(512_000)
  // Clear above and below the picture, solid inside it.
  expect(sticker.frames[0][3]).toBe(0)
  expect(sticker.frames[0][(160 * 320 + 160) * 4 + 3]).toBe(255)

  // A size to stay within: a smaller animation is not enlarged.
  await chip(page, "Destination", "X (Twitter) GIF").click()
  await expect(chip(page, "Format", "GIF")).toBeChecked()
  await expect(
    page.getByRole("switch", { name: "Enlarge smaller animations" })
  ).not.toBeChecked()
  const posted = await result(page, "gif")
  expect([posted.width, posted.height]).toEqual(BIG)

  await chip(page, "Destination", "Discord emoji").click()
  const emoji = await result(page, "gif")
  expect([emoji.width, emoji.height]).toEqual([128, 96])
  expect(emoji.buffer.length).toBeLessThanOrEqual(256 * 1024)

  // A figure the service does not publish is labelled as reported.
  await chip(page, "Destination", "Slack emoji").click()
  await expect(destination).toContainText("Reported by:")
  await expect(destination).toContainText("Slack does not publish the figure")

  // Changing one of its settings by hand leaves the preset.
  await chip(page, "Format", "WebP").click()
  await expect(chip(page, "Destination", "Anywhere")).toBeChecked()
  await expect(destination).toHaveCount(0)

  // "Anywhere" lifts the limits and the size.
  await chip(page, "Destination", "Slack emoji").click()
  await chip(page, "Destination", "Anywhere").click()
  await expect(chip(page, "Largest file", "No limit")).toBeChecked()
  await expect(chip(page, "Resize", "Original")).toBeChecked()

  const telegram = chip(page, "Destination", "Telegram video sticker")
  await telegram.click()
  if (await chip(page, "Format", "WebM").isDisabled()) return
  await expect(chip(page, "Longest result", "3 s")).toBeChecked()
  await expect(chip(page, "Frames per second", "30")).toBeChecked()
  const clip = await downloadNamed(page, "Download video")
  expect(clip.name).toBe("wave.webm")
  expect(clip.buffer.length).toBeLessThanOrEqual(256_000)
})

test("limits length, crops to a shape and compares formats", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await animation("apng", "walk.png", { scale: SCALE }))
  await chip(page, "Format", "APNG").click()
  await chip(page, "Quality", "Lossless").click()
  await settled(page)

  // Six frames of 80 ms; a quarter of a second keeps three and a bit.
  await chip(page, "Longest result", "Custom").click()
  await page.getByLabel("Longest result (s)").fill("0.24")
  let file = await result(page, "apng")
  expect(file.delays).toEqual([80, 80, 80])
  await chip(page, "Longest result", "No limit").click()

  // Crop to a square: the middle of the picture.
  await page.getByRole("button", { name: "Crop", exact: true }).click()
  await expect(page.getByTestId("crop-mode")).toBeVisible()
  await chip(page, "Shape", "1:1").click()
  const box = page.getByTestId("crop-box")
  await expect(box).toHaveAttribute("aria-label", /144 by 144 pixels/)
  // The crop box moves with the arrow keys.
  await box.focus()
  await page.keyboard.press("Shift+ArrowLeft")
  await page.getByRole("button", { name: "Done" }).click()
  await expect(page.getByTestId("crop-note")).toContainText(
    "Cropped to 144 × 144 px"
  )
  file = await result(page, "apng")
  expect([file.width, file.height]).toEqual([144, 144])
  expect(file.frames).toHaveLength(6)
  // The crop started 24 px in and moved 10 px left, so the square sits 14 px further left.
  expect(squareAt(file.frames[1], 144, 72)).toBe(8 * SCALE - 14)

  // Turning the picture turns the crop with it; the result stays square.
  await page.getByRole("button", { name: "Rotate right" }).click()
  file = await result(page, "apng")
  expect([file.width, file.height]).toEqual([144, 144])
  await page.getByRole("button", { name: "Rotate left" }).click()

  // Compare formats at these settings, smallest first.
  await page.getByRole("button", { name: "Compare formats" }).click()
  const table = page.getByTestId("comparison")
  await expect(table).toBeVisible({ timeout: 120_000 })
  const formats = await table.locator("tbody th").allInnerTexts()
  const offered: string[] = []
  for (const label of ["GIF", "WebP", "APNG", "MP4", "WebM"])
    if (!(await chip(page, "Format", label).isDisabled())) offered.push(label)
  expect(formats.map((text) => text.split("\n")[0]).sort()).toEqual(
    [...offered].sort()
  )
  expect(formats[0]).toContain("Smallest")
  // The APNG row is the file that is already made, to the byte.
  const row = table.locator("tbody tr").filter({ hasText: "APNG" })
  await expect(row.getByRole("button", { name: "Use APNG" })).toBeDisabled()
  const sizes = (
    await table.locator("tbody td:nth-child(2)").allInnerTexts()
  ).map((text) => text.split("\n")[0])
  const bytes = (text: string) =>
    Number(text.replace(/[^0-9.]/g, "")) *
    (text.includes("MB") ? 1048576 : text.includes("KB") ? 1024 : 1)
  expect(sizes.map(bytes)).toEqual([...sizes.map(bytes)].sort((a, b) => a - b))
  await table.getByRole("button", { name: "Use WebP" }).click()
  await expect(chip(page, "Format", "WebP")).toBeChecked()

  // Reset removes the crop.
  await page.getByRole("button", { name: "Change the crop" }).click()
  await page.getByRole("button", { name: "Reset" }).click()
  await page.getByRole("button", { name: "Done" }).click()
  await expect(page.getByTestId("crop-note")).toHaveCount(0)
  const whole = await result(page, "webp")
  expect([whole.width, whole.height]).toEqual(BIG)
})
