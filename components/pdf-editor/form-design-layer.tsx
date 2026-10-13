"use client"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import { fitField } from "@/lib/pdf-editor/form-fields"
import {
  HANDLES,
  handlePoint,
  pullHandle,
  type Box,
  type Handle,
} from "@/lib/pdf-editor/geometry"
import type { Size } from "@/lib/image-compressor/geometry"
import { cn } from "cn"
import { pagePoint, type Editor } from "./use-editor"
import type { MakeForm } from "./use-make-form"
const arrows: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}
export function FormDesignSpots({
  editor,
  makeForm,
  page,
  size,
  scale,
}: {
  editor: Editor
  makeForm: MakeForm
  page: number
  size: Size
  scale: number
}) {
  const surface = useRef<HTMLDivElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [preview, setPreview] = useState<{ id: string; box: Box } | null>(null)
  const moving = useRef<{ id: string; box: Box } | null>(null),
    drag = useRef<{
      id: string
      box: Box
      start: { x: number; y: number }
      handle?: Handle
    } | null>(null)
  const [coarse] = useState(() => matchMedia("(pointer: coarse)").matches)
  const fields = editor.fields[page] ?? [],
    { fresh, setFresh, reshape } = makeForm
  const exists = fields.some((f) => f.id === fresh)
  useEffect(() => {
    if (!fresh || !exists) return
    surface.current
      ?.querySelector<HTMLElement>(`[data-design-field="${fresh}"]`)
      ?.focus({ preventScroll: true })
    setFresh(null)
  }, [fresh, exists, setFresh])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      const pending = moving.current
      moving.current = null
      if (pending) void reshape(page, pending.id, pending.box)
    },
    [page, reshape]
  )
  const put = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = moving.current
    moving.current = null
    if (next) void reshape(page, next.id, next.box).then(() => setPreview(null))
  }, [page, reshape])
  const { onFlush } = editor
  useEffect(() => onFlush(put), [onFlush, put])
  const display = (id: string, box: Box) => {
    moving.current = { id, box }
    setPreview({ id, box })
  }
  const key = (event: KeyboardEvent, id: string, box: Box) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      event.stopPropagation()
      put()
      void makeForm.remove()
      return
    }
    const by = arrows[event.key]
    if (!by) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 10 : 1
    const next = fitField(
      event.altKey
        ? {
            ...box,
            width: box.width + by[0] * step,
            height: box.height + by[1] * step,
          }
        : { ...box, x: box.x + by[0] * step, y: box.y + by[1] * step },
      size
    )
    display(id, next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(put, 500)
  }
  const down = (event: PointerEvent, id: string, box: Box, handle?: Handle) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    put()
    makeForm.setChosen({ page, id })
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      id,
      box,
      start: pagePoint(surface.current!, size, event),
      handle,
    }
  }
  const move = (event: PointerEvent) => {
    const held = drag.current
    if (!held) return
    const at = pagePoint(surface.current!, size, event)
    const box = held.handle
      ? pullHandle(held.box, 0, held.handle, at)
      : {
          ...held.box,
          x: held.box.x + at.x - held.start.x,
          y: held.box.y + at.y - held.start.y,
        }
    display(held.id, fitField(box, size))
  }
  const up = (event: PointerEvent) => {
    event.stopPropagation()
    drag.current = null
    put()
  }
  return (
    <div
      ref={surface}
      data-testid="form-design-surface"
      className="pointer-events-none absolute inset-0"
    >
      {fields.map((field) => {
        const selected =
          makeForm.chosen?.page === page && makeForm.chosen.id === field.id
        const box = preview?.id === field.id ? preview.box : field.box
        return (
          <div
            key={field.id}
            className="pointer-events-none absolute"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
            }}
          >
            <button
              type="button"
              data-hold
              disabled={editor.form.xfa || field.signed}
              data-design-field={field.id}
              data-testid="form-design-field"
              data-name={field.name}
              data-box={[box.x, box.y, box.width, box.height]
                .map(Math.round)
                .join(",")}
              aria-label={`Form field: ${field.label}`}
              aria-pressed={selected}
              title={`${field.label}: drag to move, Alt and arrow keys to resize`}
              className={cn(
                "pointer-events-auto absolute inset-0 size-full cursor-move touch-none border border-primary bg-primary/10 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected && "border-2 bg-primary/20"
              )}
              onFocus={() => makeForm.setChosen({ page, id: field.id })}
              onPointerDown={(e) => down(e, field.id, box)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => {
                drag.current = null
                moving.current = null
                setPreview(null)
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => key(e, field.id, box)}
              onBlur={() => {
                if (timer.current) put()
              }}
            />
            {selected &&
              !editor.form.xfa &&
              !field.signed &&
              HANDLES.map((handle) => {
                const point = handlePoint(
                    { x: 0, y: 0, width: box.width, height: box.height },
                    0,
                    handle
                  ),
                  hit = (coarse ? 44 : 22) / scale,
                  left =
                    point.x -
                    (coarse
                      ? handle.includes("w")
                        ? hit
                        : handle.includes("e")
                          ? 0
                          : hit / 2
                      : hit / 2),
                  top =
                    point.y -
                    (coarse
                      ? handle.includes("n")
                        ? hit
                        : handle.includes("s")
                          ? 0
                          : hit / 2
                      : hit / 2),
                  visual = (coarse ? 16 : 9) / scale
                return (
                  <button
                    key={handle}
                    type="button"
                    data-hold
                    aria-label={`Resize ${field.label}: ${handle}`}
                    className="pointer-events-auto absolute touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      left,
                      top,
                      width: hit,
                      height: hit,
                    }}
                    onPointerDown={(e) => down(e, field.id, box, handle)}
                    onPointerMove={move}
                    onPointerUp={up}
                    onKeyDown={(e) => key(e, field.id, box)}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute rounded-sm border border-primary bg-white"
                      style={{
                        left: point.x - left - visual / 2,
                        top: point.y - top - visual / 2,
                        width: visual,
                        height: visual,
                      }}
                    />
                  </button>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}
