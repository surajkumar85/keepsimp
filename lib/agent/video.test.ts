import { describe, expect, it } from "vitest"
import { FakePool } from "@/tests/agent-image-fake"
import type { VideoJob, VideoLevel, VideoResponse } from "@/lib/video/protocol"
import type { VideoFacts } from "@/lib/video/settings"
import { Agent } from "./agent"
import { PoolJobs } from "./pool-jobs"
import { kept, pngSize, videoTools } from "./video"

const MP4 = Uint8Array.of(
  0,
  0,
  0,
  24,
  0x66,
  0x74,
  0x79,
  0x70,
  0x69,
  0x73,
  0x6f,
  0x6d,
  0,
  0,
  0,
  0
)
const AVI = new TextEncoder().encode("RIFF\0\0\0\0AVI LIST")

const facts: VideoFacts = {
  container: "mp4",
  size: 16,
  duration: 6,
  video: {
    codec: "avc",
    width: 320,
    height: 180,
    rotation: 0,
    flip: false,
    frameRate: 15,
    variableRate: false,
    bitrate: 100_000,
    hdr: false,
    decodable: true,
  },
  audio: {
    codec: "aac",
    sampleRate: 44100,
    channels: 2,
    bitrate: 64_000,
    decodable: true,
  },
}

/** The start of a PNG of a size: its signature and header. */
function png(width: number, height: number) {
  const head = new Uint8Array(24)
  head.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  new DataView(head.buffer).setUint32(16, width)
  new DataView(head.buffer).setUint32(20, height)
  return new Blob([head], { type: "image/png" })
}

function setup({
  problems = [] as string[],
  canWrite = true,
  readFacts = facts,
  size = 1000,
  passes = 1,
  resized = null as { width: number; height: number } | null,
  level = null as VideoLevel | null,
  frame = png(320, 180),
} = {}) {
  let pool!: FakePool<VideoJob, VideoResponse>
  const videoPool = new PoolJobs<VideoJob, VideoResponse>(
    (listener, next) =>
      (pool = new FakePool<VideoJob, VideoResponse>(listener, next, (job) => {
        if (job.job === "join")
          return [
            { type: "retired", id: job.id } as never,
            { type: "progress", id: job.id, key: job.key, fraction: 0.5 },
            {
              type: "done",
              id: job.id,
              job: "join",
              key: job.key,
              file: new Blob([new Uint8Array(size)], { type: "video/x-test" }),
              scratch: null,
              written: {
                ...readFacts,
                duration: job.plan.length,
                container: job.plan.container,
              },
              problems,
              index: "front",
              copied: job.plan.copyable,
            },
          ]
        if (job.job === "read")
          return [
            {
              type: "done",
              id: job.id,
              job: "read",
              facts: readFacts,
              poster: null,
            },
          ]
        const { plan } = job
        return [
          // Something the tool was not asked about, then how far it is.
          { type: "retired", id: job.id } as never,
          { type: "progress", id: job.id, key: job.key, fraction: 0.5 },
          {
            type: "progress",
            id: job.id,
            key: job.key,
            fraction: 0.2,
            pass: 2,
          },
          {
            type: "done",
            id: job.id,
            job: "convert",
            key: job.key,
            file: new Blob([new Uint8Array(size)], { type: "video/x-test" }),
            scratch: "x.mp4",
            written: {
              ...readFacts,
              container: plan.container,
              video: readFacts.video && {
                ...readFacts.video,
                codec:
                  plan.video.action === "encode"
                    ? plan.video.codec
                    : readFacts.video.codec,
                width: plan.width,
                height: plan.height,
              },
            },
            problems,
            index: "front",
            passes,
            resized,
            level,
            // Measured only for a picture encoded again, as the worker does.
            looks:
              plan.video.action === "encode"
                ? { mean: 0.97, least: 0.95, frames: 6 }
                : null,
          },
        ]
      })),
    "video"
  )
  const agent = new Agent(
    videoTools({
      pool: videoPool,
      ask: { video: async () => canWrite, sound: async () => true },
      folder: "agent-test",
      frame: async () => frame,
      picture: async (file: Blob) => {
        if (file.size < 4) throw new Error("Not a picture.")
        return { width: 64, height: 32 }
      },
      track: async (_file: Blob, name: string) => {
        if (name.endsWith(".txt")) throw new Error(`${name} has no sound.`)
        if (name.endsWith(".bin")) throw "not an error"
        return {
          name,
          duration: 2,
          sampleRate: 44100,
          channels: 2,
          codec: "aac",
          decodable: true,
        }
      },
    })
  )
  const progress: number[] = []
  const call = (name: string, input: unknown) =>
    agent.call(name, input, {
      caller: "page",
      onProgress: (fraction: number) => progress.push(fraction),
    } as never)
  const add = (bytes: Uint8Array, name: string) =>
    agent.files.add(new Blob([bytes as BlobPart]), name)
  return { agent, call, add, progress, jobs: () => pool.jobs }
}

describe("reading a video", () => {
  it("says what the file holds", async () => {
    const { call, add } = setup()
    const file = add(MP4, "clip.mp4")
    const result = await call("video_info", { file: file.id })
    expect(result.summary).toBe(
      "clip.mp4: MP4 · H.264 · 320 × 180 · 15 fps · 0:06, 1 KB."
    )
    expect(result.data).toEqual(facts)
    const silent = setup({ readFacts: { ...facts, audio: null } })
    expect(
      (await silent.call("video_info", { file: silent.add(MP4, "c.mp4").id }))
        .summary
    ).toMatch(/, no sound\.$/)
  })

  it("refuses what is not read here, in words", async () => {
    const { call, add } = setup()
    await expect(
      call("video_info", { file: add(AVI, "old.avi").id })
    ).rejects.toThrow(/^old\.avi: AVI files are not read here\./)
  })
})

describe("converting a video", () => {
  it("copies what does not have to change, and hands over the checked result", async () => {
    const { call, add, jobs, agent } = setup()
    const result = await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
    })
    expect(result.summary).toBe(
      "The picture (H.264) is copied as it is, without encoding it again: nothing is lost and it is quick. The sound (AAC) is copied as it is. Written and checked: MP4 · H.264 · 320 × 180 · 15 fps · 0:06, 1 KB."
    )
    expect(result.files).toHaveLength(1)
    expect(agent.files.get(result.files![0].id).ref.name).toBe(
      "clip-converted.mp4"
    )
    const convert = jobs().find((job) => job.job === "convert")!
    expect(convert).toMatchObject({ folder: "agent-test" })
  })

  it("says a large result's size in MB", async () => {
    const { call, add } = setup({ size: 2.5 * 1024 * 1024 })
    const result = await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
    })
    expect(result.summary).toMatch(/, 2\.5 MB\.$/)
  })

  it("encodes where it must, with every setting the page has", async () => {
    const { call, add, jobs } = setup()
    const result = await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
      format: "webm",
      quality: "custom",
      bitrate: 500,
      size: 360,
      frameRate: 15,
      rotate: 90,
      flip: true,
      sound: "convert",
      keepTags: false,
    })
    expect(result.summary).toMatch(/^The picture is encoded again as VP9/)
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan).toMatchObject({
      container: "webm",
      video: { action: "encode", codec: "vp9", bitrate: 500_000 },
      rotate: 90,
      flip: true,
      keepTags: false,
    })
    expect((result.data as { plan: { width: number } }).plan.width).toBe(180)
  })

  it("says what cannot be written, and refuses a result that does not hold", async () => {
    const refused = setup({ canWrite: false })
    await expect(
      refused.call("convert_video", {
        file: refused.add(MP4, "clip.mp4").id,
        format: "webm",
      })
    ).rejects.toThrow(/cannot write a picture WebM holds/)
    const off = setup({ problems: ["The picture is 2 × 2, not 320 × 180."] })
    await expect(
      off.call("convert_video", { file: off.add(MP4, "clip.mp4").id })
    ).rejects.toThrow(
      "The video was written but not as asked, so it is not handed over: The picture is 2 × 2, not 320 × 180."
    )
    const { call, add } = setup()
    await expect(
      call("convert_video", {
        file: add(MP4, "clip.mp4").id,
        quality: "custom",
      })
    ).rejects.toThrow('Give the picture\'s "bitrate" with quality custom.')
    await expect(
      call("convert_video", { file: add(MP4, "clip.mp4").id, size: 999 })
    ).rejects.toThrow()
  })
})

describe("compressing a video for an agent", () => {
  it("copies a file already under its limit, and refuses one it cannot fit", async () => {
    const { call, add, jobs, progress } = setup()
    const done = await call("compress_video", {
      file: add(MP4, "clip.mp4").id,
      megabytes: 1,
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan.video).toEqual({ action: "copy" })
    expect(done.summary).toContain(
      "It is already under 1 MB, so nothing is taken from it."
    )
    expect(progress.length).toBeGreaterThan(0)
    await expect(
      call("compress_video", { file: add(MP4, "clip.mp4").id, share: 0.5 })
    ).rejects.toThrow(
      /^This video cannot be made smaller than about \d+ KB, even at 320 × 180\./
    )
  })

  it("asks for one limit, not both or neither", async () => {
    const { call, add } = setup()
    for (const input of [{}, { megabytes: 5, share: 0.5 }])
      await expect(
        call("compress_video", { file: add(MP4, "clip.mp4").id, ...input })
      ).rejects.toThrow('Give either "megabytes" or "share".')
  })

  it("encodes to fit a larger file under its limit", async () => {
    const big: VideoFacts = {
      ...facts,
      size: 4 * 1024 * 1024,
      video: { ...facts.video!, bitrate: 5_000_000 },
    }
    const { call, add, jobs } = setup({ readFacts: big, passes: 2 })
    const result = await call("compress_video", {
      file: add(MP4, "clip.mp4").id,
      megabytes: 1,
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan.video).toMatchObject({
      action: "encode",
      target: 1024 * 1024,
    })
    expect(result.summary).toMatch(/, in 2 passes\. Looks very close/)
    const floored = setup({
      readFacts: big,
      passes: 3,
      resized: { width: 160, height: 90 },
    })
    const smaller = await floored.call("compress_video", {
      file: floored.add(MP4, "clip.mp4").id,
      megabytes: 1,
    })
    expect(smaller.summary).toContain(
      "would not come down to the bitrate asked, so the picture was made smaller, 160 × 90, to fit."
    )
    expect(smaller.data).toMatchObject({ resized: { width: 160, height: 90 } })
  })
})

describe("trimming a video for an agent", () => {
  it("works out what is kept from parts to keep and to cut", () => {
    expect(kept(10, undefined, [{ start: 2, end: 4 }])).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 10 },
    ])
    expect(
      kept(
        10,
        [
          { start: 6, end: 9 },
          { start: 1, end: 3 },
          { start: 2, end: 4 },
        ],
        [{ start: 7, end: 8 }]
      )
    ).toEqual([
      { start: 1, end: 4 },
      { start: 6, end: 7 },
      { start: 8, end: 9 },
    ])
    expect(() => kept(10, [{ start: 12, end: 14 }])).toThrow(
      "The video is 0:10.00 long, so a part cannot start at 0:12.00."
    )
  })

  it("copies the parts kept, in the file's own format, and says the cut", async () => {
    const { call, add, jobs } = setup({
      readFacts: { ...facts, video: { ...facts.video!, keyframes: [0, 2, 4] } },
    })
    const result = await call("trim_video", {
      file: add(MP4, "clip.mp4").id,
      keep: [{ start: 1, end: 3 }],
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan.cut).toEqual({
      mode: "copy",
      parts: [{ start: 1, end: 4 }],
    })
    expect(job.job === "convert" && job.plan.container).toBe("mp4")
    expect(result.summary).toContain("Written and checked")
    expect((result.data as { plan: { cut: unknown } }).plan.cut).toMatchObject({
      mode: "copy",
    })
  })

  it("cuts to the frame when asked, and asks for parts", async () => {
    const { call, add, jobs } = setup()
    await call("trim_video", {
      file: add(MP4, "clip.mp4").id,
      cut: [{ start: 1, end: 2 }],
      exact: true,
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan.cut).toEqual({
      mode: "exact",
      parts: [
        { start: 0, end: 1 },
        { start: 2, end: 6 },
      ],
    })
    await expect(
      call("trim_video", { file: add(MP4, "clip.mp4").id })
    ).rejects.toThrow('Give the parts to "keep" or to "cut", or both.')
    await expect(
      call("trim_video", {
        file: add(MP4, "clip.mp4").id,
        cut: [{ start: 0, end: 6 }],
      })
    ).rejects.toThrow("Everything is cut out.")
  })
})

describe("saving a frame for an agent", () => {
  it("hands over the frame as a PNG of the picture's size", async () => {
    const { call, add, agent } = setup()
    const result = await call("video_frame", {
      file: add(MP4, "clip.mp4").id,
      seconds: 1.5,
    })
    expect(result.summary).toBe("The frame at 0:01.50: 320 × 180 PNG, 1 KB.")
    expect(agent.files.get(result.files![0].id).ref.name).toBe(
      "clip 0-01.50.png"
    )
  })

  it("refuses a moment past the end, a file with no picture, and a picture not as read", async () => {
    const { call, add } = setup()
    await expect(
      call("video_frame", { file: add(MP4, "clip.mp4").id, seconds: 7 })
    ).rejects.toThrow(
      "clip.mp4 is 0:06.00 long, so there is no frame at 0:07.00."
    )
    const silent = setup({ readFacts: { ...facts, video: null } })
    await expect(
      silent.call("video_frame", {
        file: silent.add(MP4, "song.mp4").id,
        seconds: 1,
      })
    ).rejects.toThrow("song.mp4 has no picture.")
    for (const frame of [png(2, 2), new Blob(["not a picture"])]) {
      const wrong = setup({ frame })
      await expect(
        wrong.call("video_frame", {
          file: wrong.add(MP4, "clip.mp4").id,
          seconds: 1,
        })
      ).rejects.toThrow("is not the video's picture")
    }
    expect(pngSize(new Uint8Array(4))).toBeNull()
  })
})

describe("splitting a video for an agent", () => {
  it("writes each piece as a file of its own, with its part's name", async () => {
    const { call, add, jobs, agent, progress } = setup({
      readFacts: { ...facts, video: { ...facts.video!, keyframes: [0, 2, 4] } },
    })
    const result = await call("split_video", {
      file: add(MP4, "clip.mp4").id,
      at: [2, 4],
    })
    expect(
      result.files!.map((one) => agent.files.get(one.id).ref.name)
    ).toEqual(["clip-part-1.mp4", "clip-part-2.mp4", "clip-part-3.mp4"])
    const cuts = jobs()
      .filter((one) => one.job === "convert")
      .map((one) => one.job === "convert" && one.plan.cut)
    expect(cuts).toEqual([
      { mode: "copy", parts: [{ start: 0, end: 2 }] },
      { mode: "copy", parts: [{ start: 2, end: 4 }] },
      { mode: "copy", parts: [{ start: 4, end: 6 }] },
    ])
    expect(result.summary).toMatch(
      /^Split into 3 files\.\nPart 1 \(0:00\.00 to 0:02\.00\): /
    )
    expect(Math.max(...progress)).toBeLessThanOrEqual(1)
  })

  it("splits every so many seconds what is kept, leaving out empty pieces", async () => {
    const { call, add, jobs } = setup()
    const result = await call("split_video", {
      file: add(MP4, "clip.mp4").id,
      every: 2,
      cut: [{ start: 2, end: 4 }],
      exact: true,
    })
    expect(result.files).toHaveLength(2)
    expect(
      jobs()
        .filter((one) => one.job === "convert")
        .map((one) => one.job === "convert" && one.plan.cut?.parts)
    ).toEqual([[{ start: 0, end: 2 }], [{ start: 4, end: 6 }]])
  })

  it("asks for one way of splitting, and refuses one piece", async () => {
    const { call, add } = setup()
    for (const input of [{}, { at: [2], every: 2 }])
      await expect(
        call("split_video", { file: add(MP4, "clip.mp4").id, ...input })
      ).rejects.toThrow('Give either "at" or "every".')
    await expect(
      call("split_video", { file: add(MP4, "clip.mp4").id, at: [5.95] })
    ).rejects.toThrow(
      "Splitting clip.mp4 (0:06.00) there leaves one piece with something kept, so there is nothing to split."
    )
  })
})

describe("shape, speed and fades for an agent", () => {
  it("crops, speeds up and fades as the editor does", async () => {
    const { call, add, jobs } = setup()
    const result = await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
      shape: "1:1",
      speed: 2,
      fadeIn: 0.5,
      fadeOut: 1,
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan).toMatchObject({
      crop: { left: 70, top: 0, width: 180, height: 180 },
      speed: 2,
      fade: { in: 0.5, out: 1 },
      length: 3,
    })
    expect(result.summary).toContain(
      "It plays twice as fast: 0:06.00 becomes 0:03.00, the sound keeping its pitch."
    )
    await expect(
      call("convert_video", { file: add(MP4, "clip.mp4").id, speed: 4 })
    ).rejects.toThrow()
  })
})

describe("loudness for an agent", () => {
  it("sets the sound to a loudness and says what was done", async () => {
    const loud = (integrated: number) => ({
      integrated,
      range: 3,
      truePeak: -1.1,
      peak: -1.4,
    })
    const { call, add, jobs } = setup({
      level: {
        target: -14,
        before: loud(-20),
        db: 6,
        after: loud(-14.2),
        limited: 0,
        notes: [],
      },
    })
    const result = await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
      loudness: -14,
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan.audio).toMatchObject({
      action: "encode",
      loudness: -14,
    })
    expect(result.summary).toContain("Made 6 dB louder to −14.2 LUFS.")
    await expect(
      call("convert_video", { file: add(MP4, "clip.mp4").id, loudness: -60 })
    ).rejects.toThrow()
  })
})

describe("a crop of one's own for an agent", () => {
  it("crops to pixels of the picture as shown, and refuses one past it", async () => {
    const { call, add, jobs } = setup()
    await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
      crop: { left: 160, top: 0, width: 160, height: 90 },
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan.crop).toEqual({
      left: 160,
      top: 0,
      width: 160,
      height: 90,
    })
    await expect(
      call("convert_video", {
        file: add(MP4, "clip.mp4").id,
        crop: { left: 200, top: 0, width: 160, height: 90 },
      })
    ).rejects.toThrow(
      "The crop goes past the picture, which is 320 × 180 as shown."
    )
    const silent = setup({ readFacts: { ...facts, video: null } })
    await expect(
      silent.call("convert_video", {
        file: silent.add(MP4, "song.mp4").id,
        crop: { left: 0, top: 0, width: 2, height: 2 },
      })
    ).rejects.toThrow("song.mp4 has no picture to crop.")
  })
})

describe("a soundtrack for an agent", () => {
  it("is read, planned and handed to the worker with its file", async () => {
    const { call, add, jobs, agent } = setup()
    const music = agent.files.add(new Blob([new Uint8Array(8)]), "song.m4a")
    const result = await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
      soundtrack: music.id,
      soundtrackMode: "mix",
      soundtrackVolume: -6,
      soundtrackLoop: false,
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan.track).toMatchObject({
      id: music.id,
      name: "song.m4a",
      mode: "mix",
      volume: -6,
      loop: false,
      mixing: true,
    })
    expect(job.job === "convert" && job.track).toBeInstanceOf(Blob)
    expect(result.summary).toContain(
      "The sound of song.m4a is mixed under the video's own, 6 dB quieter. It is 2.0 s long, so the rest is silent."
    )
    // As the page does: in place of the sound, looping, by default.
    await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
      soundtrack: music.id,
    })
    expect(
      jobs()
        .filter((one) => one.job === "convert")
        .map((one) => one.job === "convert" && one.plan.track?.mode)
    ).toEqual(["mix", "replace"])
  })

  it("says why a soundtrack cannot be read", async () => {
    const { call, add, agent } = setup()
    const text = agent.files.add(new Blob(["words"]), "notes.txt")
    await expect(
      call("convert_video", {
        file: add(MP4, "clip.mp4").id,
        soundtrack: text.id,
      })
    ).rejects.toThrow("notes.txt has no sound.")
    const odd = agent.files.add(new Blob(["?"]), "odd.bin")
    await expect(
      call("convert_video", {
        file: add(MP4, "clip.mp4").id,
        soundtrack: odd.id,
      })
    ).rejects.toThrow("odd.bin could not be read.")
  })
})

describe("text and a logo for an agent", () => {
  it("are planned with the logo's size and handed to the worker with its picture", async () => {
    const { call, add, jobs, agent } = setup()
    const logo = agent.files.add(new Blob([new Uint8Array(16)]), "logo.png")
    const result = await call("convert_video", {
      file: add(MP4, "clip.mp4").id,
      captionBottom: "Hello",
      captionFrom: 1,
      logo: logo.id,
      logoCorner: "top-right",
      logoSize: 20,
    })
    const job = jobs().find((one) => one.job === "convert")!
    expect(job.job === "convert" && job.plan.overlay).toMatchObject({
      caption: { bottom: "Hello", from: 1 },
      logo: {
        id: logo.id,
        name: "logo.png",
        width: 64,
        height: 32,
        corner: "top-right",
        size: 20,
      },
    })
    expect(job.job === "convert" && job.logo).toBeInstanceOf(Blob)
    expect(result.summary).toMatch(
      /text is written on it and a logo is drawn on it/
    )
    const broken = agent.files.add(new Blob(["x"]), "broken.png")
    await expect(
      call("convert_video", { file: add(MP4, "clip.mp4").id, logo: broken.id })
    ).rejects.toThrow("broken.png could not be read as a picture.")
  })
})

describe("joining videos for an agent", () => {
  it("joins in the order given and hands over the checked file", async () => {
    const { call, add, jobs, progress } = setup()
    const first = add(MP4, "a.mp4")
    const second = add(MP4, "b.mp4")
    const result = await call("join_videos", { files: [first.id, second.id] })
    const job = jobs().find((one) => one.job === "join")!
    expect(job.job === "join" && job.files).toHaveLength(2)
    expect(job.job === "join" && job.plan.length).toBe(12)
    expect(result.summary).toMatch(
      /^2 videos joined in order, 0:12\.00 in all, as MP4\. .*Written and checked: .* the pictures copied as they are\.$/
    )
    expect(result.files).toHaveLength(1)
    expect(Math.max(...progress)).toBeLessThanOrEqual(1)
  })

  it("says when the pictures were encoded again", async () => {
    const unknown = setup({
      readFacts: { ...facts, video: { ...facts.video!, codec: null } },
    })
    const result = await unknown.call("join_videos", {
      files: [unknown.add(MP4, "a.mp4").id, unknown.add(MP4, "b.mp4").id],
    })
    expect(result.summary).toMatch(/the pictures encoded again\.$/)
  })

  it("asks for two videos with pictures, and refuses a file not as planned", async () => {
    const { call, add } = setup()
    await expect(
      call("join_videos", { files: [add(MP4, "a.mp4").id] })
    ).rejects.toThrow("Give at least two videos to join.")
    const silent = setup({ readFacts: { ...facts, video: null } })
    await expect(
      silent.call("join_videos", {
        files: [silent.add(MP4, "a.mp4").id, silent.add(MP4, "b.mp4").id],
      })
    ).rejects.toThrow("a.mp4 has no picture to join.")
    const off = setup({ problems: ["The file written has no sound."] })
    await expect(
      off.call("join_videos", {
        files: [off.add(MP4, "a.mp4").id, off.add(MP4, "b.mp4").id],
      })
    ).rejects.toThrow(
      "The videos were joined but not as planned, so the file is not handed over: The file written has no sound."
    )
  })
})
