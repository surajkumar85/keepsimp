/**
 * The PDF editor on real files, and its OCR beside OCRmyPDF. Run with
 *
 *   PDF_BENCH_DIR=/path/to/pdfs npm run pdf:editor-benchmark
 *
 * The folder holds the nine files of `node scripts/pdf-benchmark-files.mjs`
 * (see docs/pdf-compressor.md); they are not kept in Git. qpdf and Poppler
 * are used to check results, and OCRmyPDF when it is installed.
 *
 * Editing: each file is opened, the first line of four words or more on
 * its first pages is changed (its last word becomes "KeepSimp 2026", so
 * that letters the file's font may lack are needed), and the result is
 * written. The report gives the times, whether the change was made or
 * refused and why, whether the line was written in the file's own font or
 * needed a stand-in, the editor's own check, `qpdf --check`, and whether
 * Poppler reads the new words.
 *
 * OCR: pages of born-digital files are drawn as scans (300 dots to the
 * inch, grey, PNG; and a rougher 150 dots to the inch, JPEG at quality 50),
 * so that the words they hold are known. Each is read by the editor's OCR
 * (tesseract.js, English `best_int` data) and by OCRmyPDF (native
 * Tesseract, its default settings). The report gives how many of the true
 * words were found and how many found were true (by Poppler's reading of
 * each result), the time a page took, the size, and whether the page looks
 * as it did.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { PDFDocument } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { createWorker, OEM } from "tesseract.js"
import { test } from "vitest"
import { fontUrls } from "@/lib/pdf-editor/fonts"
import {
  addFont,
  exportEdited,
  startEditing,
  stopEditing,
} from "@/lib/pdf-editor/mupdf-edit"
import { applyOcr, ocrPicture } from "@/lib/pdf-editor/mupdf-ocr"
import { applyText, linesOn } from "@/lib/pdf-editor/mupdf-text"
import { readingOf, type TesseractBlock } from "@/lib/pdf-editor/ocr"
import { OCR_PARAMETERS } from "@/lib/pdf-editor/ocr-files"

const dir = process.env.PDF_BENCH_DIR
const out = dir ? join(dir, "..", "editor-out") : ""

const has = (tool: string) => {
  try {
    execFileSync("which", [tool], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}
const run = (tool: string, args: string[]) =>
  execFileSync(tool, args, { stdio: "pipe", maxBuffer: 1 << 28 }).toString()

/** qpdf's word on a file: "clean", or its first complaint. */
function qpdfSays(file: string) {
  try {
    run("qpdf", ["--check", file])
    return "clean"
  } catch (error) {
    const said = String((error as { stdout?: Buffer }).stdout ?? error)
    return said.includes("No syntax or stream encoding errors")
      ? "warnings"
      : "errors"
  }
}

/** Poppler's text of a page, or of every page. */
const popplerText = (file: string, page?: number) =>
  run("pdftotext", [
    ...(page === undefined
      ? []
      : ["-f", String(page + 1), "-l", String(page + 1)]),
    file,
    "-",
  ])

const fontNames = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const names = new Set<string>()
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const text = object.toString()
    const match = /\/FontName \/([^\s/>]+)/.exec(text)
    if (match) names.add(match[1])
  }
  return names
}

const ms = (from: number) => Math.round(performance.now() - from)
const table = (head: string[], rows: (string | number)[][]) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")

test.skipIf(!dir)("editing real files", async () => {
  mkdirSync(out, { recursive: true })
  const files = readdirSync(dir!)
    .filter((name) => name.endsWith(".pdf"))
    .sort()
  const rows: (string | number)[][] = []
  for (const name of files) {
    const bytes = new Uint8Array(readFileSync(join(dir!, name)))
    let started = performance.now()
    let session
    try {
      session = startEditing(mupdf, bytes)
    } catch (error) {
      rows.push([
        name,
        "—",
        `not opened: ${(error as Error).message}`,
        "",
        "",
        "",
        "",
        "",
      ])
      continue
    }
    const opened = ms(started)
    for (const key of Object.keys(fontUrls))
      addFont(
        mupdf,
        session,
        key,
        new Uint8Array(readFileSync(`public${fontUrls[key]}`))
      )
    const pages = session.doc.countPages()
    let found: {
      page: number
      line: ReturnType<typeof linesOn>[number]
    } | null = null
    for (let page = 0; page < Math.min(pages, 6) && !found; page++) {
      const line = linesOn(mupdf, session, page).find(
        (one) =>
          one.text.trim().split(/\s+/).length >= 4 && one.text.length < 120
      )
      if (line) found = { page, line }
    }
    if (!found) {
      rows.push([
        name,
        opened,
        "no line of text on its first pages (a scan)",
        "",
        "",
        "",
        "",
        "",
      ])
      stopEditing(session)
      continue
    }
    const words = found.line.text.trim().split(/\s+/)
    const text = [...words.slice(0, -1), "KeepSimp", "2026"].join(" ")
    started = performance.now()
    let changed = "changed"
    try {
      applyText(mupdf, session, {
        label: "Change text",
        ops: [
          {
            do: "retext",
            page: found.page,
            box: found.line.box,
            was: found.line.text,
            text,
          },
        ],
      })
    } catch (error) {
      changed = `refused: ${(error as Error).message}`
    }
    const change = ms(started)
    started = performance.now()
    const { bytes: written, report } = await exportEdited(mupdf, session)
    const exported = ms(started)
    stopEditing(session)
    const file = join(out, name)
    writeFileSync(file, written)
    const before = await fontNames(bytes)
    const added = [...(await fontNames(written))].filter(
      (one) => !before.has(one)
    )
    const font =
      changed !== "changed"
        ? "—"
        : added.length
          ? `stand-in (${added.map((one) => one.replace(/^[A-Z]{6}\+/, "")).join(", ")})`
          : "the file's own"
    const read =
      changed === "changed"
        ? popplerText(file, found.page)
            .replace(/\s+/g, " ")
            .includes("KeepSimp 2026")
          ? "yes"
          : "no"
        : "—"
    rows.push([
      name,
      `${pages} pages, ${opened} ms`,
      changed === "changed" ? `${changed} in ${change} ms` : changed,
      font,
      `${report.untouched.checked} compared, ${report.untouched.differ.length} differ; ${report.retext.found}/${report.retext.lines} lines read back`,
      `${exported} ms`,
      qpdfSays(file),
      read,
    ])
  }
  const said = table(
    [
      "File",
      "Opened",
      "Line changed",
      "Font",
      "The editor's check",
      "Written",
      "qpdf",
      "Poppler reads it",
    ],
    rows
  )
  writeFileSync(join(out, "editing.md"), said)
  console.log(`\n${said}\n`)
})

/** The words of a text, for counting: lower case, letters and figures only. */
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1)

/** How many of the true words were found, and how many found were true. */
function compare(truth: string[], got: string[]) {
  const left = new Map<string, number>()
  for (const word of truth) left.set(word, (left.get(word) ?? 0) + 1)
  let hit = 0
  for (const word of got) {
    const count = left.get(word) ?? 0
    if (count > 0) {
      hit++
      left.set(word, count - 1)
    }
  }
  return {
    found: truth.length ? hit / truth.length : 1,
    true: got.length ? hit / got.length : 1,
  }
}

const SOURCES: [string, number[]][] = [
  ["paper-arxiv.pdf", [0, 1, 2]],
  ["guide-irs-p17.pdf", [12, 13, 14]],
  ["booklet-udhr.pdf", [4, 5, 6]],
]

test.skipIf(!dir)("OCR beside OCRmyPDF", async () => {
  mkdirSync(out, { recursive: true })
  const reader = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath: join(
      process.cwd(),
      "node_modules/@tesseract.js-data/eng/4.0.0_best_int"
    ),
    cacheMethod: "none",
  })
  await reader.setParameters(OCR_PARAMETERS as never)
  const ocrmypdf = has("ocrmypdf")
  const rows: (string | number)[][] = []
  for (const [name, pages] of SOURCES) {
    const source = mupdf.Document.openDocument(
      readFileSync(join(dir!, name)),
      "application/pdf"
    )
    for (const [kind, dpi] of [
      ["clean", 300],
      ["rough", 150],
    ] as const) {
      // The scan: each page drawn as a picture, alone on a page of its size.
      const scan = await PDFDocument.create()
      const truth: string[] = []
      for (const index of pages) {
        const page = source.loadPage(index)
        const [x0, y0, x1, y1] = page.getBounds()
        const pixels = page.toPixmap(
          mupdf.Matrix.scale(dpi / 72, dpi / 72),
          mupdf.ColorSpace.DeviceGray,
          false,
          true
        )
        const picture =
          kind === "clean"
            ? await scan.embedPng(pixels.asPNG())
            : await scan.embedJpg(pixels.asJPEG(50, false))
        scan.addPage([x1 - x0, y1 - y0]).drawImage(picture, {
          x: 0,
          y: 0,
          width: x1 - x0,
          height: y1 - y0,
        })
        truth.push(
          ...wordsOf(page.toStructuredText("preserve-whitespace").asText())
        )
      }
      const scanned = await scan.save()
      const base = `${name.replace(/\.pdf$/, "")}-${kind}`
      const scanFile = join(out, `${base}-scan.pdf`)
      writeFileSync(scanFile, scanned)
      // Each page as Poppler draws it, in grey at 72 dots to the inch.
      const looks = (file: string) =>
        pages.map((_, at) =>
          execFileSync(
            "pdftoppm",
            [
              "-r",
              "72",
              "-f",
              String(at + 1),
              "-l",
              String(at + 1),
              "-gray",
              file,
            ],
            { maxBuffer: 1 << 28 }
          )
        )
      const seen = looks(scanFile)
      /**
       * How far a file's pages are drawn from the scan's: "identical", or
       * the mean difference of a pixel out of 255. MuPDF writes numbers as
       * 32-bit floats, so a page box of 311.8110046 points is written as
       * 311.811, and Poppler's pixels move by a fraction: a difference no
       * eye sees, but not the same bytes.
       */
      const drift = (file: string) => {
        let sum = 0
        let count = 0
        let size = true
        looks(file).forEach((drawn, at) => {
          const was = seen[at]
          if (drawn.length !== was.length) size = false
          else {
            for (let i = 0; i < drawn.length; i++)
              sum += Math.abs(drawn[i] - was[i])
            count += drawn.length
          }
        })
        if (!size) return "another size"
        return sum === 0 ? "identical" : `${(sum / count).toFixed(2)} of 255`
      }

      // The editor's OCR.
      let started = performance.now()
      const session = startEditing(mupdf, scanned)
      const ops = []
      for (let page = 0; page < pages.length; page++) {
        const picture = ocrPicture(mupdf, session, page)
        const { data } = await reader.recognize(
          Buffer.from(picture.png),
          {},
          { blocks: true, text: false }
        )
        ops.push({
          page,
          lines: readingOf(
            data.blocks as unknown as TesseractBlock[],
            picture.scale
          ).lines,
        })
      }
      applyOcr(mupdf, session, { label: "Recognise text", ops })
      const { bytes: ours } = await exportEdited(mupdf, session)
      stopEditing(session)
      const oursTime = ms(started) / pages.length
      const oursFile = join(out, `${base}-keepsimp.pdf`)
      writeFileSync(oursFile, ours)
      const oursScore = compare(truth, wordsOf(popplerText(oursFile)))
      const oursSame = drift(oursFile)
      rows.push([
        `${name} p${pages.map((one) => one + 1).join(",")}`,
        kind,
        "KeepSimp",
        `${(oursScore.found * 100).toFixed(1)}%`,
        `${(oursScore.true * 100).toFixed(1)}%`,
        `${(oursTime / 1000).toFixed(1)} s`,
        `${(scanned.length / 1024).toFixed(0)} → ${(ours.length / 1024).toFixed(0)} KB`,
        oursSame,
      ])

      // OCRmyPDF, as it comes.
      if (ocrmypdf) {
        const theirsFile = join(out, `${base}-ocrmypdf.pdf`)
        started = performance.now()
        run("ocrmypdf", [
          "-q",
          "-l",
          "eng",
          "--output-type",
          "pdf",
          scanFile,
          theirsFile,
        ])
        const theirsTime = ms(started) / pages.length
        const theirs = readFileSync(theirsFile)
        const theirsScore = compare(truth, wordsOf(popplerText(theirsFile)))
        const theirsSame = drift(theirsFile)
        rows.push([
          "",
          kind,
          "OCRmyPDF",
          `${(theirsScore.found * 100).toFixed(1)}%`,
          `${(theirsScore.true * 100).toFixed(1)}%`,
          `${(theirsTime / 1000).toFixed(1)} s`,
          `${(scanned.length / 1024).toFixed(0)} → ${(theirs.length / 1024).toFixed(0)} KB`,
          theirsSame,
        ])
      }
    }
    source.destroy()
  }
  await reader.terminate()
  const versions = ocrmypdf
    ? `OCRmyPDF ${run("ocrmypdf", ["--version"]).trim()}, ${run("tesseract", ["--version"]).split("\n")[0]}`
    : "OCRmyPDF not installed"
  const said = `${versions}\n\n${table(
    [
      "Pages",
      "Scan",
      "Read by",
      "True words found",
      "Words found that are true",
      "Time a page",
      "Size",
      "Drawn as the scan",
    ],
    rows
  )}`
  writeFileSync(join(out, "ocr.md"), said)
  console.log(`\n${said}\n`)
})
