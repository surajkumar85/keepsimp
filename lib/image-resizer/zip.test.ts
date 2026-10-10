import { describe, expect, it } from "vitest"
import { unzipSync } from "fflate"
import sharp from "sharp"
import {
  applyDensity,
  carriesDensity,
  setJpegDensity,
  setPngDensity,
} from "./metadata"
import { crc32, createZip, dosDateTime } from "./zip"

const text = (value: string) => new TextEncoder().encode(value)

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it("packs dates the way ZIP expects, clamping years before 1980", () => {
    expect(dosDateTime(new Date(2026, 9, 10, 13, 45, 30))).toEqual({
      time: (13 << 11) | (45 << 5) | 15,
      date: (46 << 9) | (10 << 5) | 10,
    })
    expect(dosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0)
  })

  it("writes archives an independent tool can unpack", () => {
    const files = [
      { name: "café-1200x800.jpg", data: text("first file") },
      { name: "b/second.png", data: new Uint8Array([0, 1, 2, 255]) },
      { name: "empty.txt", data: new Uint8Array() },
    ]
    const unpacked = unzipSync(createZip(files))
    expect(Object.keys(unpacked)).toEqual(files.map((file) => file.name))
    for (const file of files)
      expect(Array.from(unpacked[file.name])).toEqual(Array.from(file.data))
    expect(Object.keys(unzipSync(createZip([])))).toEqual([])
  })
})

describe("print density", () => {
  it("writes and replaces PNG pHYs so readers report the DPI", async () => {
    const png = new Uint8Array(
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#00786f" },
      })
        .png()
        .toBuffer()
    )
    const tagged = setPngDensity(png, 300)
    expect((await sharp(tagged).metadata()).density).toBe(300)
    const again = setPngDensity(tagged, 72)
    expect((await sharp(again).metadata()).density).toBe(72)
    expect(again.length).toBe(tagged.length)
    expect((await sharp(again).metadata()).width).toBe(4)
  })

  it("patches or inserts the JPEG JFIF density", async () => {
    const jpeg = new Uint8Array(
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#00786f" },
      })
        .jpeg()
        .toBuffer()
    )
    const tagged = setJpegDensity(jpeg, 300)
    expect((await sharp(tagged).metadata()).density).toBe(300)
    const patched = setJpegDensity(tagged, 72)
    expect(patched.length).toBe(tagged.length)
    expect((await sharp(patched).metadata()).density).toBe(72)
    // Remove the JFIF segment to simulate an encoder that omits it.
    const length = (tagged[4] << 8) | tagged[5]
    const bare = new Uint8Array(tagged.length - length - 2)
    bare.set(tagged.subarray(0, 2))
    bare.set(tagged.subarray(4 + length), 2)
    const inserted = setJpegDensity(bare, 150)
    const metadata = await sharp(inserted).metadata()
    expect(metadata.density).toBe(150)
    expect(metadata.width).toBe(8)
    expect(setJpegDensity(jpeg, 999999)[14]).toBe(0xff)
  })

  it("only touches formats that can carry a density", () => {
    const bytes = new Uint8Array([1, 2, 3])
    expect(applyDensity("webp", bytes, 300)).toBe(bytes)
    expect(applyDensity("avif", bytes, 300)).toBe(bytes)
    expect(carriesDensity("jpeg")).toBe(true)
    expect(carriesDensity("png")).toBe(true)
    expect(carriesDensity("webp")).toBe(false)
  })

  it("routes PNG and JPEG through the right writer", async () => {
    const png = new Uint8Array(
      await sharp({
        create: { width: 2, height: 2, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer()
    )
    const jpeg = new Uint8Array(
      await sharp({
        create: { width: 2, height: 2, channels: 3, background: "#fff" },
      })
        .jpeg()
        .toBuffer()
    )
    expect((await sharp(applyDensity("png", png, 96)).metadata()).density).toBe(
      96
    )
    expect(
      (await sharp(applyDensity("jpeg", jpeg, 96)).metadata()).density
    ).toBe(96)
  })
})
