"use client"

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import type { Size } from "@/lib/image-compressor/geometry"
import { selectWords, type LetterLine } from "@/lib/pdf-editor/comments"
import { boxBetween, type Box, type Point } from "@/lib/pdf-editor/geometry"
import { boxOf, type RedactMark } from "@/lib/pdf-editor/redact"
import { pagePoint, type Editor } from "./use-editor"
import type { Redact } from "./use-redact"
import { useHolding } from "./use-settling"

/** The smallest area that is a mark and not a slip of the hand, in points. */
const SMALLEST = 3
/** How long the arrow keys may rest before a mark that was moved with them is put into the file. */
const SETTLE = 500

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** A box moved, or made larger or smaller, and kept on its page. */
function nudged(box: Box, by: [number, number], resize: boolean, page: Size) {
  if (resize) {
    const width = Math.min(
      Math.max(SMALLEST, box.width + by[0]),
      page.width - box.x
    )
    const height = Math.min(
      Math.max(SMALLEST, box.height + by[1]),
      page.height - box.y
    )
    return { ...box, width, height }
  }
  return {
    ...box,
    x: Math.min(Math.max(0, box.x + by[0]), page.width - box.width),
    y: Math.min(Math.max(0, box.y + by[1]), page.height - box.height),
  }
}

/**
 * The marks of a page that wait to be applied, each a button that takes
 * its mark away again, and the page itself as a place to drag a new mark
 * over.
 */
export function RedactSpots({
  editor,
  redact,
  page,
  version,
  size,
  scale,
}: {
  editor: Editor
  redact: Redact
  /** Counted from 0. */
  page: number
  version: number
  size: Size
  /** How many pixels a point of the page is shown as: lines are drawn as thin on every page. */
  scale: number
}) {
  const surface = useRef<HTMLDivElement>(null)
  const [read, setRead] = useState<{ of: number; marks: RedactMark[] } | null>(
    null
  )
  const [drawn, setDrawn] = useState<{ from: Point; to: Point } | null>(null)
  const [lines, setLines] = useState<{
    of: number
    lines: LetterLine[]
  } | null>(null)
  /** A mark on its way somewhere else with the arrow keys, until it is put into the file. */
  const [moving, setMoving] = useState<{ id: string; box: Box } | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holding = useHolding()
  const { redactMarks, letters } = editor
  const { fresh, setFresh, remark } = redact
  const byWords = redact.how === "words"
  useEffect(() => {
    let stale = false
    void redactMarks(page, version).then((marks) => {
      if (stale) return
      setRead({ of: version, marks })
      // What was moved is now where the file has it.
      setMoving((was) => (settle.current ? was : null))
    })
    return () => {
      stale = true
    }
  }, [redactMarks, page, version])
  // The letters of the page are wanted as soon as words are to be marked on it.
  useEffect(() => {
    if (!byWords) return
    let stale = false
    void letters(page, version).then(
      (found) => !stale && setLines({ of: version, lines: found })
    )
    return () => {
      stale = true
    }
  }, [letters, byWords, page, version])
  // The marks of the page as it was stay until it has been read again.
  const marks = read?.marks ?? []
  // A mark that was put here with a button takes the keyboard.
  const here = fresh?.page === page ? fresh.id : null
  const arrived = here !== null && marks.some((mark) => mark.id === here)
  useEffect(() => {
    if (!arrived || !here) return
    surface.current
      ?.querySelector<HTMLElement>(`[data-mark="${here}"]`)
      ?.focus({ preventScroll: false })
    setFresh(null)
  }, [arrived, here, setFresh])
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current)
    },
    []
  )

  const at = (event: PointerEvent) => pagePoint(surface.current!, size, event)
  const frame = drawn && !byWords ? boxBetween(drawn.from, drawn.to) : null
  // While words are dragged over, the lines that would be marked are shown.
  const picked =
    drawn && byWords && lines?.of === version
      ? selectWords(lines.lines, drawn.from, drawn.to)
      : []

  /** Put a mark that was moved with the keys into the file, now. */
  const put = (id: string, box: Box) => {
    if (settle.current) clearTimeout(settle.current)
    settle.current = null
    holding(false)
    void remark(page, id, box)
  }
  const onKey = (event: KeyboardEvent, mark: RedactMark, box: Box) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      event.stopPropagation()
      if (settle.current) clearTimeout(settle.current)
      settle.current = null
      holding(false)
      setMoving(null)
      void redact.unmark(page, mark.id)
      return
    }
    const arrow = ARROWS[event.key]
    // Only a mark that is one box is moved: marked words are marked anew.
    if (!arrow || mark.quads.length !== 1) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 10 : 1
    const next = nudged(
      box,
      [arrow[0] * step, arrow[1] * step],
      event.altKey,
      size
    )
    setMoving({ id: mark.id, box: next })
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => put(mark.id, next), SETTLE)
    holding(true)
  }

  return (
    <div
      ref={surface}
      data-testid="redact-surface"
      data-marks={marks.length}
      className="absolute inset-0 cursor-crosshair touch-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        // The page under it must not take a press here for one of its own.
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        const point = at(event)
        setDrawn({ from: point, to: point })
      }}
      onPointerMove={(event) => {
        if (drawn) setDrawn({ from: drawn.from, to: at(event) })
      }}
      onPointerUp={() => {
        if (drawn && byWords)
          void redact.markBetween(page, version, drawn.from, drawn.to)
        else if (frame && frame.width >= SMALLEST && frame.height >= SMALLEST)
          void redact.markArea(page, frame)
        setDrawn(null)
      }}
      onPointerCancel={() => setDrawn(null)}
    >
      {marks.flatMap((mark) =>
        mark.quads.map((quad, part) => {
          const box =
            moving?.id === mark.id && part === 0 ? moving.box : boxOf(quad)
          const one = mark.quads.length === 1
          return (
            <button
              key={`${mark.id}/${part}`}
              type="button"
              data-hold
              data-mark={part === 0 ? mark.id : undefined}
              data-testid="redact-mark"
              data-box={[box.x, box.y, box.width, box.height]
                .map((value) => Math.round(value))
                .join(",")}
              // The parts of one mark are one stop for the keyboard.
              tabIndex={part === 0 ? 0 : -1}
              aria-label={`Marked to be taken out, on page ${page + 1}. ${one ? "The arrow keys move it, with Alt they resize it. " : ""}Press to take the mark away.`}
              title="Marked to be taken out. Press to take the mark away."
              className="absolute cursor-pointer bg-destructive/25 outline-destructive outline-solid hover:bg-destructive/40 focus-visible:bg-destructive/50"
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                outlineWidth: 2 / scale,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                if (settle.current) clearTimeout(settle.current)
                settle.current = null
                setMoving(null)
                void redact.unmark(page, mark.id)
              }}
              onKeyDown={(event) => onKey(event, mark, box)}
              onBlur={() => {
                if (settle.current && moving?.id === mark.id)
                  put(mark.id, moving.box)
              }}
            />
          )
        })
      )}
      {picked.map((quad, index) => {
        const box = boxOf(quad)
        return (
          <span
            key={index}
            aria-hidden="true"
            className="pointer-events-none absolute bg-destructive/25 outline-destructive outline-dashed"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
              outlineWidth: 2 / scale,
            }}
          />
        )
      })}
      {frame && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bg-destructive/25 outline-destructive outline-dashed"
          style={{
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
            outlineWidth: 2 / scale,
          }}
        />
      )}
    </div>
  )
}
