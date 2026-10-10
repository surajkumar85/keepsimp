/**
 * Browser-only WebAssembly codecs, loaded on first use inside the compressor worker.
 * AVIF and OxiPNG load their single-thread builds directly: the packages' default
 * entry points probe for threads and pull in self-spawning workers, which a static
 * export cannot serve with the required cross-origin isolation headers.
 */
import type { OutputFormat } from "./formats"
import type { Size } from "./geometry"
import type { Pixels } from "./ssim"
import {
  avifOptions,
  jpegOptions,
  oxipngLevel,
  webpOptions,
  type PngSettings,
} from "./quality"
import type { Resample } from "./settings"

type Loader<T> = () => Promise<T>
const loaded = new Map<string, Promise<unknown>>()
let onLoad: ((label: string) => void) | undefined

export function setCodecLoadListener(listener?: (label: string) => void) {
  onLoad = listener
}

function once<T>(key: string, label: string, load: Loader<T>): Promise<T> {
  let promise = loaded.get(key) as Promise<T> | undefined
  if (!promise) {
    onLoad?.(label)
    promise = load()
    loaded.set(key, promise)
    promise.catch(() => loaded.delete(key))
  }
  return promise
}

const toImageData = (pixels: Pixels) =>
  new ImageData(
    new Uint8ClampedArray(
      pixels.data.buffer,
      pixels.data.byteOffset,
      pixels.data.length
    ),
    pixels.width,
    pixels.height
  )

const copyBuffer = (view: Uint8Array) =>
  view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength
  ) as ArrayBuffer

const jpegEncoder = () =>
  once("jpeg-enc", "JPEG encoder", () => import("@jsquash/jpeg/encode"))
const webpEncoder = () =>
  once("webp-enc", "WebP encoder", () => import("@jsquash/webp/encode"))
const avifEncoder = () =>
  once("avif-enc", "AVIF encoder", async () => {
    const { default: factory } =
      await import("@jsquash/avif/codec/enc/avif_enc.js")
    return factory({ noInitialRun: true })
  })
const oxipng = () =>
  once("oxipng", "PNG optimiser", async () => {
    const codec = await import("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js")
    await codec.default()
    return codec
  })
const quantizer = () =>
  once("imagequant", "PNG palette engine", async () => {
    const codec = await import("libimagequant-wasm/wasm/libimagequant_wasm.js")
    await codec.default()
    return codec
  })

async function encodePng(pixels: Pixels, settings: PngSettings) {
  const { optimise, optimise_raw } = await oxipng()
  const level = oxipngLevel(settings.effort)
  if (settings.lossless || !settings.palette)
    return copyBuffer(
      optimise_raw(pixels.data, pixels.width, pixels.height, level, false, true)
    )
  const { ImageQuantizer, encode_palette_to_png } = await quantizer()
  const engine = new ImageQuantizer()
  try {
    engine.setMaxColors(settings.colors)
    engine.setQuality(settings.palette.min, settings.palette.target)
    engine.setSpeed(
      settings.effort === "fast" ? 8 : settings.effort === "max" ? 1 : 4
    )
    let result
    try {
      result = engine.quantizeImage(pixels.data, pixels.width, pixels.height)
    } catch {
      // The palette cannot reach the minimum quality: keep every colour instead.
      return copyBuffer(
        optimise_raw(
          pixels.data,
          pixels.width,
          pixels.height,
          level,
          false,
          true
        )
      )
    }
    try {
      result.setDithering(settings.dithering ? 1 : 0)
      const indices = result.getPaletteIndices(
        pixels.data,
        pixels.width,
        pixels.height
      )
      const png = encode_palette_to_png(
        indices,
        result.getPalette(),
        pixels.width,
        pixels.height
      )
      return copyBuffer(optimise(png, level, false, true))
    } finally {
      result.free()
    }
  } finally {
    engine.free()
  }
}

export async function encodeImage(
  format: OutputFormat,
  pixels: Pixels,
  settings: PngSettings
): Promise<ArrayBuffer> {
  if (format === "jpeg") {
    const { default: encode } = await jpegEncoder()
    return encode(toImageData(pixels), jpegOptions(settings))
  }
  if (format === "webp") {
    const { default: encode } = await webpEncoder()
    return encode(toImageData(pixels), webpOptions(settings))
  }
  if (format === "avif") {
    const codec = await avifEncoder()
    const output = codec.encode(
      new Uint8Array(
        pixels.data.buffer,
        pixels.data.byteOffset,
        pixels.data.length
      ),
      pixels.width,
      pixels.height,
      avifOptions(settings)
    )
    if (!output) throw new Error("The AVIF encoder could not write this image.")
    return copyBuffer(output)
  }
  return encodePng(pixels, settings)
}

/** Decode our own output so it can be compared with the reference pixels. */
export async function decodeOutput(
  format: OutputFormat,
  bytes: ArrayBuffer
): Promise<Pixels> {
  if (format === "jpeg") {
    const { default: decode } = await once(
      "jpeg-dec",
      "JPEG decoder",
      () => import("@jsquash/jpeg/decode")
    )
    return decode(bytes)
  }
  if (format === "webp") {
    const { default: decode } = await once(
      "webp-dec",
      "WebP decoder",
      () => import("@jsquash/webp/decode")
    )
    return decode(bytes)
  }
  if (format === "avif") return decodeAvif(bytes)
  const { default: decode } = await once(
    "png-dec",
    "PNG decoder",
    () => import("@jsquash/png/decode")
  )
  return decode(bytes)
}

export async function decodeAvif(bytes: ArrayBuffer): Promise<Pixels> {
  const { default: decode } = await once(
    "avif-dec",
    "AVIF decoder",
    () => import("@jsquash/avif/decode")
  )
  const image = await decode(bytes)
  if (!image) throw new Error("We could not read that AVIF image.")
  return image
}

export async function decodeJxl(bytes: ArrayBuffer): Promise<Pixels> {
  const { default: decode } = await once(
    "jxl-dec",
    "JPEG XL decoder",
    () => import("@jsquash/jxl/decode")
  )
  return decode(bytes)
}

interface HeifImage {
  get_width(): number
  get_height(): number
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    callback: (result: unknown) => void
  ): void
  free?(): void
}

export async function decodeHeic(bytes: ArrayBuffer): Promise<Pixels> {
  const libheif = await once("heif-dec", "HEIC decoder", async () => {
    const { default: factory } =
      await import("libheif-js/libheif-wasm/libheif-bundle.mjs")
    return factory() as {
      HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] }
    }
  })
  const images = new libheif.HeifDecoder().decode(new Uint8Array(bytes))
  if (!images.length) throw new Error("We could not read that HEIC image.")
  const image = images[0]
  const width = image.get_width()
  const height = image.get_height()
  const data = new Uint8ClampedArray(width * height * 4)
  await new Promise<void>((resolve, reject) =>
    image.display({ data, width, height }, (result) =>
      result
        ? resolve()
        : reject(new Error("We could not read that HEIC image."))
    )
  )
  for (const item of images) item.free?.()
  return { data, width, height }
}

export async function decodeTiff(bytes: ArrayBuffer): Promise<Pixels> {
  const UTIF = await once("tiff-dec", "TIFF decoder", async () => {
    const codec = await import("utif2")
    return (codec as unknown as { default?: typeof codec }).default ?? codec
  })
  const pages = UTIF.decode(bytes)
  if (!pages.length) throw new Error("We could not read that TIFF image.")
  UTIF.decodeImage(bytes, pages[0])
  const rgba = UTIF.toRGBA8(pages[0])
  const width = Number(pages[0].width)
  const height = Number(pages[0].height)
  return {
    data: Uint8ClampedArray.from(rgba.subarray(0, width * height * 4)),
    width,
    height,
  }
}

/** Every kernel the WASM resampler offers; the compressor exposes a subset. */
export type ResizeKernel = Resample | "triangle" | "magicKernelSharp2021"

export async function resizePixels(
  pixels: Pixels,
  size: Size,
  method: ResizeKernel,
  linearRGB = true
): Promise<Pixels> {
  if (pixels.width === size.width && pixels.height === size.height)
    return pixels
  const { default: resize } = await once(
    "resize",
    "resampler",
    () => import("@jsquash/resize")
  )
  return resize(toImageData(pixels), {
    width: size.width,
    height: size.height,
    method,
    fitMethod: "stretch",
    premultiply: true,
    linearRGB,
  })
}
