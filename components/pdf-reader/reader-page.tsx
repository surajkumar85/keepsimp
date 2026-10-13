"use client"

import {
  createContext,
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { cn } from "cn"
import { drawEdge } from "@/lib/pdf-reader/layout"
import type { Match } from "@/lib/pdf-reader/search"
import {
  placeLine,
  quadBox,
  stretch,
  type PageLink,
  type Placement,
} from "@/lib/pdf-reader/text"
import type { ReaderEntry, ReaderSource } from "./types"

/**
 * Which state of a page is on the screen: the number of the version whose
 * picture was last drawn, or -1 before the first. What lies over a page
 * reads it to know when a change it made can be seen.
 */
export const PageDrawn = createContext(-1)

/** The browser's letters stand in for the page's, unseen, so text can be selected. */
const TEXT_FONT = "sans-serif"

interface PlacedLine extends Placement {
  text: string
  size: number
  /** How much the browser's letters are stretched to end where the page's do. */
  scale: number
}

interface Layer {
  lines: PlacedLine[]
  links: PageLink[]
}

let measurer: CanvasRenderingContext2D | null | undefined

/** How wide the browser would write some text at a size, in the same units. */
function naturalWidth(text: string, size: number) {
  if (measurer === undefined)
    measurer = document.createElement("canvas").getContext("2d")
  if (!measurer) return 0
  measurer.font = `${size}px ${TEXT_FONT}`
  return measurer.measureText(text).width
}

/**
 * One page: its picture, the text laid over it for selecting, the places a
 * search found, and its links. Everything over the picture is placed in the
 * page's own points and scaled with it, so it lines up at any zoom or turn.
 */
export function ReaderPage({
  entry,
  number,
  box,
  turn,
  density,
  limit,
  source,
  matches,
  currentMatch,
  linkTo,
  onLink,
  overlay,
}: {
  entry: ReaderEntry
  /** Its place among the pages, counted from 1. */
  number: number
  /** Where it sits in the column, in screen pixels, after its turn. */
  box: { top: number; left: number; width: number; height: number }
  /** Its whole turn: the one it was given and the one the reader added. */
  turn: number
  /** Screen pixels per CSS pixel, and the most pixels a page is drawn with on its longer side. */
  density: number
  limit: number
  source: ReaderSource
  /** What a search found here, with each match's place in the whole list. */
  matches: (Match & { index: number })[]
  currentMatch: number
  /** The place among the pages that a link to a page of this file leads to; -1 when it is not shown. */
  linkTo: (page: number) => number
  onLink: (to: number) => void
  /** What a tool lays over the page, in the page's own points. Text and links are then out of reach under it. */
  overlay?: ReactNode
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawnOnce = useRef(false)
  /** The size the picture on screen was drawn for. */
  const drawnEdge = useRef(0)
  const [picture, setPicture] = useState<"drawing" | "drawn" | "failed">(
    "drawing"
  )
  const [layer, setLayer] = useState<Layer | null>(null)
  /** The version of the page whose picture is on the screen. */
  const [drawn, setDrawn] = useState(-1)

  const file = entry.kind === "page" ? entry.file : null
  const page = entry.kind === "page" ? entry.page : null
  const version = entry.kind === "page" ? (entry.version ?? 0) : 0
  const sideways = turn % 180 !== 0
  // The page before its turn, in screen pixels.
  const width = sideways ? box.height : box.width
  const height = sideways ? box.width : box.height
  const edge = drawEdge({ width, height }, density, limit)

  useEffect(() => {
    if (file === null || page === null) return
    let alive = true
    let request: number | null = null
    // A page already on screen keeps its picture, stretched, until a zoom settles.
    const timer = setTimeout(
      () => {
        const asked = source.draw(file, page, edge, true)
        request = asked.request
        void asked.promise.then((bitmap) => {
          request = null
          if (!alive) {
            bitmap?.close()
            return
          }
          const target = canvas.current
          if (!bitmap || !target) {
            bitmap?.close()
            if (!drawnOnce.current) setPicture("failed")
            return
          }
          target.width = bitmap.width
          target.height = bitmap.height
          target.getContext("2d")?.drawImage(bitmap, 0, 0)
          bitmap.close()
          drawnOnce.current = true
          drawnEdge.current = edge
          setPicture("drawn")
          setDrawn(version)
        })
      },
      // A zoom waits to settle; a page that changed is drawn again at once.
      drawnOnce.current && drawnEdge.current !== edge ? 160 : 0
    )
    return () => {
      alive = false
      clearTimeout(timer)
      if (request !== null) source.forget([request])
    }
  }, [file, page, edge, source, version])

  useEffect(() => {
    if (file === null || page === null) return
    let alive = true
    const asked = source.text(file, page)
    let waiting = true
    void asked.promise.then((text) => {
      waiting = false
      if (!alive || !text) return
      setLayer({
        lines: text.lines.map((line) => {
          const placed = placeLine(line)
          return {
            ...placed,
            text: line.text,
            size: line.size,
            scale: stretch(naturalWidth(line.text, line.size), placed.length),
          }
        }),
        links: text.links,
      })
    })
    return () => {
      alive = false
      if (waiting) source.forget([asked.request])
    }
  }, [file, page, source, version])

  const state = entry.kind === "blank" ? "drawn" : picture
  return (
    <div
      role="group"
      aria-roledescription="page"
      aria-label={`Page ${number}: ${entry.label}`}
      data-testid="reader-page"
      data-page={number}
      data-state={state}
      data-drawn={drawn < 0 ? undefined : drawn}
      data-text={layer ? layer.lines.length : undefined}
      className="absolute bg-background shadow-md ring-1 ring-foreground/10"
      style={box}
    >
      <div
        className="absolute"
        style={{
          left: (box.width - width) / 2,
          top: (box.height - height) / 2,
          width,
          height,
          transform: turn ? `rotate(${turn}deg)` : undefined,
        }}
      >
        {entry.kind === "blank" ? (
          <span className="flex size-full items-center justify-center text-sm text-muted-foreground">
            Blank page
          </span>
        ) : (
          <>
            <canvas
              ref={canvas}
              aria-hidden="true"
              hidden={state !== "drawn"}
              className="block size-full"
            />
            {state !== "drawn" && (
              <p className="flex size-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                {state === "drawing"
                  ? "Drawing the page…"
                  : "This page could not be drawn."}
              </p>
            )}
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{
                width: entry.size.width,
                height: entry.size.height,
                transform: `scale(${width / entry.size.width}, ${height / entry.size.height})`,
              }}
            >
              {matches.flatMap((match) =>
                match.quads.map((quad, at) => (
                  <span
                    key={`${match.index}-${at}`}
                    aria-hidden="true"
                    data-testid="reader-match"
                    data-current={match.index === currentMatch || undefined}
                    className={cn(
                      "absolute mix-blend-multiply",
                      match.index === currentMatch
                        ? "bg-primary/60"
                        : "bg-primary/25"
                    )}
                    style={quadBox(quad)}
                  />
                ))
              )}
              {layer && (
                <div
                  data-testid="reader-text"
                  className="absolute inset-0 cursor-text leading-none text-transparent select-text selection:bg-primary/30"
                  style={{ fontFamily: TEXT_FONT }}
                >
                  {layer.lines.map((line, at) => (
                    <Fragment key={at}>
                      <span
                        className="absolute origin-top-left whitespace-pre"
                        style={{
                          left: line.left,
                          top: line.top,
                          height: line.height,
                          lineHeight: `${line.height}px`,
                          fontSize: line.size,
                          transform: `rotate(${line.angle}deg) scaleX(${line.scale})`,
                        }}
                      >
                        {line.text}
                      </span>
                      <br />
                    </Fragment>
                  ))}
                </div>
              )}
              {layer?.links.map((link, at) => {
                const to = linkTo(link.page)
                if (to < 0) return null
                const [left, top, right, bottom] = link.rect
                return (
                  <button
                    key={at}
                    type="button"
                    aria-label={`Go to page ${to + 1}`}
                    data-testid="reader-link"
                    onClick={() => onLink(to)}
                    className="absolute cursor-pointer rounded-sm outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      left,
                      top,
                      width: right - left,
                      height: bottom - top,
                    }}
                  />
                )
              })}
              <PageDrawn.Provider value={drawn}>{overlay}</PageDrawn.Provider>
            </div>
            {layer && layer.lines.length === 0 && (
              <p className="sr-only">
                This page has no text that can be read out or selected. It may
                be a scan.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
