"use client"

import { useEffect, useRef, useState } from "react"
import { Tabs } from "@base-ui/react/tabs"
import { IconChevronRight } from "@tabler/icons-react"
import { cn } from "cn"
import type { Bookmark } from "@/lib/pdf-merger/outline"
import type { ReaderEntry, ReaderSource } from "./types"

/** The height of one row of the page strip, in pixels, and the picture's longest side. */
const ROW = 176
const THUMB = 132
/** Rows drawn beyond the strip's edges, so scrolling does not show gaps. */
const SPARE = 3

/**
 * A small picture of a page, drawn when it is first shown and again when
 * the page changes.
 * @param edge The longest side of the picture, in pixels.
 */
export function PageThumb({
  entry,
  turn,
  source,
  edge = THUMB,
}: {
  entry: ReaderEntry
  turn: number
  source: ReaderSource
  edge?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)
  const file = entry.kind === "page" ? entry.file : null
  const page = entry.kind === "page" ? entry.page : null
  const version = entry.kind === "page" ? (entry.version ?? 0) : 0
  useEffect(() => {
    if (file === null || page === null) return
    let alive = true
    // Small pictures wait behind the pages being read.
    const asked = source.draw(file, page, edge * 2, false)
    let waiting = true
    void asked.promise.then((bitmap) => {
      waiting = false
      const target = canvas.current
      if (!alive || !bitmap || !target) {
        bitmap?.close()
        return
      }
      target.width = bitmap.width
      target.height = bitmap.height
      target.getContext("2d")?.drawImage(bitmap, 0, 0)
      bitmap.close()
      setDrawn(true)
    })
    return () => {
      alive = false
      if (waiting) source.forget([asked.request])
    }
  }, [file, page, source, version, edge])
  const sideways = turn % 180 !== 0
  const shape = sideways
    ? { width: entry.size.height, height: entry.size.width }
    : entry.size
  const scale = edge / Math.max(shape.width, shape.height, 1)
  return (
    <span
      className="flex items-center justify-center"
      style={{ width: edge, height: edge }}
    >
      <span
        className="flex items-center justify-center bg-background shadow-sm ring-1 ring-foreground/10"
        style={{ width: shape.width * scale, height: shape.height * scale }}
      >
        {entry.kind === "page" && (
          <canvas
            ref={canvas}
            aria-hidden="true"
            hidden={!drawn}
            style={{
              width: entry.size.width * scale,
              height: entry.size.height * scale,
              transform: turn ? `rotate(${turn}deg)` : undefined,
            }}
            className="max-w-none shrink-0"
          />
        )}
      </span>
    </span>
  )
}

/** Every page as a small picture. Only the rows near the screen exist. */
function PageStrip({
  entries,
  turnOf,
  current,
  source,
  onPick,
}: {
  entries: ReaderEntry[]
  turnOf: (entry: ReaderEntry) => number
  current: number
  source: ReaderSource
  onPick: (index: number) => void
}) {
  const strip = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 600 })
  useEffect(() => {
    const element = strip.current
    if (!element) return
    const measure = () =>
      setView({ top: element.scrollTop, height: element.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // Keep the page being read in sight.
  useEffect(() => {
    const element = strip.current
    if (!element) return
    const top = current * ROW
    if (top < element.scrollTop) element.scrollTop = top
    else if (top + ROW > element.scrollTop + element.clientHeight)
      element.scrollTop = top + ROW - element.clientHeight
  }, [current])
  const first = Math.max(0, Math.floor(view.top / ROW) - SPARE)
  const last = Math.min(
    entries.length - 1,
    Math.ceil((view.top + view.height) / ROW) + SPARE
  )
  const rows = []
  for (let index = first; index <= last; index++) {
    const entry = entries[index]
    rows.push(
      <li
        key={entry.key}
        className="absolute inset-x-0 flex justify-center"
        style={{ top: index * ROW, height: ROW }}
      >
        <button
          type="button"
          aria-label={`Page ${index + 1}`}
          aria-current={index === current ? "page" : undefined}
          data-testid="reader-thumb"
          onClick={() => onPick(index)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg p-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
            index === current && "bg-primary/10 ring-1 ring-primary"
          )}
        >
          <PageThumb entry={entry} turn={turnOf(entry)} source={source} />
          <span className="font-mono text-xs text-muted-foreground">
            {index + 1}
          </span>
        </button>
      </li>
    )
  }
  return (
    <div
      ref={strip}
      className="h-full overflow-y-auto"
      onScroll={(event) => {
        const element = event.currentTarget
        setView({ top: element.scrollTop, height: element.clientHeight })
      }}
    >
      <ol
        aria-label="Pages"
        className="relative"
        style={{ height: entries.length * ROW }}
      >
        {rows}
      </ol>
    </div>
  )
}

function BookmarkItem({
  bookmark,
  depth,
  indexOf,
  onPick,
}: {
  bookmark: Bookmark
  depth: number
  indexOf: (page: number) => number
  onPick: (index: number) => void
}) {
  const [open, setOpen] = useState(bookmark.open || depth === 0)
  const to = bookmark.page === null ? -1 : indexOf(bookmark.page)
  const title = bookmark.title.trim() || "Untitled"
  return (
    <li>
      <div className="flex items-start">
        {bookmark.children.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} what is under ${title}`}
            onClick={() => setOpen(!open)}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:size-9"
          >
            <IconChevronRight
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform duration-150 motion-reduce:transition-none",
                open && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="size-11 shrink-0 md:size-9" />
        )}
        {to >= 0 ? (
          <button
            type="button"
            data-testid="reader-bookmark"
            onClick={() => onPick(to)}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
          >
            <span className="min-w-0 break-words">{title}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {to + 1}
            </span>
          </button>
        ) : (
          <span className="flex min-h-11 min-w-0 flex-1 items-center px-2 py-1.5 text-sm text-muted-foreground md:min-h-9">
            <span className="min-w-0 break-words">{title}</span>
          </span>
        )}
      </div>
      {open && bookmark.children.length > 0 && (
        <ul className="ml-4 border-l pl-1">
          {bookmark.children.map((child, at) => (
            <BookmarkItem
              key={at}
              bookmark={child}
              depth={depth + 1}
              indexOf={indexOf}
              onPick={onPick}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export type SidebarTab = "pages" | "bookmarks"

const tabClass =
  "inline-flex h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:h-9 data-active:bg-background data-active:text-foreground"

/** The panel beside the pages: every page small, and the file's bookmarks. */
export function ReaderSidebar({
  entries,
  turnOf,
  current,
  bookmarks,
  indexOf,
  source,
  onPick,
  tab,
  onTab,
}: {
  /** Which of the two lists is shown; kept by the reader, so it survives the panel closing. */
  tab: SidebarTab
  onTab: (tab: SidebarTab) => void
  entries: ReaderEntry[]
  turnOf: (entry: ReaderEntry) => number
  current: number
  /** Null when what is read is not one file, so has no bookmarks of its own. */
  bookmarks: Bookmark[] | null
  /** The place among the pages of a page of the file; -1 when it is not shown. */
  indexOf: (page: number) => number
  source: ReaderSource
  onPick: (index: number) => void
}) {
  return (
    <Tabs.Root
      value={bookmarks ? tab : "pages"}
      onValueChange={(value) => onTab(value as SidebarTab)}
      className="flex h-full min-h-0 flex-col"
    >
      {bookmarks && (
        <Tabs.List
          aria-label="Side panel"
          className="m-2 flex gap-1 rounded-lg border bg-muted/40 p-1"
        >
          <Tabs.Tab value="pages" className={tabClass}>
            Pages
          </Tabs.Tab>
          <Tabs.Tab value="bookmarks" className={tabClass}>
            Bookmarks
          </Tabs.Tab>
        </Tabs.List>
      )}
      <Tabs.Panel value="pages" className="min-h-0 flex-1 outline-none">
        <PageStrip
          entries={entries}
          turnOf={turnOf}
          current={current}
          source={source}
          onPick={onPick}
        />
      </Tabs.Panel>
      {bookmarks && (
        <Tabs.Panel
          value="bookmarks"
          className="min-h-0 flex-1 overflow-y-auto p-2 outline-none"
        >
          {bookmarks.length ? (
            <ul aria-label="Bookmarks">
              {bookmarks.map((bookmark, at) => (
                <BookmarkItem
                  key={at}
                  bookmark={bookmark}
                  depth={0}
                  indexOf={indexOf}
                  onPick={onPick}
                />
              ))}
            </ul>
          ) : (
            <p className="p-2 text-sm text-muted-foreground">
              This file has no bookmarks.
            </p>
          )}
        </Tabs.Panel>
      )}
    </Tabs.Root>
  )
}
