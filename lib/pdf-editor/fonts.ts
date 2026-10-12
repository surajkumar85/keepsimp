/**
 * The fonts a text box can be written in. They are the Liberation fonts
 * (SIL Open Font License), which are as wide, letter for letter, as Arial,
 * Times New Roman and Courier New, so text set in them sits the way people
 * expect in a document. The same file draws the letters on the screen and is
 * embedded in the PDF.
 */
import { FONT_KEYS, isHand, type BuiltIn } from "./objects"
import { isOwn } from "./own-font"

/**
 * The fonts for signatures look written by hand: Great Vibes, Sacramento,
 * Kalam and La Belle Aurore, each under the SIL Open Font License. Each has
 * one style.
 */
const FAMILY_FILES: Record<BuiltIn, string> = {
  sans: "LiberationSans",
  serif: "LiberationSerif",
  mono: "LiberationMono",
  greatvibes: "GreatVibes",
  sacramento: "Sacramento",
  kalam: "Kalam",
  aurore: "LaBelleAurore",
}

const STYLES: Record<string, string> = {
  "": "Regular",
  "-bold": "Bold",
  "-italic": "Italic",
  "-bold-italic": "BoldItalic",
}

/** Where a font file is, on the site, by its key (see `fontKey`). */
export function fontUrl(key: string) {
  const family = (Object.keys(FAMILY_FILES) as BuiltIn[]).find(
    (name) => key === name || key.startsWith(`${name}-`)
  )
  const rest = family === undefined ? "?" : key.slice(family.length)
  // A font that looks written by hand has no bold and no italic.
  const style =
    family !== undefined && isHand(family) && rest ? undefined : STYLES[rest]
  if (family === undefined || style === undefined)
    throw new Error(`There is no font "${key}".`)
  return `/fonts/editor/${FAMILY_FILES[family]}-${style}.ttf`
}

/**
 * The name a font goes by inside a PDF: its file's name, which is the name
 * the font gives itself. A font of one's own is not on the site and goes by
 * the name that is given with it.
 */
export const fontName = (key: string, own?: string) =>
  isOwn(key)
    ? (own ?? "").replace(/[^A-Za-z0-9-]+/g, "") || "OwnFont"
    : fontUrl(key).slice(fontUrl(key).lastIndexOf("/") + 1, -".ttf".length)

/** Every font file's address, by key. */
export const fontUrls: Readonly<Record<string, string>> = Object.fromEntries(
  FONT_KEYS.map((key) => [key, fontUrl(key)])
)

/** The name the screen knows a font file by. Each file is a family of its own, so bold and italic are never faked. */
export const screenFamily = (key: string) => `KeepSimp ${key}`

/** What a family is called in the panel. */
export const FAMILY_LABELS: Record<BuiltIn, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
  greatvibes: "Great Vibes",
  sacramento: "Sacramento",
  kalam: "Kalam",
  aurore: "La Belle Aurore",
}
