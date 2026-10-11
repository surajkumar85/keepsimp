/**
 * Size and quality report for the PDF compressor, beside Ghostscript and
 * qpdf. Run with
 *
 *   PDF_BENCH_DIR=/path/to/pdfs npm run pdf:benchmark
 *
 * `PDF_BENCH_FILES` and `PDF_BENCH_WAYS` take a pattern each, to run a part
 * of it again: files by name, and ways of compressing by theirs.
 *
 * The folder holds the files to compress; they are not kept in Git (see
 * `docs/pdf-compressor.md` for the set the published numbers come from).
 * Ghostscript, qpdf and Poppler are used when they are installed.
 *
 * For every file and every way of compressing it, the report gives the size,
 * how alike the pages still look (pages are drawn by MuPDF at 900, 1,300 and
 * 1,800 pixels and compared with SSIM; the least alike page counts), whether the text
 * Poppler reads is still the same, and whether accessibility tags survived.
 */
import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import * as mupdf from "mupdf"
import { test } from "vitest"
import { similarity } from "@/lib/image-compressor/ssim"
import { drawPage } from "@/lib/pdf-merger/mupdf-engine"
import { pagesToCheck } from "@/lib/pdf-compressor/check"
import { codecs } from "@/lib/pdf-compressor/codecs"
import {
  compressPdf,
  compressToSize,
} from "@/lib/pdf-compressor/mupdf-compress"
import type { Level, ScanChoice } from "@/lib/pdf-compressor/settings"
import { installNodeCodecShims } from "../tests/node-codecs"

installNodeCodecShims()

const dir = process.env.PDF_BENCH_DIR
const out = dir ? join(dir, "..", "out") : ""

const has = (tool: string) => {
  try {
    execFileSync("which", [tool], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

interface Way {
  name: string
  /** Writes the result to `to`; throws when the tool cannot handle the file. */
  run: (from: string, to: string) => Promise<void>
}

const ours = (level: Level, scans: ScanChoice = "keep"): Way => ({
  name: `KeepSimp ${level}${scans === "keep" ? "" : ` + ${scans}`}`,
  run: async (from, to) => {
    const bytes = new Uint8Array(readFileSync(from))
    const result = await compressPdf(mupdf, bytes, { level, codecs, scans })
    // A file that cannot be made smaller is handed back as it was.
    writeFileSync(to, result.bytes ?? bytes)
  },
})

/** Our compressor asked to come out no larger than another tool did. */
const oursAtSize = (rival: string, target: number): Way => ({
  name: `KeepSimp at the size of ${rival}`,
  run: async (from, to) => {
    const bytes = new Uint8Array(readFileSync(from))
    const result = await compressToSize(mupdf, bytes, {
      target,
      further: true,
      codecs,
    })
    writeFileSync(to, result.bytes ?? bytes)
  },
})

const ghostscript = (setting: string): Way => ({
  name: `Ghostscript /${setting}`,
  run: async (from, to) => {
    execFileSync(
      "gs",
      [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        `-dPDFSETTINGS=/${setting}`,
        `-sOutputFile=${to}`,
        from,
      ],
      { stdio: "pipe", timeout: 600_000 }
    )
  },
})

const qpdf = (name: string, args: string[]): Way => ({
  name,
  run: async (from, to) => {
    try {
      execFileSync("qpdf", [...args, from, to], {
        stdio: "pipe",
        timeout: 600_000,
      })
    } catch (error) {
      // qpdf exits with 3 for warnings and still writes the file.
      if ((error as { status?: number }).status !== 3) throw error
    }
  },
})

const only = (pattern: string | undefined) =>
  pattern ? new RegExp(pattern, "i") : /(?:)/

const ways: Way[] = [
  ours("lossless"),
  ours("balanced"),
  ours("strong"),
  ours("balanced", "layers"),
  ...(has("gs")
    ? [ghostscript("printer"), ghostscript("ebook"), ghostscript("screen")]
    : []),
  ...(has("qpdf")
    ? [
        qpdf("qpdf lossless", [
          "--object-streams=generate",
          "--recompress-flate",
          "--compression-level=9",
        ]),
        qpdf("qpdf --optimize-images", [
          "--object-streams=generate",
          "--recompress-flate",
          "--compression-level=9",
          "--optimize-images",
        ]),
      ]
    : []),
].filter((way) => only(process.env.PDF_BENCH_WAYS).test(way.name))

/** The words Poppler reads from a file, with runs of space made one. */
function words(file: string) {
  try {
    return execFileSync("pdftotext", ["-q", file, "-"], {
      stdio: "pipe",
      maxBuffer: 256 * 1024 * 1024,
    })
      .toString()
      .replace(/\s+/g, " ")
      .trim()
  } catch {
    return null
  }
}

const tagged = (file: string) => {
  try {
    return /Tagged:\s+yes/.test(
      execFileSync("pdfinfo", [file], { stdio: "pipe" }).toString()
    )
  } catch {
    return false
  }
}

/**
 * The sizes pages are drawn at to be compared, as their longer side in
 * pixels. One size is not enough: a renderer shrinks a picture in steps, and
 * at the size where the original crosses a step and the result does not, a
 * page scores well below what it does a little larger or smaller (0.925 at
 * 1,000 pixels against 0.989 and 0.984 at 900 and 1,800, on one slide).
 */
const EDGES = [900, 1300, 1800]

/** How alike the pages of two files look: the mean over a spread of pages, and the least alike of them. */
function alike(before: string, after: string) {
  const a = new mupdf.PDFDocument(readFileSync(before))
  const b = new mupdf.PDFDocument(readFileSync(after))
  try {
    const total = a.countPages()
    if (b.countPages() !== total) return { mean: 0, least: 0 }
    const pages = pagesToCheck(
      Array.from({ length: total }, (_, page) => page),
      total,
      8
    )
    const scores = pages.map((page) => {
      let sum = 0
      for (const edge of EDGES) {
        const was = drawPage(mupdf, a, page, edge)
        const is = drawPage(mupdf, b, page, edge)
        if (was.width === is.width && was.height === is.height)
          sum += similarity(was, is).mean
      }
      return sum / EDGES.length
    })
    return {
      mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      least: Math.min(...scores),
    }
  } finally {
    a.destroy()
    b.destroy()
  }
}

interface Row {
  file: string
  way: string
  bytes: number
  share: number
  seconds: number
  mean: number
  least: number
  text: boolean | null
  tags: boolean | null
  failed?: string
}

const kb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`

const fileOf = (name: string, way: string) =>
  join(
    out,
    `${name.replace(/\.pdf$/i, "")}.${way.replace(/[^a-z0-9]+/gi, "-")}.pdf`
  )

/**
 * `PDF_BENCH_REMEASURE=results.json` looks again at results that were
 * written before, without compressing anything: for when the way pages are
 * compared has changed.
 */
test.skipIf(!dir || !process.env.PDF_BENCH_REMEASURE)(
  "look again at earlier results",
  () => {
    const from = join(out, process.env.PDF_BENCH_REMEASURE!)
    const rows = JSON.parse(readFileSync(from, "utf8")) as Row[]
    for (const row of rows) {
      if (row.failed) continue
      Object.assign(row, alike(join(dir!, row.file), fileOf(row.file, row.way)))
      console.log(
        `${row.file} | ${row.way} | ${row.mean.toFixed(3)} / ${row.least.toFixed(3)}`
      )
    }
    writeFileSync(from, JSON.stringify(rows, null, 1))
  }
)

test.skipIf(!dir || Boolean(process.env.PDF_BENCH_REMEASURE))(
  "PDF compressor beside Ghostscript and qpdf",
  async () => {
    mkdirSync(out, { recursive: true })
    const poppler = has("pdftotext")
    const files = readdirSync(dir!)
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .filter((name) => only(process.env.PDF_BENCH_FILES).test(name))
      .sort()
    const rows: Row[] = []
    for (const name of files) {
      const from = join(dir!, name)
      const size = statSync(from).size
      const text = poppler ? words(from) : null
      const wasTagged = poppler ? tagged(from) : false
      console.log(`\n### ${name} (${kb(size)})\n`)
      console.log(
        "| Way | Size | Of the original | Alike (mean / least) | Text | Tags | Seconds |"
      )
      console.log("| --- | ---: | ---: | ---: | --- | --- | ---: |")
      const measure = async (way: Way) => {
        const to = fileOf(name, way.name)
        const started = performance.now()
        const row: Row = {
          file: name,
          way: way.name,
          bytes: size,
          share: 1,
          seconds: 0,
          mean: 0,
          least: 0,
          text: null,
          tags: null,
        }
        try {
          await way.run(from, to)
          row.seconds = (performance.now() - started) / 1000
          row.bytes = statSync(to).size
          row.share = row.bytes / size
          Object.assign(row, alike(from, to))
          if (text !== null) row.text = words(to) === text
          if (wasTagged) row.tags = tagged(to)
        } catch (error) {
          row.failed = (error as Error).message.split("\n")[0].slice(0, 80)
        }
        rows.push(row)
        console.log(
          row.failed
            ? `| ${row.way} | failed: ${row.failed} | | | | | |`
            : `| ${row.way} | ${kb(row.bytes)} | ${Math.round(row.share * 100)}% | ${row.mean.toFixed(3)} / ${row.least.toFixed(3)} | ${row.text === null ? "–" : row.text ? "same" : "changed"} | ${row.tags === null ? "–" : row.tags ? "kept" : "lost"} | ${row.seconds.toFixed(1)} |`
        )
        return row
      }
      const done = new Map<string, Row>()
      for (const way of ways) done.set(way.name, await measure(way))
      // Where Ghostscript made the file smaller, ours is asked for the same
      // size, to see which of the two then looks more like the original.
      for (const setting of ["ebook", "screen"]) {
        const rival = done.get(`Ghostscript /${setting}`)
        if (rival && !rival.failed && rival.bytes < size * 0.95)
          await measure(oursAtSize(`Ghostscript /${setting}`, rival.bytes))
      }
    }
    writeFileSync(
      join(out, process.env.PDF_BENCH_RESULTS ?? "results.json"),
      JSON.stringify(rows, null, 1)
    )
    // The whole set, added up for each way.
    console.log("\n### All files together\n")
    console.log(
      "| Way | Total size | Of the originals | Least alike page | Text changed in | Tags lost in |"
    )
    console.log("| --- | ---: | ---: | ---: | ---: | ---: |")
    const total = files.reduce(
      (sum, name) => sum + statSync(join(dir!, name)).size,
      0
    )
    for (const way of ways) {
      const mine = rows.filter((row) => row.way === way.name)
      const bytes = mine.reduce((sum, row) => sum + row.bytes, 0)
      console.log(
        `| ${way.name} | ${kb(bytes)} | ${Math.round((bytes / total) * 100)}% | ${Math.min(...mine.filter((row) => !row.failed).map((row) => row.least)).toFixed(3)} | ${mine.filter((row) => row.text === false).length} of ${mine.length} | ${mine.filter((row) => row.tags === false).length} of ${mine.filter((row) => row.tags !== null).length} |`
      )
    }
  }
)
