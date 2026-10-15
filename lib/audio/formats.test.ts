// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  averageBitrate,
  bitrateLabel,
  channelsLabel,
  codecLabel,
  rateLabel,
  timeLabel,
} from "./labels"
import { containerLabels, sniffContainer, writtenFormats } from "./formats"

const fixture = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`))
const bytes = (...values: (number | string)[]) => {
  const out: number[] = []
  for (const value of values)
    if (typeof value === "string")
      out.push(...Array.from(value, (letter) => letter.charCodeAt(0)))
    else out.push(value)
  return new Uint8Array(out)
}

describe("sniffContainer", () => {
  it("tells real files apart by their first bytes", () => {
    expect(sniffContainer(fixture("tone.mp3"))).toBe("mp3")
    expect(sniffContainer(fixture("tone.wav"))).toBe("wav")
    expect(sniffContainer(fixture("tone.aiff"))).toBe("aiff")
    expect(sniffContainer(fixture("tone-sowt.aifc"))).toBe("aiff")
    expect(sniffContainer(fixture("tone.flac"))).toBe("flac")
    expect(sniffContainer(fixture("tone.m4a"))).toBe("mp4")
    expect(sniffContainer(fixture("tone.opus"))).toBe("ogg")
  })

  it("knows the rest by their marks, and nothing else", () => {
    expect(sniffContainer(bytes(0x1a, 0x45, 0xdf, 0xa3, 0))).toBe("webm")
    expect(sniffContainer(bytes("RF64", 0, 0, 0, 0, "WAVE"))).toBe("wav")
    expect(sniffContainer(bytes("BW64", 0, 0, 0, 0, "WAVE"))).toBe("wav")
    expect(sniffContainer(bytes("RIFF", 0, 0, 0, 0, "AVI "))).toBeNull()
    expect(sniffContainer(bytes("FORM", 0, 0, 0, 0, "ILBM"))).toBeNull()
    const ts = new Uint8Array(400)
    ts[0] = ts[188] = 0x47
    expect(sniffContainer(ts)).toBe("mpegts")
    // ADTS has layer bits 00; MPEG audio does not.
    expect(sniffContainer(bytes(0xff, 0xf1, 0x50, 0x80))).toBe("adts")
    expect(sniffContainer(bytes(0xff, 0xfb, 0x90, 0x64))).toBe("mp3")
    expect(sniffContainer(bytes("ID3", 4, 0))).toBe("mp3")
    expect(sniffContainer(bytes(1, 2, 3))).toBeNull()
    expect(sniffContainer(bytes("%PDF-1.7"))).toBeNull()
    expect(containerLabels.adts).toBe("AAC")
    expect(writtenFormats.m4r.container).toBe("mp4")
  })
})

describe("labels", () => {
  it("names codecs as people know them", () => {
    expect(codecLabel("aac")).toBe("AAC")
    expect(codecLabel("pcm-s24")).toBe("PCM 24-bit")
    expect(codecLabel("pcm-f32be")).toBe("PCM 32-bit float")
    expect(codecLabel("ulaw")).toBe("μ-law")
    expect(codecLabel("alac")).toBe("ALAC")
    expect(codecLabel(null)).toBe("No sound")
  })

  it("says lengths, rates, channels and bitrates", () => {
    expect(timeLabel(7.25)).toBe("0:07")
    expect(timeLabel(185)).toBe("3:05")
    expect(timeLabel(3723.4)).toBe("1:02:03")
    expect(timeLabel(7.25, true)).toBe("0:07.2")
    expect(timeLabel(3723.45, true)).toBe("1:02:03.4")
    expect(timeLabel(-3)).toBe("0:00")
    expect(rateLabel(44100)).toBe("44.1 kHz")
    expect(rateLabel(48000)).toBe("48 kHz")
    expect(channelsLabel(1)).toBe("Mono")
    expect(channelsLabel(2)).toBe("Stereo")
    expect(channelsLabel(6)).toBe("5.1 (6 channels)")
    expect(channelsLabel(8)).toBe("7.1 (8 channels)")
    expect(channelsLabel(4)).toBe("4 channels")
    expect(bitrateLabel(191_600)).toBe("192 kbit/s")
    expect(averageBitrate(24_000, 1)).toBe(192_000)
    expect(averageBitrate(24_000, 0)).toBeNull()
  })
})
