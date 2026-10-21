import { describe, expect, it } from "vitest"
import { FakeCompressor, FakePool } from "@/tests/agent-image-fake"
import type { ResizerResponse } from "@/lib/image-resizer/protocol"
import type { ConverterResponse } from "@/lib/image-converter/protocol"
import type { AnimationResponse } from "@/lib/animation/protocol"
import { Agent } from "./agent"
import { animationTools, type AnimationJob } from "./animation"
import { CompressorEngine } from "./image-engines"
import { imageTools, type ConvertJob, type ResizeJob } from "./image"
import { PoolJobs } from "./pool-jobs"

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0)
const PNG = Uint8Array.of(
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10,
  0,
  0,
  0,
  13,
  73,
  72,
  68,
  82
)
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
)
const MP4 = Uint8Array.of(0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109)
const GIF = new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000")

function setup() {
  let compressor!: FakeCompressor
  let resizer!: FakePool<ResizeJob, ResizerResponse>
  let converter!: FakePool<ConvertJob, ConverterResponse>
  let animation!: FakePool<AnimationJob, AnimationResponse>
  const rasterised: Blob[] = []
  const images = {
    compressor: new CompressorEngine(
      (listener) => (compressor = new FakeCompressor(listener))
    ),
    resizer: new PoolJobs<ResizeJob, ResizerResponse>(
      (listener, next) =>
        (resizer = new FakePool(listener, next, (job) =>
          job.settings.width === "999"
            ? [
                {
                  type: "error",
                  id: job.id,
                  key: job.key,
                  message: "Enter a width above zero.",
                },
              ]
            : [
                {
                  type: "done",
                  id: job.id,
                  key: job.key,
                  usedFocus: { x: 0.5, y: 0.5 },
                  outputs: (job.settings.multi
                    ? job.settings.widths
                    : [Number(job.settings.width) || 300]
                  ).map((width) => ({
                    bytes: new ArrayBuffer(10),
                    format:
                      job.settings.format === "original"
                        ? "jpeg"
                        : job.settings.format,
                    width,
                    height: Math.round(width / 2),
                    similarity: 1,
                  })),
                },
              ]
        )),
      "resize"
    ),
    converter: new PoolJobs<ConvertJob, ConverterResponse>(
      (listener, next) =>
        (converter = new FakePool<ConvertJob, ConverterResponse>(
          listener,
          next,
          (job) => [
            {
              type: "done",
              id: job.id,
              key: job.key,
              outputs: [
                {
                  target: job.settings.target,
                  bytes: new ArrayBuffer(20),
                  width: 40,
                  height: 30,
                  similarity: null,
                  ...(job.settings.target === "pdf"
                    ? {
                        page: {
                          kind: "flate" as const,
                          data: Uint8Array.of(120, 156, 3, 0, 0, 0, 0, 1),
                          width: 1,
                          height: 1,
                        },
                      }
                    : {}),
                },
              ],
            },
          ]
        )),
      "convert"
    ),
    rasterise: async (file: Blob) => {
      rasterised.push(file)
      return { data: new Uint8ClampedArray(4), width: 1, height: 1 }
    },
  }
  const animations = new PoolJobs<AnimationJob, AnimationResponse>(
    (listener, next) =>
      (animation = new FakePool<AnimationJob, AnimationResponse>(
        listener,
        next,
        (job) => [
          { type: "progress", id: job.id, label: "Encoding frames" },
          { type: "opened", id: job.id } as never,
          {
            type: "done",
            id: job.id,
            key: job.key,
            output: {
              target: job.settings.target,
              bytes: new ArrayBuffer(30),
              width: 320,
              height: 240,
              frames: 12,
              duration: 1500,
              plays: 0,
              note: job.settings.sizeLimit ? "Fitted under the size." : null,
            },
          },
        ]
      )),
    "animation"
  )
  const agent = new Agent([
    ...imageTools(images),
    ...animationTools(animations),
  ])
  const add = (bytes: Uint8Array, name: string, type = "") =>
    agent.files.add(new Blob([bytes as BlobPart], { type }), name).id
  const call = (name: string, input: unknown) =>
    agent.call(name, input, { caller: "page" })
  return {
    agent,
    add,
    call,
    rasterised,
    compressor: () => compressor,
    resizer: () => resizer,
    converter: () => converter,
    animation: () => animation,
  }
}

describe("image_info", () => {
  it("reads an image's format and size, drawing an SVG first", async () => {
    const { add, call, rasterised, compressor } = setup()
    const info = await call("image_info", { file: add(JPEG, "a.jpg") })
    expect(info.summary).toBe("a.jpg: JPEG, 400 by 300 pixels, 11 B.")
    expect(info.data).toMatchObject({
      format: "jpeg",
      width: 400,
      height: 300,
      transparent: false,
      animated: false,
    })
    compressor().transparent = true
    const svg = await call("image_info", { file: add(SVG, "a.svg") })
    expect(svg.summary).toMatch(/^a\.svg: SVG, .*, with transparency\.$/)
    expect(rasterised).toHaveLength(1)
    expect(compressor().opens[1].pixels).toBeTruthy()
    await expect(
      call("image_info", {
        file: add(new TextEncoder().encode("hello"), "a.txt"),
      })
    ).rejects.toThrow(/^a\.txt: Choose a JPEG/)
    // An animated WebP says so; what the worker says unasked is let be.
    compressor().emit({ type: "progress", id: 99, label: "unasked" })
    const webp = Uint8Array.of(
      82,
      73,
      70,
      70,
      30,
      0,
      0,
      0,
      87,
      69,
      66,
      80,
      86,
      80,
      56,
      88,
      10,
      0,
      0,
      0,
      2,
      0,
      0,
      0
    )
    expect(
      (await call("image_info", { file: add(webp, "a.webp") })).summary
    ).toMatch(/, animated\.$/)
    compressor().openProblem = "The image is damaged."
    await expect(
      call("image_info", { file: add(PNG, "b.png") })
    ).rejects.toThrow("The image is damaged.")
  })
})

describe("compress_image", () => {
  it("compresses as the compressor's page would, with what is asked laid over it", async () => {
    const { add, call, compressor } = setup()
    const id = add(
      new Uint8Array([...JPEG, ...new Uint8Array(1000)]),
      "photo.jpg"
    )
    const done = await call("compress_image", {
      file: id,
      format: "webp",
      longEdge: 200,
      effort: "max",
      background: "#000000",
    })
    expect(done.summary).toBe(
      "1011 B became 100 B (90% smaller) as WebP, 200 by 150 pixels."
    )
    expect(done.files![0].name).toBe("photo-keepsimp.webp")
    const request = compressor().compressions[0]
    expect(request).toMatchObject({
      candidates: ["webp"],
      compression: "smart",
      effort: "max",
      background: [0, 0, 0],
      targetBytes: null,
    })
    expect(request.plan.output).toEqual({ width: 200, height: 150 })
    await call("compress_image", { file: id, quality: 40 })
    expect(compressor().compressions[1]).toMatchObject({
      compression: "custom",
      quality: 40,
    })
    await call("compress_image", { file: id, compression: "lossless" })
    expect(compressor().compressions[2]).toMatchObject({
      compression: "lossless",
    })
    await expect(
      call("compress_image", { file: id, compression: "high", quality: 50 })
    ).rejects.toThrow('A quality is for compression "custom".')
  })

  it("fits a size, saying when it could not or had to shrink", async () => {
    const { add, call, compressor } = setup()
    const id = add(
      new Uint8Array([...JPEG, ...new Uint8Array(5000)]),
      "big.jpg"
    )
    compressor().result = { bytes: 3000, fits: false, downscaled: true }
    const done = await call("compress_image", { file: id, targetKilobytes: 2 })
    expect(compressor().compressions[0]).toMatchObject({
      compression: "target",
      targetBytes: 2048,
    })
    expect(done.summary).toMatch(
      /It could not get under 2 KB\. It was made smaller in pixels to fit\.$/
    )
    expect(done.data).toMatchObject({ fits: false, downscaled: true })
  })

  it("makes nothing when the original is already smaller, and passes problems on", async () => {
    const { add, call, compressor } = setup()
    const id = add(JPEG, "tiny.jpg")
    compressor().result = { bytes: 5000 }
    const kept = await call("compress_image", { file: id })
    expect(kept.files).toBeUndefined()
    expect(kept.summary).toBe(
      "tiny.jpg is already smaller as it is (11 B); nothing was made."
    )
    compressor().result = { problem: "The encoder failed." }
    await expect(call("compress_image", { file: id })).rejects.toThrow(
      "The encoder failed."
    )
    compressor().width = 0
    await expect(call("compress_image", { file: id })).rejects.toThrow()
  })

  it("stops, and starts a fresh worker for the next image", async () => {
    const { add, agent, call, compressor } = setup()
    const id = add(JPEG, "a.jpg")
    compressor().hold = true
    const running = agent.call(
      "compress_image",
      { file: id },
      { caller: "page", id: "c" }
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    agent.stop("c")
    await expect(running).rejects.toThrow("Stopped")
    expect(compressor().disposed).toBe(1)
    compressor().hold = false
    expect((await call("image_info", { file: id })).data).toMatchObject({
      width: 400,
    })
  })
})

describe("the compressor's turns", () => {
  it("lets a job stopped while it waits go without opening it", async () => {
    const { add, agent, compressor } = setup()
    const id = add(JPEG, "a.jpg")
    compressor().hold = true
    const first = agent.call(
      "compress_image",
      { file: id },
      { caller: "page", id: "one" }
    )
    const second = agent.call(
      "compress_image",
      { file: id },
      { caller: "page", id: "two" }
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    agent.stop("two")
    agent.stop("one")
    await expect(first).rejects.toThrow("Stopped")
    await expect(second).rejects.toThrow("Stopped")
    expect(compressor().opens).toHaveLength(1)
  })
})

describe("resize_image", () => {
  it("resizes by each way the resizer offers, naming files by the pattern", async () => {
    const { add, call, resizer } = setup()
    const one = add(JPEG, "photo.jpg")
    const two = add(JPEG, "photo.jpg")
    const done = await call("resize_image", {
      files: [one, two],
      width: 300,
      height: 300,
      fit: "contain",
      format: "png",
      background: "#112233",
    })
    expect(done.summary).toBe(
      "Resized 2 images into 2 files: 300×150, 300×150."
    )
    expect(done.files!.map((file) => file.name)).toEqual([
      "photo-300x150.png",
      "photo-300x150-2.png",
    ])
    expect(resizer().jobs[0].settings).toMatchObject({
      mode: "dimensions",
      width: "300",
      height: "300",
      fit: "contain",
      background: "custom",
      backgroundColor: "#112233",
    })
    await call("resize_image", { files: [one], preset: "youtube-thumbnail" })
    expect(resizer().jobs[2].settings).toMatchObject({
      mode: "preset",
      presetId: "youtube-thumbnail",
      presetGroup: "social",
    })
    const set = await call("resize_image", {
      files: [one],
      widths: [320, 640, 960, 1280, 1600, 1920, 2560],
    })
    expect(set.files!.map((file) => file.name)[0]).toBe("photo-320w.jpg")
    expect(set.summary).toMatch(/…\.$/)
    expect(resizer().jobs[3].settings).toMatchObject({
      mode: "width",
      width: "320",
      multi: true,
    })
    await call("resize_image", {
      files: [one],
      mode: "longest",
      side: 800,
      quality: "high",
      background: "blur",
      enlarge: false,
    })
    expect(resizer().jobs[4].settings).toMatchObject({
      mode: "longest",
      side: "800",
      quality: "high",
      background: "blur",
      enlarge: false,
    })
    await call("resize_image", {
      files: [one],
      mode: "percent",
      percent: 50,
      customQuality: 60,
      height: 100,
    })
    expect(resizer().jobs[5].settings).toMatchObject({
      mode: "percent",
      percent: "50",
      quality: "custom",
      customQuality: 60,
      height: "100",
    })
    await call("resize_image", {
      files: [one],
      mode: "megapixels",
      megapixels: 2,
      widths: [100],
      height: 50,
    })
    expect(resizer().jobs[6].settings).toMatchObject({
      width: "",
      height: "50",
    })
  })

  it("says what is missing or wrong", async () => {
    const { add, call } = setup()
    const id = add(JPEG, "a.jpg")
    await expect(call("resize_image", { files: [id] })).rejects.toThrow(
      /^Say how to resize/
    )
    await expect(
      call("resize_image", { files: [id], width: 10, background: "pink" })
    ).rejects.toThrow(
      '"pink" is not a background: transparent, white, black, blur or #rrggbb.'
    )
    await expect(
      call("resize_image", { files: [id], width: 999 })
    ).rejects.toThrow("Enter a width above zero.")
  })
})

describe("convert_image", () => {
  it("converts each image, or makes one PDF of them all", async () => {
    const { add, call, converter, rasterised } = setup()
    const one = add(JPEG, "one.jpg")
    const two = add(SVG, "two.svg")
    const done = await call("convert_image", {
      files: [one, two],
      to: "avif",
      maxSide: 200,
      greyscale: true,
      customQuality: 70,
      background: "#ffffff",
    })
    expect(done.summary).toBe("Converted 2 images to AVIF.")
    expect(done.files!.map((file) => file.name)).toEqual([
      "one.avif",
      "two.avif",
    ])
    expect(rasterised).toHaveLength(1)
    expect(converter().jobs[0].settings).toMatchObject({
      target: "avif",
      limit: "custom",
      customLimit: "200",
      greyscale: true,
      quality: "custom",
      customQuality: 70,
      background: "custom",
    })
    const pdf = await call("convert_image", {
      files: [one, two],
      to: "pdf",
      onePdf: true,
      pdfPage: "a4",
      pdfMargin: "none",
    })
    expect(pdf.summary).toBe("Made one PDF of 2 pages, one image to a page.")
    expect(pdf.files![0].name).toBe("one-and-more.pdf")
    const single = await call("convert_image", {
      files: [one],
      to: "pdf",
      onePdf: true,
    })
    expect(single.files![0].name).toBe("one.pdf")
    await call("convert_image", {
      files: [one],
      to: "ico",
      icoSizes: [16],
      gifColours: 16,
      quality: "lossless",
    })
    expect(converter().jobs.at(-1)!.settings).toMatchObject({
      icoSizes: [16],
      gifColours: 16,
      quality: "lossless",
    })
    await expect(
      call("convert_image", { files: [one], to: "png", onePdf: true })
    ).rejects.toThrow('onePdf is for "to": "pdf".')
  })
})

describe("convert_animation", () => {
  it("converts a video with the page's caps, and an animation as asked", async () => {
    const { add, call, animation } = setup()
    const clip = add(MP4, "clip.mp4")
    const done = await call("convert_animation", {
      files: [clip],
      to: "gif",
      start: 1,
      end: 3,
    })
    expect(done.summary).toBe(
      "Made GIF: 320 by 240 pixels, 12 frames, 1.5 s, 30 B."
    )
    expect(done.files![0].name).toBe("clip.gif")
    expect(animation().jobs[0]).toMatchObject({
      input: { kind: "file" },
      trim: { start: 1000, end: 3000 },
      settings: {
        target: "gif",
        fps: 15,
        resize: "longEdge",
        resizeValue: 640,
        enlarge: false,
      },
    })
    const gif = add(GIF, "a.gif")
    const sized = await call("convert_animation", {
      files: [gif],
      to: "webp",
      maxMegabytes: 1,
      loop: 3,
      reverse: true,
      boomerang: true,
      speed: 2,
      fps: 10,
      quality: "high",
      captionTop: "Hi",
      fadeIn: 1,
    })
    expect(sized.summary).toMatch(/Fitted under the size\.$/)
    expect(animation().jobs[1].settings).toMatchObject({
      fps: 10,
      loop: "count",
      loopCount: 3,
      reverse: true,
      boomerang: true,
      speed: 2,
      sizeLimit: 1048576,
      quality: "high",
      captionTop: "Hi",
      fadeIn: 1,
      resize: "original",
    })
    for (const [input, want] of [
      [
        { width: 100, height: 80 },
        { resize: "exact", resizeValue: 100, resizeHeight: 80 },
      ],
      [{ width: 100 }, { resize: "width", resizeValue: 100 }],
      [{ height: 80 }, { resize: "height", resizeValue: 80 }],
      [
        { longEdge: 300 },
        { resize: "longEdge", resizeValue: 300, enlarge: true },
      ],
      [
        { percent: 50, loop: "once", customQuality: 30 },
        { resize: "percent", resizeValue: 50, loop: "once", quality: "custom" },
      ],
      [
        { loop: "forever", maxSeconds: 4 },
        { loop: "forever", maxSeconds: 4 },
      ],
    ] as const) {
      await call("convert_animation", { files: [gif], to: "apng", ...input })
      expect(animation().jobs.at(-1)!.settings).toMatchObject(want)
    }
  })

  it("builds one animation from still images, each shown as long as asked", async () => {
    const { add, call, animation } = setup()
    const stills = [add(PNG, "1.png"), add(JPEG, "2.jpg")]
    const done = await call("convert_animation", {
      files: stills,
      to: "mp4",
      frameMs: 500,
    })
    expect(done.files![0].name).toBe("animation.mp4")
    expect(animation().jobs[0].input).toMatchObject({
      kind: "stills",
      durations: [500, 500],
    })
    await call("convert_animation", { files: stills, to: "gif" })
    expect(animation().jobs[1].input).toMatchObject({ durations: [200, 200] })
  })

  it("says what it cannot use", async () => {
    const { add, call } = setup()
    const gif = add(GIF, "a.gif")
    await expect(
      call("convert_animation", { files: [add(SVG, "a.svg")], to: "gif" })
    ).rejects.toThrow(/is an SVG, which cannot be a frame/)
    await expect(
      call("convert_animation", {
        files: [add(new TextEncoder().encode("hello"), "a.txt")],
        to: "gif",
      })
    ).rejects.toThrow("a.txt is not an animation, a video or an image.")
    await expect(
      call("convert_animation", { files: [gif, add(MP4, "b.mp4")], to: "gif" })
    ).rejects.toThrow(/only when each is a still image/)
    await expect(
      call("convert_animation", {
        files: [gif],
        to: "gif",
        width: 10,
        percent: 50,
      })
    ).rejects.toThrow(/one way of sizing/)
    await expect(
      call("convert_animation", { files: [gif], to: "gif", loop: "twice" })
    ).rejects.toThrow(/"loop" is "forever", "once"/)
    await expect(
      call("convert_animation", { files: [gif], to: "gif", loop: 1 })
    ).rejects.toThrow("Enter how many times to play, 2 or more.")
    await expect(
      call("convert_animation", { files: [gif], to: "gif", start: 3, end: 2 })
    ).rejects.toThrow('"end" must come after "start".')
    await call("convert_animation", { files: [gif], to: "gif", end: 2 })
  })
})
