"use client"

import { useEffect, useRef, useState } from "react"
import type { Point } from "@/lib/pdf-editor/geometry"
import {
  LEAST_PART,
  type Cut,
  type PagePicture,
} from "@/lib/pdf-editor/page-pictures"
import { cn } from "cn"
import type { Editor } from "./use-editor"
import type { Inpage } from "./use-inpage"

/** How far a press may wander and still be a press, in pixels of the screen. */
const SLACK = 4
/** The smallest a picture is made by dragging its corner, in points. */
const SMALLEST = 8

/** Follow the pointer from a press to its release, in points of the page. */
export function useDrag(scale: number, onEnd: (by: Point) => void) {
  const from = useRef<Point | null>(null)
  const [by, setBy] = useState<Point | null>(null)
  return {
    by,
    handlers: {
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return
        // The page under it must not take a press here for one of its own.
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        from.current = { x: event.clientX, y: event.clientY }
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        if (!from.current) return
        const next = {
          x: (event.clientX - from.current.x) / scale,
          y: (event.clientY - from.current.y) / scale,
        }
        // A press that hardly moves is a press, not a drag.
        if (by || Math.hypot(next.x, next.y) * scale > SLACK) setBy(next)
      },
      onPointerUp: () => {
        from.current = null
        if (!by) return
        onEnd(by)
        // The click that ends a drag is not a press; after it, the frame
        // goes back until the page shows the picture where the file has it.
        setTimeout(() => setBy(null))
      },
      onPointerCancel: () => {
        from.current = null
        setBy(null)
      },
    },
  }
}

const SIDES = ["left", "top", "right", "bottom"] as const
type Side = (typeof SIDES)[number]

/** One edge of the frame a picture is cut to: dragged inwards, or moved with the arrow keys. */
function Edge({
  side,
  picture,
  cut,
  onCut,
  onDone,
}: {
  side: Side
  picture: PagePicture
  cut: Cut
  onCut: (cut: Cut) => void
  /** Enter on an edge cuts the picture to what is framed. */
  onDone: () => void
}) {
  const across = side === "left" || side === "right"
  const { box } = picture
  const length = across ? box.width : box.height
  const opposite = {
    left: "right",
    right: "left",
    top: "bottom",
    bottom: "top",
  }[side] as Side
  /** The edge so far in from its side, as a share of the picture; never past the edge across from it. */
  const set = (share: number) =>
    onCut({
      ...cut,
      [side]: Math.min(Math.max(0, share), 1 - cut[opposite] - LEAST_PART),
    })
  const inwards = side === "left" || side === "top" ? 1 : -1
  return (
    <button
      type="button"
      data-hold
      data-testid={`editor-cut-${side}`}
      // The keyboard goes to the frame when a picture is to be cut, so that it can be cut without a pointer.
      autoFocus={side === "left"}
      aria-label={`The ${side} edge of what is to show`}
      title="Drag inwards, or use the arrow keys"
      className={cn(
        "absolute z-10 flex touch-none items-center justify-center outline-none",
        across ? "cursor-ew-resize" : "cursor-ns-resize"
      )}
      style={
        across
          ? {
              top: cut.top * box.height,
              bottom: cut.bottom * box.height,
              [side]: cut[side] * box.width - 14,
              width: 28,
            }
          : {
              left: cut.left * box.width,
              right: cut.right * box.width,
              [side]: cut[side] * box.height - 14,
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
          ? (event.clientX - rect.left) / rect.width
          : (event.clientY - rect.top) / rect.height
        set(inwards > 0 ? at : 1 - at)
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const step = ((event.shiftKey ? 10 : 1) / length) * inwards
        const keys: Record<string, number> = across
          ? { ArrowRight: step, ArrowLeft: -step }
          : { ArrowDown: step, ArrowUp: -step }
        if (event.key === "Enter") {
          event.preventDefault()
          event.stopPropagation()
          onDone()
          return
        }
        if (!(event.key in keys)) return
        event.preventDefault()
        event.stopPropagation()
        set(cut[side] + keys[event.key])
      }}
    >
      <span
        className={cn(
          "block rounded-full bg-primary ring-1 ring-white focus-visible:ring-2",
          across ? "h-8 max-h-full w-1.5" : "h-1.5 w-8 max-w-full"
        )}
      />
    </button>
  )
}

/** One picture of the page: pressed to choose it, dragged to move it. */
function PictureSpot({
  inpage,
  page,
  picture,
  number,
  scale,
  stale,
}: {
  inpage: Inpage
  page: number
  picture: PagePicture
  /** Which picture of the page it is, from 1. */
  number: number
  scale: number
  /** The page is being read again: where the picture is may no longer be true, and nothing is done to it until it is known. */
  stale: boolean
}) {
  const { box } = picture
  const chosen =
    inpage.chosen?.page === page &&
    inpage.chosen.picture.index === picture.index
      ? inpage.chosen
      : null
  const cut = chosen?.cut ?? null
  const drag = useDrag(scale, (by) => !stale && inpage.move(page, picture, by))
  const corner = useDrag(
    scale,
    (by) =>
      !stale &&
      inpage.resize(
        page,
        picture,
        Math.max(SMALLEST, box.width + by.x) / box.width
      )
  )
  const grown = corner.by
    ? Math.max(SMALLEST, box.width + corner.by.x) / box.width
    : 1

  return (
    <div
      className="absolute"
      style={{
        left: box.x + (drag.by?.x ?? 0),
        top: box.y + (drag.by?.y ?? 0),
        width: box.width * grown,
        height: box.height * grown,
      }}
    >
      <button
        type="button"
        data-hold
        data-testid="editor-picture"
        data-box={[box.x, box.y, box.width, box.height]
          .map((value) => Math.round(value))
          .join(",")}
        data-chosen={chosen ? "true" : undefined}
        aria-busy={stale || undefined}
        aria-pressed={Boolean(chosen)}
        aria-label={`Picture ${number} of the page, ${picture.width} by ${picture.height} dots${picture.cut ? ", cut to a part" : ""}`}
        title="Choose this picture, or drag it somewhere else"
        className={cn(
          // A frame that shows on light paper and on a dark picture alike.
          "absolute inset-0 touch-none rounded-xs ring-1 ring-white/60 outline-1 outline-primary/70 outline-dashed ring-inset hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary",
          cut ? "cursor-default" : "cursor-move",
          chosen && "outline-2 outline-primary outline-solid",
          drag.by && "cursor-grabbing bg-primary/10"
        )}
        {...(cut ? {} : drag.handlers)}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          // A drag ends in a click as well; it was a drag.
          if (drag.by) return
          inpage.choose(page, picture)
        }}
        onKeyDown={(event) => {
          if (cut || stale) return
          const far = event.shiftKey ? 10 : 1
          const by: Record<string, Point> = {
            ArrowLeft: { x: -far, y: 0 },
            ArrowRight: { x: far, y: 0 },
            ArrowUp: { x: 0, y: -far },
            ArrowDown: { x: 0, y: far },
          }
          const taken = event.key === "Delete" || event.key === "Backspace"
          const size = { "+": 1.1, "=": 1.1, "-": 1 / 1.1 }[event.key]
          if (!taken && !by[event.key] && !size) return
          event.preventDefault()
          event.stopPropagation()
          if (taken) inpage.takeOut(page, picture)
          else if (size) inpage.resize(page, picture, size)
          else inpage.move(page, picture, by[event.key])
        }}
      />
      {chosen && !cut && (
        <span
          role="presentation"
          data-hold
          data-testid="editor-picture-corner"
          title="Drag to change its size"
          className="absolute -right-2 -bottom-2 z-10 size-4 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-primary shadow-sm"
          {...corner.handlers}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {cut && (
        <>
          {/* What will be hidden, dimmed. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              boxShadow: "inset 0 0 0 9999px rgb(0 0 0 / 0.45)",
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${cut.left * 100}% ${cut.top * 100}%, ${cut.left * 100}% ${(1 - cut.bottom) * 100}%, ${(1 - cut.right) * 100}% ${(1 - cut.bottom) * 100}%, ${(1 - cut.right) * 100}% ${cut.top * 100}%, ${cut.left * 100}% ${cut.top * 100}%)`,
            }}
          />
          <span
            aria-hidden="true"
            data-testid="editor-cut-frame"
            className="pointer-events-none absolute outline-2 outline-primary"
            style={{
              left: `${cut.left * 100}%`,
              top: `${cut.top * 100}%`,
              right: `${cut.right * 100}%`,
              bottom: `${cut.bottom * 100}%`,
            }}
          />
          {SIDES.map((side) => (
            <Edge
              key={side}
              side={side}
              picture={picture}
              cut={cut}
              onCut={inpage.setCut}
              onDone={inpage.finishCut}
            />
          ))}
        </>
      )}
    </div>
  )
}

/**
 * The pictures a page already has, each as a place that can be chosen,
 * dragged somewhere else and made larger or smaller. What is done to a
 * picture is done in the file, and the page is drawn again from it.
 */
export function PictureSpots({
  editor,
  inpage,
  page,
  version,
  scale,
}: {
  editor: Editor
  inpage: Inpage
  /** Counted from 0. */
  page: number
  /** How often the page has been drawn again: its pictures are read anew each time. */
  version: number
  /** Screen pixels to a point. */
  scale: number
}) {
  const [read, setRead] = useState<{
    of: string
    pictures: PagePicture[]
  } | null>(null)
  const key = `${page}/${version}`
  const { pagePictures } = editor
  useEffect(() => {
    let stale = false
    void pagePictures(page, version).then(
      (pictures) => !stale && setRead({ of: `${page}/${version}`, pictures })
    )
    return () => {
      stale = true
    }
  }, [pagePictures, page, version])
  // While the page is read again its pictures stay where they were shown,
  // so that the keyboard and what is chosen stay with them; nothing is done
  // to a picture until where it is has been read.
  const pictures = read?.pictures ?? []
  const stale = read?.of !== key
  const { refresh } = inpage
  useEffect(() => {
    if (read) refresh(page, read.pictures)
  }, [read, page, refresh])
  return (
    <>
      {pictures.map((picture) => (
        <PictureSpot
          key={picture.index}
          inpage={inpage}
          page={page}
          picture={picture}
          number={picture.index + 1}
          scale={scale}
          stale={stale}
        />
      ))}
    </>
  )
}
