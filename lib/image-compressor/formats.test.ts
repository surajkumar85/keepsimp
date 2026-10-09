import { describe, expect, it } from "vitest"
import {
  isAnimated,
  outputFilename,
  sameFormatOutput,
  sizeLabel,
  sniffFormat,
} from "./formats"

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string"
        ? [...value].map((char) => char.charCodeAt(0))
        : [value]
    )
  )
const pad = (data: Uint8Array, length: number) => {
  const out = new Uint8Array(Math.max(length, data.length))
  out.set(data)
  return out
}
const text = (value: string) => new TextEncoder().encode(value)
const ftyp = (major: string, ...compatible: string[]) => {
  const size = 16 + compatible.length * 4
  return bytes(0, 0, 0, size, "ftyp", major, 0, 0, 0, 0, ...compatible)
}

describe("format sniffing", () => {
  it.each([
    ["jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)],
    ["png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)],
    ["webp", bytes("RIFF", 0, 0, 0, 0, "WEBP")],
    ["avif", ftyp("avif")],
    ["avif", ftyp("mif1", "miaf", "avif")],
    ["avif", ftyp("avis")],
    ["heic", ftyp("heic", "mif1")],
    ["heic", ftyp("mif1", "heic")],
    ["gif", bytes("GIF89a")],
    ["gif", bytes("GIF87a")],
    ["bmp", pad(bytes("BM"), 26)],
    ["tiff", bytes("II", 0x2a, 0)],
    ["tiff", bytes("MM", 0, 0x2a)],
    ["ico", pad(bytes(0, 0, 1, 0), 22)],
    ["jxl", bytes(0xff, 0x0a)],
    ["jxl", bytes(0, 0, 0, 0x0c, "JXL ", 0x0d, 0x0a, 0x87, 0x0a)],
    ["svg", text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    [
      "svg",
      text('﻿<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg>\n  <svg>'),
    ],
  ])("detects %s from its signature", (format, data) => {
    expect(sniffFormat(data)).toBe(format)
  })

  it.each([
    ["empty", new Uint8Array()],
    ["text", text("hello world")],
    ["truncated PNG", bytes(0x89, "PN")],
    ["short BMP header", bytes("BM", 1, 2)],
    ["short ICO header", bytes(0, 0, 1, 0)],
    ["unknown ISO brand", ftyp("mp42", "isom")],
    ["ftyp without room for a brand", bytes(0, 0, 0, 8, "ftyp")],
    ["svg-like html", text("<html><svg></svg></html>")],
  ])("rejects %s", (_, data) => {
    expect(sniffFormat(data)).toBeNull()
  })
})

function gif(
  frames: number,
  options: { global?: boolean; local?: boolean } = {}
) {
  const parts: number[] = [...bytes("GIF89a", 1, 0, 1, 0)]
  parts.push(options.global ? 0x80 : 0, 0, 0)
  if (options.global) parts.push(...new Array(6).fill(0))
  // Graphic control extension: one sub-block, then terminator.
  parts.push(0x21, 0xf9, 4, 0, 0, 0, 0, 0)
  for (let i = 0; i < frames; i++) {
    parts.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, options.local ? 0x80 : 0)
    if (options.local) parts.push(...new Array(6).fill(0))
    parts.push(2, 2, 0x4c, 0x01, 0)
  }
  parts.push(0x3b)
  return new Uint8Array(parts)
}

function png(...chunks: string[]) {
  const parts: number[] = [...bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)]
  for (const chunk of chunks)
    parts.push(0, 0, 0, 0, ...bytes(chunk), 0, 0, 0, 0)
  return new Uint8Array(parts)
}

describe("animation detection", () => {
  it("counts GIF frames past extensions and colour tables", () => {
    expect(isAnimated(gif(1), "gif")).toBe(false)
    expect(isAnimated(gif(2), "gif")).toBe(true)
    expect(isAnimated(gif(2, { global: true, local: true }), "gif")).toBe(true)
    expect(isAnimated(bytes("GIF89a"), "gif")).toBe(false)
    expect(isAnimated(pad(bytes("GIF89a"), 14), "gif")).toBe(false)
    const unknownBlock = gif(1)
    unknownBlock[unknownBlock.length - 1] = 0x99
    expect(isAnimated(unknownBlock, "gif")).toBe(false)
  })

  it("finds APNG control chunks before image data", () => {
    expect(isAnimated(png("IHDR", "acTL", "IDAT"), "png")).toBe(true)
    expect(isAnimated(png("IHDR", "IDAT", "acTL"), "png")).toBe(false)
    expect(isAnimated(png("IHDR", "IEND"), "png")).toBe(false)
    expect(isAnimated(png("IHDR"), "png")).toBe(false)
  })

  it("reads the WebP animation flag", () => {
    const animated = pad(bytes("RIFF", 0, 0, 0, 0, "WEBP", "VP8X"), 21)
    animated[20] = 0x02
    expect(isAnimated(animated, "webp")).toBe(true)
    animated[20] = 0
    expect(isAnimated(animated, "webp")).toBe(false)
    expect(isAnimated(bytes("RIFF", 0, 0, 0, 0, "WEBP"), "webp")).toBe(false)
    expect(isAnimated(bytes(0xff, 0xd8, 0xff), "jpeg")).toBe(false)
  })
})

describe("output naming", () => {
  it("keeps writable formats and maps others to a choice", () => {
    expect(sameFormatOutput("jpeg")).toBe("jpeg")
    expect(sameFormatOutput("png")).toBe("png")
    expect(sameFormatOutput("webp")).toBe("webp")
    expect(sameFormatOutput("avif")).toBe("avif")
    expect(sameFormatOutput("heic")).toBeNull()
    expect(sameFormatOutput("svg")).toBeNull()
  })

  it("builds safe filenames with the real extension", () => {
    expect(outputFilename("My photo.HEIC", "jpeg")).toBe(
      "My-photo-keepsimp.jpg"
    )
    expect(outputFilename("café.png", "avif")).toBe("café-keepsimp.avif")
    expect(outputFilename(".png", "webp")).toBe("image-keepsimp.webp")
    expect(outputFilename("a".repeat(200) + ".png", "png")).toHaveLength(
      100 + "-keepsimp.png".length
    )
  })

  it("labels sizes in bytes, kilobytes and megabytes", () => {
    expect(sizeLabel(512)).toBe("512 B")
    expect(sizeLabel(1536)).toBe("1.5 KB")
    expect(sizeLabel(5 * 1024 * 1024)).toBe("5.00 MB")
  })
})
