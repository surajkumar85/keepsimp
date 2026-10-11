/**
 * Fetches and builds the nine files the PDF compressor is measured on beside
 * Ghostscript and qpdf (see "Measured beside Ghostscript and qpdf" in
 * docs/pdf-compressor.md). They are not kept in Git.
 *
 *   node scripts/pdf-benchmark-files.mjs <folder> [screenshot.png]
 *   PDF_BENCH_DIR=<folder> npm run pdf:benchmark
 *
 * Six are public documents, fetched as they are. Three are made here from
 * real material: photographs placed on pages, pages of one of the documents
 * turned into a "phone scan", and a slide deck printed by Chromium. The
 * published run had a screenshot of the compressor on one slide; without one
 * the guide's social image stands in, and the slides weigh a little
 * differently. Documents change where they are published, so sizes drift.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as mupdf from "mupdf"
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib"
import { chromium } from "@playwright/test"

const folder = process.argv[2]
if (!folder) {
  console.error(
    "Usage: node scripts/pdf-benchmark-files.mjs <folder> [screenshot.png]"
  )
  process.exit(1)
}
const screenshot =
  process.argv[3] ?? "public/images/social/compress-pdfs-without-uploading.png"
const photos = join(folder, "photos")
mkdirSync(photos, { recursive: true })

/** Public documents, by the name they are measured under. */
const DOCUMENTS = {
  "paper-arxiv.pdf": "https://arxiv.org/pdf/1706.03762",
  "form-irs-1040.pdf": "https://www.irs.gov/pub/irs-pdf/f1040.pdf",
  "guide-irs-p17.pdf": "https://www.irs.gov/pub/irs-pdf/p17.pdf",
  "booklet-udhr.pdf":
    "https://www.un.org/en/udhrbook/pdf/udhr_booklet_en_web.pdf",
  "report-ipcc-spm.pdf":
    "https://www.ipcc.ch/report/ar6/syr/downloads/report/IPCC_AR6_SYR_SPM.pdf",
  "scan-archive.pdf":
    "https://archive.org/download/aliceinwonderlan00carriala/aliceinwonderlan00carriala.pdf",
}
/** Photographs from picsum.photos, by their number there. */
const PHOTOS = [1015, 1018, 1025, 1043, 1036, 1040]

async function fetched(url, to) {
  if (existsSync(to)) return
  const response = await fetch(url, { redirect: "follow" })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  writeFileSync(to, new Uint8Array(await response.arrayBuffer()))
  console.log(`fetched ${to}`)
}

for (const [name, url] of Object.entries(DOCUMENTS))
  await fetched(url, join(folder, name))
for (const id of PHOTOS)
  await fetched(
    `https://picsum.photos/id/${id}/3000/2000`,
    join(photos, `p${id}.jpg`)
  )

// 1. A photo album: six photographs of 3000 by 2000 pixels, one a page.
{
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const [index, id] of PHOTOS.entries()) {
    const page = doc.addPage([842, 595])
    const image = await doc.embedJpg(readFileSync(join(photos, `p${id}.jpg`)))
    page.drawImage(image, { x: 46, y: 60, width: 750, height: 500 })
    page.drawText(
      `Holiday album, photograph ${index + 1}. Taken with a phone and placed at full size.`,
      { x: 46, y: 32, size: 11, font, color: rgb(0.2, 0.2, 0.2) }
    )
  }
  writeFileSync(join(folder, "album-photos.pdf"), await doc.save())
}

// 2. A phone scan: four pages of a real tax guide drawn at 200 dpi, on
// tinted paper with a shadow, softened, with grain, saved as JPEG.
{
  const source = new mupdf.PDFDocument(
    readFileSync(join(folder, "guide-irs-p17.pdf"))
  )
  const doc = await PDFDocument.create()
  let state = 99
  for (const pageIndex of [8, 9, 30, 31]) {
    const pm = source
      .loadPage(pageIndex)
      .toPixmap(
        mupdf.Matrix.scale(200 / 72, 200 / 72),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true
      )
    const w = pm.getWidth(),
      h = pm.getHeight(),
      st = pm.getStride()
    const px = pm.getPixels(),
      from = px.slice()
    const paper = [246, 241, 228]
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0
        const grain = ((state >>> 16) % 13) - 6
        const shade = 1 - 0.14 * Math.pow(x / w, 2) - 0.05 * (y / h)
        for (let c = 0; c < 3; c++) {
          let sum = 0,
            n = 0
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = Math.min(w - 1, Math.max(0, x + dx)),
                ny = Math.min(h - 1, Math.max(0, y + dy))
              const wt = dx === 0 && dy === 0 ? 4 : 1
              sum += from[ny * st + nx * 3 + c] * wt
              n += wt
            }
          px[y * st + x * 3 + c] = Math.max(
            0,
            Math.min(255, (sum / n / 255) * paper[c] * shade + grain)
          )
        }
      }
    const image = await doc.embedJpg(pm.asJPEG(85, false))
    const page = doc.addPage([612, 792])
    page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 })
  }
  writeFileSync(join(folder, "scan-phone.pdf"), await doc.save())
}

// 3. A slide deck printed by Chromium: gradients, large type, a photograph
// and a screenshot.
{
  const photo = readFileSync(join(photos, "p1018.jpg")).toString("base64")
  const shot = readFileSync(screenshot).toString("base64")
  const slide = (inner, bg) =>
    `<section style="width:1280px;height:720px;page-break-after:always;position:relative;overflow:hidden;background:${bg};font-family:Helvetica,Arial,sans-serif;color:#fff">${inner}</section>`
  const html = `<html><body style="margin:0">
    ${slide(`<h1 style="font-size:84px;margin:0;position:absolute;left:80px;top:230px">Quarterly review</h1><p style="font-size:30px;position:absolute;left:84px;top:350px;opacity:.85">Results, plans and three open questions</p>`, "linear-gradient(135deg,#0b3954,#087e8b 60%,#bfd7ea)")}
    ${slide(`<img src="data:image/jpeg;base64,${photo}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"><div style="position:absolute;left:0;right:0;bottom:0;padding:40px 80px;background:linear-gradient(transparent,rgba(0,0,0,.75))"><h2 style="font-size:54px;margin:0">Where we are</h2></div>`, "#000")}
    ${slide(`<h2 style="font-size:48px;margin:0;position:absolute;left:80px;top:50px;color:#0b3954">The product today</h2><img src="data:image/png;base64,${shot}" style="position:absolute;left:330px;top:130px;height:560px;box-shadow:0 10px 40px rgba(0,0,0,.25);border-radius:12px">`, "linear-gradient(180deg,#f7fafc,#e3edf3)")}
    ${slide(`<h2 style="font-size:48px;margin:0;position:absolute;left:80px;top:50px">Numbers</h2><div style="position:absolute;left:80px;top:160px;display:flex;gap:40px;align-items:flex-end;height:440px">${[220, 300, 260, 380, 340, 430].map((v, i) => `<div style="width:120px;height:${v}px;background:rgba(255,255,255,${0.35 + i * 0.1});border-radius:10px 10px 0 0"></div>`).join("")}</div>`, "radial-gradient(circle at 20% 20%,#5b2a86,#1b1035 70%)")}
  </body></html>`
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html)
  writeFileSync(
    join(folder, "slides-chromium.pdf"),
    await page.pdf({ width: "1280px", height: "720px", printBackground: true })
  )
  await browser.close()
}
console.log(`The nine files are in ${folder}`)
