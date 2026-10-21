"use client"

import { useEffect, useRef } from "react"
import type { Spectrum } from "@/lib/audio/spectrum"

/** A theme colour as red, green and blue, read by drawing it once. */
function rgbOf(element: Element, name: string): [number, number, number] {
  const probe = document.createElement("canvas")
  probe.width = probe.height = 1
  const context = probe.getContext("2d", { willReadFrequently: true })
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  // A neutral grey when the theme says nothing.
  if (!context || !value) return [128, 128, 128]
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return [red, green, blue]
}

/**
 * Paint a spectrogram on a canvas: low frequencies at the bottom, louder
 * as the theme's primary colour over its background. `columnAt` says which
 * of the spectrum's columns each pixel across shows (a fraction of the
 * width in, null where nothing is).
 */
export function paintSpectrum(
  element: HTMLCanvasElement,
  spectrum: Spectrum,
  columnAt: (fraction: number) => number | null
) {
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(element.clientWidth * ratio))
  const height = Math.max(1, Math.round(element.clientHeight * ratio))
  element.width = width
  element.height = height
  const context = element.getContext("2d")
  if (!context) return
  const quiet = rgbOf(element, "--background")
  const loud = rgbOf(element, "--primary")
  const image = context.createImageData(width, height)
  const pixels = image.data
  for (let x = 0; x < width; x++) {
    const column = columnAt((x + 0.5) / width)
    for (let y = 0; y < height; y++) {
      const at = (y * width + x) * 4
      let mix = 0
      if (column !== null) {
        const band = Math.min(
          spectrum.bands - 1,
          Math.floor(((height - 1 - y) / height) * spectrum.bands)
        )
        mix = spectrum.values[column * spectrum.bands + band] / 255
        // The quietest third shows as nothing, so speech and music stand out.
        mix = Math.max(0, (mix - 0.33) / 0.67)
      }
      pixels[at] = quiet[0] + (loud[0] - quiet[0]) * mix
      pixels[at + 1] = quiet[1] + (loud[1] - quiet[1]) * mix
      pixels[at + 2] = quiet[2] + (loud[2] - quiet[2]) * mix
      pixels[at + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
}

/** Where a frequency lies, as a fraction of the height from the bottom. */
export const heightOf = (spectrum: Spectrum, frequency: number) =>
  Math.log(frequency / spectrum.lowest) /
  Math.log(spectrum.highest / spectrum.lowest)

/** The frequencies marked at the side. */
const MARKS = [100, 1000, 10000]

/** Marks of 100 Hz, 1 kHz and 10 kHz at the side of a spectrogram. */
export function FrequencyMarks({ spectrum }: { spectrum: Spectrum }) {
  return (
    <>
      {MARKS.filter((mark) => mark < spectrum.highest).map((mark) => (
        <span
          key={mark}
          className="pointer-events-none absolute left-1 -translate-y-1/2 text-xs leading-none text-muted-foreground"
          style={{ bottom: `${heightOf(spectrum, mark) * 100}%` }}
          aria-hidden="true"
        >
          {mark >= 1000 ? `${mark / 1000} kHz` : `${mark} Hz`}
        </span>
      ))}
    </>
  )
}

/**
 * A file's spectrogram, with how far it has played. Clicking or tapping it
 * moves the player there, as the waveform does.
 */
export function Spectrogram({
  spectrum,
  progress,
  onSeek,
  label,
}: {
  spectrum: Spectrum
  progress: number
  onSeek?: (fraction: number) => void
  label: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const draw = () =>
      paintSpectrum(element, spectrum, (fraction) =>
        Math.min(spectrum.columns - 1, Math.floor(fraction * spectrum.columns))
      )
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    return () => observer.disconnect()
  }, [spectrum])

  return (
    <div className="relative">
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        data-testid="spectrogram"
        className="h-24 w-full cursor-pointer rounded-lg border"
        onClick={(event) => {
          if (!onSeek) return
          const box = event.currentTarget.getBoundingClientRect()
          onSeek(
            Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
          )
        }}
      />
      <FrequencyMarks spectrum={spectrum} />
      <span
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground"
        style={{ left: `${progress * 100}%` }}
        aria-hidden="true"
      />
    </div>
  )
}
