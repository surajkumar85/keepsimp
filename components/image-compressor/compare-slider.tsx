"use client"

import { useEffect, useId, useRef, useState } from "react"
import { IconArrowsHorizontal, IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { cn } from "cn"
import type { Size } from "@/lib/image-compressor/geometry"

type Zoom = "fit" | "100" | "200"

const tag =
  "pointer-events-none absolute top-3 rounded-full border bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"

/**
 * Before/after comparison. The compressed result sits on top and is revealed to
 * the right of the divider, so dragging left shows more of the compressed image.
 */
export function CompareSlider({
  reference,
  resultUrl,
  size,
  originalLabel,
  resultLabel,
  status,
  onCancel,
}: {
  reference: ImageBitmap | null
  resultUrl: string | null
  size: Size
  originalLabel: string
  resultLabel: string | null
  status: string | null
  onCancel: () => void
}) {
  const [position, setPosition] = useState(50)
  const [zoom, setZoom] = useState<Zoom>("fit")
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const inputId = useId()

  useEffect(() => {
    const element = canvas.current
    if (!element || !reference) return
    element.width = reference.width
    element.height = reference.height
    element.getContext("2d")?.drawImage(reference, 0, 0)
  }, [reference])

  function moveTo(clientX: number) {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const next = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.round(Math.min(100, Math.max(0, next)) * 10) / 10)
  }

  const zoomed = zoom !== "fit"
  const scale = zoom === "200" ? 2 : 1
  const showResult = Boolean(resultUrl)

  return (
    <div className="space-y-3">
      <div
        data-testid="compare-stage"
        className="checkerboard relative h-80 overflow-hidden rounded-xl border sm:h-96 lg:h-[30rem]"
      >
        <div
          className="absolute inset-0 flex overflow-auto"
          style={{ containerType: "size" }}
        >
          <div
            ref={frame}
            data-testid="compare-frame"
            className={cn(
              "relative m-auto shrink-0 select-none",
              zoomed ? "touch-auto" : "touch-pan-y"
            )}
            style={
              zoomed
                ? { width: size.width * scale, height: size.height * scale }
                : {
                    aspectRatio: `${size.width} / ${size.height}`,
                    width: `min(100cqw, calc(100cqh * ${size.width / size.height}))`,
                  }
            }
            onPointerDown={(event) => {
              if (zoomed && event.target === canvas.current) return
              if (!showResult || event.button !== 0) return
              dragging.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
              moveTo(event.clientX)
            }}
            onPointerMove={(event) => {
              if (dragging.current) moveTo(event.clientX)
            }}
            onPointerUp={() => {
              dragging.current = false
            }}
            onPointerCancel={() => {
              dragging.current = false
            }}
          >
            <canvas
              ref={canvas}
              role="img"
              aria-label="Original image"
              className={cn(
                "block size-full",
                zoom === "200" && "[image-rendering:pixelated]"
              )}
            />
            {resultUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img
                src={resultUrl}
                alt="Compressed result"
                draggable={false}
                className={cn(
                  "pointer-events-none absolute inset-0 size-full",
                  zoom === "200" && "[image-rendering:pixelated]"
                )}
                style={{ clipPath: `inset(0 0 0 ${position}%)` }}
              />
            )}
            {showResult && (
              <>
                <input
                  id={inputId}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(position)}
                  aria-label="Comparison position"
                  aria-valuetext={`${Math.round(position)}% original, ${100 - Math.round(position)}% compressed`}
                  onChange={(event) => setPosition(Number(event.target.value))}
                  className="peer sr-only"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background shadow-sm"
                  style={{ left: `${position}%` }}
                />
                <label
                  htmlFor={inputId}
                  aria-hidden="true"
                  data-testid="compare-handle"
                  className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border bg-background text-foreground shadow-md peer-focus-visible:ring-3 peer-focus-visible:ring-ring md:size-9"
                  style={{ left: `${position}%` }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    event.stopPropagation()
                    dragging.current = true
                    frame.current?.setPointerCapture(event.pointerId)
                  }}
                >
                  <IconArrowsHorizontal className="size-5" stroke={1.7} />
                </label>
              </>
            )}
          </div>
        </div>
        <span className={cn(tag, "left-3")}>{originalLabel}</span>
        {resultLabel && (
          <span className={cn(tag, "right-3")}>{resultLabel}</span>
        )}
        {status && (
          <div className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 py-1 pr-1 pl-3 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
            <IconLoader2
              className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="truncate" aria-hidden="true">
              {status}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 rounded-full px-3 text-xs md:h-7"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChoiceChips
          label="Zoom"
          hideLabel
          value={zoom}
          onValueChange={setZoom}
          options={[
            { value: "fit", label: "Fit" },
            { value: "100", label: "100%" },
            { value: "200", label: "200%" },
          ]}
        />
        {showResult && (
          <p className="text-xs text-muted-foreground">
            Drag the handle or use the arrow keys to compare.
          </p>
        )}
      </div>
    </div>
  )
}
