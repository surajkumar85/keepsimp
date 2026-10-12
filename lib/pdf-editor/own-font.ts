/**
 * A font of one's own: a TrueType or OpenType file from the device, to
 * write text boxes and changed lines in. The file never leaves the device;
 * it is read here for two things it says about itself: what it is called,
 * and whether its maker allows it to be put into documents.
 *
 * A font file says the second in its OS/2 table ("fsType"). A font marked
 * as restricted may not be embedded, and the editor does not embed it.
 */

/** What a font file says about itself. */
export interface OwnFont {
  /** What it is called: its full name, or its family's. */
  name: string
  /** The name printers know it by, which is the name it is given inside a PDF; its other name where it has none. */
  written: string
  /** Its maker allows it to be put into a document. */
  allowed: boolean
  /**
   * The font as a file of its own: the file as it came, or the one font
   * that was taken out of a collection. This is what is shown, embedded
   * and kept.
   */
  file: Uint8Array
}

/** The key a font of one's own goes by, as a family of the editor's: "own-" and twelve figures of hexadecimal. */
export type OwnKey = `own-${string}`

export const isOwn = (font: unknown): font is OwnKey =>
  typeof font === "string" && /^own-[0-9a-f]{12}$/.test(font)

/** The largest font file that is taken. Large fonts for Chinese, Japanese and Korean are about this size. */
export const LARGEST_FONT = 30 * 1024 * 1024

/**
 * A key for a font file, from its bytes: the same file is the same font
 * wherever and whenever it is added, which is what a draft and an undo
 * need to find it again.
 */
export function ownKey(bytes: Uint8Array): OwnKey {
  // Two runs of FNV-1a from different starts, 24 bits kept of each.
  const run = (start: number) => {
    let hash = start
    for (let at = 0; at < bytes.length; at++) {
      hash ^= bytes[at]
      hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 8).toString(16).padStart(6, "0")
  }
  return `own-${run(0x811c9dc5)}${run(0x050c5d1f)}`
}

const TAGS = ["\u0000\u0001\u0000\u0000", "OTTO", "true"]
/** The most fonts that are looked through in one collection. */
const MOST_FACES = 256

/**
 * What a font file says about itself; null when it is not a TrueType or
 * OpenType font, or ends before its tables do.
 *
 * A collection holds several fonts in one file (a family's regular, bold
 * and italic, as the fonts that come with a computer often are). One of
 * them is taken out as a file of its own: the one that goes by a name that
 * is wanted, or the first.
 */
export function readFont(
  bytes: Uint8Array,
  /** Names the wanted font of a collection may go by: its full name, or the name printers know it by. */
  wanted: readonly string[] = []
): OwnFont | null {
  if (bytes.length > LARGEST_FONT) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const within = (at: number, length: number) =>
    at >= 0 && at + length <= bytes.length
  const tag = (at: number) =>
    within(at, 4) ? String.fromCharCode(...bytes.subarray(at, at + 4)) : ""

  /** One font of the file, from where its list of tables starts. */
  const face = (start: number) => {
    if (!TAGS.includes(tag(start)) || !within(start + 4, 2)) return null
    const tables = new Map<
      string,
      { record: number; at: number; length: number }
    >()
    const count = view.getUint16(start + 4)
    for (let index = 0; index < count; index++) {
      const record = start + 12 + index * 16
      if (!within(record, 16)) return null
      tables.set(tag(record), {
        record,
        at: view.getUint32(record + 8),
        length: view.getUint32(record + 12),
      })
    }

    // Restricted (bit 1), or only as bitmaps (bit 9), which is no use to a document.
    const os2 = tables.get("OS/2")
    const allowed =
      !os2 || !within(os2.at + 8, 2)
        ? true
        : (view.getUint16(os2.at + 8) & 0x0202) === 0

    // The full name (4) before the family's (1); as Windows writes names
    // before as the old Mac did. The name printers know it by (6) is one
    // more it can be asked for by.
    const names = tables.get("name")
    let best: { rank: number; text: string } | null = null
    const known: string[] = []
    let written = ""
    if (names && within(names.at, 6)) {
      const records = view.getUint16(names.at + 2)
      const strings = names.at + view.getUint16(names.at + 4)
      for (let index = 0; index < records; index++) {
        const record = names.at + 6 + index * 12
        if (!within(record, 12)) break
        const platform = view.getUint16(record)
        const id = view.getUint16(record + 6)
        const length = view.getUint16(record + 8)
        const at = strings + view.getUint16(record + 10)
        if ((id !== 4 && id !== 1 && id !== 6) || !within(at, length)) continue
        if (platform !== 3 && platform !== 1 && platform !== 0) continue
        const wide = platform !== 1
        let text = ""
        for (let step = 0; step + (wide ? 1 : 0) < length; step += wide ? 2 : 1)
          text += String.fromCharCode(
            wide ? view.getUint16(at + step) : bytes[at + step]
          )
        text = text.trim()
        if (!text) continue
        if (id !== 1) known.push(text.toLowerCase())
        if (id === 6) {
          written ||= text
          continue
        }
        const rank = (id === 4 ? 2 : 0) + (wide ? 1 : 0)
        if (!best || rank > best.rank) best = { rank, text }
      }
    }
    const name = (best?.text ?? "Your font").slice(0, 80)
    return {
      start,
      tables,
      known,
      name,
      written: (written || name).slice(0, 80),
      allowed,
    }
  }

  if (tag(0) !== "ttcf") {
    const only = face(0)
    return (
      only && {
        name: only.name,
        written: only.written,
        allowed: only.allowed,
        file: bytes,
      }
    )
  }

  if (!within(8, 4)) return null
  const count = Math.min(view.getUint32(8), MOST_FACES)
  const asked = wanted.map((name) => name.trim().toLowerCase())
  let chosen: NonNullable<ReturnType<typeof face>> | null = null
  for (let index = 0; index < count; index++) {
    if (!within(12 + index * 4, 4)) break
    const one = face(view.getUint32(12 + index * 4))
    if (!one) continue
    chosen ??= one
    if (one.known.some((name) => asked.includes(name))) {
      chosen = one
      break
    }
  }
  if (!chosen) return null

  // The font's tables, copied out behind a list of their own.
  const tables = [...chosen.tables.values()]
  const head = 12 + tables.length * 16
  let size = head
  for (const table of tables) {
    if (!within(table.at, table.length)) return null
    size += (table.length + 3) & ~3
  }
  if (size > LARGEST_FONT) return null
  const file = new Uint8Array(size)
  file.set(bytes.subarray(chosen.start, chosen.start + 12))
  const written = new DataView(file.buffer)
  written.setUint16(4, tables.length)
  let at = head
  tables.forEach((table, index) => {
    const record = 12 + index * 16
    file.set(bytes.subarray(table.record, table.record + 16), record)
    written.setUint32(record + 8, at)
    file.set(bytes.subarray(table.at, table.at + table.length), at)
    at += (table.length + 3) & ~3
  })
  return {
    name: chosen.name,
    written: chosen.written,
    allowed: chosen.allowed,
    file,
  }
}
