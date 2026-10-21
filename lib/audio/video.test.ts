import { describe, expect, it } from "vitest"
import {
  barsOf,
  cover,
  defaultLook,
  drawFrame,
  framesPerSecond,
  layoutOf,
  SHAPES,
  type Painter,
} from "./video"

/** A painter that writes down what it is asked to draw. */
function recorder() {
  const calls: string[] = []
  const painter: Painter = {
    fillStyle: "",
    font: "",
    textBaseline: "alphabetic",
    fillRect: (x, y, width, height) =>
      calls.push(
        `rect ${painter.fillStyle} ${Math.round(x)} ${Math.round(y)} ${Math.round(width)} ${Math.round(height)}`
      ),
    fillText: (text, x, y) =>
      calls.push(
        `text ${painter.fillStyle} ${painter.font} ${text} ${Math.round(x)} ${Math.round(y)}`
      ),
    drawImage: (_image, x, y, width, height) =>
      calls.push(
        `image ${Math.round(x)} ${Math.round(y)} ${Math.round(width)} ${Math.round(height)}`
      ),
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("path"),
    rect: () => calls.push("clip-rect"),
    clip: () => calls.push("clip"),
  }
  return { painter, calls }
}

const colours = {
  background: "bg",
  foreground: "fg",
  muted: "mu",
  accent: "ac",
}

describe("audio as video", () => {
  it("fills a box with a picture, cutting what sticks out evenly", () => {
    expect(cover(200, 100, { x: 0, y: 0, width: 100, height: 100 })).toEqual({
      x: -50,
      y: 0,
      width: 200,
      height: 100,
    })
    expect(cover(100, 400, { x: 10, y: 10, width: 100, height: 100 })).toEqual({
      x: 10,
      y: -140,
      width: 100,
      height: 400,
    })
  })

  it("lays out the picture, the title and the waveform for each shape", () => {
    const square = layoutOf(defaultLook, true)
    expect([square.width, square.height]).toEqual([1080, 1080])
    expect(square.picture.y + square.picture.height).toBeLessThan(
      square.title.y
    )
    expect(square.title.y + square.title.height).toBeLessThanOrEqual(
      square.waveform.y
    )
    expect(square.waveform.y + square.waveform.height + square.margin).toBe(
      1080
    )
    // Only the picture: it takes all the room.
    const bare = layoutOf(
      { shape: "portrait", waveform: false, title: true },
      false
    )
    expect(bare.picture.height).toBe(1920 - bare.margin * 2)
    expect(bare.waveform.height).toBe(0)
    expect(bare.title.height).toBe(0)
    expect(SHAPES.landscape.width).toBe(1920)
    expect(framesPerSecond(defaultLook)).toBe(24)
    expect(framesPerSecond({ ...defaultLook, waveform: false })).toBe(1)
  })

  it("makes bars of the loudest of each share of the peaks", () => {
    const peaks = {
      min: Float32Array.of(-0.2, -0.9, 0, -0.1),
      max: Float32Array.of(0.1, 0.3, 1.5, 0.4),
    }
    expect(barsOf(peaks, 2).map((bar) => Math.round(bar * 10) / 10)).toEqual([
      0.9, 1,
    ])
    // A quiet file: scaled so its loudest bar is the full height.
    const quiet = {
      min: Float32Array.of(-0.05, -0.1),
      max: Float32Array.of(0.02, 0.05),
    }
    expect(barsOf(quiet, 2)).toEqual([0.5, 1])
    // More bars than peaks: each bar takes at least one.
    expect(barsOf(peaks, 8)).toHaveLength(8)
    expect(
      barsOf({ min: new Float32Array(0), max: new Float32Array(0) }, 3)
    ).toEqual([0, 0, 0])
  })

  it("draws the background, the picture clipped, the title, and a playhead that moves", () => {
    const layout = layoutOf(defaultLook, true)
    const picture = {
      image: {} as CanvasImageSource,
      width: 2000,
      height: 1000,
    }
    const frame = (time: number) => {
      const { painter, calls } = recorder()
      drawFrame(painter, layout, {
        time,
        duration: 10,
        colours,
        picture,
        bars: [0.5, 1, 0, 0.25],
        title: "A tune",
        artist: "KeepSimp",
      })
      return calls
    }
    const start = frame(0)
    expect(start[0]).toBe("rect bg 0 0 1080 1080")
    expect(start.slice(1, 6)).toEqual([
      "save",
      "path",
      "clip-rect",
      "clip",
      expect.stringMatching(/^image /),
    ])
    expect(
      start.some(
        (call) => call.startsWith("text fg 600") && call.includes("A tune")
      )
    ).toBe(true)
    expect(
      start.some(
        (call) => call.startsWith("text mu 400") && call.includes("KeepSimp")
      )
    ).toBe(true)
    const played = (calls: string[]) =>
      calls.filter((call) => call.startsWith("rect ac")).length
    expect(played(start)).toBe(0)
    expect(played(frame(5))).toBe(2)
    expect(played(frame(20))).toBe(4)
    // Nothing to place, no artist, no length: no picture, no second line, nothing played.
    const { painter, calls } = recorder()
    drawFrame(
      painter,
      layoutOf({ shape: "square", waveform: true, title: true }, true),
      {
        time: 3,
        duration: 0,
        colours,
        picture: null,
        bars: [1],
        title: "Only",
        artist: "",
      }
    )
    expect(calls.some((call) => call.startsWith("image"))).toBe(false)
    expect(calls.filter((call) => call.startsWith("text"))).toHaveLength(1)
    expect(calls.filter((call) => call.startsWith("rect ac"))).toHaveLength(0)
    // No waveform or title asked for: only the picture.
    const plain = recorder()
    drawFrame(
      plain.painter,
      layoutOf({ shape: "square", waveform: false, title: false }, true),
      {
        time: 0,
        duration: 1,
        colours,
        picture,
        bars: null,
        title: "x",
        artist: "y",
      }
    )
    expect(
      plain.calls.filter(
        (call) => call.startsWith("text") || call.startsWith("rect mu")
      )
    ).toEqual([])
  })
})
