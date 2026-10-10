export const responsiveWidths = [320, 640, 960, 1280, 1920, 2560]
export const MAX_SET = 12

/** Parse "400, 800 1200" into unique whole widths, smallest first. */
export function parseWidths(text: string) {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((part) => Number(part))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ].sort((a, b) => a - b)
}

/** The chosen preset widths plus any custom ones, capped so a batch stays manageable. */
export function widthSet(selected: number[], custom: string) {
  return [...new Set([...selected, ...parseWidths(custom)])]
    .sort((a, b) => a - b)
    .slice(0, MAX_SET)
}

export interface SetFile {
  name: string
  width: number
  height: number
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/** A ready-to-paste responsive `<img>` for a set of widths of one image. */
export function imgSnippet(files: SetFile[], alt = "", sizes = "100vw") {
  if (!files.length) return ""
  const ordered = [...files].sort((a, b) => a.width - b.width)
  const fallback =
    ordered[Math.min(ordered.length - 1, Math.floor(ordered.length / 2))]
  const srcset = ordered
    .map((file) => `${encodeURI(file.name)} ${file.width}w`)
    .join(",\n          ")
  return `<img
  src="${escapeAttribute(encodeURI(fallback.name))}"
  srcset="${srcset}"
  sizes="${escapeAttribute(sizes)}"
  width="${fallback.width}"
  height="${fallback.height}"
  alt="${escapeAttribute(alt)}"
  loading="lazy"
  decoding="async"
/>`
}
