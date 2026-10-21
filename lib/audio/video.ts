/**
 * Sound as a video, for sharing where only video is taken: a picture (the
 * cover, one chosen, or the theme's own colour), optionally the waveform
 * with a playhead that moves with the sound, and the title. Everything is
 * drawn here on a canvas, frame by frame; the frames are only as many as
 * the picture needs (one a second when nothing moves).
 */

import type { Peaks } from "./peaks"

export type VideoShape = "square" | "landscape" | "portrait"

export const SHAPES: Record<
  VideoShape,
  { label: string; width: number; height: number }
> = {
  square: { label: "Square · 1080 × 1080", width: 1080, height: 1080 },
  landscape: { label: "Landscape · 1920 × 1080", width: 1920, height: 1080 },
  portrait: { label: "Portrait · 1080 × 1920", width: 1080, height: 1920 },
}

export interface VideoLook {
  shape: VideoShape
  /** Draw the waveform, with a playhead that moves with the sound. */
  waveform: boolean
  /** Write the title (and artist) on it. */
  title: boolean
}

export const defaultLook: VideoLook = {
  shape: "square",
  waveform: true,
  title: true,
}

/** Frames a second: as few as the picture allows. */
export const framesPerSecond = (look: VideoLook) => (look.waveform ? 24 : 1)

/** Colours as CSS strings, read from the theme on the page. */
export interface VideoColours {
  background: string
  foreground: string
  muted: string
  accent: string
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Where a picture of `width` × `height` goes to fill a box, cut evenly at the sides that stick out. */
export function cover(width: number, height: number, box: Box): Box {
  const scale = Math.max(box.width / width, box.height / height)
  const w = width * scale
  const h = height * scale
  return {
    x: box.x + (box.width - w) / 2,
    y: box.y + (box.height - h) / 2,
    width: w,
    height: h,
  }
}

/** Where each part of a frame goes: the picture, the waveform and the title. */
export function layoutOf(look: VideoLook, hasTitle: boolean) {
  const { width, height } = SHAPES[look.shape]
  const margin = Math.round(Math.min(width, height) * 0.06)
  const wave = look.waveform ? Math.round(height * 0.16) : 0
  const text = look.title && hasTitle ? Math.round(height * 0.1) : 0
  const below = wave + text + (wave || text ? margin : 0)
  const picture: Box = {
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: Math.max(0, height - margin * 2 - below),
  }
  return {
    width,
    height,
    margin,
    picture,
    title: {
      x: margin,
      y: picture.y + picture.height + margin,
      width: width - margin * 2,
      height: text,
    },
    waveform: {
      x: margin,
      y: height - margin - wave,
      width: width - margin * 2,
      height: wave,
    },
  }
}

/**
 * The bars of a waveform in `columns` columns, each the loudest of its share
 * of the peaks, from 0 to 1, scaled so that the loudest bar is 1: a quiet
 * file uses the height it is given too.
 */
export function barsOf(peaks: Peaks, columns: number) {
  const count = peaks.min.length
  const bars = Array.from({ length: columns }, (_, column) => {
    const from = Math.floor((column / columns) * count)
    const to = Math.max(from + 1, Math.floor(((column + 1) / columns) * count))
    let loudest = 0
    for (let index = from; index < Math.min(to, count); index++)
      loudest = Math.max(loudest, -peaks.min[index], peaks.max[index])
    return Math.min(1, loudest)
  })
  const top = Math.max(...bars)
  return top > 0 ? bars.map((bar) => bar / top) : bars
}

/** The context a frame is drawn with: a canvas's 2D context, or anything that draws the same. */
export interface Painter {
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textBaseline: CanvasTextBaseline
  fillRect(x: number, y: number, width: number, height: number): void
  fillText(text: string, x: number, y: number, maxWidth?: number): void
  drawImage(
    image: CanvasImageSource,
    x: number,
    y: number,
    width: number,
    height: number
  ): void
  save(): void
  restore(): void
  beginPath(): void
  rect(x: number, y: number, width: number, height: number): void
  clip(): void
}

/** One frame, at `time` seconds of `duration`. */
export function drawFrame(
  painter: Painter,
  layout: ReturnType<typeof layoutOf>,
  frame: {
    time: number
    duration: number
    colours: VideoColours
    picture: { image: CanvasImageSource; width: number; height: number } | null
    bars: number[] | null
    title: string
    artist: string
  }
) {
  const { colours } = frame
  painter.fillStyle = colours.background
  painter.fillRect(0, 0, layout.width, layout.height)
  const box = layout.picture
  if (frame.picture && box.height > 0) {
    const place = cover(frame.picture.width, frame.picture.height, box)
    painter.save()
    painter.beginPath()
    painter.rect(box.x, box.y, box.width, box.height)
    painter.clip()
    painter.drawImage(
      frame.picture.image,
      place.x,
      place.y,
      place.width,
      place.height
    )
    painter.restore()
  }
  if (layout.title.height > 0) {
    const size = Math.round(layout.title.height * 0.42)
    painter.textBaseline = "top"
    painter.fillStyle = colours.foreground
    painter.font = `600 ${size}px system-ui, sans-serif`
    painter.fillText(
      frame.title,
      layout.title.x,
      layout.title.y,
      layout.title.width
    )
    if (frame.artist) {
      painter.fillStyle = colours.muted
      painter.font = `400 ${Math.round(size * 0.8)}px system-ui, sans-serif`
      painter.fillText(
        frame.artist,
        layout.title.x,
        layout.title.y + size * 1.3,
        layout.title.width
      )
    }
  }
  const wave = layout.waveform
  if (frame.bars && wave.height > 0) {
    const played =
      frame.duration > 0 ? Math.min(1, frame.time / frame.duration) : 0
    const width = wave.width / frame.bars.length
    const gap = Math.max(1, Math.round(width * 0.25))
    frame.bars.forEach((bar, index) => {
      const height = Math.max(2, bar * wave.height)
      painter.fillStyle =
        index / frame.bars!.length < played ? colours.accent : colours.muted
      painter.fillRect(
        wave.x + index * width,
        wave.y + (wave.height - height) / 2,
        Math.max(1, width - gap),
        height
      )
    })
  }
}
