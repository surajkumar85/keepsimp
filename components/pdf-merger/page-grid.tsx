"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import {
  IconArrowBackUp,
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowForwardUp,
  IconArrowLeft,
  IconArrowRight,
  IconArrowsExchange,
  IconCheck,
  IconCopy,
  IconRotate2,
  IconRotateClockwise2,
  IconSquarePlus,
  IconTrash,
  IconZoomIn,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { cn } from "cn"
import {
  DEFAULT_PAGE,
  duplicatePages,
  insertBlank,
  keysBetween,
  movePages,
  nudgePages,
  removePages,
  reversePages,
  rotatePages,
  type PageEntry,
} from "@/lib/pdf-merger/pages"

export interface GridFile {
  name: string
  /** A picture has one page, so its name says it all. */
  picture: boolean
  /** The size its first page is shown at, in points. */
  width: number
  height: number
}

const plural = (count: number) =>
  `${count.toLocaleString("en")} page${count === 1 ? "" : "s"}`

/** A page's picture, drawn only while the tile is near the screen. */
function Picture({
  bitmap,
  rotation,
}: {
  bitmap: ImageBitmap | undefined
  rotation: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const target = canvas.current
    if (!target || !bitmap) return
    target.width = bitmap.width
    target.height = bitmap.height
    target.getContext("2d")?.drawImage(bitmap, 0, 0)
  }, [bitmap])
  if (!bitmap) return null
  // Turned on its side, the picture has to fit the tile the other way round.
  const sideways = rotation % 180 === 90
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="max-h-full max-w-full bg-background shadow-sm transition-transform duration-200 motion-reduce:transition-none"
      style={{
        transform: `rotate(${rotation}deg)`,
        ...(sideways ? { maxWidth: 132, maxHeight: 100 } : null),
      }}
    />
  )
}

function Tool({
  label,
  icon: Icon,
  enabled,
  onClick,
}: {
  label: string
  icon: typeof IconCopy
  enabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      disabled={!enabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
    </Button>
  )
}

/**
 * Every page of the result as a tile: select, drag, turn, copy, remove and
 * add blank pages. Everything a pointer can do, the toolbar and the keyboard
 * can do too.
 */
export function PageGrid({
  entries,
  files,
  thumbs,
  onNeed,
  selection,
  onSelection,
  onChange,
  onPreview,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  newKey,
}: {
  entries: PageEntry[]
  files: Record<string, GridFile>
  /** Pictures of pages, by "file/page". */
  thumbs: Record<string, ImageBitmap>
  /** Ask for the picture of a page that has come near the screen. */
  onNeed: (file: string, page: number) => void
  selection: ReadonlySet<string>
  onSelection: (keys: Set<string>) => void
  /** A change to the pages, with what to tell a screen reader about it. */
  onChange: (entries: PageEntry[], announcement: string) => void
  onPreview: (key: string) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  newKey: () => string
}) {
  const list = useRef<HTMLOListElement>(null)
  const [focused, setFocused] = useState<string | null>(null)
  /** Where a Shift-click or Shift-arrow selection started. */
  const anchor = useRef<string | null>(null)
  const [near, setNear] = useState<ReadonlySet<string>>(new Set())
  const [dragging, setDragging] = useState<ReadonlySet<string> | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  // One observer watches every tile; only tiles near the screen draw a picture.
  const observer = useRef<IntersectionObserver | null>(null)
  useEffect(() => {
    observer.current = new IntersectionObserver(
      (changes) =>
        setNear((current) => {
          const next = new Set(current)
          for (const change of changes) {
            const key = (change.target as HTMLElement).dataset.key!
            if (change.isIntersecting) next.add(key)
            else next.delete(key)
          }
          return next
        }),
      { rootMargin: "600px 0px" }
    )
    const watching = observer.current
    for (const tile of list.current?.querySelectorAll("[data-key]") ?? [])
      watching.observe(tile)
    return () => watching.disconnect()
  }, [])
  const watch = useCallback((tile: HTMLLIElement | null) => {
    if (!tile) return
    observer.current?.observe(tile)
    return () => observer.current?.unobserve(tile)
  }, [])
  useEffect(() => {
    for (const entry of entries)
      if (entry.kind === "page" && near.has(entry.key))
        onNeed(entry.file, entry.page)
  }, [entries, near, onNeed])

  const index = new Map(entries.map((entry, at) => [entry.key, at]))
  const current = focused !== null && index.has(focused) ? focused : null
  const tabStop = current ?? entries[0]?.key ?? null
  /** What an action applies to: the selection, or the page that has focus. */
  const targets = (): Set<string> =>
    selection.size
      ? new Set(selection)
      : current
        ? new Set([current])
        : new Set()

  const focusTile = (key: string | undefined) => {
    if (!key) return
    setFocused(key)
    const focus = () =>
      list.current
        ?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"] button`)
        ?.focus()
    // At once, so the next key press lands on it; and again once the tiles
    // have settled, for a tile that is new or was moved.
    focus()
    requestAnimationFrame(focus)
  }

  const describe = (entry: PageEntry) =>
    entry.kind === "blank"
      ? "Blank page"
      : files[entry.file]?.picture
        ? files[entry.file].name
        : `${files[entry.file]?.name ?? "A file"}, page ${entry.page + 1}`

  const act = {
    rotate(direction: "left" | "right", keys = targets()) {
      if (!keys.size) return
      onChange(
        rotatePages(entries, keys, direction),
        `Turned ${plural(keys.size)} ${direction === "right" ? "clockwise" : "anticlockwise"}.`
      )
    },
    remove(keys = targets()) {
      if (!keys.size) return
      const after = entries.find(
        (entry, at) =>
          !keys.has(entry.key) && at > (index.get([...keys][0]) ?? 0)
      )
      const next = removePages(entries, keys)
      onChange(
        next,
        `Removed ${plural(keys.size)}. ${plural(next.length)} left.`
      )
      onSelection(new Set())
      focusTile((after ?? next[next.length - 1])?.key)
    },
    duplicate(keys = targets()) {
      if (!keys.size) return
      onChange(
        duplicatePages(entries, keys, newKey),
        `Copied ${plural(keys.size)}; each copy follows its page.`
      )
    },
    nudge(direction: "earlier" | "later", keys = targets()) {
      if (!keys.size) return
      const next = nudgePages(entries, keys, direction)
      const first = next.findIndex((entry) => keys.has(entry.key))
      onChange(
        next,
        `Moved ${plural(keys.size)} ${direction}. Now at position ${first + 1} of ${next.length}.`
      )
      if (current) focusTile(current)
    },
    edge(to: "start" | "end", keys = targets()) {
      if (!keys.size) return
      onChange(
        movePages(entries, keys, to === "start" ? 0 : entries.length),
        `Moved ${plural(keys.size)} to the ${to}.`
      )
      if (current) focusTile(current)
    },
    reverse(keys = targets()) {
      if (keys.size < 2) return
      onChange(
        reversePages(entries, keys),
        `Reversed the order of ${plural(keys.size)}.`
      )
    },
    blank() {
      const keys = targets()
      // After the last chosen page, or at the end when nothing is chosen.
      const last = [...entries].reverse().find((entry) => keys.has(entry.key))
      const beside = last ?? entries[entries.length - 1]
      const size =
        beside?.kind === "blank"
          ? { width: beside.width, height: beside.height }
          : beside && files[beside.file]
            ? {
                width: files[beside.file].width,
                height: files[beside.file].height,
              }
            : DEFAULT_PAGE
      const key = newKey()
      onChange(
        insertBlank(entries, beside?.key ?? null, size, key),
        `Added a blank page at position ${(beside ? index.get(beside.key)! + 1 : 0) + 1}.`
      )
      focusTile(key)
    },
  }

  function click(event: MouseEvent, key: string) {
    setFocused(key)
    if (event.shiftKey && anchor.current && index.has(anchor.current)) {
      onSelection(
        new Set([...selection, ...keysBetween(entries, anchor.current, key)])
      )
      return
    }
    const next = new Set(selection)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    anchor.current = key
    onSelection(next)
  }

  function keyDown(event: KeyboardEvent, key: string) {
    const at = index.get(key)!
    const command = event.metaKey || event.ctrlKey
    const columns = () => {
      const tiles = [...(list.current?.children ?? [])] as HTMLElement[]
      const top = tiles[0]?.offsetTop
      return Math.max(1, tiles.filter((tile) => tile.offsetTop === top).length)
    }
    const step: Record<string, () => number> = {
      ArrowLeft: () => at - 1,
      ArrowRight: () => at + 1,
      ArrowUp: () => at - columns(),
      ArrowDown: () => at + columns(),
      Home: () => 0,
      End: () => entries.length - 1,
    }
    if (
      event.altKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault()
      act.nudge(event.key === "ArrowLeft" ? "earlier" : "later")
    } else if (step[event.key]) {
      event.preventDefault()
      const to = Math.max(0, Math.min(entries.length - 1, step[event.key]()))
      const target = entries[to].key
      if (event.shiftKey) {
        anchor.current ??= key
        onSelection(new Set(keysBetween(entries, anchor.current, target)))
      }
      focusTile(target)
    } else if (command && event.key.toLowerCase() === "a") {
      event.preventDefault()
      onSelection(new Set(entries.map((entry) => entry.key)))
    } else if (command && event.key.toLowerCase() === "z") {
      event.preventDefault()
      if (event.shiftKey) onRedo()
      else onUndo()
    } else if (command && event.key.toLowerCase() === "y") {
      event.preventDefault()
      onRedo()
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      act.remove()
    } else if (event.key.toLowerCase() === "r" && !command && !event.altKey) {
      event.preventDefault()
      act.rotate(event.shiftKey ? "left" : "right")
    } else if (event.key === "Escape" && selection.size) {
      event.preventDefault()
      onSelection(new Set())
    }
  }

  /** Where dragged pages land: before the tile under the pointer, or after it from its right half. */
  const landing = (event: DragEvent<HTMLElement>, at: number) => {
    const box = event.currentTarget.getBoundingClientRect()
    return event.clientX > box.left + box.width / 2 ? at + 1 : at
  }

  const chosen = selection.size

  return (
    <div className="space-y-3" data-testid="page-grid">
      <div
        role="toolbar"
        aria-label="Pages"
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2"
      >
        <span
          className="px-1 text-sm font-medium"
          data-testid="selection-count"
        >
          {chosen ? `${chosen.toLocaleString("en")} selected` : "None selected"}
        </span>
        <Button
          variant="outline"
          disabled={chosen === entries.length}
          onClick={() =>
            onSelection(new Set(entries.map((entry) => entry.key)))
          }
        >
          Select all
        </Button>
        <Button
          variant="outline"
          disabled={!chosen}
          onClick={() => onSelection(new Set())}
        >
          Clear
        </Button>
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Tool
          label="Turn anticlockwise"
          icon={IconRotate2}
          enabled={chosen > 0}
          onClick={() => act.rotate("left")}
        />
        <Tool
          label="Turn clockwise"
          icon={IconRotateClockwise2}
          enabled={chosen > 0}
          onClick={() => act.rotate("right")}
        />
        <Tool
          label="Copy"
          icon={IconCopy}
          enabled={chosen > 0}
          onClick={() => act.duplicate()}
        />
        <Tool
          label="Remove"
          icon={IconTrash}
          enabled={chosen > 0}
          onClick={() => act.remove()}
        />
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Tool
          label="Move to the start"
          icon={IconArrowBarToLeft}
          enabled={chosen > 0}
          onClick={() => act.edge("start")}
        />
        <Tool
          label="Move earlier"
          icon={IconArrowLeft}
          enabled={chosen > 0}
          onClick={() => act.nudge("earlier")}
        />
        <Tool
          label="Move later"
          icon={IconArrowRight}
          enabled={chosen > 0}
          onClick={() => act.nudge("later")}
        />
        <Tool
          label="Move to the end"
          icon={IconArrowBarToRight}
          enabled={chosen > 0}
          onClick={() => act.edge("end")}
        />
        <Tool
          label="Reverse the order"
          icon={IconArrowsExchange}
          enabled={chosen > 1}
          onClick={() => act.reverse()}
        />
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Tool
          label="Add a blank page"
          icon={IconSquarePlus}
          enabled={true}
          onClick={() => act.blank()}
        />
        <Tool
          label="Look at the page closely"
          icon={IconZoomIn}
          enabled={chosen === 1}
          onClick={() => onPreview([...selection][0])}
        />
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Tool
          label="Undo"
          icon={IconArrowBackUp}
          enabled={canUndo}
          onClick={onUndo}
        />
        <Tool
          label="Redo"
          icon={IconArrowForwardUp}
          enabled={canRedo}
          onClick={onRedo}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Click pages to select them; Shift-click selects everything between. Drag
        to reorder, or use the buttons. With the keyboard: arrows move, Space
        selects, Alt with ← or → moves a page, R turns it and Delete removes it.
      </p>
      <ol
        ref={list}
        aria-label="Pages of the result, in order"
        className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3"
      >
        {entries.map((entry, at) => {
          const picked = selection.has(entry.key)
          const label = describe(entry)
          return (
            <li
              key={entry.key}
              ref={watch}
              data-key={entry.key}
              data-testid="page-tile"
              className={cn(
                "relative",
                dropAt === at &&
                  "before:absolute before:-left-2 before:h-full before:w-1 before:rounded-full before:bg-primary",
                dropAt === at + 1 &&
                  at === entries.length - 1 &&
                  "after:absolute after:top-0 after:-right-2 after:h-full after:w-1 after:rounded-full after:bg-primary"
              )}
              onDragOver={(event) => {
                if (!dragging) return
                event.preventDefault()
                setDropAt(landing(event, at))
              }}
              onDrop={(event) => {
                if (!dragging) return
                event.preventDefault()
                // Worked out from the drop itself: the last "drag over" may
                // not have been drawn yet.
                const to = landing(event, at)
                onChange(
                  movePages(entries, dragging, to),
                  `Moved ${plural(dragging.size)} to position ${Math.min(to, entries.length - dragging.size) + 1}.`
                )
                setDragging(null)
                setDropAt(null)
              }}
            >
              <button
                type="button"
                draggable
                tabIndex={entry.key === tabStop ? 0 : -1}
                aria-pressed={picked}
                aria-label={`Page ${at + 1}: ${label}${entry.kind === "page" && entry.rotation ? `, turned ${entry.rotation}°` : ""}`}
                onClick={(event) => click(event, entry.key)}
                onDoubleClick={() => onPreview(entry.key)}
                onFocus={() => setFocused(entry.key)}
                onKeyDown={(event) => keyDown(event, entry.key)}
                onDragStart={(event) => {
                  setDragging(
                    picked ? new Set(selection) : new Set([entry.key])
                  )
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", entry.key)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setDropAt(null)
                }}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg border bg-card p-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  picked && "border-primary ring-2 ring-primary",
                  dragging?.has(entry.key) && "opacity-50"
                )}
              >
                <span className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-md bg-muted">
                  {entry.kind === "blank" ? (
                    <span className="flex h-28 w-20 items-center justify-center border bg-background text-xs text-muted-foreground shadow-sm">
                      Blank
                    </span>
                  ) : (
                    near.has(entry.key) && (
                      <Picture
                        bitmap={thumbs[`${entry.file}/${entry.page}`]}
                        rotation={entry.rotation}
                      />
                    )
                  )}
                  {picked && (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <IconCheck className="size-3.5" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="w-full min-w-0">
                  <span className="block font-mono text-xs font-medium">
                    {at + 1}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {/* The page number comes first, so a long name cannot push it out of sight. */}
                    {entry.kind === "page" && !files[entry.file]?.picture
                      ? `p. ${entry.page + 1} · ${files[entry.file]?.name ?? ""}`
                      : label}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
