import Color from "colorjs.io"
import {
  bounded,
  css,
  hex,
  mixColors,
  parseColor,
  srgb,
  type MixSpace,
} from "./core"

export type Harmony =
  | "analogous"
  | "complementary"
  | "split"
  | "triadic"
  | "tetradic"
  | "monochrome"
export function harmony(text: string, mode: Harmony) {
  const c = parseColor(text).to("oklch")
  const turns = {
    analogous: [-30, 0, 30],
    complementary: [0, 180],
    split: [0, 150, 210],
    triadic: [0, 120, 240],
    tetradic: [0, 90, 180, 270],
    monochrome: [0, 0, 0, 0, 0],
  }[mode]
  return turns.map((turn, i) => {
    const next = c.clone()
    next.coords[2] = ((c.coords[2] ?? 0) + turn + 360) % 360
    if (mode === "monochrome") next.coords[0] = 0.25 + i * 0.15
    return css(next)
  })
}
export function tones(text: string) {
  const c = parseColor(text).to("oklch")
  return [0.97, 0.94, 0.88, 0.8, 0.7, 0.6, 0.5, 0.4, 0.32, 0.24, 0.16].map(
    (l, i) => {
      const next = c.clone()
      next.coords[0] = l
      next.coords[1] = Math.min(c.coords[1]!, 0.16)
      return { label: i === 0 ? "50" : String(i * 100), value: hex(next) }
    }
  )
}
export type ExportFormat =
  "css" | "scss" | "json" | "tokens" | "tailwind" | "gpl" | "svg"
export function exportPalette(values: string[], format: ExportFormat) {
  if (!values.length || values.length > 16)
    throw new Error("A palette needs 1 to 16 colors.")
  const colors = values.map(parseColor),
    entries = colors.map((c, i) => [`color-${i + 1}`, hex(c)] as const)
  if (format === "css")
    return {
      extension: "css",
      mime: "text/css",
      text: `:root {\n${entries.map(([name, value]) => `  --${name}: ${value};`).join("\n")}\n}\n`,
    }
  if (format === "scss")
    return {
      extension: "scss",
      mime: "text/plain",
      text:
        entries.map(([name, value]) => `$${name}: ${value};`).join("\n") + "\n",
    }
  if (format === "gpl")
    return {
      extension: "gpl",
      mime: "text/plain",
      text: `GIMP Palette\nName: KeepSimp palette (opaque sRGB)\nColumns: ${colors.length}\n#\n${colors
        .map(
          (c, i) =>
            `${srgb(c)
              .coords.map((v) => Math.round(v! * 255))
              .join(" ")} Color ${i + 1}`
        )
        .join("\n")}\n`,
    }
  if (format === "svg")
    return {
      extension: "svg",
      mime: "image/svg+xml",
      text: `<svg xmlns="http://www.w3.org/2000/svg" width="${colors.length * 160}" height="160" viewBox="0 0 ${colors.length * 160} 160">${colors.map((c, i) => `<rect x="${i * 160}" width="160" height="160" fill="${hex(c, false)}" fill-opacity="${c.alpha}"/>`).join("")}</svg>`,
    }
  const body =
    format === "tokens"
      ? Object.fromEntries(
          colors.map((c, i) => [
            `color-${i + 1}`,
            {
              $type: "color",
              $value: {
                colorSpace: "srgb",
                components: srgb(c).coords.map((v) => Number(v!.toFixed(7))),
                alpha: c.alpha,
              },
            },
          ])
        )
      : format === "tailwind"
        ? { theme: { extend: { colors: Object.fromEntries(entries) } } }
        : Object.fromEntries(entries)
  return {
    extension: "json",
    mime: "application/json",
    text: JSON.stringify(body, null, 2) + "\n",
  }
}
export type GradientKind = "linear" | "radial" | "conic"
export type Stop = { color: string; position: number }
export function gradient(
  stops: Stop[],
  kind: GradientKind,
  angle: number,
  space: MixSpace
) {
  if (stops.length < 2 || stops.length > 8)
    throw new Error("Use 2 to 8 gradient stops.")
  bounded(angle, 0, 360)
  const checked = stops.map((stop) => ({
    color: hex(parseColor(stop.color)),
    position: bounded(stop.position, 0, 100),
  }))
  if (
    checked.some((stop, i) => i > 0 && stop.position < checked[i - 1].position)
  )
    throw new Error("Stop positions must go from smallest to largest.")
  const direction =
    kind === "linear"
      ? `${angle}deg`
      : kind === "radial"
        ? "circle"
        : `from ${angle}deg`
  const cssValue = `${kind}-gradient(${direction} in ${space}, ${checked.map((s) => `${s.color} ${s.position}%`).join(", ")})`
  return { css: cssValue, stops: checked }
}
export function gradientSample(
  stops: Stop[],
  position: number,
  space: MixSpace
) {
  bounded(position, 0, 100)
  if (position < stops[0].position) return stops[0].color
  for (let i = 1; i < stops.length; i++)
    if (position < stops[i].position) {
      const left = stops[i - 1],
        right = stops[i]
      return mixColors(
        left.color,
        right.color,
        (position - left.position) / (right.position - left.position),
        space
      )
    }
  return stops.at(-1)!.color
}
export function gradientFallback(
  stops: Stop[],
  kind: GradientKind,
  angle: number,
  space: MixSpace
) {
  gradient(stops, kind, angle, space)
  // Include exact stops as well as samples, so repeated-position hard edges survive.
  const points = [
    ...stops.map((s, i) => ({
      position: s.position,
      color: hex(parseColor(s.color)),
      order: i,
    })),
    ...Array.from({ length: 33 }, (_, i) => ({
      position: (i * 100) / 32,
      color: hex(parseColor(gradientSample(stops, (i * 100) / 32, space))),
      order: 100 + i,
    })),
  ].sort((a, b) => a.position - b.position || a.order - b.order)
  return `${kind}-gradient(${kind === "linear" ? `${angle}deg` : kind === "radial" ? "circle" : `from ${angle}deg`}, ${points.map((s) => `${s.color} ${s.position}%`).join(", ")})`
}
export function paletteFromPixels(data: Uint8ClampedArray, count: number) {
  bounded(count, 2, 12)
  if (
    !Number.isInteger(count) ||
    !data.length ||
    data.length % 4 ||
    data.length > 256 * 256 * 4
  )
    throw new Error("Use a non-empty RGBA sample of at most 256 × 256 pixels.")
  const bins = new Map<number, { sum: number[]; weight: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const key =
        (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4),
      weight = data[i + 3] / 255
    const bucket = bins.get(key) ?? { sum: [0, 0, 0], weight: 0 }
    for (let j = 0; j < 3; j++) bucket.sum[j] += data[i + j] * weight
    bucket.weight += weight
    bins.set(key, bucket)
  }
  const candidates = [...bins.values()]
    .sort((a, b) => b.weight - a.weight)
    .map((b) => ({
      color: new Color(
        "srgb",
        b.sum.map((v) => v / b.weight / 255) as [number, number, number]
      ),
      weight: b.weight,
    }))
  const selected: typeof candidates = []
  for (const candidate of candidates) {
    if (selected.every((c) => Color.deltaEOK(c.color, candidate.color) > 0.06))
      selected.push(candidate)
    if (selected.length === count) break
  }
  return selected.map((c) => ({
    color: hex(c.color),
    share: c.weight / [...bins.values()].reduce((n, b) => n + b.weight, 0),
  }))
}

/** Check the bytes as well as the declared type before a browser decodes a file. */
export function checkImageHeader(bytes: Uint8Array, type: string) {
  const prefix = (value: number[], start = 0) =>
    value.every((v, i) => bytes[start + i] === v)
  const matches =
    type === "image/png"
      ? prefix([137, 80, 78, 71, 13, 10, 26, 10])
      : type === "image/jpeg"
        ? prefix([255, 216, 255])
        : type === "image/webp"
          ? prefix([82, 73, 70, 70]) && prefix([87, 69, 66, 80], 8)
          : type === "image/gif"
            ? prefix([71, 73, 70, 56]) &&
              (bytes[4] === 55 || bytes[4] === 57) &&
              bytes[5] === 97
            : false
  if (!matches)
    throw new Error(
      "The image bytes do not match a supported PNG, JPEG, WebP or GIF. Choose the original image file."
    )
}
