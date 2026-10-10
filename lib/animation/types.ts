import type { Pixels } from "@/lib/image-compressor/ssim"

/** What happens to a frame's area before the next frame is drawn. */
export type Dispose = "none" | "background" | "previous"
/** Whether a frame replaces what is under it or is painted over it. */
export type Blend = "source" | "over"

/** A frame as a file stores it: a patch somewhere on the canvas. */
export interface Patch {
  x: number
  y: number
  width: number
  height: number
  /** Milliseconds on screen. */
  duration: number
  dispose: Dispose
  blend: Blend
}

/** The whole canvas at one moment. */
export interface Frame extends Pixels {
  /** Milliseconds on screen. */
  duration: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Red, green, blue, alpha. */
export type Colour = [number, number, number, number]
