/**
 * Pictures pasted or dropped into a document. They are kept beside it,
 * under `pictures/`, and the text names them as a relative path, as a
 * folder of Markdown files would on disk; the preview shows them from the
 * page, and exports carry them (inside a web page, or beside the file in
 * a ZIP).
 */

export const PICTURE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
}

/** The largest picture kept with a document. */
export const LARGEST_PICTURE = 20 * 1024 * 1024

/** A name for a new picture that no picture of the document has yet. */
export function pictureName(
  taken: Iterable<string>,
  type: string,
  original?: string
) {
  const extension = PICTURE_TYPES[type] ?? "png"
  const used = new Set(taken)
  const base =
    (original ?? "")
      .replace(/\.[^.]*$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "picture"
  for (let count = 1; ; count++) {
    const name = `pictures/${base}${count === 1 && original ? "" : `-${count}`}.${extension}`
    if (!used.has(name)) return name
  }
}

/** The Markdown for a picture: its words come from the file's name. */
export function pictureMarkdown(name: string, original?: string) {
  const words = (original ?? "")
    .replace(/\.[^.]*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/[[\]]/g, "")
    .trim()
  return `![${words}](${name})`
}

/** The names of pictures a document's text uses. */
export function picturesUsed(text: string): Set<string> {
  const used = new Set<string>()
  for (const match of text.matchAll(
    /(?:\]\(|src=["'])(?:\.\/)?(pictures\/[\w.-]+)/g
  ))
    used.add(match[1])
  return used
}
