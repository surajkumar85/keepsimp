import { describe, expect, it } from "vitest"
import { jpegOrientation, pictureLayout, quarterTurns } from "./picture"

/** A JPEG's first bytes with an EXIF block that names an orientation. */
function jpeg(orientation: number | null, little = true, before = 0) {
  const u16 = (value: number, le = false) =>
    le ? [value & 255, value >> 8] : [value >> 8, value & 255]
  const u32 = (value: number, le = false) =>
    le
      ? [value & 255, (value >> 8) & 255, (value >> 16) & 255, value >>> 24]
      : [value >>> 24, (value >> 16) & 255, (value >> 8) & 255, value & 255]
  const bytes = [0xff, 0xd8]
  // Other blocks may come first, such as the JFIF header.
  for (let block = 0; block < before; block++)
    bytes.push(0xff, 0xe0, ...u16(6), 1, 2, 3, 4)
  if (orientation !== null) {
    const tiff = [
      ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
      ...u16(42, little),
      ...u32(8, little),
      ...u16(2, little),
      // An unrelated entry first, then the orientation.
      ...u16(0x010f, little),
      ...u16(2, little),
      ...u32(1, little),
      ...u32(0, little),
      ...u16(0x0112, little),
      ...u16(3, little),
      ...u32(1, little),
      ...u16(orientation, little),
      0,
      0,
    ]
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
    bytes.push(0xff, 0xe1, ...u16(body.length + 2), ...body)
  }
  bytes.push(0xff, 0xda, 0, 2, 1, 2, 3)
  return Uint8Array.from(bytes)
}

describe("jpegOrientation", () => {
  it("reads the orientation in either byte order", () => {
    for (const value of [1, 3, 6, 8, 2])
      for (const little of [true, false])
        expect(jpegOrientation(jpeg(value, little)), `${value}`).toBe(value)
  })

  it("looks past other blocks", () => {
    expect(jpegOrientation(jpeg(6, true, 3))).toBe(6)
  })

  it("says upright when nothing says otherwise", () => {
    expect(jpegOrientation(jpeg(null))).toBe(1)
    expect(jpegOrientation(jpeg(null, true, 2))).toBe(1)
    expect(jpegOrientation(jpeg(0))).toBe(1)
    expect(jpegOrientation(jpeg(9))).toBe(1)
    expect(jpegOrientation(new Uint8Array(0))).toBe(1)
    expect(jpegOrientation(Uint8Array.of(0xff, 0xd8))).toBe(1)
    // A PNG is not a JPEG.
    expect(jpegOrientation(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 1, 2))).toBe(1)
    // Bytes that are not block markers end the search.
    expect(
      jpegOrientation(Uint8Array.of(0xff, 0xd8, 0x12, 0x34, 0, 4, 0, 0))
    ).toBe(1)
  })

  it("survives a file cut short inside its headers", () => {
    const whole = jpeg(6)
    // Wherever the file ends, the answer is the orientation or "upright", never an error.
    for (let length = 0; length <= whole.length; length++)
      expect([1, 6], `${length} bytes`).toContain(
        jpegOrientation(whole.subarray(0, length))
      )
    expect(jpegOrientation(whole.subarray(0, 20))).toBe(1)
  })

  it("says upright when the EXIF block does not name an orientation", () => {
    const without = jpeg(6)
    // Change the orientation's tag number into another one.
    without[without.indexOf(0x12, 20)] = 0x13
    expect(jpegOrientation(without)).toBe(1)
  })

  it("reads from a view into a larger buffer", () => {
    const whole = jpeg(8)
    const padded = new Uint8Array(whole.length + 10)
    padded.set(whole, 5)
    expect(jpegOrientation(padded.subarray(5, 5 + whole.length))).toBe(8)
  })
})

describe("quarterTurns", () => {
  it("turns the orientations that only turn", () => {
    expect(quarterTurns(1)).toBe(0)
    expect(quarterTurns(6)).toBe(90)
    expect(quarterTurns(3)).toBe(180)
    expect(quarterTurns(8)).toBe(270)
  })

  it("has no answer for the ones that mirror", () => {
    for (const mirrored of [2, 4, 5, 7, 0, 9])
      expect(quarterTurns(mirrored)).toBeNull()
  })
})

describe("pictureLayout", () => {
  const photo = { width: 3000, height: 2000 }

  it("fits the page to the picture at 150 pixels an inch", () => {
    expect(pictureLayout(photo, 0, "fit", "normal", null)).toEqual({
      page: { width: 1440, height: 960 },
      matrix: [1440, 0, 0, 960, 0, 0],
    })
  })

  it("centres the picture on a sheet turned to suit it, inside the margin", () => {
    const wide = pictureLayout(photo, 0, "a4", "normal", null)
    expect(wide.page).toEqual({ width: 841.89, height: 595.28 })
    // 769.89 wide leaves 36 on either side; the height follows the shape.
    expect(wide.matrix).toEqual([769.89, 0, 0, 513.26, 36, 41.01])
    const tall = pictureLayout(
      { width: 1000, height: 3000 },
      0,
      "letter",
      "none",
      null
    )
    expect(tall.page).toEqual({ width: 612, height: 792 })
    expect(tall.matrix).toEqual([264, 0, 0, 792, 174, 0])
    const square = pictureLayout(
      { width: 500, height: 500 },
      0,
      "a4",
      "small",
      null
    )
    expect(square.page).toEqual({ width: 595.28, height: 841.89 })
    expect(square.matrix).toEqual([559.28, 0, 0, 559.28, 18, 141.31])
  })

  it("takes the size of the page before, or A4 when there is none", () => {
    const after = pictureLayout(photo, 0, "previous", "none", {
      width: 400,
      height: 600,
    })
    // The page before was upright; the picture is wide, so the sheet is turned.
    expect(after.page).toEqual({ width: 600, height: 400 })
    expect(after.matrix).toEqual([600, 0, 0, 400, 0, 0])
    expect(pictureLayout(photo, 0, "previous", "none", null).page).toEqual({
      width: 841.89,
      height: 595.28,
    })
  })

  it("keeps the margin within reason on a very small page", () => {
    const tiny = pictureLayout(
      { width: 10, height: 10 },
      0,
      "previous",
      "normal",
      {
        width: 40,
        height: 40,
      }
    )
    expect(tiny.matrix).toEqual([20, 0, 0, 20, 10, 10])
  })

  it("turns a picture that is stored on its side", () => {
    const stored = { width: 3000, height: 2000 }
    // Turned a quarter, it is shown 2000 wide and 3000 tall.
    const right = pictureLayout(stored, 90, "fit", "none", null)
    expect(right.page).toEqual({ width: 960, height: 1440 })
    expect(right.matrix).toEqual([0, -1440, 960, 0, 0, 1440])
    expect(pictureLayout(stored, 270, "fit", "none", null).matrix).toEqual([
      0, 1440, -960, 0, 960, 0,
    ])
    const upsideDown = pictureLayout(stored, 180, "fit", "none", null)
    expect(upsideDown.page).toEqual({ width: 1440, height: 960 })
    expect(upsideDown.matrix).toEqual([-1440, 0, 0, -960, 1440, 960])
  })

  it("places every corner of a turned picture on the page", () => {
    const corner = (m: number[], u: number, v: number) => [
      m[0] * u + m[2] * v + m[4],
      m[1] * u + m[3] * v + m[5],
    ]
    for (const turn of [0, 90, 180, 270] as const) {
      const { page, matrix } = pictureLayout(
        { width: 300, height: 100 },
        turn,
        "a4",
        "small",
        null
      )
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const [x, y] = corner(matrix, u, v)
        expect(x, `${turn}`).toBeGreaterThanOrEqual(17.99)
        expect(x, `${turn}`).toBeLessThanOrEqual(page.width - 17.99)
        expect(y, `${turn}`).toBeGreaterThanOrEqual(17.99)
        expect(y, `${turn}`).toBeLessThanOrEqual(page.height - 17.99)
      }
      // The picture's top-left corner (0, 1) lands where the turn puts it.
      const [x, y] = corner(matrix, 0, 1)
      const left = x < page.width / 2
      const top = y > page.height / 2
      expect([left, top], `${turn}`).toEqual(
        {
          0: [true, true],
          90: [false, true],
          180: [false, false],
          270: [true, false],
        }[turn]
      )
    }
  })
})
