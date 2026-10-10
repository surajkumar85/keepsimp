import { mkdir, writeFile } from "node:fs/promises"
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"

// The two files behind "Try a sample" in the PDF merger.
// Run with `npm run samples:pdfs` after changing them.
await mkdir("public/samples", { recursive: true })

const teal = rgb(0, 0.47, 0.435)
const ink = rgb(0.09, 0.09, 0.09)
const muted = rgb(0.42, 0.42, 0.42)
const [width, height] = [595.28, 841.89]
// Fixed dates keep the files identical from one run to the next.
const written = new Date("2026-10-11T00:00:00Z")

async function build(title, pages) {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  doc.setTitle(title)
  doc.setAuthor("KeepSimp")
  doc.setCreationDate(written)
  doc.setModificationDate(written)
  const made = pages.map((content, index) => {
    const page = doc.addPage([width, height])
    page.drawRectangle({ x: 0, y: height - 14, width, height: 14, color: teal })
    page.drawText(content.heading, {
      x: 56,
      y: height - 110,
      size: 28,
      font: bold,
      color: ink,
    })
    let y = height - 160
    for (const line of content.lines) {
      page.drawText(line, { x: 56, y, size: 12, font: plain, color: ink })
      y -= 20
    }
    for (const [row, values] of (content.table ?? []).entries()) {
      values.forEach((value, column) =>
        page.drawText(value, {
          x: 56 + column * 160,
          y: y - 20 - row * 22,
          size: 11,
          font: row === 0 ? bold : plain,
          color: ink,
        })
      )
    }
    page.drawText(`${title} · page ${index + 1}`, {
      x: 56,
      y: 40,
      size: 9,
      font: plain,
      color: muted,
    })
    return page
  })

  // Bookmarks: one per page.
  const context = doc.context
  const outline = context.nextRef()
  const refs = pages.map(() => context.nextRef())
  pages.forEach((content, index) =>
    context.assign(
      refs[index],
      context.obj({
        Title: PDFHexString.fromText(content.heading),
        Parent: outline,
        Dest: [made[index].ref, PDFName.of("Fit")],
        ...(index > 0 ? { Prev: refs[index - 1] } : {}),
        ...(index < pages.length - 1 ? { Next: refs[index + 1] } : {}),
      })
    )
  )
  context.assign(
    outline,
    context.obj({
      Type: "Outlines",
      First: refs[0],
      Last: refs[refs.length - 1],
      Count: refs.length,
    })
  )
  doc.catalog.set(PDFName.of("Outlines"), outline)

  // A link from the first page to the last.
  if (pages.length > 1) {
    made[0].drawText(`Go to "${pages[pages.length - 1].heading}"`, {
      x: 56,
      y: 120,
      size: 12,
      font: plain,
      color: teal,
    })
    made[0].node.set(
      PDFName.of("Annots"),
      context.obj([
        context.register(
          context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [52, 112, 320, 136],
            Border: [0, 0, 0],
            Dest: [made[made.length - 1].ref, PDFName.of("Fit")],
          })
        ),
      ])
    )
  }
  return doc.save()
}

await writeFile(
  "public/samples/keepsimp-report.pdf",
  await build("Quarterly report", [
    {
      heading: "Quarterly report",
      lines: [
        "A sample document for the KeepSimp PDF merger.",
        "It has three pages, a bookmark for each, and a link below.",
      ],
    },
    {
      heading: "Summary",
      lines: [
        "Visitors grew through the quarter, and most of them came back.",
        "The busiest tool was the image compressor.",
        "Nothing was uploaded: every file stayed on its owner's device.",
      ],
    },
    {
      heading: "Next steps",
      lines: [
        "Add the page organiser to the PDF merger.",
        "Record a tutorial for it.",
        "The figures behind this report are in the appendix.",
      ],
    },
  ])
)
await writeFile(
  "public/samples/keepsimp-appendix.pdf",
  await build("Appendix", [
    {
      heading: "Appendix A: figures",
      lines: ["Made-up figures, to give the page something to show."],
      table: [
        ["Month", "Visitors", "Files handled"],
        ["July", "1,204", "8,310"],
        ["August", "1,653", "11,942"],
        ["September", "2,118", "15,077"],
      ],
    },
    {
      heading: "Appendix B: method",
      lines: [
        "Counts are whole numbers and are not adjusted.",
        "A file is counted once, however many times it is changed.",
      ],
    },
  ])
)
console.log(
  "Wrote public/samples/keepsimp-report.pdf and keepsimp-appendix.pdf"
)
