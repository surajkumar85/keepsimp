/**
 * A Word file (.docx) read as Markdown: mammoth turns it into plain,
 * meaningful HTML (headings by their Word styles, lists, tables, links,
 * bold and italic, pictures), which is cleaned and made into Markdown by
 * the same rules as pasting. Pictures are kept with the document under
 * `pictures/`. What Word holds that Markdown cannot (colours, fonts,
 * layout) is left behind, and mammoth's notes say what it did not read.
 * Loaded only when a Word file is opened.
 */
import mammoth from "mammoth"
import { htmlToMarkdown } from "./from-html"
import { pictureName } from "./pictures"

export interface ReadPicture {
  name: string
  type: string
  bytes: Uint8Array
}

export interface FromWord {
  markdown: string
  pictures: ReadPicture[]
  /** What mammoth could not read, in its own words. */
  notes: string[]
}

/** A Word file's bytes, read as mammoth's browser build and its Node build each ask for them. */
export async function wordToMarkdown(bytes: ArrayBuffer): Promise<FromWord> {
  const pictures: ReadPicture[] = []
  const input = { arrayBuffer: bytes, buffer: bytes }
  const result = await mammoth.convertToHtml(input as never, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const bytes = new Uint8Array(await image.read())
      const name = pictureName(
        pictures.map((one) => one.name),
        image.contentType
      )
      pictures.push({ name, type: image.contentType, bytes })
      return { src: name }
    }),
  })
  return {
    markdown: htmlToMarkdown(result.value),
    pictures,
    notes: result.messages.map((message) => message.message),
  }
}
