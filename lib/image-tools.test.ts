import { afterEach, describe, expect, it, vi } from "vitest"
import {
  MAX_IMAGE_BYTES,
  outputDimensions,
  outputFilename,
  sizeLabel,
  decodeImage,
  processImage,
  type ImageFormat,
} from "./image-tools"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const source = () => new File(["sample"], "photo.png", { type: "image/png" })
function setup(width = 200, height = 100) {
  const bitmap = { width, height, close: vi.fn() }
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap))
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toBlob: vi.fn((callback: BlobCallback, format: string) =>
      callback(new Blob(["encoded"], { type: format }))
    ),
  }
  vi.spyOn(document, "createElement").mockReturnValue(
    canvas as unknown as HTMLCanvasElement
  )
  return { bitmap, canvas, context }
}
describe("image dimensions and export labels", () => {
  it("preserves aspect ratio and rounds to a valid minimum height", () => {
    expect(outputDimensions(1200, 800, 600)).toEqual({
      width: 600,
      height: 400,
    })
    expect(outputDimensions(16000, 1, 1)).toEqual({ width: 1, height: 1 })
  })
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid width %s", (value) =>
    expect(() => outputDimensions(10, 10, value)).toThrow("whole-number")
  )
  it("checks both output axes and source pixel budget", () => {
    expect(() => outputDimensions(10, 100, 1000)).toThrow("4096")
    expect(() => outputDimensions(100, 10, 4097)).toThrow("4096")
    expect(() => outputDimensions(5000, 5000, 100)).toThrow("16 million")
  })
  it("names outputs safely with the actual format extension", () => {
    expect(outputFilename("my photo.PNG", "image/jpeg")).toBe(
      "my-photo-keepsimp.jpg"
    )
    expect(outputFilename("a.webp", "image/png")).toBe("a-keepsimp.png")
    expect(outputFilename(".png", "image/webp")).toBe("image-keepsimp.webp")
  })
  it("formats small and large file sizes", () => {
    expect(sizeLabel(1024)).toBe("1.0 KB")
    expect(sizeLabel(1048576)).toBe("1.00 MB")
  })
})
describe("image input validation", () => {
  it("rejects unsupported and oversized files before decoding", async () => {
    await expect(
      decodeImage(new File(["x"], "a.svg", { type: "image/svg+xml" }))
    ).rejects.toThrow("JPEG, PNG or WebP")
    const file = source()
    Object.defineProperty(file, "size", { value: MAX_IMAGE_BYTES + 1 })
    await expect(decodeImage(file)).rejects.toThrow("20 MB")
  })
  it("reports corrupt inputs and releases oversized decoded images", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("decoder"))
    )
    await expect(decodeImage(source())).rejects.toThrow("could not read")
    const { bitmap } = setup(5000, 5000)
    await expect(decodeImage(source())).rejects.toThrow("16 million")
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})
describe("local image export lifecycle", () => {
  it("exports JPEG with a solid background and releases resources", async () => {
    const { bitmap, canvas, context } = setup()
    const result = await processImage(source(), {
      width: 100,
      quality: 0.8,
      format: "image/jpeg",
    })
    expect(result).toMatchObject({
      width: 100,
      height: 50,
      filename: "photo-keepsimp.jpg",
    })
    expect(result.blob.type).toBe("image/jpeg")
    expect(context.fillStyle).toBe("white")
    expect(context.fillRect).toHaveBeenCalled()
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })
  it("retains transparency for PNG instead of painting a background", async () => {
    const { context } = setup()
    await processImage(source(), {
      width: 100,
      quality: 1,
      format: "image/png",
    })
    expect(context.fillRect).not.toHaveBeenCalled()
  })
  it("rejects invalid options before decoding", async () => {
    await expect(
      processImage(source(), {
        width: 10,
        quality: 0.8,
        format: "text/plain" as ImageFormat,
      })
    ).rejects.toThrow("supported output")
    for (const quality of [0, 1.1, NaN])
      await expect(
        processImage(source(), { width: 10, quality, format: "image/png" })
      ).rejects.toThrow("quality")
  })
  it("releases the bitmap when dimensions fail before a canvas exists", async () => {
    const { bitmap } = setup()
    await expect(
      processImage(source(), { width: 0, quality: 0.8, format: "image/png" })
    ).rejects.toThrow("whole-number")
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it("handles unavailable canvas, failed encoding and silent format fallback", async () => {
    const { bitmap, canvas } = setup()
    canvas.getContext.mockReturnValueOnce(null as never)
    await expect(
      processImage(source(), { width: 100, quality: 0.8, format: "image/png" })
    ).rejects.toThrow("cannot process")
    canvas.toBlob.mockImplementationOnce((callback) => callback(null))
    await expect(
      processImage(source(), { width: 100, quality: 0.8, format: "image/png" })
    ).rejects.toThrow("could not create")
    canvas.toBlob.mockImplementationOnce((callback) =>
      callback(new Blob(["png"], { type: "image/png" }))
    )
    await expect(
      processImage(source(), { width: 100, quality: 0.8, format: "image/webp" })
    ).rejects.toThrow("cannot export")
    expect(bitmap.close).toHaveBeenCalledTimes(3)
  })
})
