import { extractOriented } from "@/lib/image-compressor/pixels"
import {
  orientedSize,
  type Rotation,
  type Size,
} from "@/lib/image-compressor/geometry"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { boxBlur, composite, createCanvas, nearest } from "./canvas"
import type { Backdrop, Kernel, OutputPlan } from "./settings"
import { unsharp } from "./sharpen"
import { resolveLayout } from "./sizing"
import { CENTER } from "./focus"

export interface RenderDeps {
  /** High-quality resampling (the WASM resizer in the browser and in Node tests). */
  resize: (
    pixels: Pixels,
    size: Size,
    kernel: Exclude<Kernel, "nearest">
  ) => Promise<Pixels>
}

export interface Orientation {
  rotation: Rotation
  flipX: boolean
  flipY: boolean
}

const BLUR_EDGE = 64

/** A soft, enlarged copy of the image that fills the padding area. */
async function blurredBackdrop(
  source: Pixels,
  orientation: Orientation,
  output: Size,
  deps: RenderDeps
) {
  const oriented = orientedSize(source, orientation.rotation)
  const cover = resolveLayout(
    oriented,
    { kind: "box", width: output.width, height: output.height, fit: "cover" },
    { enlarge: true, multiple: 1, focus: CENTER }
  )
  const region = extractOriented(
    source,
    orientation.rotation,
    orientation.flipX,
    orientation.flipY,
    cover.sourceRect
  )
  const scale = Math.min(1, BLUR_EDGE / Math.max(output.width, output.height))
  const small = await deps.resize(
    region,
    {
      width: Math.max(1, Math.round(output.width * scale)),
      height: Math.max(1, Math.round(output.height * scale)),
    },
    "triangle"
  )
  const blurred = boxBlur(small, 3)
  for (let i = 3; i < blurred.data.length; i += 4) blurred.data[i] = 255
  return deps.resize(blurred, output, "triangle")
}

/** Produce the final pixels for one output: orient, crop, resample, sharpen and pad. */
export async function render(
  source: Pixels,
  orientation: Orientation,
  plan: OutputPlan,
  background: Backdrop,
  deps: RenderDeps
): Promise<Pixels> {
  const { layout } = plan
  const region = extractOriented(
    source,
    orientation.rotation,
    orientation.flipX,
    orientation.flipY,
    layout.sourceRect
  )
  const size = { width: layout.drawRect.width, height: layout.drawRect.height }
  let image =
    region.width === size.width && region.height === size.height
      ? region
      : plan.kernel === "nearest"
        ? nearest(region, size)
        : await deps.resize(region, size, plan.kernel)
  if (plan.sharpen > 0) image = unsharp(image, plan.sharpen)
  if (!layout.padded) return image
  const canvas =
    background.kind === "blur"
      ? await blurredBackdrop(source, orientation, layout.output, deps)
      : createCanvas(
          layout.output,
          background.kind === "colour" ? [...background.rgb, 255] : [0, 0, 0, 0]
        )
  return composite(canvas, image, layout.drawRect.x, layout.drawRect.y)
}
