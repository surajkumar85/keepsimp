"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Slider } from "@base-ui/react/slider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Trim } from "@/lib/animation/settings"

const seconds = (milliseconds: number) =>
  (Math.round(milliseconds / 10) / 100).toFixed(2)

/**
 * Chooses the part of one animation to keep: two handles over a strip of its
 * frames, with exact start and end fields beside them.
 */
export function TrimBar({
  strip,
  duration,
  value,
  onChange,
}: {
  /** Moments of the animation side by side; null while it is being read. */
  strip: ImageBitmap | null
  /** Length of the original, in milliseconds. */
  duration: number
  value: Trim
  onChange: (trim: Trim) => void
}) {
  const ids = useId()
  const canvas = useRef<HTMLCanvasElement>(null)
  const start = Math.min(value.start, duration)
  const end = Math.min(value.end ?? duration, duration)
  // While a handle is dragged the bar follows it; the choice is sent on release.
  const [dragging, setDragging] = useState<[number, number] | null>(null)
  const [from, to] = dragging ?? [start, end]
  const whole = start <= 0 && end >= duration

  useEffect(() => {
    const element = canvas.current
    if (!element || !strip) return
    element.width = strip.width
    element.height = strip.height
    element.getContext("2d")?.drawImage(strip, 0, 0)
  }, [strip])

  const commit = (next: [number, number]) => {
    setDragging(null)
    onChange({
      start: next[0] <= 0 ? 0 : next[0],
      end: next[1] >= duration ? null : next[1],
    })
  }
  const field = (which: 0 | 1, text: string) => {
    const typed = Number(text) * 1000
    if (!Number.isFinite(typed)) return
    const next: [number, number] = [start, end]
    next[which] = Math.min(duration, Math.max(0, Math.round(typed)))
    // The start stays before the end, at least one hundredth of a second apart.
    if (which === 0) next[0] = Math.min(next[0], next[1] - 10)
    else next[1] = Math.max(next[1], next[0] + 10)
    commit([Math.max(0, next[0]), Math.min(duration, next[1])])
  }

  return (
    <div className="space-y-3" data-testid="trim-bar">
      <Slider.Root
        value={[from, to]}
        min={0}
        max={duration}
        step={10}
        minStepsBetweenValues={1}
        thumbAlignment="edge"
        onValueChange={(next) => setDragging(next as [number, number])}
        onValueCommitted={(next) => commit(next as [number, number])}
      >
        <Slider.Control className="relative flex h-16 touch-none items-center select-none">
          <Slider.Track className="checkerboard relative h-14 w-full overflow-hidden rounded-lg border">
            <canvas
              ref={canvas}
              aria-hidden="true"
              className="absolute inset-0 size-full"
            />
            {/* What is cut away is dimmed; what is kept shows through. */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-background/75"
              style={{ width: `${(from / duration) * 100}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute inset-y-0 right-0 bg-background/75"
              style={{ width: `${(1 - to / duration) * 100}%` }}
            />
            <Slider.Indicator className="rounded-none border-y-2 border-primary" />
            {[0, 1].map((index) => (
              <Slider.Thumb
                key={index}
                index={index}
                getAriaLabel={(thumb) =>
                  thumb === 0
                    ? "Start of the kept part"
                    : "End of the kept part"
                }
                getAriaValueText={(_, current) => `${seconds(current)} seconds`}
                className="h-14 w-3 cursor-ew-resize rounded-sm border border-primary bg-primary shadow-sm outline-none before:absolute before:-inset-x-4 before:inset-y-0 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 md:before:-inset-x-3"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1 inset-y-4 rounded-full bg-primary-foreground/80"
                />
              </Slider.Thumb>
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24">
          <label
            htmlFor={`${ids}-start`}
            className="mb-1 block text-xs font-medium"
          >
            Start (s)
          </label>
          <Input
            id={`${ids}-start`}
            key={`start-${start}`}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            defaultValue={seconds(start)}
            onBlur={(event) => field(0, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") field(0, event.currentTarget.value)
            }}
            className="font-mono"
          />
        </div>
        <div className="w-24">
          <label
            htmlFor={`${ids}-end`}
            className="mb-1 block text-xs font-medium"
          >
            End (s)
          </label>
          <Input
            id={`${ids}-end`}
            key={`end-${end}`}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            defaultValue={seconds(end)}
            onBlur={(event) => field(1, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") field(1, event.currentTarget.value)
            }}
            className="font-mono"
          />
        </div>
        <Button
          variant="outline"
          disabled={whole}
          onClick={() => commit([0, duration])}
        >
          Keep everything
        </Button>
        <p className="text-xs text-muted-foreground" role="status">
          Keeping {seconds(to - from)} s of {seconds(duration)} s
        </p>
      </div>
    </div>
  )
}
