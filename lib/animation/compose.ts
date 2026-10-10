import type { Pixels } from "@/lib/image-compressor/ssim"
import type { Patch, Rect } from "./types"

/** The part of a patch that lies on the canvas; damaged files can point outside it. */
function clip(patch: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width, patch.x))
  const y = Math.max(0, Math.min(height, patch.y))
  return {
    x,
    y,
    width: Math.max(0, Math.min(width, patch.x + patch.width) - x),
    height: Math.max(0, Math.min(height, patch.y + patch.height) - y),
  }
}

/**
 * Rebuilds whole frames from the patches an animated file stores, following
 * each patch's rules for blending and for clearing up after itself.
 */
export class Compositor {
  readonly canvas: Pixels
  private pending: { rect: Rect; dispose: Patch["dispose"] } | null = null
  private saved: Uint8ClampedArray | null = null

  constructor(width: number, height: number) {
    this.canvas = {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }
  }

  private rows(rect: Rect, visit: (start: number, end: number) => void) {
    for (let row = 0; row < rect.height; row++) {
      const start = ((rect.y + row) * this.canvas.width + rect.x) * 4
      visit(start, start + rect.width * 4)
    }
  }

  private tidy() {
    const { pending, saved } = this
    if (!pending) return
    if (pending.dispose === "background")
      this.rows(pending.rect, (start, end) =>
        this.canvas.data.fill(0, start, end)
      )
    else if (pending.dispose === "previous" && saved) {
      let offset = 0
      this.rows(pending.rect, (start, end) => {
        this.canvas.data.set(
          saved.subarray(offset, offset + end - start),
          start
        )
        offset += end - start
      })
    }
    this.pending = null
    this.saved = null
  }

  /**
   * Draw the next patch and return the canvas as it now looks. The same
   * canvas is returned every time; copy it to keep a frame.
   * @param pixels RGBA for the patch's own width and height.
   */
  draw(patch: Patch, pixels: Uint8ClampedArray): Pixels {
    this.tidy()
    const rect = clip(patch, this.canvas.width, this.canvas.height)
    if (patch.dispose === "previous") {
      const saved = new Uint8ClampedArray(rect.width * rect.height * 4)
      let offset = 0
      this.rows(rect, (start, end) => {
        saved.set(this.canvas.data.subarray(start, end), offset)
        offset += end - start
      })
      this.saved = saved
    }
    const target = this.canvas.data
    for (let row = 0; row < rect.height; row++) {
      let from =
        ((rect.y - patch.y + row) * patch.width + (rect.x - patch.x)) * 4
      let to = ((rect.y + row) * this.canvas.width + rect.x) * 4
      for (let column = 0; column < rect.width; column++, from += 4, to += 4) {
        const alpha = pixels[from + 3]
        if (patch.blend === "source" || alpha === 255) {
          target[to] = pixels[from]
          target[to + 1] = pixels[from + 1]
          target[to + 2] = pixels[from + 2]
          target[to + 3] = alpha
        } else if (alpha > 0) {
          // Ordinary "over" compositing on straight (not premultiplied) colour.
          const under = target[to + 3]
          const top = alpha / 255
          const rest = (under / 255) * (1 - top)
          const out = top + rest
          for (let channel = 0; channel < 3; channel++)
            target[to + channel] =
              (pixels[from + channel] * top + target[to + channel] * rest) / out
          target[to + 3] = out * 255
        }
      }
    }
    this.pending = { rect, dispose: patch.dispose }
    return this.canvas
  }
}
