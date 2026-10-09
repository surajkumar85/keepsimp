export type ImageFormat = "image/jpeg" | "image/png" | "image/webp"
export const imageFormats: readonly ImageFormat[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
]
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_PIXELS = 16_000_000

export function outputDimensions(
  width: number,
  height: number,
  targetWidth: number
) {
  if (
    ![width, height, targetWidth].every(
      (value) => Number.isInteger(value) && value > 0
    )
  )
    throw new Error("Enter a whole-number width greater than zero.")
  if (width * height > MAX_PIXELS)
    throw new Error("Use an image with at most 16 million pixels.")
  const targetHeight = Math.max(1, Math.round((height * targetWidth) / width))
  if (targetWidth > 4096 || targetHeight > 4096)
    throw new Error("The output must fit within 4096 × 4096 pixels.")
  return { width: targetWidth, height: targetHeight }
}

export function outputFilename(name: string, format: ImageFormat) {
  const base =
    name
      .replace(/\.[^.]*$/, "")
      .replace(/[^\p{L}\p{N}._-]/gu, "-")
      .slice(0, 100) || "image"
  return `${base}-keepsimp.${format === "image/jpeg" ? "jpg" : format.split("/")[1]}`
}

export function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export async function decodeImage(file: File) {
  if (!imageFormats.includes(file.type as ImageFormat))
    throw new Error(
      "Choose a JPEG, PNG or WebP image. Other formats and animated files are not supported by this tool."
    )
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error("Choose an image smaller than 20 MB.")
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(
      "We could not read that image. Try a different JPEG, PNG or WebP file."
    )
  }
  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    bitmap.close()
    throw new Error("Use an image with at most 16 million pixels.")
  }
  return bitmap
}

export async function processImage(
  file: File,
  options: { width: number; quality: number; format: ImageFormat }
) {
  if (!imageFormats.includes(options.format))
    throw new Error("Choose a supported output format.")
  if (
    !Number.isFinite(options.quality) ||
    options.quality < 0.1 ||
    options.quality > 1
  )
    throw new Error("Choose quality between 10 and 100 percent.")
  const bitmap = await decodeImage(file)
  let canvas: HTMLCanvasElement | undefined
  try {
    const dimensions = outputDimensions(
      bitmap.width,
      bitmap.height,
      options.width
    )
    canvas = document.createElement("canvas")
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Your browser cannot process this image.")
    if (options.format === "image/jpeg") {
      context.fillStyle = "white"
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas!.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(
                new Error(
                  "The browser could not create an output. Try a smaller image."
                )
              ),
        options.format,
        options.quality
      )
    )
    if (blob.type !== options.format)
      throw new Error(
        "Your browser cannot export that format. Try JPEG or PNG."
      )
    return {
      blob,
      ...dimensions,
      filename: outputFilename(file.name, options.format),
    }
  } finally {
    bitmap.close()
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
