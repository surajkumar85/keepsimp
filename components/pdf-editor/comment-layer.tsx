"use client"

import { useRef, useState } from "react"
import { boundsOfQuads, type Comment } from "@/lib/pdf-editor/comments"
import type { Box, Point } from "@/lib/pdf-editor/geometry"
import { strokePath } from "@/lib/pdf-editor/ink"
import { cssColour } from "@/lib/pdf-editor/styles"
import type { Quad } from "@/lib/pdf-reader/text"
import { cn } from "cn"
import { describeComment, type Comments } from "./use-comments"

const corners = (quad: Quad) =>
  `${quad[0]},${quad[1]} ${quad[2]},${quad[3]} ${quad[6]},${quad[7]} ${quad[4]},${quad[5]}`

/** The places of a comment that can be pressed: each run of marked words, or the whole of anything else. */
function areasOf(comment: Comment): Box[] {
  return comment.quads.length
    ? comment.quads.map((quad) => boundsOfQuads([quad]))
    : [comment.box]
}

/**
 * One comment on its page, as something that can be reached and pressed. A
 * note can be dragged to another place.
 */
function Spot({
  comments,
  comment,
  page,
  scale,
  idle,
}: {
  comments: Comments
  comment: Comment
  page: number
  scale: number
  /** Nothing is being made or moved, so comments answer the pointer. */
  idle: boolean
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const [moved, setMoved] = useState<Point | null>(null)
  const picked = comments.picked?.id === comment.id
  const { box } = comment
  // Room for a finger on what is small, such as a note's icon.
  const pad = Math.max(0, (24 / scale - Math.min(box.width, box.height)) / 2)
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="editor-comment"
      data-kind={comment.kind}
      data-id={comment.id}
      data-picked={picked || undefined}
      aria-label={describeComment(comment, comments.quotes[comment.id])}
      aria-pressed={picked}
      onFocus={() => {
        if (!picked) comments.pick(page, comment.id)
      }}
      className="pointer-events-none absolute rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        left: box.x + (moved?.x ?? 0),
        top: box.y + (moved?.y ?? 0),
        width: box.width,
        height: box.height,
      }}
    >
      {areasOf(comment).map((area, at) => (
        <span
          key={at}
          data-hold
          className={cn(
            "absolute touch-none",
            idle && "pointer-events-auto cursor-pointer",
            comment.kind === "note" && idle && "cursor-grab"
          )}
          style={{
            left: area.x - box.x - pad,
            top: area.y - box.y - pad,
            width: area.width + pad * 2,
            height: area.height + pad * 2,
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            // The page under it must not take this for a press of its own.
            event.stopPropagation()
            comments.pick(page, comment.id)
            if (comment.kind !== "note") return
            event.currentTarget.setPointerCapture(event.pointerId)
            start.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerMove={(event) => {
            if (!start.current) return
            const by = {
              x: (event.clientX - start.current.x) / scale,
              y: (event.clientY - start.current.y) / scale,
            }
            // A press that hardly moves is a press, not a drag.
            if (moved || Math.hypot(by.x, by.y) * scale > 4) setMoved(by)
          }}
          onPointerUp={() => {
            start.current = null
            if (!moved) return
            const by = moved
            // The note stays where it was let go until the file has moved it.
            void comments
              .move(page, comment.id, by)
              .finally(() => setMoved(null))
          }}
          onPointerCancel={() => {
            start.current = null
            setMoved(null)
          }}
          onDoubleClick={() => comments.setListed(true)}
        />
      ))}
    </div>
  )
}

/** Every comment of a page as a place that can be reached, under the things the editor adds. */
export function CommentSpots({
  comments,
  list,
  page,
  scale,
  idle,
}: {
  comments: Comments
  list: readonly Comment[]
  /** Counted from 0. */
  page: number
  scale: number
  idle: boolean
}) {
  return list.map((comment) => (
    <Spot
      key={comment.id}
      comments={comments}
      comment={comment}
      page={page}
      scale={scale}
      idle={idle}
    />
  ))
}

/**
 * Drawn over a page, inside its picture's own SVG: the frame of the comment
 * that is picked, and what a drag with a comment tool is about to make.
 */
export function CommentMarks({
  comments,
  list,
  page,
}: {
  comments: Comments
  list: readonly Comment[]
  page: number
}) {
  const { marking, tool, styles, preview } = comments
  const picked =
    comments.picked?.page === page
      ? list.find((comment) => comment.id === comments.picked?.id)
      : undefined
  const frame = "fill-none stroke-primary [vector-effect:non-scaling-stroke]"
  return (
    <>
      {picked &&
        (picked.quads.length ? (
          picked.quads.map((quad, at) => (
            <polygon
              key={at}
              points={corners(quad)}
              className={frame}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ))
        ) : (
          <rect
            {...picked.box}
            className={frame}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ))}
      {marking?.page === page &&
        tool &&
        (tool === "pen" ? (
          <path
            d={strokePath(marking.points)}
            fill="none"
            stroke={cssColour(styles.colours.pen)}
            strokeOpacity={0.45}
            strokeWidth={styles.weight}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          preview.map((quad, at) => (
            <polygon
              key={at}
              points={corners(quad)}
              fill={cssColour(styles.colours[tool])}
              fillOpacity={0.35}
            />
          ))
        ))}
    </>
  )
}
