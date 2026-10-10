import { describe, expect, it } from "vitest"
import { lzw } from "@/lib/image-converter/encoders/gif"
import { crc32 } from "@/lib/image-resizer/zip"
import { ByteWriter, ascii, u16be, u32be, u32le } from "./bytes"
import { pngChunk, pngSignature, readApng } from "./decoders/apng"
import { decodeGifFrame, gifDuration, readGif, unlzw } from "./decoders/gif"
import { readWebp, riffChunk, riffChunks, webpFile } from "./decoders/webp"
import { filterRows, writeApng } from "./encoders/apng"
import { paletteBits, retimeGif, writeGif } from "./encoders/gif"
import { pictureChunks, writeWebp } from "./encoders/webp"
import type { Colour } from "./types"

const palette: Colour[] = [
  [0, 0, 0, 255],
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
]

describe("GIF", () => {
  const two = () =>
    writeGif({
      width: 4,
      height: 2,
      palette,
      plays: 0,
      images: [
        {
          x: 0,
          y: 0,
          width: 4,
          height: 2,
          indices: Uint8Array.of(1, 1, 2, 2, 3, 3, 0, 0),
          delay: 8,
          dispose: "none",
          transparent: null,
        },
        {
          x: 1,
          y: 0,
          width: 2,
          height: 2,
          indices: Uint8Array.of(3, 0, 0, 3),
          delay: 12,
          dispose: "background",
          transparent: 0,
        },
      ],
    })

  it("writes a file its own reader understands", () => {
    const bytes = two()
    expect(ascii(bytes, 0, 6)).toBe("GIF89a")
    expect(bytes[bytes.length - 1]).toBe(0x3b)
    const file = readGif(bytes)
    expect([file.width, file.height, file.plays]).toEqual([4, 2, 0])
    expect(file.frames).toHaveLength(2)
    expect(file.frames[0]).toMatchObject({
      x: 0,
      width: 4,
      duration: 80,
      dispose: "none",
      blend: "over",
      transparent: null,
      interlaced: false,
    })
    expect(file.frames[1]).toMatchObject({
      x: 1,
      width: 2,
      duration: 120,
      dispose: "background",
      transparent: 0,
    })
    expect([...decodeGifFrame(bytes, file.frames[0])]).toEqual([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
    ])
    // The transparent colour becomes clear pixels.
    expect([...decodeGifFrame(bytes, file.frames[1])]).toEqual([
      0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255,
    ])
  })

  it("stores the number of plays as repeats, and nothing for one play", () => {
    const make = (plays: number) =>
      writeGif({ width: 1, height: 1, palette, plays, images: [] })
    const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1")
    expect(text(make(1))).not.toContain("NETSCAPE2.0")
    const forever = make(0)
    const five = make(5)
    const at = text(five).indexOf("NETSCAPE2.0") + 13
    expect(forever[at] | (forever[at + 1] << 8)).toBe(0)
    expect(five[at] | (five[at + 1] << 8)).toBe(4)
  })

  it("sizes the colour table to a power of two", () => {
    expect([1, 2, 3, 4, 5, 16, 17, 256].map(paletteBits)).toEqual([
      1, 1, 2, 2, 3, 4, 5, 8,
    ])
    // A two-colour table still uses the smallest code size GIF allows.
    const bytes = writeGif({
      width: 2,
      height: 1,
      palette: palette.slice(0, 2),
      plays: 1,
      images: [
        {
          x: 0,
          y: 0,
          width: 2,
          height: 1,
          indices: Uint8Array.of(1, 0),
          delay: 5,
          dispose: "none",
          transparent: null,
        },
      ],
    })
    const file = readGif(bytes)
    expect(bytes[file.frames[0].data]).toBe(2)
    expect([...decodeGifFrame(bytes, file.frames[0])]).toEqual([
      255, 0, 0, 255, 0, 0, 0, 255,
    ])
  })

  it("reads how many times a file plays", () => {
    const withPlays = (plays: number) =>
      readGif(
        writeGif({
          width: 1,
          height: 1,
          palette,
          plays,
          images: [
            {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              indices: Uint8Array.of(1),
              delay: 10,
              dispose: "none",
              transparent: null,
            },
          ],
        })
      ).plays
    expect([0, 1, 2, 7].map(withPlays)).toEqual([0, 1, 2, 7])
  })

  it("treats very short delays the way browsers do", () => {
    expect([0, 1, 2, 5].map(gifDuration)).toEqual([100, 100, 20, 50])
  })

  it("round-trips long runs and code-table resets through LZW", () => {
    const indices = new Uint8Array(40_000)
    let seed = 7
    for (let i = 0; i < indices.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      indices[i] = i < 3000 ? 2 : (seed >> 8) & 0xff
    }
    const packed = Uint8Array.from([8, ...lzw(indices, 8)])
    expect([...unlzw(packed, 0, indices.length)]).toEqual([...indices])
  })

  it("reads files from encoders that keep a full code table instead of resetting it", () => {
    // LZW as many encoders write it: once 4,096 codes exist, no more are added.
    const pack = (indices: Uint8Array, minimum: number) => {
      const clear = 1 << minimum
      const bytes: number[] = []
      let [buffer, bits, size, next] = [0, 0, minimum + 1, clear + 2]
      const table = new Map<number, number>()
      const write = (code: number) => {
        buffer |= code << bits
        bits += size
        for (; bits >= 8; bits -= 8, buffer >>>= 8) bytes.push(buffer & 0xff)
      }
      write(clear)
      let prefix = indices[0]
      for (let i = 1; i < indices.length; i++) {
        const key = (prefix << 8) | indices[i]
        const known = table.get(key)
        if (known !== undefined) {
          prefix = known
          continue
        }
        write(prefix)
        if (next < 4096) {
          table.set(key, next++)
          if (next > 1 << size && size < 12) size++
        }
        prefix = indices[i]
      }
      write(prefix)
      write(clear + 1)
      if (bits > 0) bytes.push(buffer & 0xff)
      const blocks = [minimum]
      for (let i = 0; i < bytes.length; i += 255)
        blocks.push(Math.min(255, bytes.length - i), ...bytes.slice(i, i + 255))
      return Uint8Array.from([...blocks, 0])
    }
    const indices = new Uint8Array(30_000)
    let seed = 11
    for (let i = 0; i < indices.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      indices[i] = (seed >> 8) & 0xff
    }
    expect([...unlzw(pack(indices, 8), 0, indices.length)]).toEqual([
      ...indices,
    ])
  })

  it("leaves missing pixels at colour 0 when the data stops early", () => {
    const packed = Uint8Array.from([
      2,
      ...lzw(Uint8Array.of(1, 2, 3, 1, 2, 3), 2),
    ])
    const cut = packed.slice(0, 3)
    const indices = unlzw(cut, 0, 6)
    expect(indices).toHaveLength(6)
    expect(indices[5]).toBe(0)
    // An end code before the picture is complete stops there too.
    expect([...unlzw(Uint8Array.of(2, 1, 0b101, 0), 0, 3)]).toEqual([0, 0, 0])
  })

  it("reads interlaced rows, local palettes and files without a control block", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    // Interlaced order: rows 0 and 8, then 4, then 2 and 6, then the odd rows.
    const stored = [0, 8, 4, 2, 6, 1, 3, 5, 7]
    const out = new ByteWriter()
      .ascii("GIF87a")
      .u16le(1)
      .u16le(9)
      .bytes([0, 0, 0])
      // A comment block is skipped.
      .bytes([0x21, 0xfe, 2, 0x68, 0x69, 0])
      .u8(0x2c)
      .u16le(0)
      .u16le(0)
      .u16le(1)
      .u16le(9)
      // Local palette of 16 colours, interlaced.
      .u8(0x80 | 0x40 | 3)
    const local = new Uint8Array(48)
    for (let colour = 0; colour < 16; colour++) local[colour * 3] = colour * 10
    out
      .bytes(local)
      .u8(4)
      .bytes(lzw(Uint8Array.from(stored), 4))
      .u8(0x3b)
    const bytes = out.finish()
    const file = readGif(bytes)
    expect(file.plays).toBe(1)
    expect(file.frames[0]).toMatchObject({
      interlaced: true,
      duration: 100,
      dispose: "none",
      transparent: null,
    })
    const pixels = decodeGifFrame(bytes, file.frames[0])
    expect(rows.map((row) => pixels[row * 4])).toEqual(
      rows.map((row) => row * 10)
    )
  })

  it("reads the 'restore previous' rule and stops at unknown blocks", () => {
    const bytes = two()
    const file = readGif(bytes)
    const control = file.frames[1].data - 10 - 8
    const changed = bytes.slice()
    changed[control + 3] = (3 << 2) | 1
    expect(readGif(changed).frames[1].dispose).toBe("previous")
    // Anything after an unknown block is ignored, not guessed at.
    const broken = bytes.slice()
    broken[file.frames[1].data - 10 - 8] = 0x99
    expect(readGif(broken).frames).toHaveLength(1)
  })

  it("copes with data that ends mid-code or holds more than the picture", () => {
    // The block says three bytes follow, but the file ends after one.
    expect([...unlzw(Uint8Array.of(2, 3, 0b100), 0, 4)]).toEqual([0, 0, 0, 0])
    // Nothing at all after the code size.
    expect([...unlzw(Uint8Array.of(2), 0, 2)]).toEqual([0, 0])
    // A run of six pixels decoded into room for four stops at four.
    const packed = Uint8Array.from([
      2,
      ...lzw(Uint8Array.of(1, 1, 1, 1, 1, 1), 2),
    ])
    expect([...unlzw(packed, 0, 4)]).toEqual([1, 1, 1, 1])
  })

  it("retimes a GIF that has no shared colour table", () => {
    const out = new ByteWriter()
      .ascii("GIF89a")
      .u16le(1)
      .u16le(1)
      .bytes([0, 0, 0])
    for (let frame = 0; frame < 2; frame++)
      out
        .u8(0x2c)
        .u16le(0)
        .u16le(0)
        .u16le(1)
        .u16le(1)
        .u8(0x80)
        .bytes([0, 0, 0, 255, 255, 255])
        .u8(2)
        .bytes(lzw(Uint8Array.of(1), 2))
    // Only the first frame is given a delay; the second gets none.
    const file = readGif(retimeGif(out.u8(0x3b).finish(), 1, [9]))
    expect(file.frames.map((frame) => frame.duration)).toEqual([90, 100])
    expect(file.plays).toBe(1)
  })

  it("refuses files that are not GIFs or have no frames", () => {
    expect(() =>
      readGif(Uint8Array.from("PNG...", (c) => c.charCodeAt(0)))
    ).toThrow("This is not a GIF file.")
    expect(() =>
      readGif(writeGif({ width: 2, height: 2, palette, plays: 0, images: [] }))
    ).toThrow("This GIF has no frames.")
  })

  it("uses black for colours missing from a short palette", () => {
    const bytes = two()
    const frame = { ...readGif(bytes).frames[0], palette: new Uint8Array(3) }
    expect([...decodeGifFrame(bytes, frame).subarray(0, 4)]).toEqual([
      0, 0, 0, 255,
    ])
  })

  it("retimes a finished GIF without touching its pictures", () => {
    const bytes = two()
    const retimed = retimeGif(bytes, 3, [25, 50])
    const file = readGif(retimed)
    expect(file.plays).toBe(3)
    expect(file.frames.map((frame) => frame.duration)).toEqual([250, 500])
    expect([...decodeGifFrame(retimed, file.frames[0])]).toEqual([
      ...decodeGifFrame(bytes, readGif(bytes).frames[0]),
    ])
    // The old loop block is replaced, not kept beside the new one.
    expect(
      Buffer.from(retimed).toString("latin1").split("NETSCAPE2.0")
    ).toHaveLength(2)
    expect(readGif(retimeGif(bytes, 1, null)).plays).toBe(1)
    expect(
      readGif(retimeGif(bytes, 0, null)).frames.map((frame) => frame.duration)
    ).toEqual([80, 120])
    // Fewer delays than frames leaves the rest at zero, shown as 100 ms.
    expect(readGif(retimeGif(bytes, 0, [7])).frames[1].duration).toBe(100)
  })

  it("gives a frame a control block when it has none, and keeps other blocks", () => {
    const out = new ByteWriter()
      .ascii("GIF89a")
      .u16le(1)
      .u16le(1)
      .bytes([0x80, 0, 0])
      .bytes([0, 0, 0, 255, 255, 255])
      .bytes([0x21, 0xfe, 2, 0x68, 0x69, 0])
      .u8(0x2c)
      .u16le(0)
      .u16le(0)
      .u16le(1)
      .u16le(1)
      // A local palette, so the reader has to step over it.
      .u8(0x80)
      .bytes([9, 9, 9, 8, 8, 8])
      .u8(2)
      .bytes(lzw(Uint8Array.of(1), 2))
      .bytes([0x99])
    const retimed = retimeGif(out.finish(), 0, [30])
    const file = readGif(retimed)
    expect(file.frames[0].duration).toBe(300)
    expect(file.plays).toBe(0)
    expect(Buffer.from(retimed).toString("latin1")).toContain("hi")
    expect(retimed[retimed.length - 1]).toBe(0x3b)
    // Without new delays nothing is invented.
    expect(readGif(retimeGif(out.finish(), 0, null)).frames[0].duration).toBe(
      100
    )
  })
})

describe("APNG", () => {
  const row = (values: number[]) => Uint8Array.from(values)

  it("writes chunks with checksums and reads its own files", () => {
    const first = row([1, 2, 3])
    const second = row([4, 5])
    const bytes = writeApng({
      width: 3,
      height: 2,
      colour: "rgba",
      plays: 2,
      images: [
        {
          x: 0,
          y: 0,
          width: 3,
          height: 2,
          data: first,
          duration: 80,
          blend: "source",
        },
        {
          x: 1,
          y: 0,
          width: 2,
          height: 1,
          data: second,
          duration: 33.4,
          blend: "over",
        },
      ],
    })
    // Every chunk's checksum covers its type and data.
    let offset = 8
    const types: string[] = []
    while (offset < bytes.length) {
      const length = u32be(bytes, offset)
      types.push(ascii(bytes, offset + 4, 4))
      expect(u32be(bytes, offset + 8 + length)).toBe(
        crc32(bytes.subarray(offset + 4, offset + 8 + length))
      )
      offset += 12 + length
    }
    expect(types).toEqual([
      "IHDR",
      "acTL",
      "fcTL",
      "IDAT",
      "fcTL",
      "fdAT",
      "IEND",
    ])

    const file = readApng(bytes)
    expect([file.width, file.height, file.plays]).toEqual([3, 2, 2])
    expect(file.frames).toHaveLength(2)
    expect(file.frames[0]).toMatchObject({
      x: 0,
      width: 3,
      height: 2,
      duration: 80,
      dispose: "none",
      blend: "source",
    })
    expect(file.frames[1]).toMatchObject({
      x: 1,
      width: 2,
      height: 1,
      duration: 33,
      blend: "over",
    })
    // Each frame is a PNG of its own: its size in the header, its data as IDAT.
    const png = file.frames[1].png
    expect(u32be(png, 16)).toBe(2)
    expect(u32be(png, 20)).toBe(1)
    const idat = Buffer.from(png).indexOf("IDAT")
    expect([...png.subarray(idat + 4, idat + 6)]).toEqual([4, 5])
    expect(ascii(png, png.length - 8, 4)).toBe("IEND")
  })

  it("numbers frame controls and frame data in one sequence", () => {
    const bytes = writeApng({
      width: 1,
      height: 1,
      colour: "rgb",
      plays: 0,
      images: [0, 1, 2].map(() => ({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        data: row([9]),
        duration: 10,
        blend: "source" as const,
      })),
    })
    const sequence: number[] = []
    let offset = 8
    while (offset < bytes.length) {
      const type = ascii(bytes, offset + 4, 4)
      if (type === "fcTL" || type === "fdAT")
        sequence.push(u32be(bytes, offset + 8))
      offset += 12 + u32be(bytes, offset)
    }
    expect(sequence).toEqual([0, 1, 2, 3, 4])
    // Truecolour without alpha is colour type 2.
    expect(bytes[25]).toBe(2)
  })

  it("writes a palette with only the opacity it needs", () => {
    const colours: Colour[] = [
      [1, 2, 3, 0],
      [4, 5, 6, 128],
      [7, 8, 9, 255],
    ]
    const make = (table: Colour[]) =>
      writeApng({
        width: 1,
        height: 1,
        colour: "indexed",
        palette: table,
        plays: 0,
        images: [
          {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            data: row([0]),
            duration: 100000,
            blend: "source",
          },
        ],
      })
    const bytes = make(colours)
    const text = Buffer.from(bytes).toString("latin1")
    expect(bytes[25]).toBe(3)
    const plte = text.indexOf("PLTE")
    expect([...bytes.subarray(plte + 4, plte + 13)]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    const trns = text.indexOf("tRNS")
    expect(u32be(bytes, trns - 4)).toBe(2)
    expect([...bytes.subarray(trns + 4, trns + 6)]).toEqual([0, 128])
    // A solid palette needs no opacity chunk; a very long delay is capped.
    expect(
      Buffer.from(make([[1, 1, 1, 255]])).toString("latin1")
    ).not.toContain("tRNS")
    const control = text.indexOf("fcTL")
    expect(u16be(bytes, control + 24)).toBe(65535)
    expect(readApng(bytes).frames[0].png.includes(0x50)).toBe(true)
    expect(
      Buffer.from(readApng(bytes).frames[0].png).toString("latin1")
    ).toContain("PLTE")
  })

  it("picks the row filter that leaves the smallest values", () => {
    // A flat row is all zeros after "sub"; a row equal to the one above after "up".
    const flat = new Uint8Array(8).fill(200)
    expect([...filterRows(flat, 2, 1, 4)]).toEqual([
      1, 200, 200, 200, 200, 0, 0, 0, 0,
    ])
    const repeated = Uint8Array.from([10, 90, 30, 250, 10, 90, 30, 250])
    expect([...filterRows(repeated, 1, 2, 4).subarray(5)]).toEqual([
      2, 0, 0, 0, 0,
    ])
    // A smooth ramp in both directions suits the average or Paeth filter.
    const ramp = new Uint8Array(4 * 4 * 3)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++)
        ramp.fill((x * 7 + y * 5) * 3, (y * 4 + x) * 3, (y * 4 + x) * 3 + 3)
    const filtered = filterRows(ramp, 4, 4, 3)
    expect([1, 2, 3, 4]).toContain(filtered[13])
    expect(filtered).toHaveLength((4 * 3 + 1) * 4)
    // Palette indices are stored as they are.
    expect([...filterRows(Uint8Array.of(5, 6, 7, 8), 2, 2, 1)]).toEqual([
      0, 5, 6, 0, 7, 8,
    ])
  })

  it("undoes its own filters", () => {
    const width = 5
    const height = 4
    const data = new Uint8Array(width * height * 4)
    let seed = 3
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      data[i] = i % 7 === 0 ? (seed >> 8) & 0xff : (i * 3) & 0xff
    }
    const filtered = filterRows(data, width, height, 4)
    const stride = width * 4
    const out = new Uint8Array(data.length)
    const paeth = (a: number, b: number, c: number) => {
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
    for (let y = 0; y < height; y++) {
      const filter = filtered[y * (stride + 1)]
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? out[y * stride + i - 4] : 0
        const up = y > 0 ? out[(y - 1) * stride + i] : 0
        const corner = y > 0 && i >= 4 ? out[(y - 1) * stride + i - 4] : 0
        const predicted = [
          0,
          left,
          up,
          (left + up) >> 1,
          paeth(left, up, corner),
        ][filter]
        out[y * stride + i] =
          (filtered[y * (stride + 1) + 1 + i] + predicted) & 0xff
      }
    }
    expect([...out]).toEqual([...data])
  })

  it("reads disposal rules, odd delays and skips a fallback picture", () => {
    const out = pngSignature(new ByteWriter())
    pngChunk(
      out,
      "IHDR",
      new ByteWriter().u32be(2).u32be(2).bytes([8, 6, 0, 0, 0]).finish()
    )
    pngChunk(out, "acTL", new ByteWriter().u32be(3).u32be(0).finish())
    pngChunk(out, "gAMA", Uint8Array.of(0, 0, 177, 143))
    // A picture for viewers that cannot animate; it is not a frame.
    pngChunk(out, "IDAT", Uint8Array.of(99))
    const control = (
      dispose: number,
      blend: number,
      numerator: number,
      denominator: number
    ) =>
      new ByteWriter()
        .u32be(0)
        .u32be(2)
        .u32be(2)
        .u32be(0)
        .u32be(0)
        .u16be(numerator)
        .u16be(denominator)
        .u8(dispose)
        .u8(blend)
        .finish()
    // Frame data with no frame to belong to is ignored as well.
    pngChunk(out, "fdAT", Uint8Array.of(0, 0, 0, 0, 55))
    pngChunk(out, "fcTL", control(1, 0, 1, 0))
    pngChunk(out, "fdAT", Uint8Array.of(0, 0, 0, 1, 7))
    pngChunk(out, "fdAT", Uint8Array.of(0, 0, 0, 2, 8))
    pngChunk(out, "fcTL", control(2, 1, 0, 30))
    pngChunk(out, "tEXt", Uint8Array.of(1))
    pngChunk(out, "fdAT", Uint8Array.of(0, 0, 0, 4, 9))
    // A control with no data after it is not a frame.
    pngChunk(out, "fcTL", control(0, 0, 1, 10))
    pngChunk(out, "IEND", new Uint8Array(0))
    pngChunk(out, "fdAT", Uint8Array.of(0, 0, 0, 9, 1))
    const file = readApng(out.finish())
    expect(file.frames).toHaveLength(2)
    expect(file.frames[0]).toMatchObject({
      dispose: "background",
      blend: "source",
      duration: 10,
    })
    expect(file.frames[1]).toMatchObject({
      dispose: "previous",
      blend: "over",
      duration: 10,
    })
    const first = Buffer.from(file.frames[0].png).toString("latin1")
    // Shared chunks are copied; both parts of a split frame are kept.
    expect(first).toContain("gAMA")
    expect(first.split("IDAT")).toHaveLength(3)
    expect(Buffer.from(file.frames[1].png).toString("latin1")).not.toContain(
      "tEXt"
    )
  })

  it("refuses files that are not animated PNGs", () => {
    expect(() => readApng(Uint8Array.of(1, 2, 3))).toThrow(
      "This is not a PNG file."
    )
    const still = pngSignature(new ByteWriter())
    pngChunk(
      still,
      "IHDR",
      new ByteWriter().u32be(1).u32be(1).bytes([8, 6, 0, 0, 0]).finish()
    )
    pngChunk(still, "IDAT", Uint8Array.of(1))
    pngChunk(still, "IEND", new Uint8Array(0))
    expect(() => readApng(still.finish())).toThrow("This PNG is not animated.")
    expect(() => readApng(pngSignature(new ByteWriter()).finish())).toThrow(
      "This PNG is not animated."
    )
  })
})

describe("WebP", () => {
  /** A stand-in still WebP: the reader only looks at its chunks. */
  const still = (parts: [string, number[]][]) => {
    const body = new ByteWriter()
    for (const [type, data] of parts)
      riffChunk(body, type, Uint8Array.from(data))
    return webpFile(body.finish())
  }

  it("pads odd-sized chunks and reads them back", () => {
    const file = still([
      ["ALPH", [1, 2, 3]],
      ["VP8 ", [4, 5]],
    ])
    expect(u32le(file, 4)).toBe(file.length - 8)
    expect(file.length % 2).toBe(0)
    const chunks = riffChunks(file, 12, file.length)
    expect(chunks.map((chunk) => [chunk.type, [...chunk.data]])).toEqual([
      ["ALPH", [1, 2, 3]],
      ["VP8 ", [4, 5]],
    ])
    // A chunk that claims more than the file holds is cut at the end.
    const cut = file.slice(0, file.length - 1)
    expect(riffChunks(cut, 12, cut.length)[1].data).toHaveLength(1)
  })

  it("takes the picture chunks out of a still WebP", () => {
    const extended = still([
      ["VP8X", [0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0]],
      ["ICCP", [9]],
      ["ALPH", [1]],
      ["VP8 ", [2]],
      ["EXIF", [3]],
    ])
    expect(pictureChunks(extended).map((chunk) => chunk.type)).toEqual([
      "ALPH",
      "VP8 ",
    ])
    expect(pictureChunks(still([["VP8L", [7]]]))[0].type).toBe("VP8L")
    expect(() =>
      pictureChunks(Uint8Array.from("GIF89a------", (c) => c.charCodeAt(0)))
    ).toThrow("The WebP encoder returned something else.")
    expect(() => pictureChunks(still([["ALPH", [1]]]))).toThrow(
      "The WebP encoder returned no picture."
    )
  })

  it("writes an animation its own reader understands", () => {
    const bytes = writeWebp({
      width: 6,
      height: 4,
      alpha: true,
      plays: 3,
      images: [
        {
          x: 0,
          y: 0,
          width: 6,
          height: 4,
          webp: still([["VP8L", [1, 2, 3]]]),
          duration: 80.4,
          blend: "source",
        },
        {
          x: 2,
          y: 2,
          width: 3,
          height: 2,
          webp: still([
            ["VP8X", [0x10, 0, 0, 0, 2, 0, 0, 1, 0, 0]],
            ["ALPH", [9]],
            ["VP8 ", [8, 7]],
          ]),
          duration: 5,
          blend: "over",
        },
      ],
    })
    expect(ascii(bytes, 12, 4)).toBe("VP8X")
    // Animation and alpha flags.
    expect(bytes[20]).toBe(0x12)
    const file = readWebp(bytes)
    expect([file.width, file.height, file.plays]).toEqual([6, 4, 3])
    expect(file.frames[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 6,
      height: 4,
      duration: 80,
      dispose: "none",
      blend: "source",
    })
    // Very short frames are shown at 100 ms by browsers.
    expect(file.frames[1]).toMatchObject({
      x: 2,
      y: 2,
      width: 3,
      height: 2,
      duration: 100,
      blend: "over",
    })
    // A plain frame becomes a simple file; one with alpha gets the extended header.
    expect(
      riffChunks(file.frames[0].webp, 12, 999).map((chunk) => chunk.type)
    ).toEqual(["VP8L"])
    const second = riffChunks(
      file.frames[1].webp,
      12,
      file.frames[1].webp.length
    )
    expect(second.map((chunk) => chunk.type)).toEqual(["VP8X", "ALPH", "VP8 "])
    expect(second[0].data[0]).toBe(0x10)
    expect([second[0].data[4], second[0].data[7]]).toEqual([2, 1])
  })

  it("writes solid animations without the alpha flag and caps the play count", () => {
    const bytes = writeWebp({
      width: 2,
      height: 2,
      alpha: false,
      plays: 100_000,
      images: [
        {
          x: 0,
          y: 0,
          width: 2,
          height: 2,
          webp: still([["VP8 ", [1]]]),
          duration: 0,
          blend: "source",
        },
      ],
    })
    expect(bytes[20]).toBe(0x02)
    expect(readWebp(bytes).plays).toBe(65535)
    // A zero duration is written as the shortest one the format has.
    const anmf = Buffer.from(bytes).indexOf("ANMF")
    expect(bytes[anmf + 8 + 12]).toBe(1)
  })

  it("refuses patches on odd pixels", () => {
    expect(() =>
      writeWebp({
        width: 4,
        height: 4,
        alpha: false,
        plays: 0,
        images: [
          {
            x: 1,
            y: 0,
            width: 2,
            height: 2,
            webp: still([["VP8 ", [1]]]),
            duration: 50,
            blend: "source",
          },
        ],
      })
    ).toThrow("even pixels")
    expect(() =>
      writeWebp({
        width: 4,
        height: 4,
        alpha: false,
        plays: 0,
        images: [
          {
            x: 0,
            y: 3,
            width: 2,
            height: 1,
            webp: still([["VP8 ", [1]]]),
            duration: 50,
            blend: "source",
          },
        ],
      })
    ).toThrow("even pixels")
  })

  it("reads disposal, a missing loop block, and refuses other files", () => {
    const body = new ByteWriter()
    riffChunk(body, "VP8X", Uint8Array.of(0x02, 0, 0, 0, 3, 0, 0, 1, 0, 0))
    const frame = new ByteWriter()
      .u24le(1)
      .u24le(0)
      .u24le(1)
      .u24le(1)
      .u24le(40)
      // Dispose to background, blend over.
      .u8(0x01)
    riffChunk(frame, "VP8 ", Uint8Array.of(5))
    riffChunk(body, "ANMF", frame.finish())
    const file = readWebp(webpFile(body.finish()))
    expect(file.plays).toBe(0)
    expect([file.width, file.height]).toEqual([4, 2])
    expect(file.frames[0]).toMatchObject({
      x: 2,
      dispose: "background",
      blend: "over",
      duration: 40,
    })

    expect(() =>
      readWebp(Uint8Array.from("RIFF----WAVE", (c) => c.charCodeAt(0)))
    ).toThrow("This is not a WebP file.")
    expect(() => readWebp(still([["VP8 ", [1]]]))).toThrow(
      "This WebP is not animated."
    )
    expect(() =>
      readWebp(still([["VP8X", [0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]]]))
    ).toThrow("This WebP is not animated.")
    expect(() =>
      readWebp(still([["VP8X", [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]]]))
    ).toThrow("This WebP has no frames.")
    const empty = new ByteWriter()
    riffChunk(empty, "VP8X", Uint8Array.of(0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0))
    riffChunk(
      empty,
      "ANMF",
      new ByteWriter().bytes(new Uint8Array(16)).finish()
    )
    expect(() => readWebp(webpFile(empty.finish()))).toThrow(
      "a frame without a picture"
    )
  })
})
