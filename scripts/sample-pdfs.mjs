import { mkdir, writeFile } from "node:fs/promises"
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"

// The files behind "Try a sample" in the PDF tools.
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

// The file behind "Try a sample" in the PDF splitter: twelve pages in five
// chapters, with sections bookmarked under their chapters, so it can be cut
// by hand, at bookmarks of either level, or by the words "Chapter".
async function handbook(chapters) {
  const title = "Team handbook"
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  doc.setTitle(title)
  doc.setAuthor("KeepSimp")
  doc.setCreationDate(written)
  doc.setModificationDate(written)
  const context = doc.context
  const outline = context.nextRef()
  let number = 0
  const draw = (heading, lines, kicker) => {
    const page = doc.addPage([width, height])
    number++
    page.drawRectangle({ x: 0, y: height - 14, width, height: 14, color: teal })
    if (kicker)
      page.drawText(kicker, {
        x: 56,
        y: height - 70,
        size: 11,
        font: plain,
        color: muted,
      })
    page.drawText(heading, {
      x: 56,
      y: height - 110,
      size: kicker ? 28 : 22,
      font: bold,
      color: ink,
    })
    let y = height - 160
    for (const line of lines) {
      page.drawText(line, { x: 56, y, size: 12, font: plain, color: ink })
      y -= 20
    }
    page.drawText(`${title} · page ${number}`, {
      x: 56,
      y: 40,
      size: 9,
      font: plain,
      color: muted,
    })
    return page
  }
  /** Bookmarks of one level, each with those under it. */
  const link = (items, parent) => {
    const refs = items.map(() => context.nextRef())
    items.forEach((item, index) => {
      const kids = item.children?.length ? link(item.children, refs[index]) : []
      context.assign(
        refs[index],
        context.obj({
          Title: PDFHexString.fromText(item.title),
          Parent: parent,
          Dest: [item.page.ref, PDFName.of("Fit")],
          ...(index > 0 ? { Prev: refs[index - 1] } : {}),
          ...(index < items.length - 1 ? { Next: refs[index + 1] } : {}),
          ...(kids.length
            ? {
                First: kids[0],
                Last: kids[kids.length - 1],
                Count: kids.length,
              }
            : {}),
        })
      )
    })
    return refs
  }
  const marks = chapters.map((chapter, index) => ({
    title: chapter.title,
    page: draw(chapter.title, chapter.lines, `Chapter ${index + 1}`),
    children: chapter.sections.map((section) => ({
      title: section.title,
      page: draw(section.title, section.lines),
    })),
  }))
  const top = link(marks, outline)
  context.assign(
    outline,
    context.obj({
      Type: "Outlines",
      First: top[0],
      Last: top[top.length - 1],
      Count: top.length,
    })
  )
  doc.catalog.set(PDFName.of("Outlines"), outline)
  return doc.save()
}

await writeFile(
  "public/samples/keepsimp-handbook.pdf",
  await handbook([
    {
      title: "Welcome",
      lines: [
        "A sample document for the KeepSimp PDF splitter.",
        "It has twelve pages in five chapters. Each chapter has a bookmark,",
        "and each section has a bookmark under its chapter.",
      ],
      sections: [
        {
          title: "How to read this",
          lines: ["Start anywhere. Every chapter stands on its own."],
        },
      ],
    },
    {
      title: "Getting started",
      lines: ["What to do in your first week."],
      sections: [
        {
          title: "Your desk",
          lines: ["Pick any free desk.", "Lockers are by the stairs."],
        },
        {
          title: "Your accounts",
          lines: ["Ask for a login on your first morning."],
        },
      ],
    },
    {
      title: "Every day",
      lines: ["How the working day runs."],
      sections: [
        {
          title: "Hours",
          lines: ["Core hours are ten to four.", "The rest is yours to plan."],
        },
        { title: "Meetings", lines: ["Keep them short. Write things down."] },
      ],
    },
    {
      title: "Time off",
      lines: ["Rest is part of the job."],
      sections: [
        {
          title: "Holidays",
          lines: ["Twenty-five days a year, plus public holidays."],
        },
      ],
    },
    {
      title: "Reference",
      lines: ["Things you will want to look up again."],
      sections: [
        {
          title: "Who to ask",
          lines: ["Your lead first, then the office team."],
        },
      ],
    },
  ])
)
/**
 * A picture painted by a function of where each pixel is (0 to 1 across and
 * down), with a little grain, as a photograph has. The same every run.
 */
function paint(pixelWidth, pixelHeight, colour, grainy = true) {
  const pixmap = new mupdf.Pixmap(
    mupdf.ColorSpace.DeviceRGB,
    [0, 0, pixelWidth, pixelHeight],
    false
  )
  const pixels = pixmap.getPixels()
  const stride = pixmap.getStride()
  let state = 20261011
  for (let y = 0; y < pixelHeight; y++)
    for (let x = 0; x < pixelWidth; x++) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      const grain = grainy ? ((state >>> 16) % 9) - 4 : 0
      const [red, green, blue] = colour(x / pixelWidth, y / pixelHeight)
      const at = y * stride + x * 3
      pixels[at] = red + grain
      pixels[at + 1] = green + grain
      pixels[at + 2] = blue + grain
    }
  return pixmap
}

const mix = (from, to, share) =>
  from.map((value, index) => value + (to[index] - value) * share)

/** Hills under an evening sky. */
function landscape(u, v) {
  const sun = Math.hypot((u - 0.72) * 1.5, v - 0.3)
  let colour = mix([52, 110, 190], [250, 205, 150], Math.min(1, v / 0.62))
  if (sun < 0.25) colour = mix([255, 244, 210], colour, sun / 0.25)
  const hills = [
    [0.52, 0.05, 5, 0.3, [96, 132, 150]],
    [0.62, 0.06, 8, 1.7, [62, 110, 96]],
    [0.76, 0.05, 13, 0.9, [34, 78, 62]],
  ]
  for (const [base, tall, waves, shift, hill] of hills) {
    const ridge =
      base +
      tall * Math.sin(u * waves + shift) +
      0.012 * Math.sin(u * waves * 5.3)
    if (v > ridge)
      colour = mix(hill, [18, 40, 36], Math.min(1, (v - ridge) / 0.5))
  }
  return colour
}

/** A street at night: lit windows in dark blocks. */
function street(u, v) {
  const block = Math.floor(u * 9)
  const roof = 0.18 + 0.22 * Math.abs(Math.sin(block * 12.9898))
  if (v < roof) return mix([14, 20, 48], [70, 60, 110], v / roof)
  const column = Math.floor(u * 9 * 6) % 6
  const row = Math.floor((v - roof) * 40)
  const lit = Math.sin(block * 7.1 + column * 3.7 + row * 5.3) > 0.35
  const edge = column === 0 || row % 3 === 0
  if (lit && !edge) return [248, 214, 130]
  return mix([36, 40, 62], [16, 18, 30], v)
}

/** A bar chart: flat colours and hard edges, stored without loss. */
function chart(u, v) {
  if (u < 0.06 || v > 0.9) return [255, 255, 255]
  const bar = Math.floor((u - 0.06) / 0.118)
  const inBar = (u - 0.06) % 0.118 < 0.08
  const tall = [0.35, 0.5, 0.42, 0.68, 0.6, 0.82, 0.74, 0.9][bar] ?? 0
  if (inBar && v > 0.9 - tall * 0.8)
    return bar % 2 ? [0, 120, 111] : [0, 86, 80]
  return Math.abs((v * 10) % 1) < 0.012 ? [222, 226, 226] : [255, 255, 255]
}

async function brochure() {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  const title = "City guide"
  doc.setTitle(title)
  doc.setAuthor("KeepSimp")
  doc.setCreationDate(written)
  doc.setModificationDate(written)
  const jpeg = async (pixmap) => {
    const image = await doc.embedJpg(pixmap.asJPEG(90, false))
    pixmap.destroy()
    return image
  }
  const png = async (pixmap) => {
    const image = await doc.embedPng(pixmap.asPNG())
    pixmap.destroy()
    return image
  }
  // Far more pixels than the pages show: what a camera or a design app hands over.
  const hills = await jpeg(paint(1800, 1200, landscape))
  const night = await jpeg(paint(1200, 800, street))
  const bars = await png(paint(1600, 900, chart, false))
  const sheet = (heading, lines) => {
    const page = doc.addPage([width, height])
    page.drawRectangle({ x: 0, y: height - 14, width, height: 14, color: teal })
    page.drawText(heading, {
      x: 56,
      y: height - 110,
      size: 28,
      font: bold,
      color: ink,
    })
    let y = height - 150
    for (const line of lines) {
      page.drawText(line, { x: 56, y, size: 12, font: plain, color: ink })
      y -= 20
    }
    page.drawText(`${title} · page ${doc.getPageCount()}`, {
      x: 56,
      y: 40,
      size: 9,
      font: plain,
      color: muted,
    })
    return { page, y }
  }
  const cover = sheet(title, [
    "A sample document for the KeepSimp PDF compressor.",
    "Its photographs hold far more pixels than the pages show,",
    "as pictures from a camera or a design app usually do.",
  ])
  cover.page.drawImage(hills, {
    x: 56,
    y: cover.y - 322,
    width: 483,
    height: 322,
  })
  const around = sheet("Getting around", [
    "Trams run every six minutes until midnight.",
    "A day ticket covers trams, buses and the river ferry.",
  ])
  around.page.drawImage(night, {
    x: 56,
    y: around.y - 160,
    width: 240,
    height: 160,
  })
  around.page.drawText("Visitors by month, in thousands", {
    x: 56,
    y: around.y - 200,
    size: 11,
    font: bold,
    color: ink,
  })
  around.page.drawImage(bars, {
    x: 56,
    y: around.y - 480,
    width: 483,
    height: 272,
  })
  sheet("Where to stay", [
    "The old town is quiet at night and close to the river.",
    "Rooms near the station cost less and suit an early train.",
    "Book ahead in June and September, when the fairs are on.",
  ])
  return doc.save()
}

await writeFile("public/samples/keepsimp-brochure.pdf", await brochure())
console.log(
  "Wrote public/samples/keepsimp-report.pdf, keepsimp-appendix.pdf, keepsimp-handbook.pdf and keepsimp-brochure.pdf"
)
