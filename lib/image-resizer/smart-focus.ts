import type { Pixels } from "@/lib/image-compressor/ssim"
import { focusForPoint, type Focus } from "./focus"

/**
 * Content-aware focus, in the spirit of smartcrop.js
 * (https://github.com/jwagner/smartcrop.js): score every pixel of a small copy
 * by edge detail, colour saturation and skin tone, then find the crop window
 * that holds the most interest.
 */
const MAP_EDGE = 96
const WEIGHTS = { detail: 1, saturation: 0.35, skin: 1.6 }
/** Reference skin colour direction, as in smartcrop.js. */
const SKIN = [0.78, 0.57, 0.44]

export interface Saliency {
  width: number
  height: number
  /** Summed-area table of scores, (width + 1) × (height + 1). */
  table: Float64Array
}

function shrink(image: Pixels) {
  const scale = Math.min(1, MAP_EDGE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const rgb = new Float32Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * image.height) / height)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * image.height) / height))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * image.width) / width)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * image.width) / width))
      let r = 0
      let g = 0
      let b = 0
      let weight = 0
      for (let sy = y0; sy < y1; sy++)
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * image.width + sx) * 4
          const alpha = image.data[i + 3] / 255
          r += image.data[i] * alpha
          g += image.data[i + 1] * alpha
          b += image.data[i + 2] * alpha
          weight += alpha
        }
      const o = (y * width + x) * 3
      if (weight > 0) {
        rgb[o] = r / weight
        rgb[o + 1] = g / weight
        rgb[o + 2] = b / weight
      }
    }
  }
  return { width, height, rgb }
}

/** Score map of how interesting each area is, stored as a summed-area table. */
export function saliency(image: Pixels): Saliency {
  const { width, height, rgb } = shrink(image)
  const luma = new Float32Array(width * height)
  for (let i = 0; i < luma.length; i++)
    luma[i] =
      0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]
  const at = (x: number, y: number) =>
    luma[
      Math.min(height - 1, Math.max(0, y)) * width +
        Math.min(width - 1, Math.max(0, x))
    ]
  const table = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      const gx =
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1)
      const gy =
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1)
      const detail = Math.min(1, Math.hypot(gx, gy) / 255)
      const o = (y * width + x) * 3
      const r = rgb[o]
      const g = rgb[o + 1]
      const b = rgb[o + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const brightness = luma[y * width + x] / 255
      const usable = brightness > 0.15 && brightness < 0.95
      const saturation = usable && max > 0 ? (max - min) / max : 0
      const magnitude = Math.hypot(r, g, b)
      let skin = 0
      if (usable && magnitude > 0) {
        const distance = Math.hypot(
          r / magnitude - SKIN[0],
          g / magnitude - SKIN[1],
          b / magnitude - SKIN[2]
        )
        skin = Math.max(0, 1 - distance / 0.2) * (saturation > 0.1 ? 1 : 0)
      }
      row +=
        detail * WEIGHTS.detail +
        saturation * WEIGHTS.saturation +
        skin * WEIGHTS.skin
      table[(y + 1) * (width + 1) + x + 1] =
        table[y * (width + 1) + x + 1] + row
    }
  }
  return { width, height, table }
}

const sum = (map: Saliency, x: number, y: number, w: number, h: number) => {
  const stride = map.width + 1
  return (
    map.table[(y + h) * stride + x + w] -
    map.table[y * stride + x + w] -
    map.table[(y + h) * stride + x] +
    map.table[y * stride + x]
  )
}

/**
 * The focus that keeps the most interesting part inside a crop of the given
 * shape (`aspect` = crop width ÷ height). Ties resolve towards the centre.
 */
export function smartFocus(image: Pixels, aspect: number): Focus {
  const map = saliency(image)
  const wide = aspect >= map.width / map.height
  const cropW = wide
    ? map.width
    : Math.max(1, Math.min(map.width, Math.round(map.height * aspect)))
  const cropH = wide
    ? Math.max(1, Math.min(map.height, Math.round(map.width / aspect)))
    : map.height
  let best = { score: -Infinity, x: 0, y: 0 }
  for (let y = 0; y + cropH <= map.height; y++)
    for (let x = 0; x + cropW <= map.width; x++) {
      const offCentre =
        Math.abs(x + cropW / 2 - map.width / 2) / map.width +
        Math.abs(y + cropH / 2 - map.height / 2) / map.height
      // A small, additive pull to the centre: it settles ties, including an all-flat image.
      const score =
        sum(map, x, y, cropW, cropH) * (1 - 0.05 * offCentre) - 1e-6 * offCentre
      if (score > best.score) best = { score, x, y }
    }
  return {
    x: focusForPoint(map.width, cropW, (best.x + cropW / 2) / map.width),
    y: focusForPoint(map.height, cropH, (best.y + cropH / 2) / map.height),
  }
}
