"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import {
  IconArrowLeft,
  IconArrowRight,
  IconCopy,
  IconFilePlus,
  IconRotate,
  IconRotateClockwise,
  IconSelectAll,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { PageThumb } from "@/components/pdf-reader/reader-sidebar"
import type { ReaderSource } from "@/components/pdf-reader/types"
import { pagesNamed } from "@/lib/pdf-editor/pages"
import { cn } from "cn"
import type { Editor } from "./use-editor"
import type { Pages } from "./use-pages"

/** The least width of one page in the list and its height, in pixels, and the longest side of its picture. */
const TILE = 132
const ROW = 156
const PICTURE = 104
/** The room left round each page in the list. */
const GAP = 3
/** Rows drawn beyond the edges of what is seen, so that scrolling shows no gaps. */
const SPARE = 2
/** How far a pointer has to move before a press is a drag, and how near an edge it scrolls the list. */
const SLACK = 6
const EDGE = 36

/**
 * The pages of the file as a list beside them: each a small picture that
 * can be chosen, dragged to another place, turned, copied or taken out,
 * with an empty page added where it is wanted.
 */
export function PagesPanel({
  editor,
  pages,
  source,
  file,
  name,
  onGo,
}: {
  editor: Editor
  pages: Pages
  source: ReaderSource
  /** The file's key with the worker, and its name. */
  file: string
  name: string
  /** Show a page in the reader. */
  onGo: (page: number) => void
}) {
  const ids = useId()
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 400, width: 288 })
  /** A press that may become a drag, and where the pages would be put. */
  const pressed = useRef<{ page: number; x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const [dropAt, setDropAt] = useState<number | null>(null)
  /** The keyboard is to be on the page it stands on, once that page is drawn. */
  const wanted = useRef(false)
  const [place, setPlace] = useState("")
  const { count, chosen, cursor } = pages
  const columns = Math.max(1, Math.floor(view.width / TILE))
  const wide = view.width / columns
  const rows = Math.ceil(count / columns)

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const measure = () =>
      setView({
        top: element.scrollTop,
        height: element.clientHeight,
        width: element.clientWidth,
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // The page the keyboard is on is kept in sight: also a copy that was just made.
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const top = Math.floor(cursor / columns) * ROW
    // A list lower than one of its rows shows the top of the row.
    if (top < element.scrollTop || ROW >= element.clientHeight)
      element.scrollTop = top
    else if (top + ROW > element.scrollTop + element.clientHeight)
      element.scrollTop = top + ROW - element.clientHeight
  }, [cursor, columns, count])

  // It has the keyboard when that was asked for, once it is drawn.
  useEffect(() => {
    const element = scroller.current
    if (!element || !wanted.current) return
    const take = () => {
      const tile = element.querySelector<HTMLElement>(`[data-page="${cursor}"]`)
      if (!tile || !wanted.current) return false
      tile.focus({ preventScroll: true })
      return true
    }
    // Now, and again once the window has done with a page that went away:
    // it puts the keyboard on itself a moment after losing it.
    take()
    let later = requestAnimationFrame(() => {
      take()
      later = requestAnimationFrame(() => {
        if (take()) wanted.current = false
      })
    })
    return () => cancelAnimationFrame(later)
  })

  const go = (page: number, how: "only" | "also" | "through" = "only") => {
    wanted.current = true
    pages.press(Math.max(0, Math.min(count - 1, page)), how)
  }
  /** Do something to the chosen pages from the keyboard, and keep the keyboard in the list. */
  const keep = (work: () => unknown) => {
    wanted.current = true
    void work()
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = event.ctrlKey || event.metaKey
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      ArrowDown: columns,
      Home: -count,
      End: count,
    }
    const step = steps[event.key]
    const used = () => {
      event.preventDefault()
      event.stopPropagation()
    }
    if (step !== undefined && event.altKey) {
      // With Alt, the chosen pages themselves go one place on.
      if (Math.abs(step) < count) keep(() => pages.move(step < 0 ? -1 : 1))
      return used()
    }
    if (step !== undefined) {
      const to = Math.max(0, Math.min(count - 1, cursor + step))
      if (command) {
        // With Ctrl or ⌘ the keyboard moves on and nothing is chosen.
        wanted.current = true
        pages.setCursor(to)
      } else go(to, event.shiftKey ? "through" : "only")
      return used()
    }
    if (event.key === " ") {
      go(cursor, "also")
      return used()
    }
    if (event.key === "Enter") {
      onGo(cursor)
      return used()
    }
    const letter = event.key.toLowerCase()
    if (command && letter === "a") {
      pages.chooseAll()
      return used()
    }
    // The list keeps its own keys, so undoing is done from here too.
    if (command && (letter === "z" || letter === "y")) {
      keep(letter === "y" || event.shiftKey ? editor.redo : editor.undo)
      return used()
    }
    if (letter === "m" && !command && !event.altKey) {
      pages.setOn(false)
      return used()
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (chosen.length && !pages.whyNotRemove) keep(pages.remove)
      return used()
    }
    if (event.key === "Escape") {
      // First the choice is let go of, then the list is closed.
      if (chosen.length) pages.chooseNone()
      else pages.setOn(false)
      return used()
    }
  }

  /** Before which page the pointer is, by where it is over the list. */
  const placeAt = (event: PointerEvent) => {
    const element = scroller.current!
    const box = element.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top + element.scrollTop
    const column = Math.max(0, Math.min(columns - 1, Math.floor(x / wide)))
    const row = Math.max(0, Math.floor(y / ROW))
    const before = x - column * wide < wide / 2 ? 0 : 1
    return Math.max(0, Math.min(count, row * columns + column + before))
  }
  const endDrag = () => {
    pressed.current = null
    setDropAt(null)
  }

  const first = Math.max(0, Math.floor(view.top / ROW) - SPARE)
  const last = Math.min(
    rows - 1,
    Math.ceil((view.top + view.height) / ROW) + SPARE
  )
  const tiles = []
  for (let page = first * columns; page < (last + 1) * columns; page++) {
    const size = editor.sizes[page]
    if (!size) break
    const picked = chosen.includes(page)
    tiles.push(
      <div
        key={page}
        role="option"
        aria-selected={picked}
        aria-label={`Page ${page + 1}`}
        tabIndex={page === cursor ? 0 : -1}
        data-page={page}
        data-testid="pages-tile"
        onPointerDown={(event) => {
          // A finger scrolls the list; pages are moved by the buttons then.
          if (event.button !== 0 || event.pointerType === "touch") return
          pressed.current = { page, x: event.clientX, y: event.clientY }
          dragged.current = false
        }}
        onClick={(event) => {
          if (dragged.current) return
          go(
            page,
            event.shiftKey
              ? "through"
              : event.ctrlKey || event.metaKey
                ? "also"
                : "only"
          )
          if (!event.shiftKey && !event.ctrlKey && !event.metaKey) onGo(page)
        }}
        className={cn(
          "absolute flex cursor-default flex-col items-center justify-center gap-1 rounded-lg outline-none select-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          picked && "bg-primary/10 ring-1 ring-primary ring-inset"
        )}
        style={{
          left: (page % columns) * wide + GAP,
          top: Math.floor(page / columns) * ROW + GAP,
          width: wide - GAP * 2,
          height: ROW - GAP * 2,
        }}
      >
        <PageThumb
          entry={{
            kind: "page",
            key: `${file}/${page}`,
            file,
            page,
            rotation: 0,
            size,
            label: `${name}, page ${page + 1}`,
            version: editor.versions[page],
          }}
          turn={0}
          source={source}
          edge={PICTURE}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {page + 1}
        </span>
      </div>
    )
  }

  const act =
    "shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
  const none = chosen.length === 0
  const toPlace = () => {
    const number = Number(place)
    if (!place.trim() || !Number.isInteger(number)) return
    void pages.moveToPlace(number - 1)
    setPlace("")
  }
  // Where the mark for a drag is drawn: before a page, or after the last.
  const mark =
    dropAt === null
      ? null
      : dropAt < count
        ? { page: dropAt, after: false }
        : { page: count - 1, after: true }
  return (
    <aside
      aria-labelledby={`${ids}-title`}
      data-testid="editor-pages"
      className="absolute inset-x-0 bottom-0 z-10 flex h-[70%] flex-col border-t bg-popover shadow-lg md:static md:h-auto md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none"
    >
      <div className="space-y-2 border-b p-2">
        <div className="flex items-center justify-between gap-2">
          <h2
            id={`${ids}-title`}
            className="px-1 font-heading text-sm font-medium"
          >
            Pages{" "}
            <span
              className="font-sans font-normal text-muted-foreground"
              data-testid="pages-count"
            >
              {count.toLocaleString("en")}
            </span>
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close the list of pages"
            title="Close the list of pages"
            onClick={() => pages.setOn(false)}
          >
            <IconX aria-hidden="true" />
          </Button>
        </div>
        <div
          role="toolbar"
          aria-label="Change the chosen pages"
          className="flex items-center gap-0.5 overflow-x-auto"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Turn to the left"
            title="Turn to the left"
            disabled={none}
            onClick={() => void pages.turn(270)}
            className={act}
          >
            <IconRotate aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Turn to the right"
            title="Turn to the right"
            disabled={none}
            onClick={() => void pages.turn(90)}
            className={act}
          >
            <IconRotateClockwise aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Move one place earlier"
            title="Move one place earlier (Alt and an arrow key)"
            disabled={!pages.canMove(-1)}
            onClick={() => void pages.move(-1)}
            className={act}
          >
            <IconArrowLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Move one place later"
            title="Move one place later (Alt and an arrow key)"
            disabled={!pages.canMove(1)}
            onClick={() => void pages.move(1)}
            className={act}
          >
            <IconArrowRight aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Duplicate"
            title="Duplicate: a copy after the last chosen page"
            disabled={none}
            onClick={() => void pages.copy()}
            className={act}
          >
            <IconCopy aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete"
            title={pages.whyNotRemove || "Delete (the Delete key)"}
            disabled={none || Boolean(pages.whyNotRemove)}
            onClick={() => void pages.remove()}
            className={act}
          >
            <IconTrash aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Add a blank page"
            title={
              none
                ? "Add a blank page at the end"
                : "Add a blank page after the last chosen page"
            }
            onClick={() => void pages.addBlank()}
            className={act}
          >
            <IconFilePlus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Choose every page"
            title="Choose every page (Ctrl or ⌘ A)"
            onClick={pages.chooseAll}
            className={act}
          >
            <IconSelectAll aria-hidden="true" />
          </Button>
        </div>
        {!none && count > 1 && (
          <form
            className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
            onSubmit={(event) => {
              event.preventDefault()
              toPlace()
            }}
          >
            <label htmlFor={`${ids}-place`} className="shrink-0">
              Move to place
            </label>
            <input
              id={`${ids}-place`}
              type="number"
              inputMode="numeric"
              min={1}
              max={count}
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              className="h-11 w-20 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
            />
            <Button
              type="submit"
              variant="outline"
              className="h-11 md:h-9"
              disabled={!place.trim()}
            >
              Move
            </Button>
          </form>
        )}
        <p
          role="status"
          className="px-1 text-xs text-muted-foreground"
          data-testid="pages-status"
        >
          {none ? (
            <>
              Press a page to choose it
              <span className="max-md:hidden">
                ; with Shift or Ctrl or ⌘, several. Drag pages to put them
                elsewhere
              </span>
              .
            </>
          ) : (
            `Chosen: ${pagesNamed(chosen)} of ${count.toLocaleString("en")}.`
          )}
        </p>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto p-0"
        onScroll={(event) => {
          const element = event.currentTarget
          setView((was) => ({ ...was, top: element.scrollTop }))
        }}
      >
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Pages of the file"
          className="relative touch-pan-y"
          style={{ height: rows * ROW }}
          onKeyDown={onKey}
          onPointerMove={(event) => {
            const from = pressed.current
            if (!from) return
            if (
              !dragged.current &&
              Math.hypot(event.clientX - from.x, event.clientY - from.y) < SLACK
            )
              return
            if (!dragged.current) {
              dragged.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
              // A page that is dragged without being chosen is the one that goes.
              if (!chosen.includes(from.page)) pages.press(from.page, "only")
            }
            setDropAt(placeAt(event))
            const element = scroller.current!
            const box = element.getBoundingClientRect()
            if (event.clientY < box.top + EDGE) element.scrollTop -= 12
            else if (event.clientY > box.bottom - EDGE) element.scrollTop += 12
          }}
          onPointerUp={(event) => {
            const from = pressed.current
            if (from && dragged.current) void pages.drop(placeAt(event))
            endDrag()
          }}
          onPointerCancel={endDrag}
        >
          {tiles}
          {mark && (
            <span
              aria-hidden="true"
              data-testid="pages-drop"
              className="pointer-events-none absolute w-0.5 rounded-full bg-primary"
              style={{
                left:
                  ((mark.page % columns) + (mark.after ? 1 : 0)) * wide -
                  (mark.after ? 2 : 0),
                top: Math.floor(mark.page / columns) * ROW + 8,
                height: ROW - 16,
              }}
            />
          )}
        </div>
      </div>
    </aside>
  )
}
