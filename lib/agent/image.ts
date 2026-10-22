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
  aspectValue,
  initialCrop,
  orientedSize,
  type AspectPreset,
  type Rotation,
} from "@/lib/image-compressor/geometry"
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
    scale?: 75 | 50 | 25
    width?: number
    height?: number
    unit?: "px" | "percent"
    keepShape?: boolean
    fit?: CompressorSettings["fit"]
    crop?: { x: number; y: number; width: number; height: number }
    aspect?: Exclude<AspectPreset, "free">
    rotate?: Rotation
    flipX?: boolean
    flipY?: boolean
    effort?: "fast" | "balanced" | "max"
    background?: string
    chroma444?: boolean
    progressive?: boolean
    pngColors?: number
    dithering?: boolean
    resample?: CompressorSettings["resample"]
  }> = {
    name: "compress_image",
    title: "Compress an image",
    description:
      "Makes an image smaller, measured so the difference cannot be seen: smart (the default), smallest, high, lossless, or a quality of your own; or to fit a size. Can change the format (auto tries several and keeps the smallest), shrink it (the long edge, a share, or a width and height), crop it (a box, or a shape such as 16:9 from the middle), turn and flip it, and set the encoder's own choices as the compressor's page does. When the original is already smaller, it says so and makes nothing.",
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
        scale: {
          type: "integer",
          enum: [75, 50, 25],
          description: "Instead: this share of its size, in percent.",
        },
        width: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Instead: a width, in pixels or percent (unit).",
        },
        height: { type: "number", exclusiveMinimum: 0 },
        unit: { type: "string", enum: ["px", "percent"] },
        keepShape: {
          type: "boolean",
          description:
            "With only a width or a height, keep the image's shape (yes by default).",
        },
        fit: {
          type: "string",
          enum: ["contain", "cover", "stretch"],
          description:
            "With a width and a height: contain (the default) keeps it within, cover fills and crops, stretch changes its shape.",
        },
        crop: {
          type: "object",
          properties: {
            x: { type: "integer", minimum: 0 },
            y: { type: "integer", minimum: 0 },
            width: { type: "integer", minimum: 1 },
            height: { type: "integer", minimum: 1 },
          },
          required: ["x", "y", "width", "height"],
          additionalProperties: false,
          description:
            "Keep only this box, in pixels of the image as it stands after any turn.",
        },
        aspect: {
          type: "string",
          enum: ["original", "1:1", "4:5", "4:3", "3:2", "16:9", "9:16"],
          description:
            "Instead of a crop box: the largest box of this shape, in the middle.",
        },
        rotate: {
          type: "integer",
          enum: [0, 90, 180, 270],
          description: "Degrees clockwise.",
        },
        flipX: { type: "boolean", description: "Mirror left to right." },
        flipY: { type: "boolean", description: "Mirror top to bottom." },
        effort: { type: "string", enum: ["fast", "balanced", "max"] },
        background: {
          ...hex,
          description:
            "What shows through transparency in a format that has none, as #rrggbb (white).",
        },
        chroma444: {
          type: "boolean",
          description:
            "For JPEG: keep colour at full resolution (sharper red text, larger files).",
        },
        progressive: {
          type: "boolean",
          description: "For JPEG: load in passes (yes by default).",
        },
        pngColors: {
          type: "integer",
          enum: [256, 128, 64, 32, 16],
          description: "For PNG at smallest: at most this many colours.",
        },
        dithering: {
          type: "boolean",
          description: "With fewer colours: dither (yes by default).",
        },
        resample: { type: "string", enum: ["lanczos3", "mitchell", "catrom"] },
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
      const sizes = [
        input.longEdge !== undefined,
        input.scale !== undefined,
        input.width !== undefined || input.height !== undefined,
      ].filter(Boolean).length
      if (sizes > 1)
        throw new ToolError(
          "Give one way to size it: longEdge, scale, or a width and height."
        )
      if (input.crop && input.aspect)
        throw new ToolError("Give a crop box or an aspect, not both.")
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
        size: input.longEdge
          ? "long-edge"
          : input.scale
            ? (String(input.scale) as "75" | "50" | "25")
            : input.width !== undefined || input.height !== undefined
              ? "custom"
              : "original",
        longEdge: input.longEdge ?? compressDefaults.longEdge,
        customWidth: input.width !== undefined ? String(input.width) : "",
        customHeight: input.height !== undefined ? String(input.height) : "",
        unit: input.unit ?? compressDefaults.unit,
        lock: input.keepShape ?? compressDefaults.lock,
        fit: input.fit ?? compressDefaults.fit,
        rotation: input.rotate ?? 0,
        flipX: Boolean(input.flipX),
        flipY: Boolean(input.flipY),
        effort: input.effort ?? compressDefaults.effort,
        ...(input.background
          ? { background: "custom" as const, backgroundColor: input.background }
          : {}),
        chroma444: input.chroma444 ?? compressDefaults.chroma444,
        progressive: input.progressive ?? compressDefaults.progressive,
        pngColors: input.pngColors ?? compressDefaults.pngColors,
        dithering: input.dithering ?? compressDefaults.dithering,
        resample: input.resample ?? compressDefaults.resample,
      }
      const target = input.targetKilobytes
        ? Math.round(input.targetKilobytes * 1024)
        : null
      const { opened, done } = await engines.compressor.run(
        { file: image.blob, format: image.format, pixels: image.pixels },
        (open) => {
          // A box of a shape is the largest in the middle of the image as it is turned, as the page makes it.
          const turned = orientedSize(open, settings.rotation)
          const crop = input.crop
            ? input.crop
            : input.aspect
              ? initialCrop(turned, aspectValue(input.aspect, turned))
              : null
          const { plan, error } = buildPlan(
            { ...settings, crop },
            { width: open.width, height: open.height }
          )
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
        edited: Boolean(
          sizes ||
          input.crop ||
          input.aspect ||
          input.rotate ||
          input.flipX ||
          input.flipY
        ),
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
    unit?: ResizerSettings["unit"]
    dpi?: number
    embedDpi?: boolean
    keepShape?: boolean
    focus?: "smart" | { x: number; y: number }
    rotate?: Rotation
    flipX?: boolean
    flipY?: boolean
    kernel?: ResizerSettings["kernel"]
    sharpen?: ResizerSettings["sharpen"]
    multiple?: ResizerSettings["multiple"]
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
        width: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: 16384,
          description: "In unit (pixels by default).",
        },
        height: { type: "number", exclusiveMinimum: 0, maximum: 16384 },
        unit: {
          type: "string",
          enum: ["px", "percent", "in", "cm", "mm"],
          description:
            "For width and height: inches, cm and mm are for print, at dpi.",
        },
        dpi: {
          type: "integer",
          minimum: 1,
          maximum: 2400,
          description: "Dots per inch, for print sizes (300).",
        },
        embedDpi: {
          type: "boolean",
          description:
            "Write the dpi into the file, for printing at that size.",
        },
        keepShape: {
          type: "boolean",
          description:
            "With only a width or a height, keep the shape (yes by default).",
        },
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
        focus: {
          description:
            'What stays in view when cover crops: "smart" (found in each image) or a point, x and y from 0 (left, top) to 1 (right, bottom); the middle by default.',
          anyOf: [
            { type: "string", enum: ["smart"] },
            {
              type: "object",
              properties: {
                x: { type: "number", minimum: 0, maximum: 1 },
                y: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["x", "y"],
              additionalProperties: false,
            },
          ],
        },
        rotate: {
          type: "integer",
          enum: [0, 90, 180, 270],
          description: "Degrees clockwise.",
        },
        flipX: { type: "boolean" },
        flipY: { type: "boolean" },
        kernel: {
          type: "string",
          enum: [
            "auto",
            "lanczos3",
            "magicKernelSharp2021",
            "mitchell",
            "catrom",
            "triangle",
            "nearest",
          ],
          description:
            "How pixels are worked out: auto chooses as the page does.",
        },
        sharpen: { type: "string", enum: ["off", "light", "medium", "strong"] },
        multiple: {
          type: "integer",
          enum: [1, 2, 8],
          description: "Round sizes to a multiple of this many pixels.",
        },
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
        unit: input.unit ?? resizeDefaults.unit,
        ...(input.dpi ? { dpi: input.dpi } : {}),
        embedDpi: input.embedDpi ?? resizeDefaults.embedDpi,
        lock: input.keepShape ?? resizeDefaults.lock,
        focusMode: input.focus === "smart" ? "smart" : "manual",
        focus:
          input.focus && input.focus !== "smart"
            ? input.focus
            : resizeDefaults.focus,
        rotation: input.rotate ?? 0,
        flipX: Boolean(input.flipX),
        flipY: Boolean(input.flipY),
        kernel: input.kernel ?? resizeDefaults.kernel,
        sharpen: input.sharpen ?? resizeDefaults.sharpen,
        multiple: input.multiple ?? resizeDefaults.multiple,
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
    alsoTo?: Target[]
    embedDpi?: boolean
    dpi?: number
    dithering?: boolean
    pdfDpi?: number
  }> = {
    name: "convert_image",
    title: "Convert images",
    description:
      "Converts images to JPEG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO or PDF, from any of those and HEIC and SVG, to one format or several at once (alsoTo). With onePdf, all the images become the pages of one PDF, in order. Can limit the longest side, turn them grey, set the quality, the colours of a GIF and the sizes of an icon, and write the dpi for print.",
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
        alsoTo: {
          type: "array",
          items: { type: "string", enum: TARGETS },
          minItems: 1,
          maxItems: 9,
          uniqueItems: true,
          description: "More formats to write each image in, besides to.",
        },
        embedDpi: {
          type: "boolean",
          description: "Write the dpi into the file.",
        },
        dpi: { type: "integer", minimum: 1, maximum: 2400 },
        dithering: {
          type: "boolean",
          description: "For GIF: dither (yes by default).",
        },
        pdfDpi: {
          type: "integer",
          minimum: 36,
          maximum: 1200,
          description:
            "For PDF pages of A4 or Letter: dots per inch an image is placed at (150).",
        },
      },
      required: ["files", "to"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal, progress }) {
      if (input.onePdf && input.to !== "pdf")
        throw new ToolError('onePdf is for "to": "pdf".')
      if (input.onePdf && input.alsoTo)
        throw new ToolError("onePdf makes one PDF: give no other formats.")
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
        multi: Boolean(input.alsoTo),
        targets: [input.to, ...(input.alsoTo ?? [])].filter(
          (target, at, all) => all.indexOf(target) === at
        ),
        embedDpi: input.embedDpi ?? convertDefaults.embedDpi,
        dpi: input.dpi ?? convertDefaults.dpi,
        dithering: input.dithering ?? convertDefaults.dithering,
        pdfDpi: input.pdfDpi ?? convertDefaults.pdfDpi,
      }
      const made: {
        name: string
        bytes: ArrayBuffer
        width: number
        height: number
        page?: PdfImage
        target: Target
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
            target: output.target,
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
        files.add(
          new Blob([one.bytes], { type: targets[one.target].mime }),
          names[at],
          "made"
        )
      )
      return {
        summary: `Converted ${plural(input.files.length, "image")} to ${settings.targets
          .filter((target) => settings.multi || target === input.to)
          .map((target) => targets[target].label)
          .join(", ")}.`,
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
