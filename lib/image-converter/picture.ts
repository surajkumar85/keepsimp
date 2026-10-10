import { targets, type Target } from "./targets"

export interface PictureFile {
  target: Target
  name: string
  width: number
  height: number
}

/** Most efficient first: a browser uses the first source it understands. */
const sourceOrder: Target[] = ["avif", "jxl", "webp"]
/** Formats every browser shows, used for the plain `<img>` fallback. */
const fallbackOrder: Target[] = ["jpeg", "png", "webp"]

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/**
 * A `<picture>` element for one image saved in several web formats, or an
 * empty string when there is nothing sensible to offer.
 */
export function pictureSnippet(files: PictureFile[], alt = "") {
  const web = files.filter((file) => targets[file.target].web)
  const fallback = fallbackOrder
    .map((target) => web.find((file) => file.target === target))
    .find(Boolean)
  if (!fallback) return ""
  const sources = sourceOrder
    .map((target) => web.find((file) => file.target === target))
    .filter((file): file is PictureFile => Boolean(file) && file !== fallback)
  if (!sources.length) return ""
  return `<picture>
${sources
  .map(
    (file) =>
      `  <source srcset="${escapeAttribute(encodeURI(file.name))}" type="${targets[file.target].mime}" />`
  )
  .join("\n")}
  <img
    src="${escapeAttribute(encodeURI(fallback.name))}"
    width="${fallback.width}"
    height="${fallback.height}"
    alt="${escapeAttribute(alt)}"
    loading="lazy"
    decoding="async"
  />
</picture>`
}
