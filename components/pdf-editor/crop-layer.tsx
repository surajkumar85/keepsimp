"use client"

import { useEffect, useRef } from "react"
import type { Edges } from "@/lib/pdf-editor/pages"
import { cn } from "cn"
import type { Crop } from "./use-crop"

const SIDES = ["left", "top", "right", "bottom"] as const

/** One edge of the frame a page is cut to: dragged inwards, or moved with the arrow keys. */
function Edge({ side, crop }: { side: keyof Edges; crop: Crop }) {
  const across = side === "left" || side === "right"
  const { off, size } = crop
  const inwards = side === "left" || side === "top" ? 1 : -1
  const grip = useRef<HTMLButtonElement>(null)
  // The keyboard goes to the frame, so that a page can be cut without a
  // pointer. The pages stay where they are: an edge is as long as the page,
  // and a browser would scroll to show all of it.
  useEffect(() => {
    if (side === "left") grip.current?.focus({ preventScroll: true })
  }, [side])
  return (
    <button
      ref={grip}
      type="button"
      data-hold
      data-testid={`crop-${side}`}
      aria-label={`The ${side} edge of what is to show: ${Math.round(off[side])} points cut off`}
      title="Drag inwards, or use the arrow keys"
      className={cn(
        "absolute z-10 flex touch-none items-center justify-center outline-none",
        across ? "cursor-ew-resize" : "cursor-ns-resize"
      )}
      style={
        across
          ? {
              top: off.top,
              bottom: off.bottom,
              [side]: off[side] - 14,
              width: 28,
            }
          : {
              left: off.left,
              right: off.right,
              [side]: off[side] - 14,
              height: 28,
            }
      }
      onPointerDown={(event) => {
        if (event.button !== 0) return
        // The page under it must not take a press here for one of its own.
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const rect = event.currentTarget.parentElement!.getBoundingClientRect()
        const at = across
          ? ((event.clientX - rect.left) / rect.width) * size.width
          : ((event.clientY - rect.top) / rect.height) * size.height
        crop.setEdge(
          side,
          inwards > 0 ? at : (across ? size.width : size.height) - at
        )
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const step = (event.shiftKey ? 10 : 1) * inwards
        const keys: Record<string, number> = across
          ? { ArrowRight: step, ArrowLeft: -step }
          : { ArrowDown: step, ArrowUp: -step }
        if (event.key === "Enter") {
          event.preventDefault()
          event.stopPropagation()
          void crop.cut()
          return
        }
        if (!(event.key in keys)) return
        event.preventDefault()
        event.stopPropagation()
        crop.setEdge(side, off[side] + keys[event.key])
      }}
    >
      <span
        className={cn(
          "block rounded-full bg-primary ring-1 ring-white",
          across ? "h-8 max-h-full w-1.5" : "h-1.5 w-8 max-w-full"
        )}
      />
    </button>
  )
}

/**
 * The frame a page is cut to, laid over the page: what will be hidden is
 * shaded, and each edge of the frame can be dragged or moved by the keys.
 */
export function CropFrame({ crop }: { crop: Crop }) {
  const { off } = crop
  const shade = "pointer-events-none absolute bg-foreground/40"
  return (
    <div
      data-testid="crop-frame"
      data-off={[off.left, off.top, off.right, off.bottom]
        .map((edge) => Math.round(edge))
        .join(",")}
      className="absolute inset-0"
    >
      <span
        className={shade}
        style={{ inset: 0, bottom: "auto", height: off.top }}
      />
      <span
        className={shade}
        style={{ inset: 0, top: "auto", height: off.bottom }}
      />
      <span
        className={shade}
        style={{ top: off.top, bottom: off.bottom, left: 0, width: off.left }}
      />
      <span
        className={shade}
        style={{ top: off.top, bottom: off.bottom, right: 0, width: off.right }}
      />
      <span
        className="pointer-events-none absolute ring-1 ring-white/70 outline-1 outline-primary"
        style={{
          left: off.left,
          top: off.top,
          right: off.right,
          bottom: off.bottom,
        }}
      />
      {SIDES.map((side) => (
        <Edge key={side} side={side} crop={crop} />
      ))}
    </div>
  )
}
