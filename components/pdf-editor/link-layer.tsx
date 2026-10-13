"use client"

import { useEffect, useRef, useState } from "react"
import type { Box, Point } from "@/lib/pdf-editor/geometry"
import { linkName, SMALLEST_LINK, type PageLink } from "@/lib/pdf-editor/links"
import { cn } from "cn"
import { useDrag } from "./picture-layer"
import type { Editor } from "./use-editor"
import type { Links } from "./use-links"

/** One link of the page, or the one that is being made: pressed to choose it, dragged to move it. */
function LinkSpot({
  links,
  page,
  link,
  box,
  scale,
  stale,
}: {
  links: Links
  page: number
  /** Null for the link that is being made. */
  link: PageLink | null
  box: Box
  scale: number
  /** The page is being read again: nothing is done to the link until where it is has been read. */
  stale: boolean
}) {
  const chosen =
    links.chosen?.page === page &&
    (link ? links.chosen.link?.index === link.index : !links.chosen.link)
  const drag = useDrag(
    scale,
    (by) =>
      !stale &&
      links.place(page, link, { ...box, x: box.x + by.x, y: box.y + by.y })
  )
  const corner = useDrag(
    scale,
    (by) =>
      !stale &&
      links.place(page, link, {
        ...box,
        width: Math.max(SMALLEST_LINK, box.width + by.x),
        height: Math.max(SMALLEST_LINK, box.height + by.y),
      })
  )
  return (
    <div
      className="absolute"
      style={{
        left: box.x + (drag.by?.x ?? 0),
        top: box.y + (drag.by?.y ?? 0),
        width: Math.max(SMALLEST_LINK, box.width + (corner.by?.x ?? 0)),
        height: Math.max(SMALLEST_LINK, box.height + (corner.by?.y ?? 0)),
      }}
    >
      <button
        type="button"
        data-hold
        data-testid={link ? "editor-link" : "editor-new-link"}
        data-box={[box.x, box.y, box.width, box.height]
          .map((value) => Math.round(value))
          .join(",")}
        aria-pressed={chosen}
        aria-busy={stale || undefined}
        aria-label={
          link ? linkName(link.to) : "A new link, not in the file yet"
        }
        title={
          link
            ? "Choose this link, or drag it somewhere else"
            : "Type where it leads, in the bar"
        }
        className={cn(
          // A frame that shows on light paper and on a dark picture alike.
          "absolute inset-0 cursor-move touch-none rounded-xs bg-primary/10 ring-1 ring-white/60 outline-1 outline-primary/70 outline-dashed ring-inset hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary",
          chosen && "outline-2 outline-primary outline-solid",
          drag.by && "cursor-grabbing"
        )}
        {...drag.handlers}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          // A drag ends in a click as well; it was a drag.
          if (drag.by || !link) return
          links.choose(page, link)
        }}
        onKeyDown={(event) => {
          if (stale) return
          const far = event.shiftKey ? 10 : 1
          const by: Record<string, Point> = {
            ArrowLeft: { x: -far, y: 0 },
            ArrowRight: { x: far, y: 0 },
            ArrowUp: { x: 0, y: -far },
            ArrowDown: { x: 0, y: far },
          }
          const taken = event.key === "Delete" || event.key === "Backspace"
          if (!taken && !by[event.key]) return
          event.preventDefault()
          event.stopPropagation()
          if (taken) links.takeAway(page, link)
          else
            links.place(page, link, {
              ...box,
              x: box.x + by[event.key].x,
              y: box.y + by[event.key].y,
            })
        }}
      />
      {chosen && (
        <span
          role="presentation"
          data-hold
          data-testid="editor-link-corner"
          title="Drag to change its size"
          className="absolute -right-2 -bottom-2 z-10 size-4 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-primary shadow-sm"
          {...corner.handlers}
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </div>
  )
}

/**
 * The links of a page, each as a place that can be chosen and dragged
 * somewhere else, and the page itself as a place where a box can be drawn
 * for a new one.
 */
export function LinkSpots({
  editor,
  links,
  page,
  version,
  scale,
}: {
  editor: Editor
  links: Links
  /** Counted from 0. */
  page: number
  /** How often the page has been drawn again: its links are read anew each time. */
  version: number
  /** Screen pixels to a point. */
  scale: number
}) {
  const [read, setRead] = useState<{ of: string; links: PageLink[] } | null>(
    null
  )
  const key = `${page}/${version}`
  const { pageLinks } = editor
  useEffect(() => {
    let stale = false
    void pageLinks(page, version).then(
      (found) => !stale && setRead({ of: `${page}/${version}`, links: found })
    )
    return () => {
      stale = true
    }
  }, [pageLinks, page, version])
  // While the page is read again its links stay where they were shown, so
  // that the keyboard and what is chosen stay with them.
  const list = read?.links ?? []
  const stale = read?.of !== key
  const { refresh } = links
  useEffect(() => {
    if (read) refresh(page, read.links)
  }, [read, page, refresh])

  /** A box that is being drawn for a new link, in points of the page. */
  const from = useRef<Point | null>(null)
  const [drawn, setDrawn] = useState<Box | null>(null)
  const at = (event: React.PointerEvent<HTMLElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    }
  }
  const making =
    links.chosen?.page === page && !links.chosen.link ? links.chosen : null

  return (
    <>
      <div
        data-testid="editor-link-surface"
        className="absolute inset-0 cursor-crosshair touch-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          // The page under it must not take a press here for one of its own.
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          from.current = at(event)
          links.deselect()
        }}
        onPointerMove={(event) => {
          if (!from.current) return
          const to = at(event)
          setDrawn({
            x: Math.min(from.current.x, to.x),
            y: Math.min(from.current.y, to.y),
            width: Math.abs(to.x - from.current.x),
            height: Math.abs(to.y - from.current.y),
          })
        }}
        onPointerUp={() => {
          from.current = null
          const box = drawn
          setDrawn(null)
          // A press that hardly moved drew nothing.
          if (
            box &&
            box.width >= SMALLEST_LINK * 2 &&
            box.height >= SMALLEST_LINK
          )
            links.begin(page, box)
        }}
        onPointerCancel={() => {
          from.current = null
          setDrawn(null)
        }}
      />
      {drawn && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xs bg-primary/10 outline-1 outline-primary outline-dashed"
          style={{
            left: drawn.x,
            top: drawn.y,
            width: drawn.width,
            height: drawn.height,
          }}
        />
      )}
      {list.map((link) => (
        <LinkSpot
          key={link.index}
          links={links}
          page={page}
          link={link}
          box={link.box}
          scale={scale}
          stale={stale}
        />
      ))}
      {making && (
        <LinkSpot
          key="new"
          links={links}
          page={page}
          link={null}
          box={making.box}
          scale={scale}
          stale={false}
        />
      )}
    </>
  )
}
