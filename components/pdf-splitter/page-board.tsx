"use client"

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import { IconCheck, IconScissors } from "@tabler/icons-react"
import { cn } from "cn"
import type { SplitMode } from "@/lib/pdf-splitter/parts"

function Picture({ bitmap }: { bitmap: ImageBitmap | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const target = canvas.current
    if (!target || !bitmap) return
    target.width = bitmap.width
    target.height = bitmap.height
    target.getContext("2d")?.drawImage(bitmap, 0, 0)
  }, [bitmap])
  if (!bitmap) return null
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="max-h-full max-w-full bg-background shadow-sm"
    />
  )
}

/** What a tile says about where its page goes. */
function fate(
  mode: SplitMode,
  parts: readonly number[],
  picked: boolean,
  leftOut: ReadonlySet<number>,
  planned: boolean
) {
  if (mode === "extract") return picked ? "Taken out" : "Not taken"
  if (mode === "remove") return picked ? "Removed" : "Kept"
  if (mode === "blank" && picked) return "Blank"
  // Until there is a plan, nothing is said about where a page goes.
  if (!planned) return ""
  const written = parts.filter((part) => !leftOut.has(part))
  if (!written.length) return "Left out"
  return `${written.length > 1 ? "Parts" : "Part"} ${written.map((part) => part + 1).join(", ")}`
}

/**
 * One page and the place to cut after it. It is drawn again only when
 * something about this page changes, so a file of thousands of pages stays
 * quick while cuts are placed and a split runs.
 */
const Tile = memo(function Tile({
  page,
  last,
  bitmap,
  where,
  parts,
  cuts,
  selects,
  picked,
  gone,
  tinted,
  cut,
  tabStop,
  watch,
  onPress,
  onRead,
  onFocused,
  onKey,
  onCut,
}: {
  page: number
  /** The last page has no place to cut after it. */
  last: boolean
  bitmap: ImageBitmap | undefined
  where: string
  /** The parts the page is in, from 1, as text for tests and tools. */
  parts: string
  /** The board is in the way of splitting that cuts. */
  cuts: boolean
  selects: boolean
  picked: boolean
  gone: boolean
  tinted: boolean
  cut: boolean
  tabStop: boolean
  watch: (tile: HTMLLIElement | null) => (() => void) | undefined
  onPress: (page: number, event: MouseEvent) => void
  onRead: (page: number, from: HTMLElement) => void
  onFocused: (page: number) => void
  onKey: (event: KeyboardEvent<HTMLButtonElement>, page: number) => void
  onCut: (after: number) => void
}) {
  return (
    <li
      ref={watch}
      data-page={page}
      data-testid="board-page"
      data-part={parts}
      className="flex min-w-0 items-stretch"
    >
      <button
        type="button"
        data-tile=""
        tabIndex={tabStop ? 0 : -1}
        aria-pressed={selects ? picked : undefined}
        aria-label={
          where
            ? `Page ${page + 1}, ${where.toLowerCase()}`
            : `Page ${page + 1}`
        }
        aria-keyshortcuts={cuts ? "S Enter" : "Enter"}
        onClick={(event) => onPress(page, event)}
        onDoubleClick={(event) => onRead(page, event.currentTarget)}
        onFocus={() => onFocused(page)}
        onKeyDown={(event) => onKey(event, page)}
        className={cn(
          "relative flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-lg border p-2 text-left transition-colors duration-150 outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          tinted ? "bg-muted" : "bg-card",
          selects && picked && "border-primary ring-1 ring-primary",
          // Text keeps its contrast; the picture and the border say the page goes nowhere.
          gone && "border-dashed"
        )}
      >
        <span
          className={cn(
            "flex h-32 w-full items-center justify-center overflow-hidden rounded-md bg-muted/60",
            gone && "opacity-40"
          )}
        >
          <Picture bitmap={bitmap} />
        </span>
        <span className="flex w-full items-center justify-between gap-1">
          <span className="font-mono text-xs">{page + 1}</span>
          <span className="truncate text-xs font-medium">{where}</span>
        </span>
        {selects && picked && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <IconCheck className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </button>
      {cuts &&
        (last ? (
          <span className="w-11 shrink-0 md:w-7" />
        ) : (
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={cut}
            aria-label={`Cut after page ${page + 1}`}
            title={
              cut
                ? `Remove the cut after page ${page + 1}`
                : `Cut after page ${page + 1}`
            }
            data-testid="board-cut"
            onClick={() => onCut(page)}
            className="group relative flex w-11 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-7"
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-1 left-1/2 -translate-x-1/2 border-l-2",
                cut
                  ? "border-primary"
                  : "border-dashed border-border group-hover:border-primary/60"
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "relative flex size-6 items-center justify-center rounded-full border bg-background transition-colors duration-150 motion-reduce:transition-none",
                cut
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground group-hover:border-primary/60 group-hover:text-foreground"
              )}
            >
              <IconScissors className="size-3.5" />
            </span>
          </button>
        ))}
    </li>
  )
})

/**
 * Every page of the file as a tile, in order. Between two tiles sits a place
 * to cut; in the ways of splitting that select pages, a tile is a toggle.
 * Everything a pointer can do, a key can do too.
 */
export const PageBoard = memo(function PageBoard({
  file,
  count,
  pictures,
  onNeed,
  mode,
  cuts,
  onCut,
  selected,
  onSelect,
  membership,
  leftOut,
  onRead,
  onFocused,
}: {
  /** The id of the file, for its pictures. */
  file: string
  count: number
  /** Pictures of pages, by "file/page". */
  pictures: Record<string, ImageBitmap>
  onNeed: (page: number) => void
  mode: SplitMode
  cuts: readonly number[]
  /** Put a cut after a page, or take it away. */
  onCut: (after: number) => void
  selected: ReadonlySet<number>
  /** Select a page or let go of it; with `span`, everything from the last one pressed. */
  onSelect: (page: number, span: boolean) => void
  /** For each page, the parts it is in, counted from 0. */
  membership: readonly (readonly number[])[]
  /** Parts that are not written, counted from 0. */
  leftOut: ReadonlySet<number>
  onRead: (page: number, from: HTMLElement) => void
  /** Told which page has the keyboard, counted from 0. */
  onFocused: (page: number) => void
}) {
  const list = useRef<HTMLOListElement>(null)
  const [near, setNear] = useState<ReadonlySet<number>>(new Set())
  const [focused, setFocused] = useState(0)
  // In these ways of splitting a page is pressed to pick it: to take it out, to remove it, or to call it blank.
  const selects = mode === "extract" || mode === "remove" || mode === "blank"

  // One observer watches every tile; only tiles near the screen draw a picture.
  const observer = useRef<IntersectionObserver | null>(null)
  useEffect(() => {
    observer.current = new IntersectionObserver(
      (changes) =>
        setNear((current) => {
          const next = new Set(current)
          for (const change of changes) {
            const page = Number((change.target as HTMLElement).dataset.page)
            if (change.isIntersecting) next.add(page)
            else next.delete(page)
          }
          return next
        }),
      { rootMargin: "600px 0px" }
    )
    const watching = observer.current
    for (const tile of list.current?.querySelectorAll("[data-page]") ?? [])
      watching.observe(tile)
    return () => watching.disconnect()
  }, [])
  const watch = useCallback((tile: HTMLLIElement | null) => {
    if (!tile) return
    observer.current?.observe(tile)
    return () => observer.current?.unobserve(tile)
  }, [])
  useEffect(() => {
    for (const page of near) onNeed(page)
  }, [near, onNeed])

  /** What the handlers below need, as it is now; they stay the same so tiles are not drawn again for nothing. */
  const now = useRef({ count, mode, selects, onCut, onSelect, onRead })
  useEffect(() => {
    now.current = { count, mode, selects, onCut, onSelect, onRead }
  })

  const focus = useCallback(
    (page: number) => {
      setFocused(page)
      onFocused(page)
    },
    [onFocused]
  )
  const press = useCallback(
    (page: number, event: MouseEvent) => {
      focus(page)
      if (now.current.selects) now.current.onSelect(page, event.shiftKey)
    },
    [focus]
  )
  const read = useCallback(
    (page: number, from: HTMLElement) => now.current.onRead(page, from),
    []
  )
  const cutAfter = useCallback((after: number) => now.current.onCut(after), [])
  const keyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, page: number) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const state = now.current
      /** How many tiles sit in one row, as the grid is laid out now. */
      const columns = list.current
        ? getComputedStyle(list.current).gridTemplateColumns.split(" ").length
        : 1
      const move: Record<string, number> = {
        ArrowLeft: page - 1,
        ArrowRight: page + 1,
        ArrowUp: page - columns,
        ArrowDown: page + columns,
        Home: 0,
        End: state.count - 1,
      }
      if (event.key in move) {
        event.preventDefault()
        const to = Math.min(Math.max(move[event.key], 0), state.count - 1)
        focus(to)
        list.current
          ?.querySelector<HTMLElement>(`[data-page="${to}"] [data-tile]`)
          ?.focus()
      } else if (event.key.toLowerCase() === "s" && state.mode === "cuts") {
        event.preventDefault()
        if (page < state.count - 1) state.onCut(page)
      } else if (event.key === " " && state.selects) {
        event.preventDefault()
        state.onSelect(page, event.shiftKey)
      } else if (event.key === "Enter") {
        event.preventDefault()
        state.onRead(page, event.currentTarget)
      }
    },
    [focus]
  )

  const tabStop = Math.min(Math.max(focused, 0), Math.max(count - 1, 0))
  const cutSet = new Set(cuts)
  /** Some page has a part to go to; before that, pages are not shown as left out. */
  const planned = membership.some((parts) => parts.length > 0)
  const tiles = []
  for (let page = 0; page < count; page++) {
    const parts = membership[page] ?? []
    const picked = selected.has(page)
    tiles.push(
      <Tile
        key={page}
        page={page}
        last={page === count - 1}
        bitmap={pictures[`${file}/${page}`]}
        where={fate(mode, parts, picked, leftOut, planned)}
        parts={parts.map((part) => part + 1).join(",")}
        cuts={mode === "cuts"}
        selects={selects}
        picked={picked}
        // Pages that go nowhere are shown faded.
        gone={
          mode === "remove"
            ? picked
            : mode === "extract"
              ? !picked
              : planned && parts.every((part) => leftOut.has(part))
        }
        // Neighbouring parts take turns with a tint, so their edges show without colour alone.
        tinted={
          (!selects || mode === "blank") &&
          parts.length > 0 &&
          parts[0] % 2 === 1
        }
        cut={cutSet.has(page)}
        tabStop={page === tabStop}
        watch={watch}
        onPress={press}
        onRead={read}
        onFocused={focus}
        onKey={keyDown}
        onCut={cutAfter}
      />
    )
  }

  return (
    <ol
      ref={list}
      aria-label="Pages of the file, in order"
      data-testid="page-board"
      className={cn(
        "grid gap-y-3",
        mode === "cuts"
          ? "grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]"
          : "grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-3"
      )}
    >
      {tiles}
    </ol>
  )
})
