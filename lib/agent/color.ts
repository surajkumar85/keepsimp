/**
 * The colour utility's work as tools: the same functions the workspace uses,
 * so wide-gamut values stay as given, sRGB fallbacks say they were mapped,
 * and contrast counts transparency.
 */
import {
  asFormat,
  contrast,
  contrastSuggestion,
  defaults,
  difference,
  hex,
  inspect,
  mixColors,
  parseColor,
  type MixSpace,
} from "@/lib/color/core"
import { brands } from "@/lib/color/brands"
import {
  checkImageHeader,
  exportPalette,
  gradient,
  gradientFallback,
  harmony,
  paletteFromPixels,
  tones,
  type ExportFormat,
  type GradientKind,
  type Harmony,
  type Stop,
} from "@/lib/color/palette"
import { sampleProblem } from "@/lib/color/sample"
import { simulate, type Vision } from "@/lib/color/vision"
import { madeName, type FileStore } from "./files"
import { asTool, fileProperty, ToolError, type AgentTool } from "./registry"

/** Draws an image file small and gives its RGBA pixels (in the browser: `createImageBitmap`). */
export type SampleImage = (
  file: Blob
) => Promise<{ data: Uint8ClampedArray; width: number; height: number }>
/** Draws a palette as the page's PNG strip (`drawStrip`) and gives the file. */
export type PaletteStrip = (colors: string[]) => Promise<Blob>

const color = (description: string) => ({
  type: "string",
  maxLength: 512,
  description,
})

/** A colour's values, for an answer: no library objects, only words and numbers. */
function described(text: string) {
  const found = inspect(text)
  return {
    input: text,
    hex: found.hex,
    css: found.css,
    alpha: found.alpha,
    inSrgb: found.inSrgb,
    inDisplayP3: found.inP3,
    values: found.rows.map((row) => ({
      space: row.label,
      value: row.value,
      // Mapped into the space's range, so not the colour exactly.
      mapped: row.mapped,
    })),
  }
}

const HARMONIES: Harmony[] = [
  "analogous",
  "complementary",
  "split",
  "triadic",
  "tetradic",
  "monochrome",
]
const FORMATS: ExportFormat[] = [
  "css",
  "scss",
  "json",
  "tokens",
  "tailwind",
  "gpl",
  "svg",
]
const SPACES: MixSpace[] = ["srgb", "srgb-linear", "oklab", "oklch"]
const VISIONS: Vision[] = ["protan", "deutan", "tritan", "grayscale"]
const space = {
  type: "string",
  enum: SPACES,
  description: "The space to blend in: OKLab by default, as the page.",
}

/** Runs a colour function, turning what it refuses into an answer for the agent. */
function checked<T>(work: () => T): T {
  try {
    return work()
  } catch (error) {
    throw new ToolError((error as Error).message)
  }
}

/** Writes a palette in a text format, or as the page's PNG strip. */
async function written(
  palette: string[],
  format: ExportFormat | "png",
  strip: PaletteStrip,
  files: FileStore,
  base: string
) {
  if (format === "png")
    return files.add(
      await strip(palette),
      madeName(null, `-${base}`, "png"),
      "made"
    )
  const made = checked(() => exportPalette(palette, format))
  return files.add(
    new Blob([made.text], { type: made.mime }),
    madeName(null, `-${base}`, made.extension),
    "made"
  )
}

export function colorTools(
  sample: SampleImage,
  strip: PaletteStrip
): AgentTool[] {
  /** An image file checked as the page checks it, then drawn small. */
  async function drawn(files: FileStore, id: string) {
    const { blob, ref } = files.get(id)
    const problem = sampleProblem(ref.type, blob.size)
    if (problem) throw new ToolError(problem)
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
    checked(() => checkImageHeader(head, ref.type))
    return { ref, drawing: await sample(blob) }
  }

  const convertColor: AgentTool<{
    colors: string[]
    format?: "hex" | "rgb" | "oklch"
  }> = {
    name: "convert_color",
    title: "Convert colours",
    description:
      "Reads colours written any way CSS allows (hex, rgb(), hsl(), oklch(), color(display-p3 …), names) and gives each in HEX, RGB, HSL, HWB, Lab, LCH, OKLab, OKLCH, Display P3, Rec. 2020 and more, saying where a value had to be mapped into a smaller space. With format, gives only that one value for each, as the page's batch converter does.",
    inputSchema: {
      type: "object",
      properties: {
        colors: {
          type: "array",
          items: color("A colour."),
          minItems: 1,
          maxItems: 100,
        },
        format: {
          type: "string",
          enum: ["hex", "rgb", "oklch"],
          description:
            "Only this value for each colour; HEX and RGB are the sRGB fallback.",
        },
      },
      required: ["colors"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input) {
      const { format } = input
      const answers = input.colors.map((text) => {
        try {
          return format
            ? { input: text, value: asFormat(parseColor(text), format) }
            : described(text)
        } catch (error) {
          return { input: text, problem: (error as Error).message }
        }
      })
      const failed = answers.filter((answer) => "problem" in answer).length
      return {
        summary: failed
          ? `Read ${answers.length - failed} of ${answers.length} colours; the others could not be read.`
          : `Read ${answers.length} ${answers.length === 1 ? "colour" : "colours"}.`,
        data: answers,
      }
    },
  }

  const checkContrast: AgentTool<{
    foreground: string
    background: string
    canvas?: string
    target?: 3 | 4.5 | 7
  }> = {
    name: "check_contrast",
    title: "Check colour contrast",
    description:
      "Gives the WCAG 2 contrast ratio of a text colour on a background, with transparency laid over the canvas (white by default), and whether it passes AA and AAA for text, large text and graphics. When it falls short of the target (4.5:1 by default), suggests the nearest lightness of the text colour that reaches it. Also gives the colour difference (ΔE2000, without opacity) and how the pair may look with protan, deutan and tritan colour vision and in grayscale: approximate previews, not a prediction of every person's vision.",
    inputSchema: {
      type: "object",
      properties: {
        foreground: color("The text or icon colour."),
        background: color("The colour behind it."),
        canvas: color(
          "What a transparent background lies on; opaque. White by default."
        ),
        target: {
          type: "number",
          enum: [3, 4.5, 7],
          description: "The ratio a suggestion must reach.",
        },
      },
      required: ["foreground", "background"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input) {
      const canvas = input.canvas ?? defaults.white
      let result: ReturnType<typeof contrast>
      try {
        result = contrast(input.foreground, input.background, canvas)
      } catch (error) {
        throw new ToolError((error as Error).message)
      }
      const target = input.target ?? 4.5
      const short = result.ratio < target
      const suggestion = short
        ? contrastSuggestion(input.foreground, input.background, canvas, target)
        : null
      const ratio = Math.floor(result.ratio * 100) / 100
      const vision = Object.fromEntries(
        VISIONS.map((kind) => [
          kind,
          {
            foreground: simulate(result.foreground, kind),
            background: simulate(result.background, kind),
          },
        ])
      )
      return {
        summary: `${ratio}:1. ${result.aa ? "Passes" : "Fails"} AA for text${result.aaa ? " and AAA" : ""}.${suggestion ? ` ${suggestion} would reach ${target}:1.` : short ? ` No opaque text colour reaches ${target}:1 on this background.` : ""}`,
        data: {
          ratio: result.ratio,
          aa: result.aa,
          aaLarge: result.largeAA,
          aaa: result.aaa,
          aaaLarge: result.largeAAA,
          graphics: result.graphics,
          foregroundAsSeen: result.foreground,
          backgroundAsSeen: result.background,
          target,
          suggestion,
          difference:
            Math.round(difference(input.foreground, input.background) * 100) /
            100,
          vision,
        },
      }
    },
  }

  const makePalette: AgentTool<{
    color?: string
    harmony?: Harmony
    colors?: string[]
    format?: ExportFormat | "png"
  }> = {
    name: "make_palette",
    title: "Make a colour palette",
    description:
      "From one colour, makes a harmony (analogous, complementary, split, triadic, tetradic or monochrome, in OKLCH) and a scale of eleven tones from 50 to 1000. Or give your own colours. With format, also writes the palette as CSS variables, SCSS, JSON, design tokens, a Tailwind theme, a GIMP palette, SVG swatches or a PNG strip.",
    inputSchema: {
      type: "object",
      properties: {
        color: color("The colour to start from."),
        harmony: { type: "string", enum: HARMONIES },
        colors: {
          type: "array",
          items: color("A colour of the palette."),
          minItems: 1,
          maxItems: 16,
          description: "Your own palette, instead of a harmony.",
        },
        format: { type: "string", enum: [...FORMATS, "png"] },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files }) {
      if ((input.color === undefined) === (input.colors === undefined))
        throw new ToolError('Give either "color" or "colors".')
      if (input.colors && input.harmony)
        throw new ToolError(
          "A harmony is made from one colour, not from a list."
        )
      let palette: string[]
      let scale: { label: string; value: string }[] | undefined
      try {
        palette =
          input.colors ?? harmony(input.color!, input.harmony ?? "analogous")
        scale = input.color ? tones(input.color) : undefined
      } catch (error) {
        throw new ToolError((error as Error).message)
      }
      const file = input.format
        ? await written(palette, input.format, strip, files, "palette")
        : null
      return {
        summary: `${palette.length} colours${scale ? " and a scale of 11 tones" : ""}.${file ? ` Written as ${input.format} to ${file.name}.` : ""}`,
        files: file ? [file] : [],
        data: { palette, tones: scale },
      }
    },
  }

  const colorsFromImage: AgentTool<{ file: string; count?: number }> = {
    name: "colors_from_image",
    title: "Colours from an image",
    description:
      "Finds the main colours of a PNG, JPEG, WebP or GIF (up to 10 MiB), with the share of the picture each covers. The image is drawn at most 256 pixels wide for counting; transparent pixels are left out.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The image."),
        count: { type: "integer", minimum: 2, maximum: 12 },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files }) {
      const { ref, drawing } = await drawn(files, input.file)
      const found = paletteFromPixels(drawing.data, input.count ?? 8)
      if (!found.length)
        throw new ToolError(
          "There are no visible pixels to count. Try an image with less transparency."
        )
      return {
        summary: `${found.length} main colours of ${ref.name}.`,
        data: found.map((each) => ({
          color: each.color,
          share: Math.round(each.share * 1000) / 1000,
        })),
      }
    },
  }

  const pickImageColor: AgentTool<{ file: string; x: number; y: number }> = {
    name: "pick_image_color",
    title: "Read one pixel of an image",
    description:
      "Gives the colour of one pixel of a PNG, JPEG, WebP or GIF, with its opacity, as the page's pixel picker does. The image is first drawn at most 256 pixels on a side and turned into sRGB by the browser, so x and y count pixels of that drawing (from 0 at the top left), not of the original file; the answer gives the drawing's size.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The image."),
        x: { type: "integer", minimum: 0, maximum: 255 },
        y: { type: "integer", minimum: 0, maximum: 255 },
      },
      required: ["file", "x", "y"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files }) {
      const { ref, drawing } = await drawn(files, input.file)
      const { width, height, data } = drawing
      if (input.x >= width || input.y >= height)
        throw new ToolError(
          `${ref.name} is drawn ${width} × ${height} pixels; give x under ${width} and y under ${height}.`
        )
      const at = (input.y * width + input.x) * 4
      const [r, g, b, a] = data.slice(at, at + 4)
      const value = `rgb(${r} ${g} ${b} / ${(a / 255).toFixed(6)})`
      return {
        summary: `Pixel ${input.x}, ${input.y} of ${ref.name} is ${hex(parseColor(value))}.`,
        data: {
          color: value,
          hex: hex(parseColor(value)),
          sample: { width, height },
        },
      }
    },
  }

  const mix: AgentTool<{
    first: string
    second: string
    amount?: number
    space?: MixSpace
  }> = {
    name: "mix_colors",
    title: "Mix two colours",
    description:
      "Blends two colours as the palette page does, with opacity counted (premultiplied) and hue the shorter way round: amount 0 is the first colour, 1 the second.",
    inputSchema: {
      type: "object",
      properties: {
        first: color("The first colour."),
        second: color("The second colour."),
        amount: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "How much of the second colour (0.5).",
        },
        space,
      },
      required: ["first", "second"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input) {
      const amount = input.amount ?? 0.5
      const value = checked(() =>
        mixColors(input.first, input.second, amount, input.space ?? "oklab")
      )
      const { hex: fallback, inSrgb } = inspect(value)
      return {
        summary: `${fallback}${inSrgb ? "" : " (mapped into sRGB)"}: ${Math.round(amount * 100)}% of ${input.second} in ${input.first}.`,
        data: { color: value, hex: fallback, inSrgb },
      }
    },
  }

  const makeGradient: AgentTool<{
    stops: Stop[]
    kind?: GradientKind
    angle?: number
    space?: MixSpace
  }> = {
    name: "make_gradient",
    title: "Make a CSS gradient",
    description:
      "Writes a linear, radial or conic CSS gradient from 2 to 8 stops, blended in sRGB, linear sRGB, OKLab or OKLCH. Gives the modern CSS and a fallback for browsers without interpolation spaces: 33 sampled points plus the stops themselves, so stops at the same place keep their hard edge; the fallback only approximates between samples.",
    inputSchema: {
      type: "object",
      properties: {
        stops: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              color: color("The stop's colour."),
              position: { type: "number", minimum: 0, maximum: 100 },
            },
            required: ["color", "position"],
            additionalProperties: false,
          },
          description: "From the smallest position (%) to the largest.",
        },
        kind: { type: "string", enum: ["linear", "radial", "conic"] },
        angle: {
          type: "number",
          minimum: 0,
          maximum: 360,
          description: "Degrees, for linear and conic (90).",
        },
        space,
      },
      required: ["stops"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input) {
      const kind = input.kind ?? "linear"
      const angle = input.angle ?? 90
      const blend = input.space ?? "oklab"
      const made = checked(() => ({
        modern: gradient(input.stops, kind, angle, blend),
        fallback: gradientFallback(input.stops, kind, angle, blend),
      }))
      return {
        summary: `A ${kind} gradient of ${input.stops.length} stops, blended in ${blend}.`,
        data: {
          css: `background: ${made.fallback};\nbackground: ${made.modern.css};`,
          modern: made.modern.css,
          fallback: made.fallback,
          stops: made.modern.stops,
        },
      }
    },
  }

  const brandColors: AgentTool<{
    brand?: string
    format?: ExportFormat | "png"
  }> = {
    name: "brand_colors",
    title: "Companies' brand colours",
    description: `Gives the colours published by ${brands.length} companies (${brands.map((brand) => brand.name).join(", ")}), each with its scope, its first-party source and the date it was checked. Without a brand, lists them. With format, writes the brand's colours as a palette file. These are references, not affiliations or a licence to use an identity.`,
    inputSchema: {
      type: "object",
      properties: {
        brand: {
          type: "string",
          enum: brands.map((brand) => brand.name),
        },
        format: { type: "string", enum: [...FORMATS, "png"] },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files }) {
      if (!input.brand) {
        if (input.format)
          throw new ToolError('Name the "brand" whose colours to write.')
        return {
          summary: `${brands.length} companies: ${brands.map((brand) => brand.name).join(", ")}.`,
          data: brands.map((brand) => ({
            name: brand.name,
            scope: brand.scope,
            colors: brand.colors.length,
          })),
        }
      }
      const brand = brands.find((each) => each.name === input.brand)!
      const file = input.format
        ? await written(
            brand.colors.map((each) => each.value),
            input.format,
            strip,
            files,
            `${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-colors`
          )
        : null
      return {
        summary: `${brand.colors.length} colours of ${brand.name}, from ${brand.source} (checked ${brand.checked}).${file ? ` Written as ${input.format} to ${file.name}.` : ""}`,
        files: file ? [file] : [],
        data: brand,
      }
    },
  }

  return [
    convertColor,
    checkContrast,
    makePalette,
    mix,
    makeGradient,
    brandColors,
    colorsFromImage,
    pickImageColor,
  ].map((tool) => asTool(tool as AgentTool<never>))
}
