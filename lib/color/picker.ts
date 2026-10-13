import { parseColor, srgb } from "./core"

export type PickerValue = {
  hue: number
  saturation: number
  brightness: number
  alpha: number
}
export function clamp(value: number, max = 100) {
  return Math.max(0, Math.min(max, value))
}
export function pickerValue(value: string, previous: PickerValue): PickerValue {
  const color = srgb(parseColor(value))
  const high = Math.max(...(color.coords as number[])),
    low = Math.min(...(color.coords as number[]))
  const hue = color.to("hsl").coords[0]
  return {
    hue: high === low ? previous.hue : hue!,
    saturation: high === 0 ? previous.saturation : ((high - low) / high) * 100,
    brightness: high * 100,
    alpha: color.alpha! * 100,
  }
}
export function pickerColor(value: PickerValue) {
  const color = parseColor(
    `hsv(${clamp(value.hue, 360)} ${clamp(value.saturation)}% ${clamp(value.brightness)}%)`
  )
  color.alpha = clamp(value.alpha) / 100
  return color.toString({ precision: 12, inGamut: false })
}
export function pickerPoint(
  x: number,
  y: number,
  width: number,
  height: number
) {
  return {
    saturation: clamp((x / Math.max(1, width)) * 100),
    brightness: clamp(100 - (y / Math.max(1, height)) * 100),
  }
}
export const hueTrack = `linear-gradient(to right, ${Array.from({ length: 7 }, (_, i) => `hsl(${i * 60} 100% 50%)`).join(", ")})`
