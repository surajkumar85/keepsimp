import type { Size } from "@/lib/image-compressor/geometry"

export interface PdfImage {
  /** "dct" holds a complete JPEG file; "flate" holds zlib-compressed RGB bytes. */
  kind: "dct" | "flate"
  data: Uint8Array
  width: number
  height: number
}

export type PdfPageSize = "fit" | "a4" | "letter"
export type PdfMargin = "none" | "small" | "normal"

export interface PdfOptions {
  page: PdfPageSize
  /** Pixels per inch used when the page fits the image. */
  dpi: number
  margin: PdfMargin
}

const paper: Record<Exclude<PdfPageSize, "fit">, Size> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
}
const margins: Record<PdfMargin, number> = { none: 0, small: 18, normal: 36 }
const round = (value: number) => Math.round(value * 100) / 100

/** Page size and image placement in PDF points (1/72 inch). */
export function pageLayout(image: Size, options: PdfOptions) {
  if (options.page === "fit") {
    const width = round((image.width * 72) / options.dpi)
    const height = round((image.height * 72) / options.dpi)
    return { page: { width, height }, draw: { x: 0, y: 0, width, height } }
  }
  const sheet = paper[options.page]
  const landscape = image.width > image.height
  const page = landscape
    ? { width: sheet.height, height: sheet.width }
    : { ...sheet }
  const margin = margins[options.margin]
  const boxWidth = page.width - margin * 2
  const boxHeight = page.height - margin * 2
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height)
  const width = round(image.width * scale)
  const height = round(image.height * scale)
  return {
    page,
    draw: {
      x: round((page.width - width) / 2),
      y: round((page.height - height) / 2),
      width,
      height,
    },
  }
}

/** A PDF 1.4 document with one image per page. */
export function createPdf(images: PdfImage[], options: PdfOptions) {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length
    push(`${id} 0 obj\n${body}\n`)
    if (stream) {
      push("stream\n")
      push(stream)
      push("\nendstream\n")
    }
    push("endobj\n")
  }

  // The second line is a comment of high bytes, marking the file as binary.
  push("%PDF-1.4\n%âãÏÓ\n")
  const pageIds = images.map((_, index) => 3 + index * 3)
  object(1, "<< /Type /Catalog /Pages 2 0 R >>")
  object(
    2,
    `<< /Type /Pages /Count ${images.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`
  )
  images.forEach((image, index) => {
    const pageId = pageIds[index]
    const { page, draw } = pageLayout(image, options)
    const content = encoder.encode(
      `q ${draw.width} 0 0 ${draw.height} ${draw.x} ${draw.y} cm /Im0 Do Q`
    )
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`
    )
    object(pageId + 1, `<< /Length ${content.length} >>`, content)
    object(
      pageId + 2,
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${
        image.kind === "dct" ? "DCTDecode" : "FlateDecode"
      } /Length ${image.data.length} >>`,
      image.data
    )
  })
  const total = 3 + images.length * 3
  const xref = length
  push(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let id = 1; id < total; id++)
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let position = 0
  for (const chunk of chunks) {
    out.set(chunk, position)
    position += chunk.length
  }
  return out
}

/** Drop the alpha channel: PDF image streams here are plain RGB. */
export function rgbBytes(rgba: Uint8ClampedArray) {
  const out = new Uint8Array((rgba.length / 4) * 3)
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    out[target++] = rgba[source]
    out[target++] = rgba[source + 1]
    out[target++] = rgba[source + 2]
  }
  return out
}
