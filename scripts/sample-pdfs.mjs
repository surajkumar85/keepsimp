import { mkdir, writeFile } from "node:fs/promises"
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { readFile } from "node:fs/promises"
import { PDFArray, PDFNumber, PDFString } from "@cantoo/pdf-lib"
import { SignPdf } from "@signpdf/signpdf"
import { P12Signer } from "@signpdf/signer-p12"

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
  // What a design app leaves behind: data to reopen its own file with, which
  // no reader uses, and a small preview of the first page.
  let state = 20261012
  const leftover = new Uint8Array(96 * 1024)
  for (let index = 0; index < leftover.length; index++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    leftover[index] = state >>> 24
  }
  cover.page.node.set(
    PDFName.of("PieceInfo"),
    doc.context.obj({
      DesignApp: {
        Private: doc.context.register(doc.context.stream(leftover)),
      },
    })
  )
  return doc.save()
}

/**
 * A page as a scanner hands it over: a letter drawn at 150 dots per inch
 * on cream paper that darkens towards one side, a little
 * soft, with grain and a red stamp. The words are laid over it unseen, as a
 * text recogniser leaves them; without them, it is a scan as it comes, for
 * the page that recognises words.
 */
async function scan(recognised = true) {
  // The page that was "scanned": a letter with a heading and a column of text.
  const letter = await PDFDocument.create()
  const heading = await letter.embedFont(StandardFonts.TimesRomanBold)
  const body = await letter.embedFont(StandardFonts.TimesRoman)
  const sheet = letter.addPage([width, height])
  sheet.drawText("Rental agreement", {
    x: 72,
    y: height - 110,
    size: 24,
    font: heading,
    color: ink,
  })
  sheet.drawText("Flat 4, 12 Harbour Street", {
    x: 72,
    y: height - 136,
    size: 12,
    font: body,
    color: ink,
  })
  const clauses = [
    "1. The tenancy begins on the first day of March and runs for twelve months.",
    "2. Rent is due on the first working day of each month, by bank transfer.",
    "3. A deposit of one month's rent is held and returned within ten days of",
    "    the end of the tenancy, less the cost of any damage beyond fair wear.",
    "4. The tenant keeps the flat clean and reports faults as soon as they show.",
    "5. The landlord carries out repairs to the structure, heating and wiring,",
    "    and gives at least a day's notice before visiting, except in emergencies.",
    "6. Pets are welcome with the landlord's agreement, given in writing.",
    "7. The flat is let to the people named here and may not be let on to others.",
    "8. Either side may end the tenancy after six months with two months' notice.",
    "9. Changes to this agreement are made in writing and signed by both sides.",
    "",
    "Signed on behalf of the landlord:",
    "",
    "",
    "Signed by the tenant:",
  ]
  clauses.forEach((line, index) =>
    sheet.drawText(line, {
      x: 72,
      y: height - 190 - index * 26,
      size: 13,
      font: body,
      color: ink,
    })
  )
  const source = new mupdf.PDFDocument(await letter.save())
  const drawn = source
    .loadPage(0)
    .toPixmap(
      mupdf.Matrix.scale(150 / 72, 150 / 72),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true
    )
  const pixelWidth = drawn.getWidth()
  const pixelHeight = drawn.getHeight()
  const from = drawn.getPixels().slice()
  const stride = drawn.getStride()
  const pixels = drawn.getPixels()
  const paper = [244, 238, 222]
  let state = 20261013
  for (let y = 0; y < pixelHeight; y++)
    for (let x = 0; x < pixelWidth; x++) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      const grain = ((state >>> 16) % 13) - 6
      const shade = 1 - 0.1 * (x / pixelWidth)
      const ring = Math.hypot(x - pixelWidth * 0.72, y - pixelHeight * 0.78)
      const stamp = ring > pixelWidth * 0.07 && ring < pixelWidth * 0.08
      for (let channel = 0; channel < 3; channel++) {
        // A little of each neighbour, as the lens of a scanner blurs.
        let sum = 0
        let count = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.min(pixelWidth - 1, Math.max(0, x + dx))
            const ny = Math.min(pixelHeight - 1, Math.max(0, y + dy))
            const weight = dx === 0 && dy === 0 ? 4 : 1
            sum += from[ny * stride + nx * 3 + channel] * weight
            count += weight
          }
        const ink = sum / count / 255
        pixels[y * stride + x * 3 + channel] = stamp
          ? [196, 36, 48][channel] + grain
          : ink * paper[channel] * shade + grain
      }
    }
  const doc = await PDFDocument.create()
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  doc.setTitle("Scanned page")
  doc.setAuthor("KeepSimp")
  doc.setCreationDate(written)
  doc.setModificationDate(written)
  const page = doc.addPage([width, height])
  const image = await doc.embedJpg(drawn.asJPEG(88, false))
  drawn.destroy()
  source.destroy()
  page.drawImage(image, { x: 0, y: 0, width, height })
  if (recognised)
    page.drawText("Rental agreement. Flat 4, 12 Harbour Street.", {
      x: 56,
      y: height - 110,
      size: 12,
      font: plain,
      opacity: 0,
    })
  return doc.save()
}

/**
 * A form with a field of every kind a person fills in, behind "Try a sample"
 * on the page that fills forms in. Its signature is a line on the page, not
 * a field, as on most forms that are printed and signed.
 */
async function form() {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  doc.setTitle("Membership form")
  doc.setAuthor("KeepSimp")
  doc.setCreationDate(written)
  doc.setModificationDate(written)
  const page = doc.addPage([width, height])
  page.drawRectangle({ x: 0, y: height - 14, width, height: 14, color: teal })
  page.drawText("Membership form", {
    x: 56,
    y: height - 96,
    size: 26,
    font: bold,
    color: ink,
  })
  page.drawText("Harbour Street Library. Fields marked * must be filled in.", {
    x: 56,
    y: height - 120,
    size: 11,
    font: plain,
    color: muted,
  })
  const fields = doc.getForm()
  const label = (text, x, y) =>
    page.drawText(text, { x, y, size: 10, font: bold, color: ink })
  const look = { font: plain, borderWidth: 0.75, borderColor: muted }
  /** A hint for people who use a screen reader, and for the list of what is missing. */
  const hint = (field, text) =>
    field.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText(text))

  label("Full name *", 56, 680)
  const name = fields.createTextField("member.full_name")
  name.enableRequired()
  hint(name, "Full name")
  name.addToPage(page, { x: 56, y: 652, width: 300, height: 22, ...look })

  label("Date of birth", 380, 680)
  const born = fields.createTextField("member.born")
  hint(born, "Date of birth")
  born.acroField.dict.set(
    PDFName.of("AA"),
    doc.context.obj({
      F: {
        S: "JavaScript",
        JS: PDFHexString.fromText('AFDate_FormatEx("dd/mm/yyyy");'),
      },
    })
  )
  born.addToPage(page, { x: 380, y: 652, width: 159, height: 22, ...look })

  label("Email *", 56, 624)
  const email = fields.createTextField("member.email")
  email.enableRequired()
  hint(email, "Email")
  email.addToPage(page, { x: 56, y: 596, width: 300, height: 22, ...look })

  label("Country", 380, 624)
  const country = fields.createDropdown("member.country")
  hint(country, "Country")
  country.addOptions(["India", "France", "Japan", "Brazil", "Kenya"])
  country.addToPage(page, { x: 380, y: 596, width: 159, height: 22, ...look })

  label("Membership *", 56, 566)
  const kind = fields.createRadioGroup("membership")
  kind.enableRequired()
  hint(kind, "Membership")
  ;["Standard", "Family", "Student"].forEach((option, at) => {
    kind.addOptionToPage(option, page, {
      x: 56 + at * 110,
      y: 542,
      width: 14,
      height: 14,
      borderWidth: 0.75,
      borderColor: muted,
    })
    page.drawText(option, {
      x: 76 + at * 110,
      y: 545,
      size: 11,
      font: plain,
      color: ink,
    })
  })

  label("What do you read? Choose any.", 56, 512)
  const reads = fields.createOptionList("reads")
  hint(reads, "What you read")
  reads.addOptions(["Novels", "History", "Science", "Poetry", "Comics"])
  reads.enableMultiselect()
  reads.addToPage(page, { x: 56, y: 426, width: 180, height: 78, ...look })

  label("Anything we should know?", 260, 512)
  const notes = fields.createTextField("notes")
  hint(notes, "Anything we should know")
  notes.enableMultiline()
  notes.addToPage(page, { x: 260, y: 426, width: 279, height: 78, ...look })
  notes.setFontSize(10)

  const tick = (field, text, y) => {
    field.addToPage(page, {
      x: 56,
      y,
      width: 14,
      height: 14,
      borderWidth: 0.75,
      borderColor: muted,
    })
    page.drawText(text, { x: 78, y: y + 3, size: 11, font: plain, color: ink })
  }
  const news = fields.createCheckBox("newsletter")
  hint(news, "Send me the newsletter")
  tick(news, "Send me the monthly newsletter.", 392)
  const rules = fields.createCheckBox("rules")
  rules.enableRequired()
  hint(rules, "I have read the library's rules")
  tick(rules, "I have read the library's rules and agree to them. *", 366)

  for (const [text, x] of [
    ["Signature", 56],
    ["Date", 380],
  ]) {
    page.drawLine({
      start: { x, y: 290 },
      end: { x: x === 56 ? 300 : 539, y: 290 },
      thickness: 0.75,
      color: muted,
    })
    page.drawText(text, { x, y: 276, size: 10, font: plain, color: muted })
  }
  page.drawText("Membership form · page 1", {
    x: 56,
    y: 40,
    size: 9,
    font: plain,
    color: muted,
  })
  return doc.save()
}

await writeFile("public/samples/keepsimp-form.pdf", await form())
await writeFile("public/samples/keepsimp-brochure.pdf", await brochure())
await writeFile("public/samples/keepsimp-scan.pdf", await scan())
await writeFile("public/samples/keepsimp-scanned-letter.pdf", await scan(false))
await writeFile("public/samples/keepsimp-signed.pdf", await signedContract())
console.log(
  "Wrote public/samples/keepsimp-report.pdf, keepsimp-appendix.pdf, keepsimp-handbook.pdf, keepsimp-form.pdf, keepsimp-brochure.pdf, keepsimp-scan.pdf, keepsimp-scanned-letter.pdf and keepsimp-signed.pdf"
)

/**
 * A contract signed with a certificate, and then added to: the witness's
 * name was typed in after it was signed, written after the signature as a
 * second version of the file. Behind "Try a sample" on the page that checks
 * signatures, it shows a signature that holds and what changed after it.
 * The certificate is the test set's (tests/fixtures/certificates), issued
 * by the KeepSimp Test Authority, which no program trusts.
 */
async function signedContract() {
  const doc = await PDFDocument.create()
  doc.setTitle("Signed agreement")
  doc.setAuthor("KeepSimp")
  doc.setCreationDate(written)
  doc.setModificationDate(written)
  const heading = await doc.embedFont(StandardFonts.HelveticaBold)
  const body = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([width, height])
  page.drawText("Service agreement", {
    x: 72,
    y: height - 110,
    size: 24,
    font: heading,
    color: ink,
  })
  const lines = [
    "KeepSimp agrees to design three pages for the client by 1 December.",
    "The client pays half on signing and half when the pages are delivered.",
    "Either side may end this agreement with fourteen days' notice in writing.",
  ]
  lines.forEach((line, at) =>
    page.drawText(line, {
      x: 72,
      y: height - 160 - at * 22,
      size: 12,
      font: body,
      color: ink,
    })
  )
  page.drawText("Signed for the client", {
    x: 72,
    y: height - 300,
    size: 11,
    font: body,
    color: muted,
  })
  page.drawText("Witness", {
    x: 72,
    y: height - 400,
    size: 11,
    font: body,
    color: muted,
  })
  const form = doc.getForm()
  form.createTextField("Witness").addToPage(page, {
    x: 72,
    y: height - 440,
    width: 220,
    height: 24,
    font: body,
  })
  const range = PDFArray.withContext(doc.context)
  range.push(PDFNumber.of(0))
  for (let at = 0; at < 3; at++) range.push(PDFName.of("**********"))
  const value = doc.context.register(
    doc.context.obj({
      Type: "Sig",
      Filter: "Adobe.PPKLite",
      SubFilter: "adbe.pkcs7.detached",
      ByteRange: range,
      Contents: PDFHexString.of("0".repeat(16384)),
      Reason: PDFString.of("Agreed"),
      Location: PDFString.of("Leeds"),
      M: PDFString.fromDate(new Date("2026-10-14T16:00:00Z")),
    })
  )
  const widget = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Widget",
      FT: "Sig",
      Rect: [72, height - 360, 292, height - 310],
      V: value,
      T: PDFString.of("Client"),
      F: 4,
      P: page.ref,
    })
  )
  page.node.addAnnot(widget)
  form.acroForm.addField(widget)
  form.acroForm.dict.set(PDFName.of("SigFlags"), PDFNumber.of(3))
  const unsigned = await doc.save({
    useObjectStreams: false,
    updateFieldAppearances: true,
  })
  const signer = new P12Signer(
    await readFile("tests/fixtures/certificates/rsa-aes.p12"),
    { passphrase: "keepsimp" }
  )
  const signed = await new SignPdf().sign(
    Buffer.from(unsigned),
    signer,
    new Date("2026-10-14T16:00:00Z")
  )
  // After signing, the witness's name is typed in: a second version.
  const after = new mupdf.PDFDocument(new Uint8Array(signed))
  const [witness] = after
    .loadPage(0)
    .getWidgets()
    .filter((one) => one.getName() === "Witness")
  witness.setTextValue("Alex Morgan")
  witness.update()
  const bytes = after.saveToBuffer("incremental").asUint8Array().slice()
  after.destroy()
  return bytes
}
