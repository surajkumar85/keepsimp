/**
 * Reproducible size/quality report for the image compressor.
 * Run with `npm run image:benchmark`. Results print to stdout; nothing is written to Git.
 *
 * Baseline: sharp's libjpeg-turbo (MozJPEG off), libwebp and zlib PNG at default
 * settings, the same families of encoders browsers use for canvas export.
 * For lossy formats the baseline quality is searched until it matches the SSIM that
 * KeepSimp's Smart preset reached, so sizes are compared at equal measured quality.
 */
import { test } from "vitest"
import sharp from "sharp"
import { installNodeCodecShims } from "../tests/node-codecs"
import { decodeOutput, encodeImage } from "@/lib/image-compressor/codecs"
import { runPipeline, type PipelineJob } from "@/lib/image-compressor/pipeline"
import { flattenAlpha, hasTransparency } from "@/lib/image-compressor/pixels"
import { similarity, ssim, type Pixels } from "@/lib/image-compressor/ssim"
import type { OutputFormat } from "@/lib/image-compressor/formats"

installNodeCodecShims()

const graphic =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#e8f5f3"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <rect x="40" y="40" width="1120" height="72" rx="12" fill="#00786f"/>
  <text x="72" y="88" font-family="sans-serif" font-size="32" fill="#fff">Dashboard overview</text>
  ${Array.from(
    { length: 6 },
    (
      _,
      i
    ) => `<rect x="${40 + (i % 3) * 380}" y="${150 + Math.floor(i / 3) * 300}" width="350" height="270" rx="16" fill="#fff" stroke="#d4d4d4"/>
  <text x="${64 + (i % 3) * 380}" y="${200 + Math.floor(i / 3) * 300}" font-family="sans-serif" font-size="22" fill="#222">Card ${i + 1} · Weekly summary</text>
  <rect x="${64 + (i % 3) * 380}" y="${240 + Math.floor(i / 3) * 300}" width="${120 + i * 30}" height="18" rx="9" fill="#5eead4"/>
  <circle cx="${300 + (i % 3) * 380}" cy="${340 + Math.floor(i / 3) * 300}" r="44" fill="#f59e0b" opacity="0.8"/>`
  ).join("")}
</svg>`)

const text = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#ffffff"/>${Array.from(
    { length: 12 },
    (_, i) =>
      `<text x="40" y="${60 + i * 60}" font-family="sans-serif" font-size="${16 + (i % 4) * 4}" fill="#222222">Card ${i} · Weekly summary and revenue report</text>`
  ).join("")}</svg>`
)

async function load(input: string | Buffer, density?: number): Promise<Pixels> {
  const { data, info } = await sharp(input, density ? { density } : {})
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8ClampedArray(
      data.buffer,
      data.byteOffset,
      data.length
    ) as Uint8ClampedArray<ArrayBuffer>,
    width: info.width,
    height: info.height,
  }
}

const job = (
  format: OutputFormat,
  compression: PipelineJob["compression"]
): PipelineJob => ({
  candidates: [format],
  compression,
  quality: 75,
  targetBytes: null,
  allowDownscale: false,
  effort: "balanced",
  chroma444: false,
  progressive: true,
  pngColors: 256,
  dithering: true,
  resample: "lanczos3",
  background: [255, 255, 255],
})

async function keepsimp(
  pixels: Pixels,
  format: OutputFormat,
  compression: PipelineJob["compression"]
) {
  const started = performance.now()
  const { candidate } = await runPipeline({
    job: job(format, compression),
    output: { width: pixels.width, height: pixels.height },
    transparent: hasTransparency(pixels),
    pixelsAt: async () => pixels,
    codecs: { encode: encodeImage, decode: decodeOutput },
  })
  return { ...candidate, ms: performance.now() - started }
}

async function baseline(
  pixels: Pixels,
  format: "jpeg" | "webp",
  targetSsim: number
) {
  const raw = {
    raw: { width: pixels.width, height: pixels.height, channels: 4 as const },
  }
  let low = 1
  let high = 100
  let best: Buffer | null = null
  while (low <= high) {
    const quality = Math.round((low + high) / 2)
    const pipeline = sharp(Buffer.from(pixels.data.buffer), raw)
    const bytes =
      format === "jpeg"
        ? await pipeline
            .flatten({ background: "#ffffff" })
            .jpeg({ quality, mozjpeg: false })
            .toBuffer()
        : await pipeline.webp({ quality }).toBuffer()
    const decoded = await load(bytes)
    if (ssim(pixels, decoded) >= targetSsim) {
      best = bytes
      high = quality - 1
    } else low = quality + 1
  }
  return best!.byteLength
}

async function fixedQuality(
  pixels: Pixels,
  format: "jpeg" | "webp",
  quality: number
) {
  const raw = {
    raw: { width: pixels.width, height: pixels.height, channels: 4 as const },
  }
  const pipeline = sharp(Buffer.from(pixels.data.buffer), raw)
  const bytes =
    format === "jpeg"
      ? await pipeline
          .flatten({ background: "#ffffff" })
          .jpeg({ quality, mozjpeg: false })
          .toBuffer()
      : await pipeline.webp({ quality }).toBuffer()
  return { bytes: bytes.byteLength, ssim: ssim(pixels, await load(bytes)) }
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`
const pct = (ours: number, theirs: number) =>
  `${Math.round((1 - ours / theirs) * 100)}%`

test("image compressor benchmark", async () => {
  const rows: string[] = [
    "| Image | Format | KeepSimp Smart | Quality | SSIM | Worst 1% | Fixed q80 export (SSIM) | Same encoder family at equal SSIM | Time |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ]
  const corpus = [
    {
      name: "Coastline photo (1536×1024)",
      pixels: await load("public/images/coastline.jpg"),
    },
    {
      name: "Still life photo (1400×933)",
      pixels: await load("public/images/private-workspace.webp"),
    },
    { name: "Interface graphic (1200×800)", pixels: await load(graphic) },
    { name: "Text document (1200×800)", pixels: await load(text) },
    {
      name: "Transparent logo mark",
      pixels: await load("public/brand/keepsimp-mark.svg", 1200),
    },
  ]
  for (const { name, pixels } of corpus) {
    const alpha = hasTransparency(pixels)
    for (const format of (alpha
      ? ["webp", "avif", "png"]
      : ["jpeg", "webp", "avif", "png"]) as OutputFormat[]) {
      for (const preset of ["smart"] as const) {
        const result = await keepsimp(pixels, format, preset)
        let base = "—"
        let saved = "—"
        let fixed = "—"
        if (format === "jpeg" || format === "webp") {
          const size = await baseline(pixels, format, result.similarity)
          saved = `${kb(size)} (${pct(result.bytes.byteLength, size)} saved)`
          const q80 = await fixedQuality(pixels, format, 80)
          fixed = `${kb(q80.bytes)} (${q80.ssim.toFixed(4)})`
        } else if (format === "png") {
          const size = (
            await sharp(Buffer.from(pixels.data.buffer), {
              raw: { width: pixels.width, height: pixels.height, channels: 4 },
            })
              .png({ compressionLevel: 9 })
              .toBuffer()
          ).byteLength
          fixed = `${kb(size)} lossless (1.0000)`
          base = fixed
        }
        const measured = similarity(
          format === "jpeg" ? flattenAlpha(pixels, [255, 255, 255]) : pixels,
          await decodeOutput(format, result.bytes)
        )
        void base
        rows.push(
          `| ${name} | ${format.toUpperCase()} | ${kb(result.bytes.byteLength)} | ${result.quality ?? "palette"} | ${measured.mean.toFixed(4)} | ${measured.worst.toFixed(3)} | ${fixed} | ${saved} | ${Math.round(result.ms)} ms |`
        )
      }
    }
  }
  process.stdout.write(`\n${rows.join("\n")}\n\n`)
})
