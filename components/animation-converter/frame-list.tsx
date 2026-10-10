"use client"

import { useId, useState } from "react"
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconPhotoPlus,
  IconX,
} from "@tabler/icons-react"
import { FileInput } from "@/components/image-compressor/drop-zone"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { cn } from "cn"

/** One still image in an animation being built. */
export interface StillFrame {
  /** Stays with the frame as it is moved, so the list can be reordered. */
  key: string
  file: File
  /** Milliseconds on screen. */
  duration: number
  /** Object URL for the thumbnail. */
  url: string
}

const paces = ["100", "200", "500", "1000"] as const
const seconds = (milliseconds: number) => String(milliseconds / 1000)

/**
 * The frames of an animation built from still images: reorder them, set how
 * long each one shows, duplicate or remove them, and add more.
 */
export function FrameList({
  frames,
  onChange,
  onAdd,
  accept,
}: {
  frames: StillFrame[]
  onChange: (frames: StillFrame[]) => void
  onAdd: (files: File[]) => void
  accept: string
}) {
  const ids = useId()
  const [dragged, setDragged] = useState<string | null>(null)
  const shared = frames.every((frame) => frame.duration === frames[0].duration)
    ? String(frames[0].duration)
    : ""

  const move = (from: number, to: number) => {
    if (to < 0 || to >= frames.length || from === to) return
    const next = [...frames]
    next.splice(to, 0, ...next.splice(from, 1))
    onChange(next)
  }
  const setDuration = (index: number, text: string) => {
    const value = Math.round(Number(text) * 1000)
    // Between a hundredth of a second and a minute.
    if (!Number.isFinite(value) || value < 10 || value > 60_000) return
    onChange(
      frames.map((frame, at) =>
        at === index ? { ...frame, duration: value } : frame
      )
    )
  }

  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-labelledby={`${ids}-title`}
      data-testid="frame-list"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${ids}-title`} className="font-heading text-base font-medium">
          Frames
        </h2>
        <div>
          <FileInput
            onFiles={onAdd}
            label="Add images as frames"
            id={`${ids}-add`}
            multiple
            accept={accept}
          />
          <label
            htmlFor={`${ids}-add`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
            )}
          >
            <IconPhotoPlus aria-hidden="true" /> Add frames
          </label>
        </div>
      </div>
      <ChoiceChips
        label="Show every frame for"
        value={(paces as readonly string[]).includes(shared) ? shared : ""}
        onValueChange={(value) =>
          onChange(
            frames.map((frame) => ({ ...frame, duration: Number(value) }))
          )
        }
        options={paces.map((pace) => ({
          value: pace,
          label: `${seconds(Number(pace))} s`,
        }))}
        hint="Or give each frame its own time below. The first image sets the size."
      />
      <ol
        aria-label="Frames in order"
        className="max-h-96 space-y-2 overflow-y-auto"
      >
        {frames.map((frame, index) => (
          <li
            key={frame.key}
            draggable
            onDragStart={() => setDragged(frame.key)}
            onDragEnd={() => setDragged(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const from = frames.findIndex((item) => item.key === dragged)
              if (from >= 0) move(from, index)
              setDragged(null)
            }}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2",
              dragged === frame.key && "opacity-50"
            )}
          >
            <span className="w-6 text-center font-mono text-xs text-muted-foreground">
              {index + 1}
            </span>
            <span className="checkerboard flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img
                src={frame.url}
                alt=""
                draggable={false}
                className="max-h-full max-w-full"
                // Some formats cannot be shown by the browser; they still convert.
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden"
                }}
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {frame.file.name}
            </span>
            <div className="flex items-center gap-1">
              <label htmlFor={`${ids}-time-${frame.key}`} className="sr-only">
                Seconds for frame {index + 1}
              </label>
              <Input
                id={`${ids}-time-${frame.key}`}
                key={frame.duration}
                type="number"
                inputMode="decimal"
                min={0.01}
                max={60}
                step={0.01}
                defaultValue={seconds(frame.duration)}
                onBlur={(event) => setDuration(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter")
                    setDuration(index, event.currentTarget.value)
                }}
                className="w-20 font-mono"
              />
              <span
                className="text-xs text-muted-foreground"
                aria-hidden="true"
              >
                s
              </span>
            </div>
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label={`Frame ${index + 1}`}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move frame ${index + 1} earlier`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <IconArrowUp aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move frame ${index + 1} later`}
                disabled={index === frames.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <IconArrowDown aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Duplicate frame ${index + 1}`}
                onClick={() => {
                  const next = [...frames]
                  next.splice(index + 1, 0, {
                    ...frame,
                    key: `${frame.key}-${Date.now()}`,
                    url: URL.createObjectURL(frame.file),
                  })
                  onChange(next)
                }}
              >
                <IconCopy aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove frame ${index + 1}`}
                disabled={frames.length === 1}
                onClick={() => onChange(frames.filter((_, at) => at !== index))}
              >
                <IconX aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
