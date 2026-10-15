"use client"

import { useEffect, useRef } from "react"
import type { Peaks } from "@/lib/audio/peaks"

/** Read a colour the theme gives a CSS variable, for drawing on a canvas. */
function themeColour(element: Element, name: string) {
  return (
    getComputedStyle(element).getPropertyValue(name).trim() || "currentColor"
  )
}

/**
 * A file's overview waveform, with how far it has played. Clicking or
 * tapping it moves the player there; the player's own controls do the
 * same from the keyboard, so the drawing is left out of the reading order.
 */
export function Waveform({
  peaks,
  progress,
  onSeek,
  label,
}: {
  peaks: Peaks | null
  /** How far it has played, from 0 to 1. */
  progress: number
  onSeek?: (fraction: number) => void
  label: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const draw = () => {
      const ratio = window.devicePixelRatio || 1
      const width = Math.max(1, Math.round(element.clientWidth * ratio))
      const height = Math.max(1, Math.round(element.clientHeight * ratio))
      element.width = width
      element.height = height
      const context = element.getContext("2d")
      if (!context) return
      context.clearRect(0, 0, width, height)
      const middle = height / 2
      const played = themeColour(element, "--primary")
      const waiting = themeColour(element, "--muted-foreground")
      if (!peaks) {
        context.fillStyle = waiting
        context.fillRect(0, Math.floor(middle), width, Math.max(1, ratio))
        return
      }
      const count = peaks.min.length
      for (let x = 0; x < width; x++) {
        const from = Math.floor((x / width) * count)
        const to = Math.max(from + 1, Math.floor(((x + 1) / width) * count))
        let low = 0
        let high = 0
        for (let index = from; index < to && index < count; index++) {
          low = Math.min(low, peaks.min[index])
          high = Math.max(high, peaks.max[index])
        }
        const top = middle - high * middle * 0.95
        const bottom = middle - low * middle * 0.95
        context.fillStyle = x / width <= progress ? played : waiting
        context.fillRect(x, top, 1, Math.max(ratio, bottom - top))
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    return () => observer.disconnect()
  }, [peaks, progress])

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      data-testid="waveform"
      className="h-24 w-full cursor-pointer rounded-lg border bg-muted/40"
      onClick={(event) => {
        if (!onSeek) return
        const box = event.currentTarget.getBoundingClientRect()
        onSeek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)))
      }}
    />
  )
}
