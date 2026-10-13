import Color from "colorjs.io"

export const defaults = {
  color: "#00786f",
  foreground: "#141413",
  background: "#faf9f5",
  white: "#ffffff",
  black: "#000000",
}
export const initialPalette = [
  defaults.color,
  defaults.background,
  defaults.foreground,
  "#d97757",
  "#6a9bcc",
]
export const spaces = [
  ["srgb", "RGB"],
  ["hsl", "HSL"],
  ["hwb", "HWB"],
  ["lab", "Lab D50"],
  ["lch", "LCH D50"],
  ["oklab", "OKLab"],
  ["oklch", "OKLCH"],
  ["p3", "Display P3"],
  ["srgb-linear", "Linear sRGB"],
  ["a98rgb", "Adobe RGB compatible"],
  ["prophoto", "ProPhoto RGB"],
  ["rec2020", "Rec. 2020"],
  ["xyz-d50", "XYZ D50"],
  ["xyz-d65", "XYZ D65"],
] as const
export type MixSpace = "srgb" | "srgb-linear" | "oklab" | "oklch"
export function bounded(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`Use a number from ${min} to ${max}.`)
  return value
}
export function parseColor(text: string): Color {
  const input = text.trim()
  if (!input || input.length > 512)
    throw new Error("Enter one color, up to 512 characters.")
  if (
    /\b(?:none|nan|infinity|from|var|calc|currentcolor|url|color-mix)\b|[;{}<>]/i.test(
      input
    )
  )
    throw new Error(
      "Use a complete color value, without variables, missing channels or CSS expressions."
    )
  const model = input.match(/^(hsv|hsb|cmyk)\(([^()]*)\)$/i)
  let color: Color
  if (model) {
    const parts = model[2].trim().split(/[\s,]+/)
    const expected = model[1].toLowerCase() === "cmyk" ? 4 : 3
    if (
      parts.length !== expected ||
      parts.some((p) => !/^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(p))
    )
      throw new Error("Use hsv(hue saturation% value%) or cmyk(c% m% y% k%).")
    const values = parts.map((p) => Number(p.replace("%", "")))
    if (expected === 4) {
      const [c, m, y, k] = values.map((v) => bounded(v, 0, 100) / 100)
      color = new Color("srgb", [
        (1 - c) * (1 - k),
        (1 - m) * (1 - k),
        (1 - y) * (1 - k),
      ])
    } else {
      const h = ((bounded(values[0], -360000, 360000) % 360) + 360) % 360
      const s = bounded(values[1], 0, 100) / 100,
        v = bounded(values[2], 0, 100) / 100
      color = new Color("hsl", [
        h,
        v === 0 || (v === 1 && s === 0)
          ? 0
          : ((v * s) / (1 - Math.abs(2 * v * (1 - s / 2) - 1))) * 100,
        v * (1 - s / 2) * 100,
      ])
    }
  } else {
    try {
      color = new Color(input)
    } catch {
      throw new Error(
        "That color could not be read. Try HEX, a CSS color name, rgb(), hsl(), lab(), oklch() or color(display-p3 …)."
      )
    }
  }
  if (
    color.coords.some(
      (v) => v === null || !Number.isFinite(v) || Math.abs(v) > 1e6
    ) ||
    color.alpha === null ||
    !Number.isFinite(color.alpha)
  )
    throw new Error(
      "Each channel must be a finite number; missing channels are not supported."
    )
  color.alpha = Math.max(0, Math.min(1, color.alpha))
  return color
}
export function srgb(color: Color) {
  return color.to("srgb").toGamut({ method: "css", space: "srgb" })
}
export function hex(color: Color, alpha = true) {
  const rgb = srgb(color)
  const channels = rgb.coords.map((v) =>
    Math.round(Math.max(0, Math.min(1, v!)) * 255)
  )
  if (alpha && rgb.alpha! < 1) channels.push(Math.round(rgb.alpha! * 255))
  return `#${channels.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}
export function css(color: Color) {
  return color
    .to("oklch")
    .toString({ precision: 7, inGamut: false })
    .replace(/\bnone\b/g, "0")
}
export function inspect(text: string) {
  const color = parseColor(text),
    rgb = srgb(color)
  const [r, g, b] = rgb.coords as [number, number, number]
  const high = Math.max(r, g, b),
    low = Math.min(r, g, b)
  const h = rgb.to("hsl").coords[0] ?? 0
  const round = (n: number) => String(Number(n.toFixed(4)))
  const rows = [
    { label: "HEX", value: hex(color), mapped: !color.inGamut("srgb") },
    ...spaces.map(([id, label]) => ({
      label,
      value: (id === "srgb" || id === "hsl" || id === "hwb" ? rgb : color)
        .to(id)
        .toString({ precision: 7, inGamut: false })
        .replace(/\bnone\b/g, "0"),
      mapped: ["srgb", "hsl", "hwb"].includes(id) && !color.inGamut("srgb"),
    })),
    {
      label: "HSV / HSB",
      value: `hsv(${round(h)} ${round(high === 0 ? 0 : ((high - low) / high) * 100)}% ${round(high * 100)}%)`,
      mapped: !color.inGamut("srgb"),
    },
    {
      label: "CMYK (approximate)",
      value: `cmyk(${[r, g, b].map((v) => round(high === 0 ? 0 : ((high - v) / high) * 100)).join("% ")}% ${round((1 - high) * 100)}%)`,
      mapped: true,
    },
  ]
  return {
    color,
    hex: hex(color),
    css: css(color),
    rows,
    alpha: color.alpha!,
    inSrgb: color.inGamut("srgb"),
    inP3: color.inGamut("p3"),
  }
}
export function bulkConvert(text: string, format: "hex" | "rgb" | "oklch") {
  if (text.length > 52000)
    throw new Error("Keep the list under 52,000 characters.")
  const lines = text.trim().split(/\r?\n/)
  if (lines.length > 100)
    throw new Error("Convert up to 100 colors at once, one per line.")
  return lines.map((line, index) => {
    try {
      const c = parseColor(line)
      return {
        line: index + 1,
        value:
          format === "hex"
            ? hex(c)
            : format === "rgb"
              ? srgb(c).toString({ precision: 7 })
              : css(c),
      }
    } catch (e) {
      return { line: index + 1, error: (e as Error).message }
    }
  })
}
export function composite(foreground: Color, background: Color) {
  const fg = srgb(foreground),
    bg = srgb(background)
  if (bg.alpha !== 1) throw new Error("The canvas color must be opaque.")
  return new Color(
    "srgb",
    fg.coords.map(
      (v, i) => v! * fg.alpha! + bg.coords[i]! * (1 - fg.alpha!)
    ) as [number, number, number]
  )
}
export function contrast(
  foreground: string,
  background: string,
  canvas = defaults.white
) {
  const base = parseColor(canvas),
    bg = composite(parseColor(background), base),
    fg = composite(parseColor(foreground), bg)
  // WCAG's normative sRGB weights (not the slightly different XYZ matrix Y).
  const luminance = (color: Color) =>
    color
      .to("srgb-linear")
      .coords.reduce<number>(
        (sum, channel, i) => sum + channel! * [0.2126, 0.7152, 0.0722][i],
        0
      )
  const first = luminance(bg),
    second = luminance(fg)
  const ratio =
    (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  return {
    ratio,
    foreground: fg.toString({ precision: 12, inGamut: false }),
    background: bg.toString({ precision: 12, inGamut: false }),
    aa: ratio >= 4.5,
    largeAA: ratio >= 3,
    aaa: ratio >= 7,
    largeAAA: ratio >= 4.5,
    graphics: ratio >= 3,
  }
}
export function contrastSuggestion(
  foreground: string,
  background: string,
  canvas: string,
  target: number
) {
  bounded(target, 3, 7)
  const original = parseColor(foreground).to("oklch")
  const choices: { value: string; distance: number }[] = []
  for (let i = 0; i <= 100; i++) {
    const candidate = original.clone()
    candidate.coords[0] = i / 100
    candidate.alpha = 1
    const value = hex(candidate)
    if (contrast(value, background, canvas).ratio >= target)
      choices.push({ value, distance: Math.abs(i / 100 - original.coords[0]!) })
  }
  choices.sort((a, b) => a.distance - b.distance)
  return choices[0]?.value ?? null
}
export function mixColors(
  first: string,
  second: string,
  amount: number,
  space: MixSpace
) {
  bounded(amount, 0, 1)
  return parseColor(first)
    .mix(parseColor(second), amount, {
      space,
      outputSpace: space,
      premultiplied: true,
      hue: "shorter",
    })
    .toString({ precision: 12, inGamut: false })
    .replace(/\bnone\b/g, "0")
}
export function difference(first: string, second: string) {
  return Color.deltaE2000(parseColor(first), parseColor(second))
}
