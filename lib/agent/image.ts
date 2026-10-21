/**
 * The image tools' work as agent tools: the compressor's worker, and the
 * resizer's and converter's pools, with their pages' own settings and
 * defaults. What an agent gives is laid over those defaults, so a choice
 * left out is the one the page would have made.
 */
import { inspectFile } from "@/lib/image-compressor/client"
import {
  outputFilename,
  outputFormats,
  type InputFormat,
  type OutputFormat,
} from "@/lib/image-compressor/formats"
import {
  backgroundRgb,
  buildPlan,
  candidateFormats,
  defaultSettings as compressDefaults,
  originalOutput,
  type CompressorSettings,
} from "@/lib/image-compressor/settings"
import { originalIsBetter } from "@/lib/image-compressor/quality"
import { sizeLabel } from "@/lib/image-compressor/formats"
import {
  defaultSettings as resizeDefaults,
  processingKey as resizeKey,
  type ResizerSettings,
} from "@/lib/image-resizer/settings"
import { findPreset, presets } from "@/lib/image-resizer/presets"
import type {
  ProcessRequest as ResizeRequest,
  ResizerResponse,
} from "@/lib/image-resizer/protocol"
import { fileName, uniqueNames } from "@/lib/image-resizer/naming"
import {
  defaultSettings as convertDefaults,
  pdfOptions,
  processingKey as convertKey,
  type ConverterSettings,
} from "@/lib/image-converter/settings"
import { targets, type Target } from "@/lib/image-converter/targets"
import type {
  ProcessRequest as ConvertRequest,
  ConverterResponse,
} from "@/lib/image-converter/protocol"
import { createPdf, type PdfImage } from "@/lib/image-converter/encoders/pdf"
import type { CompressorEngine } from "./image-engines"
import type { PoolJobs } from "./pool-jobs"
import type { FileStore } from "./files"
import {
  asTool,
  fileProperty,
  filesProperty,
  ToolError,
  type AgentTool,
  type FileRef,
} from "./registry"

type Pixels = NonNullable<ResizeRequest["pixels"]>
export type ResizeJob = Omit<ResizeRequest, "type" | "generation">
export type ConvertJob = Omit<ConvertRequest, "type" | "generation">

export interface ImageEngines {
  compressor: CompressorEngine
  resizer: PoolJobs<ResizeJob, ResizerResponse>
  converter: PoolJobs<ConvertJob, ConverterResponse>
  /** SVG drawn to pixels on the page, as the image tools' pages draw it. */
  rasterise(file: Blob): Promise<Pixels>
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

const OUTPUTS = Object.keys(outputFormats) as OutputFormat[]
const hex = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }

export function imageTools(engines: ImageEngines): AgentTool[] {
  /** What an image file is, and its pixels when it is an SVG, as the pages read them. */
  async function source(files: FileStore, id: string) {
    const { blob, ref } = files.get(id)
    let inspected: { format: InputFormat; animated: boolean }
    try {
      inspected = await inspectFile(blob)
    } catch (error) {
      throw new ToolError(`${ref.name}: ${(error as Error).message}`)
    }
    const pixels =
      inspected.format === "svg" ? await engines.rasterise(blob) : undefined
    return { blob, ref, ...inspected, pixels }
  }

  const imageInfo: AgentTool<{ file: string }> = {
    name: "image_info",
    title: "Read an image",
    description:
      "Tells what an image is: its format, its size in pixels, whether it has transparency and whether it moves. Reads JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, ICO, SVG and JPEG XL.",
    inputSchema: {
      type: "object",
      properties: { file: fileProperty("The image.") },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal }) {
      const image = await source(files, input.file)
      const opened = await engines.compressor.read(
        { file: image.blob, format: image.format, pixels: image.pixels },
        signal
      )
      return {
        summary: `${image.ref.name}: ${image.format.toUpperCase()}, ${opened.width} by ${opened.height} pixels, ${sizeLabel(image.blob.size)}${opened.transparent ? ", with transparency" : ""}${image.animated ? ", animated" : ""}.`,
        data: {
          format: image.format,
          width: opened.width,
          height: opened.height,
          bytes: image.blob.size,
          transparent: opened.transparent,
          animated: image.animated,
        },
      }
    },
  }

  const compressImage: AgentTool<{
    file: string
    format?: "original" | "auto" | OutputFormat
    compression?: "smart" | "smallest" | "high" | "lossless" | "custom"
    quality?: number
    targetKilobytes?: number
    allowDownscale?: boolean
    longEdge?: number
    effort?: "fast" | "balanced" | "max"
    background?: string
  }> = {
    name: "compress_image",
    title: "Compress an image",
    description:
      "Makes an image smaller, measured so the difference cannot be seen: smart (the default), smallest, high, lossless, or a quality of your own; or to fit a size. Can change the format (auto tries several and keeps the smallest) and shrink the long edge. When the original is already smaller, it says so and makes nothing.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The image."),
        format: {
          type: "string",
          enum: ["original", "auto", ...OUTPUTS],
          description: "original (the default), auto, or a format.",
        },
        compression: {
          type: "string",
          enum: ["smart", "smallest", "high", "lossless", "custom"],
        },
        quality: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "With compression custom.",
        },
        targetKilobytes: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: 51200,
          description: "Instead: the size to come out under.",
        },
        allowDownscale: {
          type: "boolean",
          description:
            "With targetKilobytes: make it smaller in pixels if it must (yes by default).",
        },
        longEdge: {
          type: "integer",
          minimum: 16,
          maximum: 16384,
          description: "Make the long edge at most this many pixels.",
        },
        effort: { type: "string", enum: ["fast", "balanced", "max"] },
        background: {
          ...hex,
          description:
            "What shows through transparency in a format that has none, as #rrggbb (white).",
        },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal, progress }) {
      if (
        input.quality !== undefined &&
        (input.compression ?? "custom") !== "custom"
      )
        throw new ToolError('A quality is for compression "custom".')
      const image = await source(files, input.file)
      const settings: CompressorSettings = {
        ...compressDefaults,
        format: input.format ?? compressDefaults.format,
        compression: input.targetKilobytes
          ? "target"
          : (input.compression ??
            (input.quality !== undefined
              ? "custom"
              : compressDefaults.compression)),
        quality: input.quality ?? compressDefaults.quality,
        allowDownscale: input.allowDownscale ?? compressDefaults.allowDownscale,
        size: input.longEdge ? "long-edge" : "original",
        longEdge: input.longEdge ?? compressDefaults.longEdge,
        effort: input.effort ?? compressDefaults.effort,
        ...(input.background
          ? { background: "custom" as const, backgroundColor: input.background }
          : {}),
      }
      const target = input.targetKilobytes
        ? Math.round(input.targetKilobytes * 1024)
        : null
      const { opened, done } = await engines.compressor.run(
        { file: image.blob, format: image.format, pixels: image.pixels },
        (open) => {
          const { plan, error } = buildPlan(settings, {
            width: open.width,
            height: open.height,
          })
          if (!plan) throw new Error(error!)
          return {
            plan,
            candidates: candidateFormats(
              settings.format,
              image.format,
              open.transparent,
              settings.compression === "lossless"
            ),
            compression: settings.compression,
            quality: settings.quality,
            targetBytes: target,
            allowDownscale: settings.allowDownscale,
            effort: settings.effort,
            chroma444: settings.chroma444,
            progressive: settings.progressive,
            pngColors: settings.pngColors,
            dithering: settings.dithering,
            resample: settings.resample,
            background: backgroundRgb(settings),
          }
        },
        signal,
        (label) => progress(0.5, label)
      )
      const result = done!
      const sameFormat =
        result.format === originalOutput(image.format, opened.transparent)
      const smaller = Math.round(
        (1 - result.bytes.byteLength / image.blob.size) * 100
      )
      const keepOriginal = originalIsBetter({
        originalBytes: image.blob.size,
        resultBytes: result.bytes.byteLength,
        sameFormat,
        sameDimensions:
          result.size.width === opened.width &&
          result.size.height === opened.height,
        edited: Boolean(input.longEdge),
      })
      const data = {
        before: image.blob.size,
        after: result.bytes.byteLength,
        format: result.format,
        width: result.size.width,
        height: result.size.height,
        quality: result.quality,
        similarity: Math.round(result.similarity * 10000) / 10000,
        ...(target ? { fits: result.fits, downscaled: result.downscaled } : {}),
      }
      if (keepOriginal)
        return {
          summary: `${image.ref.name} is already smaller as it is (${sizeLabel(image.blob.size)}); nothing was made.`,
          data,
        }
      const file = files.add(
        new Blob([result.bytes], { type: outputFormats[result.format].mime }),
        outputFilename(image.ref.name, result.format),
        "made"
      )
      return {
        summary: [
          `${sizeLabel(image.blob.size)} became ${sizeLabel(result.bytes.byteLength)} (${smaller}% smaller) as ${outputFormats[result.format].label}, ${result.size.width} by ${result.size.height} pixels.`,
          target && result.fits === false
            ? `It could not get under ${input.targetKilobytes} KB.`
            : "",
          result.downscaled ? "It was made smaller in pixels to fit." : "",
        ]
          .filter(Boolean)
          .join(" "),
        files: [file],
        data,
      }
    },
  }

  const PRESETS = presets.map((preset) => preset.id)
  const resizeImages: AgentTool<{
    files: string[]
    mode?: ResizerSettings["mode"]
    width?: number
    height?: number
    side?: number
    percent?: number
    megapixels?: number
    preset?: string
    fit?: ResizerSettings["fit"]
    enlarge?: boolean
    background?: "transparent" | "white" | "black" | "blur" | string
    format?: ResizerSettings["format"]
    quality?: ResizerSettings["quality"]
    customQuality?: number
    widths?: number[]
    pattern?: string
  }> = {
    name: "resize_image",
    title: "Resize images",
    description: `Resizes images: to a width, a height or both (fit cover, contain, inside, outside or stretch), the longest or shortest side, a percentage, megapixels, or a preset for social, web, screens, print and icons (${PRESETS.slice(0, 8).join(", ")}…). With widths, writes each image at several widths, for a srcset. Names files by a pattern: {name}, {width}, {height}, {format}, {index}, {preset}.`,
    inputSchema: {
      type: "object",
      properties: {
        files: filesProperty("The images.", 1, 50),
        mode: {
          type: "string",
          enum: [
            "dimensions",
            "width",
            "height",
            "longest",
            "shortest",
            "percent",
            "megapixels",
            "preset",
          ],
          description: "dimensions (the default) takes width and/or height.",
        },
        width: { type: "integer", minimum: 1, maximum: 16384 },
        height: { type: "integer", minimum: 1, maximum: 16384 },
        side: {
          type: "integer",
          minimum: 1,
          maximum: 16384,
          description: "For longest and shortest.",
        },
        percent: { type: "number", exclusiveMinimum: 0, maximum: 1000 },
        megapixels: { type: "number", exclusiveMinimum: 0, maximum: 200 },
        preset: { type: "string", enum: PRESETS },
        fit: {
          type: "string",
          enum: ["cover", "contain", "inside", "outside", "stretch"],
          description:
            "With both sides: cover (the default) crops to fill, contain pads, inside and outside keep within or around.",
        },
        enlarge: {
          type: "boolean",
          description: "Make small images larger (yes by default).",
        },
        background: {
          type: "string",
          description:
            "For padding: transparent, white (the default), black, blur, or #rrggbb.",
        },
        format: { type: "string", enum: ["original", ...OUTPUTS] },
        quality: {
          type: "string",
          enum: ["balanced", "high", "small", "lossless", "custom"],
        },
        customQuality: { type: "integer", minimum: 1, maximum: 100 },
        widths: {
          type: "array",
          items: { type: "integer", minimum: 16, maximum: 8192 },
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
          description: "Write each image at these widths.",
        },
        pattern: { type: "string", maxLength: 200 },
      },
      required: ["files"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal, progress }) {
      const preset = input.preset ? findPreset(input.preset)! : null
      // A set of widths alone keeps each image's own shape.
      const mode =
        input.mode ??
        (preset
          ? "preset"
          : input.width !== undefined || input.height !== undefined
            ? "dimensions"
            : input.widths
              ? "width"
              : undefined)
      if (!mode)
        throw new ToolError(
          "Say how to resize: width and/or height, side, percent, megapixels or preset."
        )
      const background = input.background ?? "white"
      const named = ["transparent", "white", "black", "blur"]
      if (!named.includes(background) && !/^#[0-9a-fA-F]{6}$/.test(background))
        throw new ToolError(
          `"${background}" is not a background: transparent, white, black, blur or #rrggbb.`
        )
      const settings: ResizerSettings = {
        ...resizeDefaults,
        mode,
        width:
          input.width !== undefined
            ? String(input.width)
            : input.widths && !input.height
              ? String(input.widths[0])
              : "",
        height: input.height !== undefined ? String(input.height) : "",
        side: String(input.side ?? resizeDefaults.side),
        percent: String(input.percent ?? resizeDefaults.percent),
        megapixels: String(input.megapixels ?? resizeDefaults.megapixels),
        ...(preset
          ? {
              presetGroup: preset.group,
              presetId: preset.id,
              dpi: preset.dpi ?? resizeDefaults.dpi,
            }
          : {}),
        fit: input.fit ?? resizeDefaults.fit,
        enlarge: input.enlarge ?? resizeDefaults.enlarge,
        background: (named.includes(background)
          ? background
          : "custom") as ResizerSettings["background"],
        backgroundColor: named.includes(background)
          ? resizeDefaults.backgroundColor
          : background,
        format: input.format ?? resizeDefaults.format,
        quality:
          input.quality ??
          (input.customQuality !== undefined
            ? "custom"
            : resizeDefaults.quality),
        customQuality: input.customQuality ?? resizeDefaults.customQuality,
        multi: Boolean(input.widths),
        widths: input.widths ?? resizeDefaults.widths,
        pattern:
          input.pattern ??
          (input.widths ? "{name}-{width}w" : resizeDefaults.pattern),
      }
      const made: {
        name: string
        bytes: ArrayBuffer
        format: OutputFormat
        width: number
        height: number
      }[] = []
      for (const [index, id] of input.files.entries()) {
        const image = await source(files, id)
        progress(index / input.files.length, `Resizing ${image.ref.name}`)
        const done = (await engines.resizer.run(
          {
            file: image.blob,
            format: image.format,
            pixels: image.pixels,
            settings,
            focus: null,
            key: resizeKey(settings, null),
            describe: false,
          },
          { signal }
        )) as Extract<ResizerResponse, { type: "done" }>
        for (const output of done.outputs)
          made.push({
            name: fileName(settings.pattern, {
              name: image.ref.name,
              width: output.width,
              height: output.height,
              format: outputFormats[output.format].extension,
              index: index + 1,
              preset: preset?.id ?? "",
            }),
            ...output,
          })
      }
      const names = uniqueNames(made.map((one) => one.name))
      const refs: FileRef[] = made.map((one, at) =>
        files.add(
          new Blob([one.bytes], { type: outputFormats[one.format].mime }),
          names[at],
          "made"
        )
      )
      return {
        summary: `Resized ${plural(input.files.length, "image")} into ${plural(refs.length, "file")}: ${made
          .slice(0, 6)
          .map((one) => `${one.width}×${one.height}`)
          .join(", ")}${made.length > 6 ? "…" : ""}.`,
        files: refs,
        data: made.map((one, at) => ({
          name: names[at],
          width: one.width,
          height: one.height,
          format: one.format,
          bytes: one.bytes.byteLength,
        })),
      }
    },
  }

  const TARGETS = Object.keys(targets) as Target[]
  const convertImages: AgentTool<{
    files: string[]
    to: Target
    quality?: ConverterSettings["quality"]
    customQuality?: number
    background?: string
    maxSide?: number
    greyscale?: boolean
    gifColours?: number
    icoSizes?: number[]
    pdfPage?: ConverterSettings["pdfPage"]
    pdfMargin?: ConverterSettings["pdfMargin"]
    onePdf?: boolean
    pattern?: string
  }> = {
    name: "convert_image",
    title: "Convert images",
    description:
      "Converts images to JPEG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO or PDF, from any of those and HEIC and SVG. With onePdf, all the images become the pages of one PDF, in order. Can limit the longest side, turn them grey, and set the quality.",
    inputSchema: {
      type: "object",
      properties: {
        files: filesProperty("The images.", 1, 50),
        to: { type: "string", enum: TARGETS },
        quality: {
          type: "string",
          enum: ["balanced", "high", "small", "lossless", "custom"],
        },
        customQuality: { type: "integer", minimum: 1, maximum: 100 },
        background: {
          ...hex,
          description:
            "What shows through transparency in a format that has none (white).",
        },
        maxSide: {
          type: "integer",
          minimum: 16,
          maximum: 16384,
          description:
            "Make the longest side at most this many pixels; never larger.",
        },
        greyscale: { type: "boolean" },
        gifColours: { type: "integer", enum: [256, 128, 64, 32, 16, 2] },
        icoSizes: {
          type: "array",
          items: { type: "integer", enum: [16, 24, 32, 48, 64, 128, 256] },
          minItems: 1,
          uniqueItems: true,
        },
        pdfPage: {
          type: "string",
          enum: ["fit", "a4", "letter"],
          description:
            "For PDF: the page size: each image's own (fit), A4 or Letter.",
        },
        pdfMargin: { type: "string", enum: ["none", "small", "normal"] },
        onePdf: {
          type: "boolean",
          description: "For PDF: every image a page of one PDF.",
        },
        pattern: { type: "string", maxLength: 200 },
      },
      required: ["files", "to"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal, progress }) {
      if (input.onePdf && input.to !== "pdf")
        throw new ToolError('onePdf is for "to": "pdf".')
      const settings: ConverterSettings = {
        ...convertDefaults,
        target: input.to,
        quality:
          input.quality ??
          (input.customQuality !== undefined
            ? "custom"
            : convertDefaults.quality),
        customQuality: input.customQuality ?? convertDefaults.customQuality,
        ...(input.background
          ? { background: "custom" as const, backgroundColor: input.background }
          : {}),
        ...(input.maxSide
          ? { limit: "custom" as const, customLimit: String(input.maxSide) }
          : {}),
        greyscale: Boolean(input.greyscale),
        gifColours: input.gifColours ?? convertDefaults.gifColours,
        icoSizes: input.icoSizes ?? convertDefaults.icoSizes,
        pdfPage: input.pdfPage ?? convertDefaults.pdfPage,
        pdfMargin: input.pdfMargin ?? convertDefaults.pdfMargin,
        pdfCombine: Boolean(input.onePdf),
        pattern: input.pattern ?? convertDefaults.pattern,
      }
      const made: {
        name: string
        bytes: ArrayBuffer
        width: number
        height: number
        page?: PdfImage
      }[] = []
      for (const [index, id] of input.files.entries()) {
        const image = await source(files, id)
        progress(index / input.files.length, `Converting ${image.ref.name}`)
        const done = (await engines.converter.run(
          {
            file: image.blob,
            format: image.format,
            pixels: image.pixels,
            settings,
            key: convertKey(settings),
            describe: false,
          },
          { signal }
        )) as Extract<ConverterResponse, { type: "done" }>
        for (const output of done.outputs)
          made.push({
            name: fileName(settings.pattern, {
              name: image.ref.name,
              width: output.width,
              height: output.height,
              format: targets[output.target].extension,
              index: index + 1,
              preset: "",
            }),
            bytes: output.bytes,
            width: output.width,
            height: output.height,
            page: output.page,
          })
      }
      const mime = targets[input.to].mime
      if (input.onePdf) {
        const pdf = createPdf(
          made.map((one) => one.page!),
          pdfOptions(settings)
        )
        const name = `${files.get(input.files[0]).ref.name.replace(/\.[^.]+$/, "")}${input.files.length > 1 ? "-and-more" : ""}.pdf`
        const ref = files.add(
          new Blob([pdf as BlobPart], { type: mime }),
          name,
          "made"
        )
        return {
          summary: `Made one PDF of ${plural(made.length, "page")}, one image to a page.`,
          files: [ref],
          data: { pages: made.length, bytes: pdf.length },
        }
      }
      const names = uniqueNames(made.map((one) => one.name))
      const refs = made.map((one, at) =>
        files.add(new Blob([one.bytes], { type: mime }), names[at], "made")
      )
      return {
        summary: `Converted ${plural(input.files.length, "image")} to ${targets[input.to].label}.`,
        files: refs,
        data: made.map((one, at) => ({
          name: names[at],
          width: one.width,
          height: one.height,
          bytes: one.bytes.byteLength,
        })),
      }
    },
  }

  return [imageInfo, compressImage, resizeImages, convertImages].map((tool) =>
    asTool(tool as AgentTool<never>)
  )
}
