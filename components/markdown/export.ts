/**
 * The files a document is exported as, built on the page: a web page that
 * stands alone (its pictures inside it, its maths and diagrams drawn), a
 * Word file (its pictures and diagrams as pictures), and a ZIP of the
 * Markdown with its pictures beside it, as a folder on disk would hold
 * them. Nothing is fetched: pictures from other sites stay links.
 */
import { exportedBody, standaloneHtml } from "@/lib/markdown/document"
import { renderMarkdown, type RenderOptions } from "@/lib/markdown/render"
import type { WordPicture } from "@/lib/markdown/to-word"
import { zipBlobs } from "@/lib/video/zip-blobs"
import { enrichHtml } from "./enrich"
import type { KeptPicture } from "./use-documents"

type Pictures = ReadonlyMap<string, KeptPicture>

function dataUrl(picture: KeptPicture) {
  let binary = ""
  const bytes = picture.bytes
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return `data:${picture.type};base64,${btoa(binary)}`
}

/** The document drawn for export: pictures inside it, maths and diagrams drawn, in the light theme. */
async function drawnBody(
  text: string,
  options: RenderOptions,
  pictures: Pictures
) {
  const rendered = renderMarkdown(text, {
    ...options,
    pictures: new Map(
      Array.from(pictures, ([name, picture]) => [name, dataUrl(picture)])
    ),
  })
  return exportedBody(await enrichHtml(rendered.html, rendered.needs, false))
}

/** A web page that stands alone. */
export async function webPage(
  text: string,
  title: string,
  options: RenderOptions,
  pictures: Pictures
) {
  return standaloneHtml(title, await drawnBody(text, options, pictures))
}

/** HTML for the clipboard: the body alone, with its pictures inside it. */
export const clipboardHtml = (
  text: string,
  options: RenderOptions,
  pictures: Pictures
) => drawnBody(text, options, pictures)

const WORD_TYPES: Record<string, WordPicture["type"]> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
}

/** A picture drawn into a PNG, for kinds Word cannot hold (WebP, AVIF, SVG) and for diagrams. */
async function asPng(source: Blob, scale = 1): Promise<WordPicture> {
  const url = URL.createObjectURL(source)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const width = Math.max(1, Math.round((image.naturalWidth || 600) * scale))
    const height = Math.max(1, Math.round((image.naturalHeight || 400) * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")!
    context.fillStyle = "white"
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (made) =>
          made
            ? resolve(made)
            : reject(new Error("The picture could not be drawn.")),
        "image/png"
      )
    )
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      type: "png",
      width: width / scale,
      height: height / scale,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function forWord(picture: KeptPicture): Promise<WordPicture> {
  const blob = new Blob([picture.bytes as BlobPart], { type: picture.type })
  const type = WORD_TYPES[picture.type]
  if (!type) return asPng(blob)
  const bitmap = await createImageBitmap(blob)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return { bytes: picture.bytes, type, ...size }
}

/** The document as a Word file, its pictures and diagrams as pictures. */
export async function wordFile(
  text: string,
  title: string,
  pictures: Pictures
) {
  const [{ markdownToWord }, rendered] = [
    await import("@/lib/markdown/to-word"),
    renderMarkdown(text),
  ]
  const words = new Map<string, WordPicture>()
  for (const [name, picture] of pictures) {
    try {
      words.set(name, await forWord(picture))
    } catch {
      // A picture that cannot be read is left as its words.
    }
  }
  let diagrams: (WordPicture | null)[] = []
  if (rendered.needs.diagrams) {
    const root = document.createElement("div")
    root.innerHTML = await enrichHtml(
      rendered.html,
      { math: false, diagrams: true, code: false },
      false
    )
    diagrams = await Promise.all(
      Array.from(
        root.querySelectorAll("figure[data-diagram]"),
        async (figure) => {
          const svg = figure.querySelector("svg")
          if (!svg) return null
          // Drawn at twice its size, so it stays sharp when printed.
          return asPng(
            new Blob([svg.outerHTML], { type: "image/svg+xml" }),
            2
          ).catch(() => null)
        }
      )
    )
  }
  return markdownToWord(text, { title, pictures: words, diagrams })
}

/** The Markdown and its pictures, as a folder in a ZIP. */
export function folderZip(name: string, text: string, pictures: Pictures) {
  return zipBlobs([
    { name, blob: new Blob([text], { type: "text/markdown" }) },
    ...Array.from(pictures, ([path, picture]) => ({
      name: path,
      blob: new Blob([picture.bytes as BlobPart], { type: picture.type }),
    })),
  ])
}
