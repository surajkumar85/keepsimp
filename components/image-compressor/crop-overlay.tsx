"use client"

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import { IconCheck, IconRestore } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import {
  clampCrop,
  moveCrop,
  resizeCrop,
  type CropHandle,
  type Rect,
  type Rotation,
  type Size,
} from "@/lib/image-compressor/geometry"

const handles: { id: CropHandle; className: string; label: string }[] = [
  { id: "nw", className: "top-0 left-0 cursor-nwse-resize", label: "top left" },
  { id: "n", className: "top-0 left-1/2 cursor-ns-resize", label: "top" },
  {
    id: "ne",
    className: "top-0 left-full cursor-nesw-resize",
    label: "top right",
  },
  { id: "e", className: "top-1/2 left-full cursor-ew-resize", label: "right" },
  {
    id: "se",
    className: "top-full left-full cursor-nwse-resize",
    label: "bottom right",
  },
  { id: "s", className: "top-full left-1/2 cursor-ns-resize", label: "bottom" },
  {
    id: "sw",
    className: "top-full left-0 cursor-nesw-resize",
    label: "bottom left",
  },
  { id: "w", className: "top-1/2 left-0 cursor-ew-resize", label: "left" },
]

/** Draw the preview as it will be processed: rotated clockwise, then flipped. */
function drawOriented(
  canvas: HTMLCanvasElement,
  preview: ImageBitmap,
  rotation: Rotation,
  flipX: boolean,
  flipY: boolean
) {
  const sideways = rotation === 90 || rotation === 270
  canvas.width = sideways ? preview.height : preview.width
  canvas.height = sideways ? preview.width : preview.height
  const context = canvas.getContext("2d")
  if (!context) return
  context.translate(canvas.width / 2, canvas.height / 2)
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1)
  context.rotate((rotation * Math.PI) / 180)
  context.drawImage(preview, -preview.width / 2, -preview.height / 2)
}

export function CropOverlay({
  preview,
  bounds,
  rotation,
  flipX,
  flipY,
  crop,
  aspect,
  onChange,
  onReset,
  onDone,
}: {
  preview: ImageBitmap
  bounds: Size
  rotation: Rotation
  flipX: boolean
  flipY: boolean
  crop: Rect | null
  aspect: number | null
  onChange: (rect: Rect) => void
  onReset: () => void
  onDone: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    handle: CropHandle | "move"
    startX: number
    startY: number
    rect: Rect
  } | null>(null)
  const rect = crop ?? { x: 0, y: 0, ...bounds }

  useEffect(() => {
    if (canvas.current)
      drawOriented(canvas.current, preview, rotation, flipX, flipY)
  }, [preview, rotation, flipX, flipY])

  function begin(event: PointerEvent, handle: CropHandle | "move") {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    drag.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      rect,
    }
    frame.current?.setPointerCapture(event.pointerId)
  }

  function update(event: PointerEvent) {
    const state = drag.current
    const box = frame.current?.getBoundingClientRect()
    if (!state || !box?.width) return
    const ratio = bounds.width / box.width
    const dx = (event.clientX - state.startX) * ratio
    const dy = (event.clientY - state.startY) * ratio
    onChange(
      state.handle === "move"
        ? moveCrop(state.rect, dx, dy, bounds)
        : resizeCrop(state.rect, state.handle, dx, dy, bounds, aspect)
    )
  }

  function keyboard(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 1
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = delta[event.key]
    if (!move) return
    event.preventDefault()
    onChange(
      event.altKey
        ? resizeCrop(rect, "se", move[0], move[1], bounds, aspect)
        : moveCrop(rect, move[0], move[1], bounds)
    )
  }

  function setField(field: keyof Rect, value: string) {
    const number = Math.round(Number(value))
    if (!value.trim() || !Number.isFinite(number)) return
    const next = { ...rect, [field]: number }
    if (aspect && field === "width") next.height = Math.round(number / aspect)
    if (aspect && field === "height") next.width = Math.round(number * aspect)
    onChange(clampCrop(next, bounds))
  }

  const percent = (value: number, total: number) => `${(value / total) * 100}%`

  return (
    <div className="space-y-3">
      <div className="checkerboard relative h-80 overflow-hidden rounded-xl border sm:h-96 lg:h-[30rem]">
        <div
          className="absolute inset-0 flex p-4"
          style={{ containerType: "size" }}
        >
          <div
            ref={frame}
            className="relative m-auto shrink-0 touch-none select-none"
            style={{
              aspectRatio: `${bounds.width} / ${bounds.height}`,
              width: `min(100cqw, calc(100cqh * ${bounds.width / bounds.height}))`,
            }}
            onPointerMove={update}
            onPointerUp={() => {
              drag.current = null
            }}
            onPointerCancel={() => {
              drag.current = null
            }}
          >
            <canvas
              ref={canvas}
              role="img"
              aria-label="Image to crop"
              className="block size-full"
            />
            <div
              role="group"
              tabIndex={0}
              aria-label={`Crop area, ${rect.width} by ${rect.height} pixels. Arrow keys move it; hold Alt to resize; hold Shift for larger steps.`}
              data-testid="crop-box"
              className="absolute cursor-move shadow-[0_0_0_9999px_color-mix(in_oklch,var(--background)_72%,transparent)] outline-2 outline-background focus-visible:outline-ring"
              style={{
                left: percent(rect.x, bounds.width),
                top: percent(rect.y, bounds.height),
                width: percent(rect.width, bounds.width),
                height: percent(rect.height, bounds.height),
              }}
              onPointerDown={(event) => begin(event, "move")}
              onKeyDown={keyboard}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
              >
                {Array.from({ length: 9 }, (_, index) => (
                  <span key={index} className="border border-background/40" />
                ))}
              </div>
              {handles.map((handle) => (
                <span
                  key={handle.id}
                  aria-hidden="true"
                  title={`Resize from the ${handle.label}`}
                  className={cn(
                    "absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center md:size-7",
                    handle.className
                  )}
                  onPointerDown={(event) => begin(event, handle.id)}
                >
                  <span className="size-3 rounded-sm border-2 border-primary bg-background" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <legend className="sr-only">Crop position and size in pixels</legend>
        {(
          [
            ["x", "Left (px)"],
            ["y", "Top (px)"],
            ["width", "Width (px)"],
            ["height", "Height (px)"],
          ] as const
        ).map(([field, label]) => (
          <DraftNumber
            key={`${field}-${rect[field]}`}
            label={label}
            value={rect[field]}
            min={field === "width" || field === "height" ? 1 : 0}
            onCommit={(value) => setField(field, value)}
          />
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onDone}>
          <IconCheck aria-hidden="true" /> Done cropping
        </Button>
        <Button variant="outline" onClick={onReset}>
          <IconRestore aria-hidden="true" /> Reset crop
        </Button>
      </div>
    </div>
  )
}

/** Number input that applies its value on blur or Enter, so typing is never interrupted. */
function DraftNumber({
  label,
  value,
  min,
  onCommit,
}: {
  label: string
  value: number
  min: number
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    onCommit(draft)
    // If the value was clamped back to the current one, show it again.
    setDraft(String(value))
  }
  return (
    <label className="space-y-1.5 text-xs font-medium">
      <span>{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
        }}
      />
    </label>
  )
}
