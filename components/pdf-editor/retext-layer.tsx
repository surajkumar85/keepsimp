"use client"

import { useEffect, useRef, useState } from "react"
import { screenFamily } from "@/lib/pdf-editor/fonts"
import type { Point } from "@/lib/pdf-editor/geometry"
import { cssColour } from "@/lib/pdf-editor/styles"
import { mainStyle, standIns, type PageLine } from "@/lib/pdf-editor/retext"
import { cn } from "cn"
import type { Editor } from "./use-editor"
import type { Retext } from "./use-retext"

/** The generic family of one of the editor's fonts, for the browser to type in before that font is loaded. */
const generic = (key: string) =>
  key.startsWith("mono")
    ? "monospace"
    : key.startsWith("serif")
      ? "serif"
      : "sans-serif"

/** How far a press may wander and still be a press, in pixels of the screen. */
const SLACK = 4

/** One line of the page: pressed to change its words, dragged to move it. */
function Spot({
  retext,
  page,
  line,
  scale,
}: {
  retext: Retext
  page: number
  line: PageLine
  scale: number
}) {
  const from = useRef<Point | null>(null)
  const [moved, setMoved] = useState<Point | null>(null)
  const { box } = line
  const nudge = (x: number, y: number) =>
    retext.change(page, line, line.text, {}, { x, y })
  return (
    <button
      type="button"
      data-hold
      data-testid="editor-line"
      data-fixed={line.fixed ? "true" : undefined}
      aria-label={`Change the line: ${line.text}`}
      title={line.fixed ?? "Change these words, or drag them somewhere else"}
      className={cn(
        // A frame that shows on light paper and on a dark picture alike.
        "absolute cursor-text touch-none rounded-xs ring-1 ring-white/50 outline-1 outline-primary/60 ring-inset hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary",
        line.fixed ? "outline-dashed" : "outline",
        moved && "cursor-grabbing bg-primary/10"
      )}
      style={{
        left: box.x - 1 + (moved?.x ?? 0),
        top: box.y + (moved?.y ?? 0),
        width: box.width + 2,
        height: box.height,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        // The page under it must not take a press here for one of its own.
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        from.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerMove={(event) => {
        if (!from.current) return
        const by = {
          x: (event.clientX - from.current.x) / scale,
          y: (event.clientY - from.current.y) / scale,
        }
        // A press that hardly moves is a press, not a drag.
        if (moved || Math.hypot(by.x, by.y) * scale > SLACK) setMoved(by)
      }}
      onPointerUp={() => {
        from.current = null
        if (!moved) return
        const by = moved
        retext.change(page, line, line.text, {}, by)
        // The click that ends a drag is not a press; after it, the frame
        // goes back until the page shows the line where the file now has it.
        setTimeout(() => setMoved(null))
      }}
      onPointerCancel={() => {
        from.current = null
        setMoved(null)
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        // A drag ends in a click as well; it was a drag.
        if (moved) return
        retext.setTyping({ page, line, text: line.text, look: {} })
      }}
      onKeyDown={(event) => {
        const far = event.shiftKey ? 10 : 1
        const by: Record<string, [number, number]> = {
          ArrowLeft: [-far, 0],
          ArrowRight: [far, 0],
          ArrowUp: [0, -far],
          ArrowDown: [0, far],
        }
        const taken = event.key === "Delete" || event.key === "Backspace"
        if (!taken && !by[event.key]) return
        event.preventDefault()
        event.stopPropagation()
        if (taken) retext.change(page, line, "")
        else nudge(...by[event.key])
      }}
    />
  )
}

/**
 * The lines of a page's own text, each as a place that can be clicked to
 * change its words. The line being changed is a field over it, in a font
 * close to its own; the page shows the real thing once the file has it.
 */
export function LineSpots({
  editor,
  retext,
  page,
  version,
  scale,
}: {
  editor: Editor
  retext: Retext
  /** Counted from 0. */
  page: number
  /** How often the page has been drawn again: its lines are read anew each time. */
  version: number
  /** Screen pixels to a point. */
  scale: number
}) {
  const [read, setRead] = useState<{ of: string; lines: PageLine[] } | null>(
    null
  )
  const key = `${page}/${version}`
  const { lines: linesOf } = editor
  useEffect(() => {
    let stale = false
    void linesOf(page, version).then(
      (lines) => !stale && setRead({ of: `${page}/${version}`, lines })
    )
    return () => {
      stale = true
    }
  }, [linesOf, page, version])
  // Lines that were read from the page as it was are not offered for the page as it is.
  const lines = read?.of === key ? read.lines : []
  const typing = retext.typing?.page === page ? retext.typing : null

  return (
    <>
      {lines.map((line, at) =>
        typing && typing.line === line ? null : (
          <Spot
            // A line that was moved is another line: it starts where the file now has it.
            key={`${key}/${at}`}
            retext={retext}
            page={page}
            line={line}
            scale={scale}
          />
        )
      )}
      {typing &&
        (() => {
          const { line, text, look } = typing
          const style = mainStyle(line)
          const size = look.size ?? style?.size ?? 12
          // The font it will be set in: one of the editor's when that was
          // chosen; else the one that stands closest to its own, to type in.
          const shown = look.font ?? style?.standIn ?? "sans"
          // Phones zoom the whole page in on a field with letters under 16
          // pixels; the field is made larger and scaled back down.
          const grow = Math.max(1, 16 / size)
          const lent = standIns(line, text.trim(), look)
          const height = (line.box.height * size) / (style?.size ?? size)
          const turned = line.along.x !== 1
          return (
            <div
              className="absolute"
              style={{ left: line.box.x - 1, top: line.box.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <input
                autoFocus
                data-testid="editor-retext"
                aria-label="The words of this line"
                aria-describedby={
                  line.fixed || lent.length || turned
                    ? `retext-${page}`
                    : undefined
                }
                value={text}
                readOnly={Boolean(line.fixed)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                onChange={(event) =>
                  retext.setTyping({ ...typing, text: event.target.value })
                }
                onBlur={(event) => {
                  // Choosing a look in the bar does not end the typing.
                  if (
                    (event.relatedTarget as HTMLElement | null)?.closest(
                      "[data-editor-bar]"
                    )
                  )
                    return
                  retext.finish()
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    event.preventDefault()
                    retext.setTyping(null)
                  } else if (event.key === "Enter") {
                    event.preventDefault()
                    retext.finish()
                  }
                }}
                className="origin-top-left border-0 bg-white p-0 px-px outline-1 outline-primary select-text"
                style={{
                  width:
                    Math.max(line.box.width, size * 6) * grow + size * 6 * grow,
                  height: height * grow,
                  transform: grow > 1 ? `scale(${1 / grow})` : undefined,
                  fontFamily: `"${screenFamily(shown)}", ${generic(shown)}`,
                  fontWeight: shown.includes("bold") ? 700 : 400,
                  fontStyle: shown.includes("italic") ? "italic" : "normal",
                  fontSize: size * grow,
                  lineHeight: `${height * grow}px`,
                  color: cssColour(look.colour ?? style?.colour ?? [0, 0, 0]),
                }}
              />
              {(line.fixed || lent.length > 0 || turned) && (
                <p
                  id={`retext-${page}`}
                  role="status"
                  className="absolute left-0 w-max max-w-80 rounded-xs bg-foreground px-1 py-0.5 whitespace-normal text-background"
                  style={{
                    top: height + 2,
                    fontSize: Math.max(7, Math.min(10, size * 0.8)),
                    lineHeight: 1.3,
                  }}
                >
                  {line.fixed ??
                    [
                      turned &&
                        "This line is turned on the page; it is typed here straight and written turned.",
                      lent.length > 0 &&
                        `This line's font has no ${lent.map((letter) => `“${letter}”`).join(", ")}: the closest font the editor has will be used for ${lent.length === 1 ? "it" : "them"}.`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                </p>
              )}
            </div>
          )
        })()}
    </>
  )
}
