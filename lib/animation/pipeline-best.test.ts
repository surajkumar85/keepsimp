import { expect, it, vi } from "vitest"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { readGif } from "./decoders/gif"
import { BEST_TOO_LARGE, convertAnimation, type ConvertDeps } from "./pipeline"
import { defaultSettings, noTrim } from "./settings"
import type { Source } from "./source"

// Pretend gifski's memory share is used up, without building 32 megapixels of frames.
vi.mock("./settings", async (original) => ({
  ...(await original<typeof import("./settings")>()),
  bestFits: () => false,
}))

const deps: ConvertDeps = {
  palette: async () => ({
    colours: [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ],
    remap: (pixels: Pixels) =>
      Uint8Array.from({ length: pixels.width * pixels.height }, (_, index) =>
        pixels.data[index * 4] > 127 ? 1 : 0
      ),
    free: () => {},
  }),
  encodeWebp: async () => new Uint8Array(0),
  deflate: async (bytes) => bytes,
  gifski: async () => {
    throw new Error("gifski must not be asked")
  },
  encodeStill: async () => new Uint8Array(0),
  encodeVideo: async () => ({ bytes: new Uint8Array(0), frames: 0 }),
  resize: async (pixels) => pixels,
  renderCaption: async () => {
    throw new Error("no text must be drawn")
  },
  checkpoint: async () => {},
  progress: () => {},
}

function source(levels: number[]): Source {
  return {
    format: "webp",
    width: 2,
    height: 2,
    plays: 0,
    durations: levels.map(() => 100),
    seekable: false,
    async *read(indices) {
      for (const index of indices)
        yield {
          data: new Uint8ClampedArray(16).map((_, at) =>
            at % 4 === 3 ? 255 : levels[index]
          ),
          width: 2,
          height: 2,
        }
    },
  }
}

const best = {
  ...defaultSettings,
  target: "gif" as const,
  gifEngine: "best" as const,
}

it("uses the fast encoder, and says so, when gifski cannot hold the frames", async () => {
  const result = await convertAnimation(source([0, 255, 0]), best, noTrim, deps)
  expect(result.note).toBe(BEST_TOO_LARGE)
  expect(readGif(result.bytes).frames).toHaveLength(3)
})

it("says nothing when there is only one frame, which gifski cannot take anyway", async () => {
  const result = await convertAnimation(
    source([0, 255]),
    best,
    { start: 0, end: 100 },
    deps
  )
  expect(result.note).toBeNull()
  expect(readGif(result.bytes).frames).toHaveLength(1)
})
