"use client"

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconSearch, IconX } from "@tabler/icons-react"
import { ToolIcon, categoryTone } from "@/components/tool-icon"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "cn"
import { categories } from "@/lib/catalogue"
import {
  edgeChoice,
  firstChoice,
  isApple,
  isSearchShortcut,
  moveChoice,
  searchTools,
  shortcutLabel,
} from "@/lib/tool-search"

const never = () => () => {}
/** Which keyboard this is, known once the page runs; until then, the commoner one. */
const readApple = () => isApple(navigator.platform || navigator.userAgent)

const labelOf = (id: string) =>
  categories.find((category) => category.id === id)?.label ?? ""

const keyClass =
  "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border bg-muted px-1 font-mono text-xs text-muted-foreground"

/**
 * The search in the top bar: a pill that opens a list of every tool. It also
 * opens with ⌘K on a Mac and Ctrl+K elsewhere, from anywhere in the
 * workspace. Type to narrow the list, move with the arrow keys, and press
 * Enter to open a tool.
 */
export function ToolSearch() {
  const ids = useId()
  const router = useRouter()
  const list = useRef<HTMLUListElement>(null)
  /** Takes focus again when the search closes; Safari does not focus a button that is clicked. */
  const pill = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  /** The tool the arrow keys last moved to; null for the first that can be opened. */
  const [chosen, setChosen] = useState<string | null>(null)
  const apple = useSyncExternalStore(never, readApple, () => false)

  const results = useMemo(() => searchTools(query), [query])
  const chosenAt = chosen
    ? results.findIndex(
        (tool) => tool.id === chosen && tool.status === "available"
      )
    : -1
  const active = chosenAt >= 0 ? chosenAt : firstChoice(results)

  const show = (next: boolean) => {
    setOpen(next)
    // Each opening starts afresh.
    setQuery("")
    setChosen(null)
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isSearchShortcut(event, apple)) return
      event.preventDefault()
      setOpen((before) => !before)
      setQuery("")
      setChosen(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [apple])

  // The tool the keys moved to is kept in sight.
  useEffect(() => {
    list.current
      ?.querySelector("[data-active]")
      ?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  const move = (to: number) => setChosen(results[to]?.id ?? null)
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      move(moveChoice(results, active, event.key === "ArrowDown" ? 1 : -1))
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      move(edgeChoice(results, event.key === "Home" ? "first" : "last"))
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault()
      router.push(`/dashboard/${results[active].id}/`)
      show(false)
    }
  }

  return (
    <>
      <button
        ref={pill}
        type="button"
        onClick={() => show(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts={apple ? "Meta+K" : "Control+K"}
        data-testid="search-button"
        className="search-pill group flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full border bg-background text-sm text-muted-foreground transition-[border-color,color] duration-150 outline-none hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:w-full sm:max-w-sm sm:justify-start sm:px-3.5 md:h-9"
      >
        <IconSearch className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only flex-1 text-left sm:not-sr-only">
          Search tools
        </span>
        <kbd className={cn(keyClass, "hidden sm:inline-flex")}>
          {shortcutLabel(apple)}
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={show}>
        <DialogContent
          showCloseButton={false}
          finalFocus={pill}
          className="top-4 max-h-[calc(100dvh-2rem)] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12vh]"
        >
          <DialogTitle className="sr-only">Search tools</DialogTitle>
          <DialogDescription className="sr-only">
            Type to narrow the list, move with the arrow keys, and press Enter
            to open a tool.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b pr-1 pl-4">
            <IconSearch
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              role="combobox"
              aria-label="Search tools"
              aria-expanded="true"
              aria-controls={`${ids}-list`}
              aria-autocomplete="list"
              aria-activedescendant={
                active >= 0 ? `${ids}-${results[active].id}` : undefined
              }
              autoComplete="off"
              spellCheck={false}
              placeholder="Try “compress” or “PDF”"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setChosen(null)
              }}
              onKeyDown={onKeyDown}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
            <DialogClose
              render={<Button variant="ghost" size="icon" />}
              aria-label="Close search"
            >
              <IconX aria-hidden="true" />
            </DialogClose>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {results.length} {results.length === 1 ? "tool" : "tools"}
          </p>
          {results.length ? (
            <ul
              ref={list}
              id={`${ids}-list`}
              role="listbox"
              aria-label="Tools"
              className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2"
            >
              {results.map((tool, at) => {
                const ready = tool.status === "available"
                const row = (
                  <>
                    <ToolIcon tool={tool} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {tool.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tool.description}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        ready
                          ? categoryTone[tool.category].text
                          : "text-muted-foreground"
                      )}
                    >
                      {ready ? labelOf(tool.category) : "Coming soon"}
                    </span>
                  </>
                )
                const shape =
                  "flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 outline-none"
                return (
                  <li key={tool.id} role="presentation">
                    {ready ? (
                      <Link
                        href={`/dashboard/${tool.id}/`}
                        id={`${ids}-${tool.id}`}
                        role="option"
                        aria-selected={at === active}
                        data-active={at === active || undefined}
                        tabIndex={-1}
                        onClick={() => show(false)}
                        onPointerMove={() => setChosen(tool.id)}
                        className={cn(shape, at === active && "bg-accent")}
                      >
                        {row}
                      </Link>
                    ) : (
                      <div
                        id={`${ids}-${tool.id}`}
                        role="option"
                        aria-selected="false"
                        aria-disabled="true"
                        className={shape}
                      >
                        {row}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="p-6 text-center" id={`${ids}-list`}>
              <p className="font-heading text-base font-medium">
                No tools found
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try another name, such as “PDF” or “resize”.
              </p>
            </div>
          )}
          <p className="hidden items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
            <span className="flex items-center gap-1">
              <kbd className={keyClass}>↑</kbd>
              <kbd className={keyClass}>↓</kbd> to move
            </span>
            <span className="flex items-center gap-1">
              <kbd className={keyClass}>Enter</kbd> to open
            </span>
            <span className="flex items-center gap-1">
              <kbd className={keyClass}>Esc</kbd> to close
            </span>
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
