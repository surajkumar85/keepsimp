"use client"

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react"
import {
  IconArrowAutofitContent,
  IconArrowAutofitWidth,
  IconChevronDown,
  IconChevronUp,
  IconLayoutSidebar,
  IconRotateClockwise2,
  IconSearch,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { Bookmark } from "@/lib/pdf-merger/outline"
import {
  anchorAt,
  currentPage,
  layoutColumn,
  pagesNear,
  parsePageNumber,
  POINT,
  scrollToAnchor,
  scrollToPage,
  stepZoom,
  turned,
  turnedPoint,
  zoomFor,
  zoomLabel,
  type ZoomChoice,
} from "@/lib/pdf-reader/layout"
import {
  addMatches,
  firstFrom,
  matchesOn,
  needleOf,
  searchStatus,
  stepMatch,
  type Match,
} from "@/lib/pdf-reader/search"
import { quadBox } from "@/lib/pdf-reader/text"
import { ReaderPage } from "./reader-page"
import { ReaderSidebar, type SidebarTab } from "./reader-sidebar"
import type { ReaderEntry, ReaderSource } from "./types"

/** What the reader is showing, or about to. */
export type Reading =
  | { state: "opening"; title: string }
  | { state: "failed"; title: string; message: string }
  | {
      state: "ready"
      title: string
      /** A line under the title; without one, the line says which page is being read. */
      subtitle?: string
      entries: ReaderEntry[]
      /** The page to open at, counted from 0. */
      start: number
      /** The bookmarks of the one file being read, and which file that is; null when there is no such file. */
      bookmarks: { file: string; items: Bookmark[] } | null
    }

type Ready = Extract<Reading, { state: "ready" }>

/** Something a tool lets a person do to the page being read, such as cutting after it. */
export interface ReaderAction {
  label: string
  /** The action is in force for this page, as a cut that is already there. */
  pressed: boolean
  icon: ReactNode
  onPress: () => void
}

/**
 * What a tool adds to the window when it does more than read: the editor's
 * tools, and what it lays over each page.
 */
export interface ReaderExtras {
  /** What the window is, for its close button: "reader" unless said otherwise. */
  name?: string
  /** Buttons at the end of the bar. */
  actions?: ReactNode
  /** Rows under the bar. */
  toolbar?: ReactNode
  /** Laid over a page, in the page's own points. `scale` is screen pixels to a point. */
  overlay?: (page: {
    index: number
    entry: ReaderEntry
    scale: number
  }) => ReactNode
  /** The view cannot be turned: what is laid over the pages counts on that. */
  fixed?: boolean
  /** Told which page is being read, counted from 0. */
  onPage?: (index: number) => void
  /** Keys the tool wants before the reader has them. True when it took one. */
  onKey?: (event: KeyboardEvent) => boolean
}

const NO_MATCHES: Match[] = []

const turnOf = (entry: ReaderEntry) =>
  entry.kind === "page" ? entry.rotation : 0

interface Results {
  run: number
  needle: string
  /** The page being read when the search began. */
  from: number
  matches: Match[]
  done: number
  total: number
  withText: number
}

function ReaderBody({
  reading,
  source,
  action,
  extras,
}: {
  reading: Ready
  source: ReaderSource
  action?: (page: number) => ReaderAction | null
  extras?: ReaderExtras
}) {
  const ids = useId()
  const area = useRef<HTMLDivElement>(null)
  const { entries } = reading
  const [room, setRoom] = useState<Size | null>(null)
  const [choice, setChoice] = useState<ZoomChoice>({ fit: "auto" })
  const [turn, setTurn] = useState<Rotation>(0)
  const [scroll, setScroll] = useState(0)
  /** Where the pages should be scrolled to once they are laid out again. */
  const pending = useRef<number | null>(null)
  const frame = useRef(0)
  const [density] = useState(() => Math.min(window.devicePixelRatio || 1, 3))
  // Phones have less memory for large pictures.
  const [limit] = useState(() =>
    matchMedia("(pointer: coarse)").matches ? 2048 : 4096
  )
  const [sidebar, setSidebar] = useState(
    () => matchMedia("(min-width: 1024px)").matches
  )
  const [tab, setTab] = useState<SidebarTab>("pages")
  const [typedPage, setTypedPage] = useState<string | null>(null)

  const sizes = useMemo(
    () => entries.map((entry) => turned(entry.size, turnOf(entry) + turn)),
    [entries, turn]
  )
  const zoom = room ? zoomFor(choice, sizes, room) : 1
  const column = useMemo(() => layoutColumn(sizes, zoom), [sizes, zoom])
  const current = room
    ? currentPage(column, scroll, room.height)
    : reading.start
  const near = room ? pagesNear(column, scroll, room.height, room.height) : null

  const onPage = extras?.onPage
  useEffect(() => {
    onPage?.(current)
  }, [onPage, current])

  /** The first place each page of each file is shown. */
  const places = useMemo(() => {
    const found = new Map<string, number>()
    entries.forEach((entry, index) => {
      if (entry.kind !== "page") return
      const key = `${entry.file}/${entry.page}`
      if (!found.has(key)) found.set(key, index)
    })
    return found
  }, [entries])

  const latest = useRef({ choice, sizes, column, room, current, zoom, turn })
  useEffect(() => {
    latest.current = { choice, sizes, column, room, current, zoom, turn }
  })

  useEffect(() => {
    const element = area.current
    if (!element) return
    // The pages take the keys from the start: arrows and Page Down scroll at once.
    element.focus({ preventScroll: true })
    const observer = new ResizeObserver(() => {
      const next = { width: element.clientWidth, height: element.clientHeight }
      if (!next.width || !next.height) return
      const was = latest.current
      if (was.room?.width === next.width && was.room.height === next.height)
        return
      const after = layoutColumn(
        was.sizes,
        zoomFor(was.choice, was.sizes, next)
      )
      const top = was.room
        ? scrollToAnchor(
            after,
            anchorAt(was.column, element.scrollTop, was.room.height),
            next.height
          )
        : scrollToPage(after, reading.start)
      pending.current = top
      setRoom(next)
      setScroll(top)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
    }
  }, [reading.start])

  useLayoutEffect(() => {
    if (pending.current === null || !area.current) return
    area.current.scrollTop = pending.current
    pending.current = null
  })

  /** Change the zoom or the turn, keeping the middle of the screen where it is. */
  const change = (nextChoice: ZoomChoice, nextTurn: Rotation = turn) => {
    const element = area.current
    if (!element || !room) return
    const nextSizes =
      nextTurn === turn
        ? sizes
        : entries.map((entry) => turned(entry.size, turnOf(entry) + nextTurn))
    const after = layoutColumn(nextSizes, zoomFor(nextChoice, nextSizes, room))
    const top = scrollToAnchor(
      after,
      anchorAt(column, element.scrollTop, room.height),
      room.height
    )
    pending.current = top
    setChoice(nextChoice)
    setTurn(nextTurn)
    setScroll(top)
  }

  const goTo = (index: number) => {
    const element = area.current
    if (!element) return
    const top = scrollToPage(column, index)
    element.scrollTop = top
    setScroll(top)
  }

  /** Go to a page from the side panel, which covers the pages on a small screen. */
  const pick = (index: number) => {
    goTo(index)
    if (!matchMedia("(min-width: 768px)").matches) setSidebar(false)
    area.current?.focus({ preventScroll: true })
  }

  // Searching.
  const searchField = useRef<HTMLInputElement>(null)
  const [searching, setSearching] = useState(false)
  const [typed, setTyped] = useState("")
  const [needle, setNeedle] = useState("")
  const [results, setResults] = useState<Results | null>(null)
  const [picked, setPicked] = useState<Match | null>(null)
  const runs = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setNeedle(needleOf(typed)), 250)
    return () => clearTimeout(timer)
  }, [typed])

  useEffect(() => {
    if (!needle) return
    const run = ++runs.current
    const from = latest.current.current
    // Search from the page being read onwards, then round from the start.
    const order = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.kind === "page")
    const split = order.findIndex(({ index }) => index >= from)
    const turnedOrder =
      split > 0 ? [...order.slice(split), ...order.slice(0, split)] : order
    const search = source.search(
      needle,
      turnedOrder.map(({ entry }) =>
        entry.kind === "page"
          ? { id: entry.file, page: entry.page }
          : { id: "", page: 0 }
      ),
      (news) =>
        setResults((before) => {
          let matches = before?.run === run ? before.matches : NO_MATCHES
          for (const found of news.found)
            matches = addMatches(
              matches,
              turnedOrder[found.at].index,
              found.hits
            )
          return {
            run,
            needle,
            from,
            matches,
            done: news.done,
            total: news.total,
            withText: news.withText,
          }
        })
    )
    return () => search.stop()
  }, [needle, entries, source])

  const live = needle && results?.needle === needle ? results : null
  const matches = live?.matches ?? NO_MATCHES
  const pickedAt = picked ? matches.indexOf(picked) : -1
  const currentMatch = !live
    ? -1
    : pickedAt >= 0
      ? pickedAt
      : firstFrom(matches, live.from)
  const shown = currentMatch >= 0 ? matches[currentMatch] : null
  const finished = live ? live.done >= live.total : false

  // Bring the match being looked at into view.
  useEffect(() => {
    const element = area.current
    const now = latest.current
    if (!shown || !element || !now.room) return
    const entry = entries[shown.page]
    const box = now.column.pages[shown.page]
    if (!entry || !box) return
    const hit = quadBox(shown.quads[0])
    const spot = turnedPoint(
      { x: hit.left + hit.width / 2, y: hit.top + hit.height / 2 },
      entry.size,
      turnOf(entry) + now.turn
    )
    const scale = now.zoom * POINT
    const wide = Math.max(now.column.width, now.room.width)
    element.scrollTop = Math.max(
      0,
      box.top + spot.y * scale - now.room.height / 3
    )
    element.scrollLeft = Math.max(
      0,
      (wide - box.width) / 2 + spot.x * scale - now.room.width / 2
    )
  }, [shown, entries])

  const step = (direction: 1 | -1) => {
    const next = stepMatch(currentMatch, matches.length, direction)
    if (next >= 0) setPicked(matches[next])
  }

  const openSearch = () => {
    setSearching(true)
    searchField.current?.select()
  }
  const closeSearch = () => {
    setSearching(false)
    setTyped("")
    setNeedle("")
    area.current?.focus({ preventScroll: true })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (extras?.onKey?.(event)) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault()
      openSearch()
      return
    }
    const target = event.target as HTMLElement
    if (
      target.closest("input, textarea, [contenteditable]") ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return
    if (event.key === "+" || event.key === "=") {
      event.preventDefault()
      change({ fit: null, zoom: stepZoom(zoom, 1) })
    } else if (event.key === "-") {
      event.preventDefault()
      change({ fit: null, zoom: stepZoom(zoom, -1) })
    } else if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      target === area.current &&
      room &&
      column.width <= room.width
    ) {
      // Nothing to scroll sideways, so the arrows turn pages.
      event.preventDefault()
      goTo(
        Math.min(
          entries.length - 1,
          Math.max(0, current + (event.key === "ArrowRight" ? 1 : -1))
        )
      )
    }
  }

  const wide = Math.max(column.width, room?.width ?? 0)
  const scale = zoom * POINT
  const pageBoxes = []
  if (near)
    for (let index = near.first; index <= near.last; index++) {
      const entry = entries[index]
      const box = column.pages[index]
      pageBoxes.push(
        <ReaderPage
          key={entry.key}
          entry={entry}
          number={index + 1}
          box={{ ...box, left: (wide - box.width) / 2 }}
          turn={(turnOf(entry) + turn) % 360}
          density={density}
          limit={limit}
          source={source}
          matches={matchesOn(matches, index)}
          currentMatch={currentMatch}
          linkTo={(page) =>
            entry.kind === "page"
              ? (places.get(`${entry.file}/${page}`) ?? -1)
              : -1
          }
          onLink={goTo}
          overlay={extras?.overlay?.({ index, entry, scale })}
        />
      )
    }

  const status = searchStatus({
    needle,
    searching: !finished,
    count: matches.length,
    current: currentMatch,
    noText: finished && live?.withText === 0,
  })
  const bookmarkFile = reading.bookmarks?.file
  const tool = action?.(current) ?? null

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={onKeyDown}
      data-testid="reader"
      data-zoom={Math.round(zoom * 100)}
      data-page={current + 1}
      data-ready={room ? "true" : undefined}
      data-scale={scale}
    >
      <header className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={sidebar ? "Hide the side panel" : "Show the side panel"}
          title={sidebar ? "Hide the side panel" : "Show the side panel"}
          aria-pressed={sidebar}
          onClick={() => setSidebar(!sidebar)}
        >
          <IconLayoutSidebar aria-hidden="true" />
        </Button>
        <div className="order-1 min-w-0 flex-1 basis-32 px-1">
          <DialogTitle className="truncate">{reading.title}</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {reading.subtitle ?? entries[current]?.label ?? ""}
          </DialogDescription>
        </div>
        <div className="order-3 flex basis-full flex-wrap items-center justify-between md:order-2 md:basis-auto md:justify-start md:gap-1">
          <div className="flex items-center gap-1.5 pr-1">
            <label htmlFor={`${ids}-page`} className="sr-only">
              Page
            </label>
            <Input
              id={`${ids}-page`}
              inputMode="numeric"
              autoComplete="off"
              value={typedPage ?? String(current + 1)}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setTypedPage(event.target.value)}
              onBlur={() => setTypedPage(null)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                const page = parsePageNumber(
                  event.currentTarget.value,
                  entries.length
                )
                if (page !== null) goTo(page)
                setTypedPage(null)
              }}
              aria-describedby={`${ids}-count`}
              className="w-12 px-1 text-center font-mono md:w-14"
            />
            <span
              id={`${ids}-count`}
              className="text-sm whitespace-nowrap text-muted-foreground max-[359px]:sr-only"
            >
              of {entries.length.toLocaleString("en")}
            </span>
          </div>
          <div role="group" aria-label="Zoom" className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={stepZoom(zoom, -1) >= zoom}
              onClick={() => change({ fit: null, zoom: stepZoom(zoom, -1) })}
            >
              <IconZoomOut aria-hidden="true" />
            </Button>
            <span
              className="hidden w-12 text-center font-mono text-xs text-muted-foreground sm:block"
              data-testid="reader-zoom"
            >
              {zoomLabel(zoom)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={stepZoom(zoom, 1) <= zoom}
              onClick={() => change({ fit: null, zoom: stepZoom(zoom, 1) })}
            >
              <IconZoomIn aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fit the width"
              title="Fit the width"
              aria-pressed={choice.fit === "width"}
              onClick={() => change({ fit: "width" })}
            >
              <IconArrowAutofitWidth aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fit the whole page"
              title="Fit the whole page"
              aria-pressed={choice.fit === "page"}
              onClick={() => change({ fit: "page", page: current })}
              className="max-sm:hidden"
            >
              <IconArrowAutofitContent aria-hidden="true" />
            </Button>
          </div>
          {!extras?.fixed && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Turn the view"
              title="Turn the view"
              onClick={() => change(choice, ((turn + 90) % 360) as Rotation)}
            >
              <IconRotateClockwise2 aria-hidden="true" />
            </Button>
          )}
          {tool && (
            <Button
              variant={tool.pressed ? "default" : "outline"}
              aria-pressed={tool.pressed}
              aria-label={tool.label}
              title={tool.label}
              onClick={tool.onPress}
              data-testid="reader-action"
            >
              {tool.icon}
              <span className="max-xl:sr-only">{tool.label}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search this file"
            title="Search this file"
            aria-pressed={searching}
            onClick={() => (searching ? closeSearch() : openSearch())}
          >
            <IconSearch aria-hidden="true" />
          </Button>
          {extras?.actions}
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              className="order-2 md:order-3"
            />
          }
        >
          <IconX aria-hidden="true" />
          <span className="sr-only">Close the {extras?.name ?? "reader"}</span>
        </DialogClose>
      </header>
      {extras?.toolbar}

      {searching && (
        <div
          role="search"
          className="flex flex-wrap items-center gap-1 border-b p-2 sm:gap-2"
        >
          <label htmlFor={`${ids}-search`} className="sr-only">
            Words to find
          </label>
          <Input
            ref={searchField}
            id={`${ids}-search`}
            type="search"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Find in this file"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
              setPicked(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                step(event.shiftKey ? -1 : 1)
              } else if (event.key === "Escape") {
                // Closes the search, not the reader.
                event.preventDefault()
                event.stopPropagation()
                closeSearch()
              }
            }}
            className="min-w-0 flex-1 basis-24"
          />
          <span
            role="status"
            aria-live="polite"
            data-testid="reader-search-status"
            className="order-last basis-full px-1 text-xs whitespace-nowrap text-muted-foreground empty:hidden sm:order-none sm:min-w-16 sm:basis-auto"
          >
            {status}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous match"
            title="Previous match"
            disabled={matches.length === 0}
            onClick={() => step(-1)}
          >
            <IconChevronUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next match"
            title="Next match"
            disabled={matches.length === 0}
            onClick={() => step(1)}
          >
            <IconChevronDown aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close the search"
            title="Close the search"
            onClick={closeSearch}
          >
            <IconX aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {sidebar && (
          <aside
            aria-label="Pages and bookmarks"
            data-testid="reader-sidebar"
            className="absolute inset-y-0 left-0 z-10 w-56 border-r bg-popover shadow-lg md:static md:w-52 md:shrink-0 md:shadow-none"
          >
            <ReaderSidebar
              tab={tab}
              onTab={setTab}
              entries={entries}
              turnOf={(entry) => (turnOf(entry) + turn) % 360}
              current={current}
              bookmarks={reading.bookmarks?.items ?? null}
              indexOf={(page) => places.get(`${bookmarkFile}/${page}`) ?? -1}
              source={source}
              onPick={pick}
            />
          </aside>
        )}
        <div
          ref={area}
          tabIndex={0}
          role="group"
          aria-label={`Pages of ${reading.title}`}
          data-testid="reader-pages"
          onScroll={() => {
            if (frame.current) return
            frame.current = requestAnimationFrame(() => {
              frame.current = 0
              if (area.current) setScroll(area.current.scrollTop)
            })
          }}
          className={cn(
            "min-w-0 flex-1 [scrollbar-gutter:stable] overflow-auto bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          )}
        >
          <div
            className="relative"
            style={{ width: wide || undefined, height: column.height }}
          >
            {pageBoxes}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A window for reading a PDF: every page in one column, with zoom, a page
 * strip, bookmarks, search and text that can be selected. Pages are drawn
 * and read by the worker that holds the files; nothing leaves the device.
 */
export function PdfReader({
  reading,
  source,
  onClose,
  returnTo,
  action,
  extras,
}: {
  /** Null while the reader is closed. */
  reading: Reading | null
  source: ReaderSource
  onClose: () => void
  /** What can be done to the page being read, counted from 0; null where nothing can. */
  action?: (page: number) => ReaderAction | null
  /**
   * What takes focus when the reader closes: the control that opened it.
   * Safari does not focus a button that is clicked, so it cannot be left to
   * "whatever had focus before".
   */
  returnTo?: RefObject<HTMLElement | null>
  /** What a tool adds when the window is more than a reader. */
  extras?: ReaderExtras
}) {
  // What was last read stays in the window while it closes.
  const [last, setLast] = useState(reading)
  if (reading && reading !== last) setLast(reading)
  const shown = reading ?? last
  return (
    <Dialog
      open={reading !== null}
      onOpenChange={(open, details) => {
        if (open) return
        // In the search field, Escape closes the search and leaves the reader
        // open; so does an Escape that a tool has used for itself.
        if (
          details.reason === "escape-key" &&
          (details.event.defaultPrevented ||
            document.activeElement?.closest("[role=search]"))
        ) {
          details.cancel()
          return
        }
        onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        finalFocus={returnTo}
        className="top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:top-4 sm:left-4 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:rounded-2xl sm:border"
      >
        {shown?.state === "ready" ? (
          <ReaderBody
            reading={shown}
            source={source}
            action={action}
            extras={extras}
          />
        ) : (
          shown && (
            <div
              className="flex min-h-0 flex-1 flex-col"
              data-testid="reader"
              data-state={shown.state}
            >
              <header className="flex items-center gap-2 border-b p-2 pl-4">
                <DialogTitle className="min-w-0 flex-1 truncate">
                  {shown.title}
                </DialogTitle>
                <DialogClose render={<Button variant="ghost" size="icon" />}>
                  <IconX aria-hidden="true" />
                  <span className="sr-only">Close the reader</span>
                </DialogClose>
              </header>
              <DialogDescription
                role={shown.state === "failed" ? "alert" : "status"}
                className="flex flex-1 items-center justify-center bg-muted p-6 text-center"
              >
                {shown.state === "opening" ? "Opening…" : shown.message}
              </DialogDescription>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
