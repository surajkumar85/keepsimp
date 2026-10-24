import { describe, expect, it } from "vitest"
import { Document, Packer, Paragraph } from "docx"
import { wordToMarkdown } from "./from-word"
import { markdownToWord, type WordPicture } from "./to-word"

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ),
  (char) => char.charCodeAt(0)
)
const picture: WordPicture = { bytes: PNG, type: "png", width: 10, height: 10 }

describe("wordToMarkdown", () => {
  it("reads a Word file back as the Markdown it was written from, pictures kept", async () => {
    const source = [
      "# Title",
      "",
      "Some **bold** and _soft_ words with a [link](https://example.com/).",
      "",
      "- one",
      "- two",
      "",
      "| Name | Age |",
      "| ---- | --- |",
      "| Ada  | 36  |",
      "",
      "![A chart](pictures/chart.png) ![Again](pictures/chart.png)",
    ].join("\n")
    const blob = await markdownToWord(source, {
      pictures: new Map([["pictures/chart.png", picture]]),
    })
    const read = await wordToMarkdown(await blob.arrayBuffer())
    expect(read.markdown).toContain("# Title")
    expect(read.markdown).toContain(
      "Some **bold** and _soft_ words with a [link](https://example.com/)."
    )
    expect(read.markdown).toContain("- one\n- two")
    expect(read.markdown).toContain("| Name | Age |")
    expect(read.markdown).toContain("![A chart](pictures/picture-1.png)")
    expect(read.markdown).toContain("![Again](pictures/picture-2.png)")
    expect(read.pictures).toHaveLength(2)
    expect(read.pictures[0]).toMatchObject({
      name: "pictures/picture-1.png",
      type: "image/png",
    })
    expect(Array.from(read.pictures[0].bytes)).toEqual(Array.from(PNG))
  })

  it("says what it could not read", async () => {
    const document = new Document({
      styles: {
        paragraphStyles: [{ id: "Fancy", name: "Fancy", run: { bold: true } }],
      },
      sections: [
        { children: [new Paragraph({ text: "Styled", style: "Fancy" })] },
      ],
    })
    const read = await wordToMarkdown(
      await (await Packer.toBlob(document)).arrayBuffer()
    )
    expect(read.markdown).toBe("Styled")
    expect(read.notes.join(" ")).toContain("Fancy")
  })
})
