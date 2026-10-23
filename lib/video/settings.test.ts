import { describe, expect, it } from "vitest"
import {
  MkvOutputFormat,
  MovOutputFormat,
  Mp4OutputFormat,
  WebMOutputFormat,
} from "mediabunny"
import {
  defaultSettings,
  ENCODE_ORDER,
  highBitrate,
  HOLDS,
  planFor,
  settingsKey,
  settingsProblem,
  shownSize,
  soundLabel,
  type CanEncode,
  type VideoFacts,
  type VideoSettings,
} from "./settings"

const clip: VideoFacts = {
  container: "mp4",
  size: 10_000_000,
  duration: 10,
  video: {
    codec: "avc",
    width: 1920,
    height: 1080,
    rotation: 0,
    flip: false,
    frameRate: 30,
    variableRate: false,
    bitrate: 8_000_000,
    hdr: false,
    decodable: true,
  },
  audio: {
    codec: "aac",
    sampleRate: 48000,
    channels: 2,
    bitrate: 128_000,
    decodable: true,
  },
}
const all: CanEncode = () => true
const set = (change: Partial<VideoSettings>): VideoSettings => ({
  ...defaultSettings,
  ...change,
})
const withVideo = (change: Partial<NonNullable<VideoFacts["video"]>>) => ({
  ...clip,
  video: { ...clip.video!, ...change },
})
const withSound = (change: Partial<NonNullable<VideoFacts["audio"]>>) => ({
  ...clip,
  audio: { ...clip.audio!, ...change },
})

describe("what each kind holds", () => {
  it("is held to what Mediabunny's writers take", () => {
    const writers = {
      mp4: new Mp4OutputFormat(),
      mov: new MovOutputFormat(),
      webm: new WebMOutputFormat(),
      mkv: new MkvOutputFormat(),
    }
    for (const [kind, writer] of Object.entries(writers)) {
      const holds = HOLDS[kind as keyof typeof HOLDS]
      for (const codec of holds.video)
        expect(writer.getSupportedVideoCodecs(), `${kind} ${codec}`).toContain(
          codec
        )
      for (const codec of holds.sound)
        expect(writer.getSupportedAudioCodecs(), `${kind} ${codec}`).toContain(
          codec
        )
      for (const codec of ENCODE_ORDER[kind as keyof typeof HOLDS])
        expect(holds.video).toContain(codec)
    }
  })
})

describe("copying when nothing has to change", () => {
  it("copies an H.264 and AAC file into MP4, quickly and losslessly", () => {
    const plan = planFor(clip, defaultSettings, all)
    expect(plan.video).toEqual({ action: "copy" })
    expect(plan.audio).toEqual({ action: "copy" })
    expect(plan.problem).toBeNull()
    expect(plan.estimate).toBe(clip.size)
    expect([plan.width, plan.height]).toEqual([1920, 1080])
    expect(plan.notes).toEqual([
      "The picture (H.264) is copied as it is, without encoding it again: nothing is lost and it is quick.",
      "The sound (AAC) is copied as it is.",
    ])
  })

  it("writes a kind it reads but cannot write as MP4, and says so", () => {
    const plan = planFor(
      { ...clip, container: "ts" },
      set({ format: "same" }),
      all
    )
    expect(plan.container).toBe("mp4")
    expect(plan.notes[0]).toBe(
      "MPEG-TS is read here but not written, so it becomes an MP4."
    )
    expect(
      planFor({ ...clip, container: "mkv" }, set({ format: "same" }), all)
        .container
    ).toBe("mkv")
  })

  it("turns an MP4 or MOV by its setting, without redrawing", () => {
    const plan = planFor(clip, set({ rotate: 90 }), all)
    expect(plan.video).toEqual({ action: "copy" })
    expect([plan.width, plan.height]).toEqual([1080, 1920])
    expect(plan.notes[1]).toMatch(/written as a setting that players follow/)
    expect(
      planFor(clip, set({ format: "mov", flip: true }), all).video
    ).toEqual({ action: "copy" })
  })

  it("never raises the frame rate, and copies a clip already slower", () => {
    const plan = planFor(
      withVideo({ frameRate: 24 }),
      set({ frameRate: 30 }),
      all
    )
    expect(plan.video).toEqual({ action: "copy" })
    expect(
      planFor(withVideo({ frameRate: 24 }), set({ frameRate: 24 }), all).video
    ).toEqual({ action: "copy" })
  })

  it("copies the codec chosen on purpose wherever the kind holds it", () => {
    const vp9 = withVideo({ codec: "vp9" })
    expect(planFor(vp9, set({ codec: "vp9" }), all).video).toEqual({
      action: "copy",
    })
  })

  it("estimates a copied picture from the file when its bitrate is unknown", () => {
    const plan = planFor(
      withVideo({ bitrate: null }),
      set({ sound: "convert" }),
      all
    )
    expect(plan.video).toEqual({ action: "copy" })
    expect(plan.estimate).toBe(
      Math.round((((8_000_000 + 128_000) * 10) / 8) * 1.01)
    )
  })
})

describe("encoding when something has to change", () => {
  it("writes WebM as VP9 and Opus, saying why", () => {
    const plan = planFor(clip, set({ format: "webm" }), all)
    expect(plan.video).toMatchObject({
      action: "encode",
      codec: "vp9",
      width: 1920,
      height: 1080,
      frameRate: null,
      keyFrameInterval: 2,
    })
    expect(plan.audio).toEqual({
      action: "encode",
      codec: "opus",
      bitrate: 128_000,
    })
    expect(plan.notes[0]).toBe(
      "The picture is encoded again as VP9, 1920 × 1080, at 4.8 Mbit/s, because WebM does not hold H.264."
    )
    expect(plan.notes[1]).toBe(
      "The sound is converted to Opus at 128 kbit/s, as WebM would not play AAC everywhere."
    )
  })

  it("sets bitrates from YouTube's table, shared by the presets", () => {
    const at = (quality: VideoSettings["quality"]) => {
      const video = planFor(clip, set({ quality }), all).video
      return video.action === "encode" ? video.bitrate : 0
    }
    expect(at("high")).toBe(8_000_000)
    expect(at("balanced")).toBe(4_000_000)
    expect(at("small")).toBe(2_000_000)
    expect(planFor(clip, set({ quality: "balanced" }), all).notes[0]).toBe(
      "The picture is encoded again as H.264, 1920 × 1080, at 4 Mbit/s, because the quality was chosen."
    )
  })

  it("never asks for more than the file holds", () => {
    const plan = planFor(
      withVideo({ bitrate: 2_000_000 }),
      set({ quality: "high" }),
      all
    )
    expect(plan.video).toMatchObject({ bitrate: 2_000_000 })
    expect(plan.notes[0]).toMatch(/at 2 Mbit\/s, no more than the file holds,/)
    const tiny = planFor(
      withVideo({ bitrate: 10_000 }),
      set({ quality: "high" }),
      all
    )
    expect(tiny.video).toMatchObject({ bitrate: 100_000 })
  })

  it("takes a bitrate of one's own, within bounds", () => {
    const bits = (bitrate: number) => {
      const video = planFor(
        clip,
        set({ quality: "custom", bitrate }),
        all
      ).video
      return video.action === "encode" ? video.bitrate : 0
    }
    expect(bits(2500)).toBe(2_500_000)
    expect(bits(1)).toBe(100_000)
    expect(bits(10_000_000)).toBe(200_000_000)
    expect(
      planFor(clip, set({ quality: "custom", bitrate: 300 }), all).notes[0]
    ).toMatch(/at 300 kbit\/s/)
  })

  it("makes the shorter side smaller, never larger, and even", () => {
    const plan = planFor(clip, set({ size: 720 }), all)
    expect(plan.video).toMatchObject({ width: 1280, height: 720 })
    expect(plan.notes[0]).toMatch(/because it is made 1280 × 720\./)
    const odd = planFor(
      withVideo({ width: 1001, height: 999 }),
      set({ size: 480 }),
      all
    )
    expect([odd.width, odd.height]).toEqual([480, 480])
    expect(shownSize(clip.video!, { rotate: 0, size: 2160 })).toEqual({
      width: 1920,
      height: 1080,
      scaled: false,
    })
    expect(shownSize(clip.video!, { rotate: 270, size: 720 })).toEqual({
      width: 720,
      height: 1280,
      scaled: true,
    })
  })

  it("lowers the frame rate when asked", () => {
    const plan = planFor(clip, set({ frameRate: 15 }), all)
    expect(plan.video).toMatchObject({ frameRate: 15, bitrate: 4_000_000 })
    expect(plan.notes[0]).toMatch(
      /1920 × 1080 at 15 frames a second, at .* because it is made 15 frames a second\./
    )
    // Unknown rates count as 30.
    expect(
      planFor(withVideo({ frameRate: null }), set({ frameRate: 24 }), all).video
    ).toMatchObject({
      frameRate: 24,
    })
  })

  it("encodes into another codec when one is chosen", () => {
    const plan = planFor(clip, set({ codec: "hevc" }), all)
    expect(plan.video).toMatchObject({ codec: "hevc", bitrate: 4_800_000 })
    expect(plan.notes[0]).toMatch(/because HEVC was chosen\./)
    const wrong = planFor(clip, set({ format: "mov", codec: "vp9" }), all)
    expect(wrong.problem).toBe("MOV cannot hold VP9. It holds H.264, HEVC.")
  })

  it("re-encodes VP9 for an MP4 unless VP9 was chosen", () => {
    const plan = planFor(withVideo({ codec: "vp9" }), defaultSettings, all)
    expect(plan.video).toMatchObject({ action: "encode", codec: "avc" })
    expect(plan.notes[0]).toMatch(
      /because VP9 in MP4 does not play everywhere\./
    )
    const unknown = planFor(withVideo({ codec: null }), defaultSettings, all)
    expect(unknown.notes[0]).toMatch(
      /because MP4 does not hold this picture's codec\./
    )
  })

  it("turns by redrawing where the kind cannot carry a turn", () => {
    const plan = planFor(clip, set({ format: "mkv", rotate: 180 }), all)
    expect(plan.video).toMatchObject({ action: "encode", codec: "avc" })
    expect(plan.notes).toContain(
      "The picture is turned as it is drawn, so every player shows it upright."
    )
    expect(plan.notes[0]).toMatch(/MKV cannot carry a turn as a setting/)
    // A phone's own turn counts too.
    const phone = planFor(
      withVideo({ rotation: 90, width: 1080, height: 1920 }),
      set({ format: "webm" }),
      all
    )
    expect(phone.notes[0]).toMatch(
      /WebM does not hold H\.264 and WebM cannot carry a turn/
    )
  })

  it("says what it cannot promise about HDR and varying frame times", () => {
    const plan = planFor(
      withVideo({ hdr: true, variableRate: true }),
      set({ quality: "high" }),
      all
    )
    expect(plan.notes).toContain(
      "This video is HDR. It is written without tone mapping, so its colours may look flat or bright in some players."
    )
    expect(plan.notes).toContain("Its frames keep their own times, which vary.")
    const fixed = planFor(
      withVideo({ variableRate: true }),
      set({ frameRate: 24 }),
      all
    )
    expect(fixed.notes).not.toContain(
      "Its frames keep their own times, which vary."
    )
  })
})

describe("what this browser can write", () => {
  it("waits while the browser is being asked", () => {
    const plan = planFor(clip, set({ format: "webm" }), () => null)
    expect(plan.pending).toEqual([{ codec: "vp9", width: 1920, height: 1080 }])
    expect(plan.problem).toBeNull()
  })

  it("takes the next codec the kind holds when one cannot be written", () => {
    const plan = planFor(
      clip,
      set({ quality: "small" }),
      (codec) => codec === "av1"
    )
    expect(plan.video).toMatchObject({ codec: "av1", bitrate: 800_000 })
  })

  it("says when nothing it holds can be written, or the codec chosen", () => {
    expect(planFor(clip, set({ format: "webm" }), () => false).problem).toBe(
      "This browser cannot write a picture WebM holds at 1920 × 1080. Choose another format or a smaller size."
    )
    expect(planFor(clip, set({ codec: "hevc" }), () => false).problem).toBe(
      "This browser cannot write HEVC at 1920 × 1080. Choose another codec or a smaller size."
    )
  })

  it("cannot encode a picture it cannot play, but can still copy it", () => {
    const hevc = withVideo({ codec: "hevc", decodable: false })
    expect(planFor(hevc, defaultSettings, all).problem).toBeNull()
    expect(planFor(hevc, set({ format: "webm" }), all).problem).toBe(
      "This browser cannot play this video's picture (HEVC), so it cannot be encoded again. Choose a format that holds it as it is (MKV holds most), or try another browser."
    )
    expect(
      planFor(
        withVideo({ codec: null, decodable: false }),
        defaultSettings,
        all
      ).problem
    ).toMatch(/^This browser cannot play this video's picture, so/)
  })
})

describe("the sound", () => {
  it("leaves the sound out when asked", () => {
    const plan = planFor(clip, set({ sound: "none" }), all)
    expect(plan.audio).toEqual({ action: "drop" })
    expect(plan.notes).toContain("The sound is left out.")
  })

  it("converts when asked, with less for one channel", () => {
    expect(planFor(clip, set({ sound: "convert" }), all).notes[1]).toBe(
      "The sound is converted to AAC at 128 kbit/s, no more than the file holds."
    )
    expect(
      planFor(withSound({ channels: 1 }), set({ sound: "convert" }), all).audio
    ).toEqual({ action: "encode", codec: "aac", bitrate: 96_000 })
    expect(
      planFor(withSound({ channels: 1 }), set({ format: "webm" }), all).audio
    ).toEqual({ action: "encode", codec: "opus", bitrate: 64_000 })
  })

  it("converts sound an MP4 would not play everywhere", () => {
    const plan = planFor(withSound({ codec: "opus" }), defaultSettings, all)
    expect(plan.audio).toMatchObject({ codec: "aac" })
    expect(plan.notes[1]).toBe(
      "The sound is converted to AAC at 128 kbit/s, no more than the file holds, as MP4 would not play Opus everywhere."
    )
    expect(
      planFor(withSound({ codec: "ac3" }), set({ format: "mkv" }), all).audio
    ).toEqual({ action: "copy" })
    expect(
      planFor(withSound({ codec: null }), defaultSettings, all).notes[1]
    ).toBe(
      "The sound is converted to AAC at 128 kbit/s, no more than the file holds."
    )
  })

  it("never gives converted sound more than the file's own holds", () => {
    const thin = planFor(
      withSound({ bitrate: 70_500 }),
      set({ format: "webm" }),
      all
    )
    expect(thin.audio).toEqual({
      action: "encode",
      codec: "opus",
      bitrate: 72_000,
    })
    expect(thin.notes[1]).toBe(
      "The sound is converted to Opus at 72 kbit/s, no more than the file holds, as WebM would not play AAC everywhere."
    )
    const tiny = planFor(
      withSound({ bitrate: 8_000 }),
      set({ sound: "convert" }),
      all
    )
    expect(tiny.audio).toEqual({
      action: "encode",
      codec: "aac",
      bitrate: 48_000,
    })
    expect(
      planFor(withSound({ bitrate: 8_000 }), set({ format: "webm" }), all).audio
    ).toEqual({ action: "encode", codec: "opus", bitrate: 32_000 })
  })

  it("falls back to Vorbis for WebM where Opus cannot be written", () => {
    const vorbis = planFor(
      clip,
      set({ format: "webm" }),
      all,
      (codec) => codec === "vorbis"
    )
    expect(vorbis.audio).toEqual({
      action: "encode",
      codec: "vorbis",
      bitrate: 128_000,
    })
    expect(
      planFor(clip, set({ format: "webm" }), all, () => false).problem
    ).toBe(
      "This browser cannot write Opus sound for WebM. Choose another format, or leave the sound out."
    )
    expect(
      planFor(clip, set({ sound: "convert" }), all, () => false).problem
    ).toMatch(/cannot write AAC sound for MP4/)
  })

  it("converts sound for MKV to Opus, and says when only AAC can be written", () => {
    expect(
      planFor(clip, set({ format: "mkv", sound: "convert" }), all).audio
    ).toEqual({
      action: "encode",
      codec: "opus",
      bitrate: 128_000,
    })
    const late = planFor(
      clip,
      set({ format: "mkv", sound: "convert" }),
      all,
      (codec) => codec === "aac"
    )
    expect(late.audio).toMatchObject({ codec: "aac" })
    expect(late.problem).toBeNull()
    expect(late.notes).toContain(
      "This browser cannot write Opus, so the sound is AAC, which in MKV starts a few hundredths of a second late. Choose MP4 to keep it in step."
    )
  })

  it("cannot convert sound it cannot play", () => {
    const plan = planFor(
      withSound({ codec: "eac3", decodable: false }),
      defaultSettings,
      all
    )
    expect(plan.problem).toBe(
      "This browser cannot play this video's sound (E-AC-3), so it cannot be converted. Choose MKV, which keeps it as it is, or leave the sound out."
    )
  })
})

describe("files with less in them", () => {
  it("estimates copied sound whose bitrate is unknown", () => {
    const plan = planFor(
      withSound({ bitrate: null }),
      set({ quality: "high" }),
      all
    )
    expect(plan.audio).toEqual({ action: "copy" })
    expect(plan.estimate).toBe(
      Math.round((((8_000_000 + 128_000) * 10) / 8) * 1.01)
    )
  })

  it("writes sound alone", () => {
    const plan = planFor({ ...clip, video: null }, defaultSettings, all)
    expect(plan.video).toEqual({ action: "none" })
    expect([plan.width, plan.height]).toEqual([0, 0])
    expect(plan.audio).toEqual({ action: "copy" })
  })

  it("writes a picture alone, estimating its size", () => {
    const plan = planFor(
      { ...clip, audio: null },
      set({ quality: "balanced", keepTags: false }),
      all
    )
    expect(plan.audio).toEqual({ action: "none" })
    expect(plan.estimate).toBe(Math.round(((4_000_000 * 10) / 8) * 1.01))
    expect(plan.notes).toContain("The title and other details are left out.")
    expect(plan.keepTags).toBe(false)
  })

  it("says a file with neither cannot be written", () => {
    expect(
      planFor({ ...clip, video: null, audio: null }, defaultSettings, all)
        .problem
    ).toBe("This file has neither a picture nor sound in it.")
  })
})

describe("the parts", () => {
  it("interpolates YouTube's bitrates by the picture's pixels", () => {
    expect(highBitrate(1920, 1080, 30)).toBe(8_000_000)
    expect(highBitrate(1920, 1080, 60)).toBe(12_000_000)
    expect(highBitrate(1280, 720, 24)).toBe(5_000_000)
    expect(highBitrate(3840, 2160, 30)).toBe(40_000_000)
    // Halfway in pixels between 720p and 1080p.
    const middle = Math.sqrt((1280 * 720 + 1920 * 1080) / 2 / (16 / 9))
    expect(highBitrate((middle * 16) / 9, middle, 30)).toBe(6_500_000)
    // Smaller than 360p and larger than 2160p scale with the pixels.
    expect(highBitrate(320, 180, 30)).toBe(250_000)
    expect(highBitrate(7680, 4320, 30)).toBe(160_000_000)
  })

  it("names sound codecs for people", () => {
    expect(soundLabel("aac")).toBe("AAC")
    expect(soundLabel("pcm-s16")).toBe("PCM")
    expect(soundLabel("dts")).toBe("DTS")
    expect(soundLabel("truehd")).toBe("TRUEHD")
    expect(soundLabel(null)).toBe("unknown")
  })

  it("checks a bitrate of one's own, and names the settings", () => {
    expect(settingsProblem(defaultSettings)).toBeNull()
    expect(
      settingsProblem(set({ quality: "custom", bitrate: 4000 }))
    ).toBeNull()
    for (const bitrate of [50, 300_000, Number.NaN])
      expect(settingsProblem(set({ quality: "custom", bitrate }))).toBe(
        "Give a bitrate from 100 to 200,000 kbit/s."
      )
    expect(settingsKey(defaultSettings)).toBe(JSON.stringify(defaultSettings))
  })
})

describe("a size limit", () => {
  const MB = 1024 * 1024
  const long = { ...clip, duration: 120, size: 200 * MB }

  it("fits the picture into what the sound leaves, and says it", () => {
    const plan = planFor(long, set({ limit: { bytes: 25 * MB } }), all)
    expect(plan.video).toMatchObject({
      action: "encode",
      codec: "avc",
      width: 1280,
      height: 720,
      target: 25 * MB,
    })
    expect(plan.notes[0]).toMatch(/because it is to fit under 25 MB\.$/)
    expect(plan.notes[1]).toBe(
      "If the browser's encoder overshoots, the file is written again with less (3 times at most), and it is never handed over larger than 25 MB."
    )
    expect(plan.estimate).toBe(25 * MB)
    expect(plan.audio).toEqual({ action: "copy" })
  })

  it("takes a share of the file's own size", () => {
    const plan = planFor(long, set({ limit: { share: 0.25 } }), all)
    expect(plan.video).toMatchObject({ target: 50 * MB })
  })

  it("copies a file already under its limit", () => {
    const plan = planFor(clip, set({ limit: { bytes: 25 * MB } }), all)
    expect(plan.video).toEqual({ action: "copy" })
    expect(plan.notes).toContain(
      "It is already under 25 MB, so nothing is taken from it."
    )
  })

  it("converts sound smaller when it would take more than a fifth", () => {
    const plan = planFor(long, set({ limit: { bytes: 5 * MB } }), all)
    expect(plan.audio).toEqual({
      action: "encode",
      codec: "aac",
      bitrate: 48_000,
    })
    expect(plan.notes).toContain(
      "The sound is converted to AAC at 48 kbit/s, to leave room for the picture."
    )
    const opus = planFor(
      long,
      set({ format: "webm", limit: { bytes: 20 * MB } }),
      all
    )
    expect(opus.audio).toMatchObject({ codec: "opus", bitrate: 128_000 })
  })

  it("asks the browser at the size it would write, codec by codec", () => {
    const asked: string[] = []
    planFor(long, set({ limit: { bytes: 25 * MB } }), (codec, w, h) => {
      asked.push(`${codec}@${w}x${h}`)
      return codec === "av1"
    })
    // H.264 and HEVC at 720p; AV1 needs fewer bits, so it keeps 1080p.
    expect(asked).toEqual(["avc@1280x720", "hevc@1280x720", "av1@1920x1080"])
    const pending = planFor(
      long,
      set({ limit: { bytes: 25 * MB } }),
      () => null
    )
    expect(pending.pending).toEqual([
      { codec: "avc", width: 1280, height: 720 },
    ])
  })

  it("says how small a video can be made when the limit is too small", () => {
    const plan = planFor(
      { ...long, duration: 3600 },
      set({ limit: { bytes: 5 * MB } }),
      all
    )
    expect(plan.problem).toMatch(
      /^This video cannot be made smaller than about [\d.]+ MB, even at 426 × 240\. Choose a limit of at least that, or leave the sound out\.$/
    )
  })

  it("lowers the frame rate before the size", () => {
    const fast = { ...long, video: { ...long.video!, frameRate: 60 } }
    const plan = planFor(fast, set({ limit: { bytes: 60 * MB } }), all)
    expect(plan.video).toMatchObject({ frameRate: 30, width: 1920 })
  })

  it("says small limits in KB, and counts sound of no stated bitrate as 128 kbit/s", () => {
    const plan = planFor(
      { ...clip, size: 300_000 },
      set({ limit: { bytes: 512 * 1024 } }),
      all
    )
    expect(plan.notes).toContain(
      "It is already under 512 KB, so nothing is taken from it."
    )
    const unknown = planFor(
      { ...long, audio: { ...long.audio!, bitrate: null } },
      set({ limit: { bytes: 25 * MB } }),
      all
    )
    expect(unknown.audio).toEqual({ action: "copy" })
  })

  it("checks a size of one's own", () => {
    expect(settingsProblem(set({ limit: { bytes: 5 * MB } }))).toBeNull()
    expect(settingsProblem(set({ limit: { share: 0.5 } }))).toBeNull()
    for (const bytes of [0.1 * MB, 200_000 * MB, Number.NaN])
      expect(settingsProblem(set({ limit: { bytes } }))).toBe(
        "Give a size from 0.25 to 100,000 MB."
      )
  })
})
