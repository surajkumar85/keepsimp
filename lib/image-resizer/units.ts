import type { Size } from "@/lib/image-compressor/geometry"

export type Unit = "px" | "percent" | "in" | "cm" | "mm"
export type Multiple = 1 | 2 | 8

export const dpiChoices = [72, 96, 150, 300] as const
export const unitLabels: Record<Unit, string> = {
  px: "px",
  percent: "%",
  in: "in",
  cm: "cm",
  mm: "mm",
}
const perInch: Record<"in" | "cm" | "mm", number> = {
  in: 1,
  cm: 2.54,
  mm: 25.4,
}

export const isPhysical = (unit: Unit): unit is "in" | "cm" | "mm" =>
  unit === "in" || unit === "cm" || unit === "mm"

/** Convert a typed value to pixels. `base` is the source length used for percentages. */
export function toPixels(value: number, unit: Unit, dpi: number, base: number) {
  if (unit === "px") return value
  if (unit === "percent") return (base * value) / 100
  return (value / perInch[unit]) * dpi
}

/** The inverse of `toPixels`, for showing a pixel length in the chosen unit. */
export function fromPixels(
  pixels: number,
  unit: Unit,
  dpi: number,
  base: number
) {
  if (unit === "px") return pixels
  if (unit === "percent") return (pixels / base) * 100
  return (pixels / dpi) * perInch[unit]
}

/** Trim a converted value to a readable number of decimals for an input field. */
export function formatValue(value: number, unit: Unit) {
  if (unit === "px") return String(Math.round(value))
  return String(
    Number(value.toFixed(unit === "mm" || unit === "percent" ? 1 : 2))
  )
}

/** Scale factor that brings an image to a megapixel count while keeping its shape. */
export function megapixelScale(source: Size, megapixels: number) {
  return Math.sqrt((megapixels * 1_000_000) / (source.width * source.height))
}

/** Round to the nearest multiple, never below one multiple. */
export function roundTo(value: number, multiple: Multiple) {
  return Math.max(multiple, Math.round(value / multiple) * multiple)
}

/** Physical print size of a pixel length at a given density. */
export function printLength(
  pixels: number,
  dpi: number,
  unit: "in" | "cm" | "mm"
) {
  return Number(((pixels / dpi) * perInch[unit]).toFixed(unit === "mm" ? 0 : 2))
}
