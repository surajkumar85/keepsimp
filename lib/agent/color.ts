/**
 * The colour utility's work as tools: the same functions the workspace uses,
 * so wide-gamut values stay as given, sRGB fallbacks say they were mapped,
 * and contrast counts transparency.
 */
import {
  contrast,
  contrastSuggestion,
  defaults,
  inspect,
} from "@/lib/color/core"
import {
  checkImageHeader,
  exportPalette,
  harmony,
  paletteFromPixels,
  tones,
  type ExportFormat,
  type Harmony,
} from "@/lib/color/palette"
import { sampleProblem } from "@/lib/color/sample"
import { madeName } from "./files"
import { asTool, fileProperty, ToolError, type AgentTool } from "./registry"

/** Draws an image file small and gives its RGBA pixels (in the browser: `createImageBitmap`). */
export type SampleImage = (file: Blob) => Promise<Uint8ClampedArray>

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

export function colorTools(sample: SampleImage): AgentTool[] {
  const convertColor: AgentTool<{ colors: string[] }> = {
    name: "convert_color",
    title: "Convert colours",
    description:
      "Reads colours written any way CSS allows (hex, rgb(), hsl(), oklch(), color(display-p3 …), names) and gives each in HEX, RGB, HSL, HWB, Lab, LCH, OKLab, OKLCH, Display P3, Rec. 2020 and more, saying where a value had to be mapped into a smaller space.",
    inputSchema: {
      type: "object",
      properties: {
        colors: {
          type: "array",
          items: color("A colour."),
          minItems: 1,
          maxItems: 100,
        },
      },
      required: ["colors"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input) {
      const answers = input.colors.map((text) => {
        try {
          return described(text)
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
  }> = {
    name: "check_contrast",
    title: "Check colour contrast",
    description:
      "Gives the WCAG 2 contrast ratio of a text colour on a background, with transparency laid over the canvas (white by default), and whether it passes AA and AAA for text, large text and graphics. When it fails AA, suggests the nearest lightness of the text colour that passes.",
    inputSchema: {
      type: "object",
      properties: {
        foreground: color("The text or icon colour."),
        background: color("The colour behind it."),
        canvas: color(
          "What a transparent background lies on; opaque. White by default."
        ),
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
      const suggestion = result.aa
        ? null
        : contrastSuggestion(input.foreground, input.background, canvas, 4.5)
      const ratio = Math.floor(result.ratio * 100) / 100
      return {
        summary: `${ratio}:1. ${result.aa ? "Passes" : "Fails"} AA for text${result.aaa ? " and AAA" : ""}.${suggestion ? ` ${suggestion} would pass AA.` : ""}`,
        data: {
          ratio: result.ratio,
          aa: result.aa,
          aaLarge: result.largeAA,
          aaa: result.aaa,
          aaaLarge: result.largeAAA,
          graphics: result.graphics,
          foregroundAsSeen: result.foreground,
          backgroundAsSeen: result.background,
          suggestion,
        },
      }
    },
  }

  const makePalette: AgentTool<{
    color?: string
    harmony?: Harmony
    colors?: string[]
    format?: ExportFormat
  }> = {
    name: "make_palette",
    title: "Make a colour palette",
    description:
      "From one colour, makes a harmony (analogous, complementary, split, triadic, tetradic or monochrome, in OKLCH) and a scale of eleven tones from 50 to 1000. Or give your own colours. With format, also writes the palette as CSS variables, SCSS, JSON, design tokens, a Tailwind theme, a GIMP palette or SVG swatches.",
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
        format: { type: "string", enum: FORMATS },
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
      const made = input.format ? exportPalette(palette, input.format) : null
      const file = made
        ? files.add(
            new Blob([made.text], { type: made.mime }),
            madeName(null, "-palette", made.extension),
            "made"
          )
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
      const { blob, ref } = files.get(input.file)
      const problem = sampleProblem(ref.type, blob.size)
      if (problem) throw new ToolError(problem)
      try {
        checkImageHeader(
          new Uint8Array(await blob.slice(0, 16).arrayBuffer()),
          ref.type
        )
      } catch (error) {
        throw new ToolError((error as Error).message)
      }
      const found = paletteFromPixels(await sample(blob), input.count ?? 8)
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

  return [convertColor, checkContrast, makePalette, colorsFromImage].map(
    (tool) => asTool(tool as AgentTool<never>)
  )
}
