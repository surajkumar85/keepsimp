/**
 * Which of a page's fonts, pictures and other resources its content really
 * uses. Many files give every page one shared list of everything in the
 * file; a page copied out of such a file would carry the lot with it.
 */

/** The lists in a page's resources that are looked up by name. */
export const RESOURCE_KINDS = [
  "Font",
  "XObject",
  "ExtGState",
  "ColorSpace",
  "Pattern",
  "Shading",
  "Properties",
] as const

const SLASH = 0x2f
const HASH = 0x23
/** Bytes that end a name: white space and the delimiters of PDF syntax. */
const ENDS = new Set([
  0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20, 0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b,
  0x7d, 0x2f, 0x25,
])

const hexValue = (byte: number) =>
  byte >= 0x30 && byte <= 0x39
    ? byte - 0x30
    : byte >= 0x41 && byte <= 0x46
      ? byte - 0x37
      : byte >= 0x61 && byte <= 0x66
        ? byte - 0x57
        : -1

/**
 * Every name that appears in a page's drawing commands, added to `names`.
 *
 * It looks at every "/" in the bytes, wherever it stands: inside text, inside
 * the data of an inline picture, anywhere. That can only find names that are
 * not really names, never miss one that is, and a resource kept without need
 * costs a little space while one dropped by mistake breaks the page.
 */
export function namesIn(content: Uint8Array, names = new Set<string>()) {
  let at = 0
  while (at < content.length) {
    if (content[at++] !== SLASH) continue
    let name = ""
    while (at < content.length && !ENDS.has(content[at])) {
      let byte = content[at++]
      // "#41" stands for the byte 0x41, so names can hold any character.
      if (byte === HASH && at + 1 < content.length) {
        const high = hexValue(content[at])
        const low = hexValue(content[at + 1])
        if (high >= 0 && low >= 0) {
          byte = high * 16 + low
          at += 2
        }
      }
      name += String.fromCharCode(byte)
    }
    names.add(name)
  }
  return names
}

/**
 * Whether an entry of a resource list stays. A name with characters outside
 * ASCII always stays: such names reach us decoded in a way that cannot be
 * compared with certainty.
 */
export const keepsEntry = (key: string, names: ReadonlySet<string>) =>
  names.has(key) || /[^\x00-\x7f]/.test(key)
