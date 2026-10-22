import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { readPdf } from "@/tests/pdf-reader"
import { hand, ran, ready, run, saved } from "./agent"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-agent-image-"))

/** A photo-like JPEG of `width` by `height`, made by FFmpeg. */
function photo(name: string, width = 1200, height = 800) {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=s=${width}x${height}`,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    path,
  ])
  return readFileSync(path)
}

/** What FFprobe says of a file the tools made. */
async function probed(page: Page, id: string) {
  const file = await saved(page, id)
  const path = join(folder, file.name)
  writeFileSync(path, file.bytes)
  const info = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_name,width,height,nb_read_frames",
      "-of",
      "json",
      path,
    ]).toString()
  ) as {
    streams: {
      codec_name: string
      width: number
      height: number
      nb_read_frames?: string
    }[]
  }
  return { name: file.name, bytes: file.bytes, stream: info.streams[0] }
}

test("reads, compresses and resizes images with the tools' own engines", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await ready(page)
  const jpeg = photo("photo.jpg")
  const id = await hand(page, "photo.jpg", jpeg, "image/jpeg")

  const info = await ran(page, "image_info", { file: id })
  expect(info.data).toMatchObject({
    format: "jpeg",
    width: 1200,
    height: 800,
    transparent: false,
    animated: false,
  })

  const webp = await ran(page, "compress_image", {
    file: id,
    format: "webp",
    longEdge: 600,
  })
  expect(webp.summary).toMatch(/smaller\) as WebP, 600 by 400 pixels\./)
  const small = await probed(page, webp.files![0].id)
  expect(small.name).toBe("photo-keepsimp.webp")
  expect([
    small.stream.codec_name,
    small.stream.width,
    small.stream.height,
  ]).toEqual(["webp", 600, 400])

  const fitted = await ran(page, "compress_image", {
    file: id,
    targetKilobytes: 40,
  })
  expect(
    (await saved(page, fitted.files![0].id)).bytes.length
  ).toBeLessThanOrEqual(40 * 1024)

  const resized = await ran(page, "resize_image", {
    files: [id],
    width: 300,
    height: 300,
    fit: "cover",
    format: "png",
  })
  const square = await probed(page, resized.files![0].id)
  expect([
    square.stream.codec_name,
    square.stream.width,
    square.stream.height,
  ]).toEqual(["png", 300, 300])

  const set = await ran(page, "resize_image", {
    files: [id],
    widths: [320, 640],
  })
  expect(set.files!.map((file) => file.name)).toEqual([
    "photo-320w.jpg",
    "photo-640w.jpg",
  ])

  const preset = await ran(page, "resize_image", {
    files: [id],
    preset: "youtube-thumbnail",
  })
  const thumb = await probed(page, preset.files![0].id)
  expect([thumb.stream.width, thumb.stream.height]).toEqual([1280, 720])

  expect(await run(page, "resize_image", { files: [id] })).toEqual({
    ok: false,
    problem: expect.stringContaining("Say how to resize"),
  })
})

test("converts images, and puts several into one PDF", async ({ page }) => {
  test.setTimeout(180_000)
  await ready(page)
  const one = await hand(
    page,
    "one.jpg",
    photo("one.jpg", 400, 300),
    "image/jpeg"
  )
  const two = await hand(
    page,
    "two.jpg",
    photo("two.jpg", 300, 400),
    "image/jpeg"
  )
  const avif = await ran(page, "convert_image", {
    files: [one],
    to: "avif",
    maxSide: 200,
  })
  const made = await probed(page, avif.files![0].id)
  expect(made.name).toBe("one.avif")
  expect([made.stream.width, made.stream.height]).toEqual([200, 150])

  const pdf = await ran(page, "convert_image", {
    files: [one, two],
    to: "pdf",
    onePdf: true,
  })
  expect(pdf.summary).toBe("Made one PDF of 2 pages, one image to a page.")
  const read = await readPdf(
    new Uint8Array((await saved(page, pdf.files![0].id)).bytes)
  )
  expect(read.pages.map((each) => each.pictures)).toEqual([1, 1])
})

test("converts a video and an animation, and builds one from stills", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await ready(page)
  const clip = await hand(
    page,
    "clip.mp4",
    readFileSync("public/samples/keepsimp-clip.mp4"),
    "video/mp4"
  )
  const gif = await ran(page, "convert_animation", {
    files: [clip],
    to: "gif",
    end: 2,
  })
  expect(gif.summary).toMatch(
    /^Made GIF: \d+ by \d+ pixels, \d+ frames, 2\.0 s/
  )
  const gifFile = await probed(page, gif.files![0].id)
  expect(gifFile.stream.codec_name).toBe("gif")
  // A video is brought to at most 640 pixels and 15 frames a second.
  expect(
    Math.max(gifFile.stream.width, gifFile.stream.height)
  ).toBeLessThanOrEqual(640)
  expect(Number(gifFile.stream.nb_read_frames)).toBeLessThanOrEqual(31)

  const again = await hand(page, "clip.gif", gifFile.bytes, "image/gif")
  const webp = await ran(page, "convert_animation", {
    files: [again],
    to: "webp",
    width: 160,
    speed: 2,
  })
  // Not every FFprobe reads animated WebP: its size is read from its own header.
  const webpBytes = (await saved(page, webp.files![0].id)).bytes
  expect(webpBytes.subarray(12, 16).toString()).toBe("VP8X")
  expect(webpBytes.readUIntLE(24, 3) + 1).toBe(160)
  expect(webp.data).toMatchObject({ seconds: expect.closeTo(1, 0) })

  const stills = await Promise.all(
    ["a", "b", "c"].map((letter) =>
      hand(
        page,
        `${letter}.jpg`,
        photo(`${letter}.jpg`, 320, 240),
        "image/jpeg"
      )
    )
  )
  const built = await ran(page, "convert_animation", {
    files: stills,
    to: "mp4",
    frameMs: 500,
  })
  expect(built.summary).toMatch(/3 frames, 1\.5 s/)
  expect((await probed(page, built.files![0].id)).stream.codec_name).toMatch(
    /h264|vp9|vp8|av1/
  )
})

test("uses every setting of the image pages: crops, turns, print sizes, several formats, effects and a logo", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await ready(page)
  const id = await hand(
    page,
    "photo.jpg",
    photo("settings.jpg", 1200, 800),
    "image/jpeg"
  )

  // Turned a quarter, then the largest 1:1 box of its middle, as WebP.
  const square = await ran(page, "compress_image", {
    file: id,
    rotate: 90,
    aspect: "1:1",
    format: "webp",
  })
  const squareFile = await probed(page, square.files![0].id)
  expect([squareFile.stream.width, squareFile.stream.height]).toEqual([
    800, 800,
  ])
  // A box of its own, and half its size.
  const boxed = await ran(page, "compress_image", {
    file: id,
    crop: { x: 100, y: 100, width: 400, height: 300 },
    width: 50,
    unit: "percent",
  })
  const boxedFile = await probed(page, boxed.files![0].id)
  expect([boxedFile.stream.width, boxedFile.stream.height]).toEqual([200, 150])

  // Two inches wide at 150 dpi, turned upside down: 300 pixels.
  const print = await ran(page, "resize_image", {
    files: [id],
    width: 2,
    unit: "in",
    dpi: 150,
    rotate: 180,
  })
  const printFile = await probed(page, print.files![0].id)
  expect(printFile.stream.width).toBe(300)

  // One image, three formats at once.
  const three = await ran(page, "convert_image", {
    files: [id],
    to: "png",
    alsoTo: ["webp", "avif"],
    maxSide: 300,
  })
  expect(three.files!.map((file) => file.name.split(".").pop()).sort()).toEqual(
    ["avif", "png", "webp"]
  )

  // An animation with a logo on every frame, a filter, a caption and a crop.
  const clip = await hand(
    page,
    "clip.mp4",
    readFileSync("public/samples/keepsimp-clip.mp4"),
    "video/mp4"
  )
  const logo = await hand(
    page,
    "logo.png",
    photo("logo.png", 64, 64),
    "image/png"
  )
  const animated = await ran(page, "convert_animation", {
    files: [clip],
    to: "gif",
    end: 1,
    crop: { x: 0, y: 0, width: 200, height: 100 },
    filter: "greyscale",
    captionBottom: "Hello",
    captionSize: "large",
    logo,
    logoCorner: "top-right",
  })
  const animatedFile = await probed(page, animated.files![0].id)
  expect(animatedFile.stream.codec_name).toBe("gif")
  expect([animatedFile.stream.width, animatedFile.stream.height]).toEqual([
    200, 100,
  ])
})
