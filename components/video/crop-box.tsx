"use client"

import { useRef, type PointerEvent as ReactPointerEvent } from "react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import {
  centred,
  moved,
  reshaped,
  resized,
  WHOLE,
  type Box,
  type Corner,
} from "@/lib/video/frame"
import { SHAPES, shapeRatio, type Shape } from "@/lib/video/settings"

const CORNERS: { corner: Corner; className: string; label: string }[] = [
  { corner: "top-left", className: "left-0 top-0", label: "top left" },
  { corner: "top-right", className: "right-0 top-0", label: "top right" },
  {
    corner: "bottom-left",
    className: "bottom-0 left-0",
    label: "bottom left",
  },
  {
    corner: "bottom-right",
    className: "bottom-0 right-0",
    label: "bottom right",
  },
]

/** How far a key moves or grows the box: a hundredth of the picture. */
const STEP = 0.01

const percent = (share: number) => `${share * 100}%`

/**
 * The box drawn over the player, where the picture is: dragged to move,
 * by its corners to resize, or with the arrow keys (Shift to resize).
 * `aspect` is the picture's width over its height as shown.
 */
export function CropOverlay({
  box,
  onChange,
  aspect,
  ratio,
}: {
  box: Box
  onChange: (box: Box) => void
  aspect: number
  ratio: number | null
}) {
  const area = useRef<HTMLDivElement>(null)
  // The player is 16:9 and shows the picture inside it, in its shape.
  const wide = aspect > 16 / 9
  const place = wide
    ? { width: 1, height: 16 / 9 / aspect }
    : { width: aspect / (16 / 9), height: 1 }

  function drag(
    event: ReactPointerEvent<HTMLElement>,
    change: (dx: number, dy: number) => Box
  ) {
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const rect = area.current!.getBoundingClientRect()
    const follow = (move: PointerEvent) =>
      onChange(
        change(
          (move.clientX - startX) / rect.width,
          (move.clientY - startY) / rect.height
        )
      )
    const stop = () => {
      target.removeEventListener("pointermove", follow)
      target.removeEventListener("pointerup", stop)
      target.removeEventListener("pointercancel", stop)
    }
    target.addEventListener("pointermove", follow)
    target.addEventListener("pointerup", stop)
    target.addEventListener("pointercancel", stop)
  }

  return (
    <div
      ref={area}
      className="absolute touch-none overflow-hidden"
      style={{
        left: percent((1 - place.width) / 2),
        top: percent((1 - place.height) / 2),
        width: percent(place.width),
        height: percent(place.height),
      }}
      data-testid="crop-area"
    >
      <button
        type="button"
        aria-label={`Crop box: ${Math.round(box.width * 100)}% by ${Math.round(box.height * 100)}% of the picture, ${Math.round(box.x * 100)}% from the left and ${Math.round(box.y * 100)}% from the top. Arrow keys move it; with Shift, they resize it.`}
        className="absolute cursor-move border-2 border-primary-foreground shadow-[0_0_0_9999px] shadow-black/55 outline-none focus-visible:ring-3 focus-visible:ring-ring"
        style={{
          left: percent(box.x),
          top: percent(box.y),
          width: percent(box.width),
          height: percent(box.height),
        }}
        data-testid="crop-box"
        onPointerDown={(event) => drag(event, (dx, dy) => moved(box, dx, dy))}
        onKeyDown={(event) => {
          const arrows: Record<string, [number, number]> = {
            ArrowLeft: [-STEP, 0],
            ArrowRight: [STEP, 0],
            ArrowUp: [0, -STEP],
            ArrowDown: [0, STEP],
          }
          const step = arrows[event.key]
          if (!step) return
          event.preventDefault()
          onChange(
            event.shiftKey
              ? resized(box, "bottom-right", step[0], step[1], ratio, aspect)
              : moved(box, step[0], step[1])
          )
        }}
      >
        {CORNERS.map(({ corner, className, label }) => (
          <span
            key={corner}
            aria-hidden="true"
            className={`absolute size-4 rounded-full border-2 border-primary bg-primary-foreground ${className}`}
            style={{
              cursor:
                corner === "top-left" || corner === "bottom-right"
                  ? "nwse-resize"
                  : "nesw-resize",
            }}
            data-corner={label}
            onPointerDown={(event) =>
              drag(event, (dx, dy) =>
                resized(box, corner, dx, dy, ratio, aspect)
              )
            }
          />
        ))}
      </button>
    </div>
  )
}

/** The controls under the player while the crop box is shown. */
export function CropControls({
  shape,
  onShape,
  box,
  aspect,
  size,
  onUse,
  onReset,
  onCancel,
}: {
  shape: Shape
  onShape: (shape: Shape, box: Box) => void
  box: Box
  aspect: number
  /** The picture as shown, in pixels, for the size the box keeps. */
  size: { width: number; height: number }
  onUse: () => void
  onReset: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="crop-panel">
      <ChoiceChips
        label="Crop shape"
        hint={`Drag the box or its corners, or use the arrow keys on it (Shift resizes). It keeps ${Math.round(box.width * size.width)} × ${Math.round(box.height * size.height)} of ${size.width} × ${size.height}.`}
        value={shape}
        onValueChange={(next) => {
          const value = next as Shape
          onShape(
            value,
            value === "same" ? box : reshaped(box, shapeRatio(value), aspect)
          )
        }}
        options={[
          { value: "same", label: "Free" },
          ...SHAPES.map((one) => ({ value: one, label: one })),
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={onUse}>Use this crop</Button>
        <Button variant="outline" onClick={onReset}>
          Whole picture
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** The box a shape starts with, or the whole picture. */
export const startingBox = (shape: Shape, aspect: number) =>
  shape === "same" ? WHOLE : centred(shapeRatio(shape), aspect)
