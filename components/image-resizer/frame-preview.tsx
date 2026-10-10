"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { IconArrowsMove, IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { cn } from "cn"
import {
  orientedSize,
  type Rotation,
  type Size,
} from "@/lib/image-compressor/geometry"
import { nudgeFocus, type Focus } from "@/lib/image-resizer/focus"
import type { Backdrop } from "@/lib/image-resizer/settings"
import { shiftFocus, type Layout } from "@/lib/image-resizer/sizing"

type Zoom = "fit" | "100" | "200"

const tag =
  "pointer-events-none absolute top-3 rounded-full border bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"

/** Draw the thumbnail as it will be processed: rotated clockwise, then flipped. */
function orient(
  thumbnail: ImageBitmap,
  rotation: Rotation,
  flipX: boolean,
  flipY: boolean
) {
  const sideways = rotation === 90 || rotation === 270
  const canvas = document.createElement("canvas")
  canvas.width = sideways ? thumbnail.height : thumbnail.width
  canvas.height = sideways ? thumbnail.width : thumbnail.height
  const context = canvas.getContext("2d")!
  context.translate(canvas.width / 2, canvas.height / 2)
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1)
  context.rotate((rotation * Math.PI) / 180)
  context.drawImage(thumbnail, -thumbnail.width / 2, -thumbnail.height / 2)
  return canvas
}

/**
 * The output frame drawn to scale. A fast canvas sketch follows every change
 * instantly; the real resized file replaces it once it is ready. When the
 * picture is cropped or padded it can be dragged, or moved with arrow keys.
 */
export function FramePreview({
  thumbnail,
  source,
  rotation,
  flipX,
  flipY,
  layout,
  focus,
  background,
  resultUrl,
  safeArea,
  status,
  onFocus,
  onCancel,
}: {
  thumbnail: ImageBitmap | null
  source: Size
  rotation: Rotation
  flipX: boolean
  flipY: boolean
  layout: Layout
  focus: Focus
  background: Backdrop
  resultUrl: string | null
  safeArea: { top: number; bottom: number } | null
  status: string | null
  onFocus: (focus: Focus) => void
  onCancel: () => void
}) {
  const [zoom, setZoom] = useState<Zoom>("fit")
  const [dragging, setDragging] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; layout: Layout } | null>(null)
  const oriented = useMemo(
    () => orientedSize(source, rotation),
    [source, rotation]
  )
  const movable = layout.cropped || layout.padded
  const { output } = layout

  useEffect(() => {
    const element = canvas.current
    if (!element || !thumbnail) return
    const scale = Math.min(1, 1024 / Math.max(output.width, output.height))
    element.width = Math.max(1, Math.round(output.width * scale))
    element.height = Math.max(1, Math.round(output.height * scale))
    const context = element.getContext("2d")
    if (!context) return
    const picture = orient(thumbnail, rotation, flipX, flipY)
    const toThumb = picture.width / oriented.width
    const draw = (
      region: { x: number; y: number; width: number; height: number },
      target: { x: number; y: number; width: number; height: number }
    ) =>
      context.drawImage(
        picture,
        region.x * toThumb,
        region.y * toThumb,
        region.width * toThumb,
        region.height * toThumb,
        target.x * scale,
        target.y * scale,
        target.width * scale,
        target.height * scale
      )
    context.clearRect(0, 0, element.width, element.height)
    if (layout.padded) {
      if (background.kind === "colour") {
        context.fillStyle = `rgb(${background.rgb.join(" ")})`
        context.fillRect(0, 0, element.width, element.height)
      } else if (background.kind === "blur") {
        // A quick stand-in for the blurred fill; the finished file is exact.
        const cover = Math.max(
          output.width / oriented.width,
          output.height / oriented.height
        )
        const width = output.width / cover
        const height = output.height / cover
        context.filter = `blur(${Math.round(element.width / 28)}px)`
        draw(
          {
            x: (oriented.width - width) / 2,
            y: (oriented.height - height) / 2,
            width,
            height,
          },
          { x: 0, y: 0, width: output.width, height: output.height }
        )
        context.filter = "none"
      }
    }
    draw(layout.sourceRect, layout.drawRect)
  }, [thumbnail, rotation, flipX, flipY, layout, background, output, oriented])

  function keyboard(event: KeyboardEvent) {
    if (!movable) return
    const step = event.shiftKey ? 0.1 : 0.02
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    onFocus(nudgeFocus(focus, move[0], move[1]))
  }

  const zoomed = zoom !== "fit"
  const factor = zoom === "200" ? 2 : 1
  const showResult = Boolean(resultUrl) && !dragging

  return (
    <div className="space-y-3">
      <div
        data-testid="frame-stage"
        className="checkerboard relative h-80 overflow-hidden rounded-xl border sm:h-96 lg:h-[30rem]"
      >
        <div
          className="absolute inset-0 flex overflow-auto p-4"
          style={{ containerType: "size" }}
        >
          <div
            ref={frame}
            data-testid="output-frame"
            role="group"
            tabIndex={movable ? 0 : -1}
            aria-label={
              movable
                ? "Output frame. Drag the picture, or use the arrow keys, to choose which part is kept."
                : "Output frame"
            }
            className={cn(
              "relative m-auto shrink-0 overflow-hidden bg-background shadow-sm outline-offset-4 select-none",
              movable && !zoomed && "cursor-move touch-none",
              zoom === "200" && "[image-rendering:pixelated]"
            )}
            style={
              zoomed
                ? {
                    width: output.width * factor,
                    height: output.height * factor,
                  }
                : {
                    aspectRatio: `${output.width} / ${output.height}`,
                    width: `min(100cqw, calc(100cqh * ${output.width / output.height}))`,
                  }
            }
            onKeyDown={keyboard}
            onPointerDown={(event) => {
              if (!movable || zoomed || event.button !== 0) return
              drag.current = { x: event.clientX, y: event.clientY, layout }
              setDragging(true)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              const start = drag.current
              const box = frame.current?.getBoundingClientRect()
              if (!start || !box?.width) return
              const ratio = output.width / box.width
              onFocus(
                shiftFocus(
                  start.layout,
                  oriented,
                  (event.clientX - start.x) * ratio,
                  (event.clientY - start.y) * ratio
                )
              )
            }}
            onPointerUp={() => {
              drag.current = null
              setDragging(false)
            }}
            onPointerCancel={() => {
              drag.current = null
              setDragging(false)
            }}
          >
            <div className="checkerboard absolute inset-0" aria-hidden="true" />
            <canvas
              ref={canvas}
              role="img"
              aria-label="Preview of the resized image"
              className="relative block size-full"
            />
            {showResult && (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img
                src={resultUrl!}
                alt="Resized result"
                draggable={false}
                className="pointer-events-none absolute inset-0 size-full"
              />
            )}
            {safeArea && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              >
                <div
                  className="absolute inset-x-0 top-0 border-b border-dashed border-background bg-foreground/35"
                  style={{ height: `${safeArea.top * 100}%` }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 border-t border-dashed border-background bg-foreground/35"
                  style={{ height: `${safeArea.bottom * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
        <span className={cn(tag, "left-3")}>
          Original · {oriented.width} × {oriented.height}
        </span>
        <span className={cn(tag, "right-3")} data-testid="output-size">
          Output · {output.width} × {output.height}
        </span>
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
        <div className="space-y-1 text-xs text-muted-foreground">
          {movable && (
            <p className="flex items-center gap-1.5">
              <IconArrowsMove className="size-3.5" aria-hidden="true" />
              Drag the picture or use the arrow keys to reposition it.
            </p>
          )}
          {safeArea && (
            <p>
              Shaded bands are usually covered by the app&apos;s own buttons.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
