import { describe, expect, it } from "vitest"
import {
  containerProblem,
  sameContainer,
  sniffContainer,
  type Container,
} from "./formats"

const bytes = (...parts: (string | number[])[]) => {
  const out: number[] = []
  for (const part of parts)
    if (typeof part === "string")
      for (const char of part) out.push(char.charCodeAt(0))
    else out.push(...part)
  return Uint8Array.from(out)
}

describe("telling video files apart by their bytes", () => {
  it("knows MP4 and MOV by their first box", () => {
    expect(sniffContainer(bytes([0, 0, 0, 24], "ftypisom", [0, 0, 0, 0]))).toBe(
      "mp4"
    )
    expect(sniffContainer(bytes([0, 0, 0, 20], "ftypqt  ", [0, 0, 0, 0]))).toBe(
      "mov"
    )
    // An old QuickTime file starts straight with its atoms.
    expect(sniffContainer(bytes([0, 0, 0, 8], "wide"))).toBe("mov")
    expect(sniffContainer(bytes([0, 0, 0, 8], "moov"))).toBe("mov")
  })

  it("tells WebM from Matroska by the DocType", () => {
    const ebml = [0x1a, 0x45, 0xdf, 0xa3]
    expect(sniffContainer(bytes(ebml, [0x42, 0x82, 0x84], "webm"))).toBe("webm")
    expect(sniffContainer(bytes(ebml, [0x42, 0x82, 0x88], "matroska"))).toBe(
      "mkv"
    )
  })

  it("knows a transport stream by its sync bytes every 188", () => {
    const ts = new Uint8Array(400)
    ts[0] = ts[188] = ts[376] = 0x47
    expect(sniffContainer(ts)).toBe("ts")
    ts[188] = 0
    expect(sniffContainer(ts)).toBeNull()
  })

  it("names the kinds it does not read", () => {
    expect(sniffContainer(bytes("OggS", [0]))).toBe("ogg")
    expect(sniffContainer(bytes("RIFF", [0, 0, 0, 0], "AVI LIST"))).toBe("avi")
    expect(sniffContainer(bytes("FLV", [1]))).toBe("flv")
    expect(sniffContainer(bytes([0x30, 0x26, 0xb2, 0x75, 0x8e]))).toBe("wmv")
    expect(sniffContainer(bytes([0, 0, 1, 0xba]))).toBe("mpeg")
    expect(sniffContainer(bytes([0, 0, 1, 0xb3]))).toBe("mpeg")
    expect(sniffContainer(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBeNull()
    expect(sniffContainer(bytes("hello"))).toBeNull()
    expect(sniffContainer(new Uint8Array(0))).toBeNull()
  })

  it("says why a file cannot be opened, and what to do", () => {
    expect(containerProblem("mp4")).toBeNull()
    expect(containerProblem("ts")).toBeNull()
    expect(containerProblem(null)).toMatch(/not a video file/)
    expect(containerProblem("avi")).toBe(
      "AVI files are not read here. Open it in a desktop player or converter that saves MP4, then convert that."
    )
  })

  it("writes a file in its own kind where it can, otherwise as MP4", () => {
    const cases: [Container, string][] = [
      ["mp4", "mp4"],
      ["mov", "mov"],
      ["webm", "webm"],
      ["mkv", "mkv"],
      ["ts", "mp4"],
      ["ogg", "mp4"],
    ]
    for (const [from, to] of cases) expect(sameContainer(from)).toBe(to)
  })
})
