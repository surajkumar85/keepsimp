import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { isOwn, LARGEST_FONT, ownKey, readFont } from "./own-font"

const file = (name: string) =>
  new Uint8Array(readFileSync(`public/fonts/editor/${name}.ttf`))

/** A font file with the tables given, each as its bytes. */
function font(tables: Record<string, number[]>, magic = [0, 1, 0, 0]) {
  const names = Object.keys(tables)
  const head = 12 + names.length * 16
  const body = names.flatMap((name) => tables[name])
  const bytes = new Uint8Array(head + body.length)
  const view = new DataView(bytes.buffer)
  bytes.set(magic)
  view.setUint16(4, names.length)
  let at = head
  names.forEach((name, index) => {
    const record = 12 + index * 16
    bytes.set(
      [...name].map((letter) => letter.charCodeAt(0)),
      record
    )
    view.setUint32(record + 8, at)
    view.setUint32(record + 12, tables[name].length)
    bytes.set(tables[name], at)
    at += tables[name].length
  })
  return bytes
}

const u16 = (value: number) => [value >> 8, value & 255]
/** An OS/2 table that says how the font may be embedded. */
const os2 = (fsType: number) => [
  ...u16(4),
  ...u16(500),
  ...u16(400),
  ...u16(5),
  ...u16(fsType),
]
/** A name table with the names given: [platform, which name, the words]. */
function names(...entries: [number, number, string][]) {
  const strings: number[] = []
  const records = entries.flatMap(([platform, id, words]) => {
    const text =
      platform === 1
        ? [...words].map((letter) => letter.charCodeAt(0))
        : [...words].flatMap((letter) => u16(letter.charCodeAt(0)))
    const record = [
      ...u16(platform),
      ...u16(platform === 3 ? 1 : 0),
      ...u16(0),
      ...u16(id),
      ...u16(text.length),
      ...u16(strings.length),
    ]
    strings.push(...text)
    return record
  })
  return [
    ...u16(0),
    ...u16(entries.length),
    ...u16(6 + records.length),
    ...records,
    ...strings,
  ]
}

/** Fonts put together as a collection: a list of where each starts, then the fonts with their tables moved. */
function collection(...fonts: Uint8Array[]) {
  const head = 12 + fonts.length * 4
  const bytes = new Uint8Array(
    head + fonts.reduce((sum, one) => sum + one.length, 0)
  )
  const view = new DataView(bytes.buffer)
  bytes.set([0x74, 0x74, 0x63, 0x66, 0, 1, 0, 0])
  view.setUint32(8, fonts.length)
  let at = head
  fonts.forEach((one, index) => {
    view.setUint32(12 + index * 4, at)
    bytes.set(one, at)
    const tables = new DataView(one.buffer, one.byteOffset).getUint16(4)
    // Only what is a font has tables to move.
    if (one[0] <= 1 || one[0] === 0x4f)
      for (let table = 0; table < tables; table++) {
        const record = at + 12 + table * 16 + 8
        view.setUint32(record, view.getUint32(record) + at)
      }
    at += one.length
  })
  return bytes
}

/** The tables of a font file, each by its name with its bytes. */
function tablesOf(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Object.fromEntries(
    Array.from({ length: view.getUint16(4) }, (_, index) => {
      const record = 12 + index * 16
      const at = view.getUint32(record + 8)
      return [
        String.fromCharCode(...bytes.subarray(record, record + 4)),
        Array.from(bytes.subarray(at, at + view.getUint32(record + 12))).join(),
      ]
    })
  )
}

describe("a font file read for what it says of itself", () => {
  it("reads real fonts: their names, and that they may be embedded", () => {
    const bold = file("LiberationSans-Bold")
    const read = readFont(bold)
    expect(read).toMatchObject({
      name: "Liberation Sans Bold",
      written: "LiberationSans-Bold",
      allowed: true,
    })
    // A font that is a file of its own is that file.
    expect(read?.file).toBe(bold)
    expect(readFont(file("GreatVibes-Regular"))).toMatchObject({
      name: "Great Vibes Regular",
      allowed: true,
    })
    expect(readFont(file("Kalam-Regular"))?.name).toMatch(/^Kalam/)
  })

  it("does not take a font its maker does not allow in documents", () => {
    expect(readFont(font({ "OS/2": os2(0x0002) }))?.allowed).toBe(false)
    // Only as bitmaps is no use to a document either.
    expect(readFont(font({ "OS/2": os2(0x0200) }))?.allowed).toBe(false)
    // Preview and print, editable, installable: all may be embedded.
    for (const fsType of [0, 0x0004, 0x0008])
      expect(readFont(font({ "OS/2": os2(fsType) }))?.allowed).toBe(true)
    // An old font that says nothing is taken.
    expect(readFont(font({}))).toMatchObject({
      name: "Your font",
      allowed: true,
    })
    expect(readFont(font({ "OS/2": [0, 4] }))?.allowed).toBe(true)
  })

  it("prefers the full name, as Windows writes names", () => {
    expect(
      readFont(
        font({
          name: names(
            [1, 1, "Family Mac"],
            [3, 1, "Family"],
            [1, 4, "Full Mac"],
            [3, 4, " Full Name "]
          ),
        })
      )?.name
    ).toBe("Full Name")
    expect(
      readFont(font({ name: names([3, 1, "Family"], [1, 4, "Full Mac"]) }))
        ?.name
    ).toBe("Full Mac")
    expect(readFont(font({ name: names([1, 1, "Only Family"]) }))?.name).toBe(
      "Only Family"
    )
    expect(readFont(font({ name: names([0, 4, "Unicode Name"]) }))?.name).toBe(
      "Unicode Name"
    )
    // The name printers know it by is the one it is written under; without one, its other name is.
    expect(
      readFont(font({ name: names([3, 6, "Mine-Bold"], [3, 6, "Other"]) }))
    ).toMatchObject({ name: "Your font", written: "Mine-Bold" })
    expect(readFont(font({ name: names([3, 4, "Mine Bold"]) }))?.written).toBe(
      "Mine Bold"
    )
    // Other names, other platforms and empty names are passed over.
    expect(
      readFont(
        font({ name: names([3, 6, "PostScript"], [2, 4, "ISO"], [3, 4, "  "]) })
      )?.name
    ).toBe("Your font")
    expect(
      readFont(font({ name: names([3, 4, "x".repeat(200)]) }))?.name
    ).toHaveLength(80)
  })

  it("reads OpenType fonts and old Mac fonts", () => {
    const inner = font(
      { name: names([3, 4, "Inside"]) },
      [0x4f, 0x54, 0x54, 0x4f]
    )
    expect(readFont(inner)?.name).toBe("Inside")
    expect(readFont(font({}, [0x74, 0x72, 0x75, 0x65]))).not.toBeNull()
  })

  it("takes one font out of a collection as a file of its own", () => {
    const regular = file("LiberationSans-Regular")
    const bold = file("LiberationSans-Bold")
    const both = collection(regular, bold)
    // The first, when none is asked for by name.
    const first = readFont(both)
    expect(first?.name).toBe("Liberation Sans")
    expect(readFont(first!.file)).toMatchObject({
      name: "Liberation Sans",
      allowed: true,
    })
    // By its full name, or by the name printers know it by, in any case of letters.
    for (const wanted of [
      ["Liberation Sans Bold"],
      [" liberationsans-bold "],
      ["Nothing", "LiberationSans-Bold"],
    ]) {
      const second = readFont(both, wanted)
      expect(second?.name).toBe("Liberation Sans Bold")
      // Every table of the font is in the file that was made, as it was.
      expect(tablesOf(second!.file)).toEqual(tablesOf(bold))
      expect(ownKey(second!.file)).not.toBe(ownKey(first!.file))
    }
    // A family's name is every one of its fonts' name: it asks for none of them.
    expect(readFont(both, ["Liberation Sans"])?.name).toBe("Liberation Sans")
    expect(readFont(both, ["Not there"])?.name).toBe("Liberation Sans")
    // The same font taken out twice is the same file, and so the same key.
    expect(ownKey(readFont(both, ["LiberationSans-Bold"])!.file)).toBe(
      ownKey(readFont(both, ["Liberation Sans Bold"])!.file)
    )
  })

  it("passes over what is not a font inside a collection", () => {
    const bold = file("LiberationSans-Bold")
    // A font that is no font, then a real one.
    const odd = collection(new TextEncoder().encode("not a font"), bold)
    expect(readFont(odd)?.name).toBe("Liberation Sans Bold")
    expect(
      readFont(collection(new TextEncoder().encode("not a font")))
    ).toBeNull()
    // It says it holds more fonts than it has room to list.
    const many = collection(bold)
    new DataView(many.buffer).setUint32(8, 9)
    expect(readFont(many.subarray(0, 16))).toBeNull()
    const none = collection()
    expect(readFont(none)).toBeNull()
    expect(readFont(none.subarray(0, 10))).toBeNull()
    // A table that lies past the end of the file cannot be copied out.
    const whole = collection(bold)
    expect(readFont(whole.subarray(0, whole.length - 8))).toBeNull()
    // Tables that would make a file larger than is taken are not copied.
    // (Forty tables that each claim the same million bytes.)
    const tables = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `t${String(index).padStart(3, "0")}`,
        index ? [0] : Array.from({ length: 1_000_000 }, () => 0),
      ])
    )
    const huge = collection(font(tables))
    expect(readFont(huge)).not.toBeNull()
    const view = new DataView(huge.buffer)
    for (let index = 0; index < 40; index++) {
      view.setUint32(16 + 12 + index * 16 + 8, 0)
      view.setUint32(16 + 12 + index * 16 + 12, huge.length)
    }
    expect(readFont(huge)).toBeNull()
    // Tables are set on a boundary of four bytes each.
    const twice = font({ a: [1], b: [2] })
    expect(readFont(collection(twice))?.file).toHaveLength(12 + 32 + 8)
  })

  it("refuses what is not a font, and a file that ends too soon", () => {
    expect(readFont(new Uint8Array(0))).toBeNull()
    expect(readFont(new TextEncoder().encode("%PDF-1.7 not a font"))).toBeNull()
    expect(readFont(new TextEncoder().encode("wOFF"))).toBeNull()
    expect(readFont(new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 0]))).toBeNull()
    expect(readFont(new Uint8Array([0, 1, 0, 0, 0]))).toBeNull()
    // It says it has two tables and has room for none.
    expect(
      readFont(new Uint8Array([0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0]))
    ).toBeNull()
    // A table of names that points past the end of the file names nothing.
    const cut = font({ name: names([3, 4, "Full Name"]) })
    expect(readFont(cut.subarray(0, cut.length - 6))).toMatchObject({
      name: "Your font",
      allowed: true,
    })
    const short = font({ name: [0, 0, 0, 9, 0, 6] })
    expect(readFont(short)?.name).toBe("Your font")
    expect(readFont(new Uint8Array(LARGEST_FONT + 1))).toBeNull()
  })
})

describe("the key a font of one's own goes by", () => {
  it("is the same for the same file and another for another", () => {
    const sans = ownKey(file("LiberationSans-Regular"))
    expect(sans).toMatch(/^own-[0-9a-f]{12}$/)
    expect(ownKey(file("LiberationSans-Regular"))).toBe(sans)
    expect(ownKey(file("LiberationSans-Bold"))).not.toBe(sans)
    expect(isOwn(sans)).toBe(true)
    expect(ownKey(new Uint8Array(0))).toMatch(/^own-[0-9a-f]{12}$/)
  })

  it("is told from the editor's own fonts and from anything else", () => {
    for (const value of [
      "sans",
      "own-",
      "own-12345",
      "own-XYZ123456789",
      "own-0123456789abc",
      7,
      null,
    ])
      expect(isOwn(value)).toBe(false)
  })
})
