"use client"

import { useLayoutEffect, useRef, useState, type PointerEvent } from "react"
import type { Size } from "@/lib/image-compressor/geometry"
import { screenFamily } from "@/lib/pdf-editor/fonts"
import {
  boxBetween,
  centreOf,
  cornersOf,
  type Point,
} from "@/lib/pdf-editor/geometry"
import { strokePath } from "@/lib/pdf-editor/ink"
import { measured } from "@/lib/pdf-editor/measure"
import {
  arrowHead,
  arrowShaft,
  fontKey,
  calloutFrame,
  calloutLine,
  handlesOf,
  handleSpot,
  isLine,
  nameOf,
  LINE_HEIGHT,
  type EditorObject,
} from "@/lib/pdf-editor/objects"
import { cssColour } from "@/lib/pdf-editor/styles"
import { shown, turnHandle, turns } from "@/lib/pdf-editor/tools"
import { cn } from "cn"
import { CommentMarks, CommentSpots } from "./comment-layer"
import { FieldSpots } from "./field-layer"
import { LineSpots } from "./retext-layer"
import type { Comments } from "./use-comments"
import type { Retext } from "./use-retext"
import { PictureSpots } from "./picture-layer"
import type { Inpage } from "./use-inpage"
import { laidOut, pagePoint, type Editor } from "./use-editor"

const points = (list: readonly Point[]) =>
  list.map((point) => `${point.x},${point.y}`).join(" ")

/** What a thing is called for someone who cannot see it. */
function describe(object: EditorObject) {
  const name = nameOf(object).replace(/^./, (first) => first.toUpperCase())
  if (object.kind === "text")
    return `${name}: ${object.text.slice(0, 80) || "empty"}`
  if (object.kind === "stamp") return `${name}: ${object.label}`
  if (object.kind === "measure")
    return `${name}: ${measured(object.from, object.to, object.unit, object.scale)}`
  return name
}

/** A thing as it is dragged, pulled or turned: its outline, and its shape where it has one. */
function Ghost({ object }: { object: EditorObject }) {
  const line = "stroke-primary [vector-effect:non-scaling-stroke]"
  if (object.kind === "text" && object.tip) {
    // A call-out: its frame, and the line to what it points at.
    const lead = calloutLine(object)
    return (
      <g className={line} fill="none" strokeWidth={1.5} strokeDasharray="4 3">
        <rect {...calloutFrame(object.box)} />
        {lead && (
          <line
            x1={lead.from.x}
            y1={lead.from.y}
            x2={lead.to.x}
            y2={lead.to.y}
          />
        )}
      </g>
    )
  }
  if (isLine(object))
    return (
      <line
        x1={object.from.x}
        y1={object.from.y}
        x2={object.to.x}
        y2={object.to.y}
        className={line}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
    )
  if (object.kind === "ink")
    return (
      <g className={line} fill="none" strokeWidth={1.5} strokeDasharray="4 3">
        {object.strokes.map((stroke, at) => (
          <path key={at} d={strokePath(stroke)} />
        ))}
      </g>
    )
  const centre = centreOf(object.box)
  const turn = `rotate(${object.rotation} ${centre.x} ${centre.y})`
  return object.kind === "ellipse" ? (
    <ellipse
      cx={centre.x}
      cy={centre.y}
      rx={object.box.width / 2}
      ry={object.box.height / 2}
      transform={turn}
      fill="none"
      className={line}
      strokeWidth={1.5}
      strokeDasharray="4 3"
    />
  ) : (
    <rect
      {...object.box}
      transform={turn}
      fill="none"
      className={line}
      strokeWidth={1.5}
      strokeDasharray="4 3"
    />
  )
}

/**
 * What the editor lays over one page: the things on it as places that can be
 * reached, the frame and handles of what is selected, what a gesture is
 * about to do, and the box being typed in. Everything is in the page's own
 * points; the page scales it.
 */
export function PageLayer({
  editor,
  page,
  size,
  scale,
  comments,
  retext,
  inpage,
}: {
  editor: Editor
  comments: Comments
  retext: Retext
  inpage: Inpage
  /** Counted from 0. */
  page: number
  size: Size
  /** Screen pixels to a point. */
  scale: number
}) {
  const layer = useRef<HTMLDivElement>(null)
  /** What the last press on this page was: by a finger, and whether it ended the typing. */
  const pressed = useRef({ touch: false, ended: false })
  const field = useRef<HTMLTextAreaElement>(null)
  const [coarse] = useState(() => matchMedia("(pointer: coarse)").matches)
  const { state, typing } = editor
  const objects = editor.objects[page] ?? []
  // How many points a finger's or a mouse's reach is at this zoom.
  const reach = (coarse ? 14 : 6) / scale
  const view = { page, size, objects }
  const now = shown(state, view)
  const ids = state.selection?.page === page ? state.selection.ids : []
  const chosen = now.filter((object) => ids.includes(object.id))
  const gesture = state.gesture?.page === page ? state.gesture : null
  const mine = typing?.page === page ? typing : null

  const at = (event: PointerEvent) => ({
    point: pagePoint(layer.current!, size, event),
    reach,
    shift: event.shiftKey,
  })

  /** The box that was being typed in on this page, to hand the keyboard on when typing ends. */
  const typed = useRef<string | null>(null)
  // Before the browser paints, so that a key pressed right after lands in the box.
  useLayoutEffect(() => {
    if (!mine) {
      const id = typed.current
      typed.current = null
      // The field went away with the keyboard in it. The keyboard goes to the
      // box that was typed, or to the pages when the box is gone, unless
      // something else in the window has taken it meanwhile.
      const active = document.activeElement
      if (!id || active?.closest("[data-testid=reader]")) return
      const next =
        layer.current?.querySelector<HTMLElement>(
          `[data-id="${CSS.escape(id)}"]`
        ) ?? layer.current?.closest<HTMLElement>("[data-testid=reader-pages]")
      next?.focus({ preventScroll: true })
      return
    }
    typed.current = mine.object.id
    const element = field.current
    if (!element) return
    element.focus({ preventScroll: true })
    element.setSelectionRange(element.value.length, element.value.length)
    // Only when typing starts in this box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine?.object.id])

  const marks = editor.comments[page] ?? []
  /** A tool that makes comments is in hand: the page is marked, not edited. */
  const marking = comments.tool !== null
  const drawing = state.tool !== "select" || marking
  const moving = gesture && (gesture.kind !== "move" || gesture.begun)

  return (
    <div
      ref={layer}
      data-testid="editor-layer"
      data-page={page + 1}
      data-objects={objects.length}
      data-comments={marks.length}
      className={cn(
        "absolute inset-0 select-none",
        drawing ? "cursor-crosshair touch-none" : "touch-pan-x touch-pan-y",
        (state.tool === "text" ||
          (marking && comments.tool !== "pen" && comments.tool !== "note")) &&
          "cursor-text"
      )}
      onMouseDown={(event) => {
        // A press with the text tool starts a box and puts the keyboard in
        // it. The browser would then move the keyboard to the pages, as it
        // does on any press, and the empty box would close again.
        if (state.tool === "text" || typing) event.preventDefault()
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        pressed.current = { touch: event.pointerType === "touch", ended: false }
        // Pressing the page puts a line that is being changed into the file.
        if (retext.typing) {
          retext.finish()
          // The pointer is elsewhere now: the keyboard is not brought back to the line.
          retext.hold(null)
          return
        }
        retext.hold(null)
        // And lets go of a picture of the page that was chosen.
        if (inpage.chosen) {
          inpage.deselect()
          return
        }
        // Pressing the page ends the typing, also where a tap does not take the keyboard away.
        if (typing) {
          pressed.current.ended = true
          editor.finishTyping(typing.object.text)
          return
        }
        if (event.pointerType === "touch" && !drawing) {
          // A finger on empty paper scrolls the page; on a thing, it takes hold of it.
          const target = event.target as HTMLElement
          if (!target.closest("[data-hold]")) return
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        if (marking) {
          comments.pointerDown(page, pagePoint(layer.current!, size, event))
          return
        }
        // A press anywhere but on a comment lets go of the comment that was picked.
        comments.unpick()
        editor.pointerDown(page, at(event))
      }}
      onPointerMove={(event) => {
        if (comments.dragging())
          comments.pointerMove(pagePoint(layer.current!, size, event))
        else if (editor.dragging()) editor.pointerMove(page, at(event))
      }}
      onPointerUp={() => {
        if (comments.dragging()) void comments.pointerUp()
        else editor.pointerUp(page, reach)
      }}
      onClick={(event) => {
        // A finger on empty paper scrolls, so it never starts a gesture; a
        // tap that did not scroll lets go of what is selected, as a click does.
        const { touch, ended } = pressed.current
        if (
          touch &&
          !ended &&
          !drawing &&
          !(event.target as HTMLElement).closest("[data-hold], textarea")
        ) {
          editor.deselect()
          comments.unpick()
        }
      }}
      onPointerCancel={() => {
        comments.pointerCancel()
        editor.pointerCancel()
      }}
      onDoubleClick={(event) => {
        const point = pagePoint(layer.current!, size, event)
        const [only] = chosen
        if (
          chosen.length === 1 &&
          only.kind === "text" &&
          point.x >= only.box.x - reach &&
          point.x <= only.box.x + only.box.width + reach
        )
          editor.retype(page, only)
      }}
    >
      <CommentSpots
        comments={comments}
        list={marks}
        page={page}
        scale={scale}
        idle={!drawing && !gesture && !mine}
      />
      {retext.on && (
        <LineSpots
          editor={editor}
          retext={retext}
          page={page}
          version={editor.versions[page] ?? 0}
          scale={scale}
        />
      )}
      {inpage.on && (
        <PictureSpots
          editor={editor}
          inpage={inpage}
          page={page}
          version={editor.versions[page] ?? 0}
          scale={scale}
        />
      )}
      <FieldSpots
        editor={editor}
        page={page}
        idle={!drawing && !gesture && !mine && !retext.on && !inpage.on}
      />
      {objects.map((object) => {
        const corners = cornersOf(object.box, object.rotation)
        const left = Math.min(...corners.map((corner) => corner.x)) - reach / 2
        const top = Math.min(...corners.map((corner) => corner.y)) - reach / 2
        const right = Math.max(...corners.map((corner) => corner.x)) + reach / 2
        const bottom =
          Math.max(...corners.map((corner) => corner.y)) + reach / 2
        return (
          <div
            key={object.id}
            role="button"
            tabIndex={0}
            data-hold
            data-id={object.id}
            data-testid="editor-object"
            data-kind={object.kind}
            data-selected={ids.includes(object.id) || undefined}
            aria-label={describe(object)}
            aria-pressed={ids.includes(object.id)}
            onFocus={() => {
              if (!ids.includes(object.id) && !state.gesture)
                editor.select(page, object.id)
            }}
            className="absolute touch-none rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left, top, width: right - left, height: bottom - top }}
          />
        )
      })}
      <svg
        aria-hidden="true"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
      >
        <CommentMarks comments={comments} list={marks} page={page} />
        {moving &&
          chosen.map((object) => <Ghost key={object.id} object={object} />)}
        {!gesture &&
          chosen.map((object) =>
            isLine(object) ? (
              <line
                key={object.id}
                x1={object.from.x}
                y1={object.from.y}
                x2={object.to.x}
                y2={object.to.y}
                className="stroke-primary [vector-effect:non-scaling-stroke]"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : (
              <polygon
                key={object.id}
                points={points(cornersOf(object.box, object.rotation))}
                fill="none"
                className="stroke-primary [vector-effect:non-scaling-stroke]"
                strokeWidth={1}
              />
            )
          )}
        {gesture?.kind === "move" &&
          gesture.guides.map((guide, index) =>
            guide.axis === "x" ? (
              <line
                key={index}
                x1={guide.at}
                x2={guide.at}
                y1={0}
                y2={size.height}
                className="stroke-primary/70 [vector-effect:non-scaling-stroke]"
                strokeWidth={1}
              />
            ) : (
              <line
                key={index}
                y1={guide.at}
                y2={guide.at}
                x1={0}
                x2={size.width}
                className="stroke-primary/70 [vector-effect:non-scaling-stroke]"
                strokeWidth={1}
              />
            )
          )}
        {gesture?.kind === "marquee" && (
          <rect
            {...boxBetween(gesture.from, gesture.to)}
            className="fill-primary/10 stroke-primary [vector-effect:non-scaling-stroke]"
            strokeWidth={1}
          />
        )}
        {gesture?.kind === "ink" && (
          <path
            d={strokePath(gesture.points)}
            fill="none"
            stroke={cssColour(editor.styles.inkColour)}
            strokeWidth={editor.styles.inkWeight}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {gesture?.kind === "make" &&
          (gesture.tool === "line" ||
          gesture.tool === "arrow" ||
          gesture.tool === "measure" ||
          gesture.tool === "callout" ? (
            <g
              stroke={cssColour(editor.styles.stroke)}
              fill={cssColour(editor.styles.stroke)}
              strokeLinecap="round"
            >
              <line
                x1={gesture.from.x}
                y1={gesture.from.y}
                {...(gesture.tool === "arrow"
                  ? (() => {
                      const end = arrowShaft(
                        gesture.from,
                        gesture.to,
                        editor.styles.weight
                      )
                      return { x2: end.x, y2: end.y }
                    })()
                  : { x2: gesture.to.x, y2: gesture.to.y })}
                strokeWidth={editor.styles.weight}
              />
              {gesture.tool === "arrow" && (
                <polygon
                  points={points(
                    arrowHead(gesture.from, gesture.to, editor.styles.weight)
                  )}
                  stroke="none"
                />
              )}
            </g>
          ) : gesture.tool === "ellipse" ? (
            <ellipse
              cx={(gesture.from.x + gesture.to.x) / 2}
              cy={(gesture.from.y + gesture.to.y) / 2}
              rx={Math.abs(gesture.to.x - gesture.from.x) / 2}
              ry={Math.abs(gesture.to.y - gesture.from.y) / 2}
              fill={editor.styles.fill ? cssColour(editor.styles.fill) : "none"}
              stroke={cssColour(editor.styles.stroke)}
              strokeWidth={editor.styles.weight}
            />
          ) : (
            <rect
              {...boxBetween(gesture.from, gesture.to)}
              fill={
                gesture.tool === "cover"
                  ? cssColour(editor.styles.coverFill)
                  : editor.styles.fill
                    ? cssColour(editor.styles.fill)
                    : "none"
              }
              stroke={
                gesture.tool === "cover"
                  ? "none"
                  : cssColour(
                      gesture.tool === "stamp"
                        ? editor.styles.stampColour
                        : editor.styles.stroke
                    )
              }
              strokeWidth={editor.styles.weight}
              className={
                gesture.tool === "cover"
                  ? "outline-1 outline-primary/60"
                  : undefined
              }
            />
          ))}
      </svg>
      {!gesture &&
        chosen.length === 1 &&
        !mine &&
        (() => {
          const [object] = chosen
          const ends = isLine(object)
          const spots: { key: string; at: Point; label: string }[] = handlesOf(
            object
          ).map((handle) => ({
            key: handle,
            at: handleSpot(object, handle),
            // A line is held by its start and its end.
            label: ends ? (handle === "w" ? "start" : "end") : handle,
          }))
          if (turns(object))
            spots.push({
              key: "turn",
              at: turnHandle(object, reach),
              label: "turn",
            })
          const edge = Math.max(8, coarse ? 16 : 9) / scale
          return spots.map((spot) => (
            <span
              key={spot.key}
              data-hold
              data-testid="editor-handle"
              data-handle={spot.label}
              aria-hidden="true"
              className={cn(
                "absolute touch-none border border-primary bg-white",
                spot.key === "turn" || spot.key === "tip"
                  ? "rounded-full"
                  : "rounded-xs"
              )}
              style={{
                left: spot.at.x - edge / 2,
                top: spot.at.y - edge / 2,
                width: edge,
                height: edge,
                borderWidth: 1 / scale,
              }}
            />
          ))
        })()}
      {mine &&
        (() => {
          const { object } = mine
          // Phones zoom the whole page in on a field with letters under 16
          // pixels. The field is made larger and scaled back down, so its
          // letters are the size they will be on the page.
          const grow = Math.max(1, 16 / object.size)
          // In a row of boxes the letters are set as far apart as the boxes
          // are, about a figure's width each. The page shows them exactly,
          // each in the middle of its box, once the file has them.
          const apart = object.comb
            ? (object.box.width / object.comb - object.size * 0.556) * grow
            : 0
          return (
            <div
              className="absolute"
              style={{
                left: object.box.x,
                top: object.box.y,
                width: object.box.width,
                height: object.box.height,
                transform: object.rotation
                  ? `rotate(${object.rotation}deg)`
                  : undefined,
              }}
            >
              <textarea
                ref={field}
                aria-label="Text of the box"
                data-testid="editor-typing"
                value={object.text}
                spellCheck={false}
                autoCapitalize="off"
                rows={Math.max(1, object.lines.length)}
                maxLength={object.comb}
                onChange={(event) =>
                  editor.setTyping({
                    ...mine,
                    object: laidOut(object, event.target.value),
                  })
                }
                onBlur={(event) => {
                  // Choosing a look in the bar does not end the typing.
                  if (
                    (event.relatedTarget as HTMLElement | null)?.closest(
                      "[data-editor-bar]"
                    )
                  )
                    return
                  editor.finishTyping(object.text)
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    event.preventDefault()
                    editor.finishTyping(null)
                  } else if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault()
                    editor.finishTyping(object.text)
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                className="absolute top-0 left-0 origin-top-left resize-none overflow-hidden border-0 bg-white p-0 [overflow-wrap:anywhere] whitespace-pre-wrap outline-1 outline-primary select-text [font-kerning:none] [font-variant-ligatures:none]"
                style={{
                  width: object.box.width * grow,
                  height: object.box.height * grow,
                  transform: grow > 1 ? `scale(${1 / grow})` : undefined,
                  fontFamily: `"${screenFamily(fontKey(object))}"`,
                  fontSize: object.size * grow,
                  lineHeight: LINE_HEIGHT,
                  color: cssColour(object.colour),
                  textAlign: object.comb
                    ? "left"
                    : object.align === "centre"
                      ? "center"
                      : object.align,
                  ...(object.comb
                    ? {
                        letterSpacing: apart,
                        paddingLeft: Math.max(0, apart / 2),
                        whiteSpace: "pre" as const,
                      }
                    : null),
                  outlineWidth: grow / scale,
                }}
              />
            </div>
          )
        })()}
    </div>
  )
}
