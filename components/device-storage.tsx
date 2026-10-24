"use client"

import Link from "next/link"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { IconDatabase, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
} from "@/components/ui/popover"
import { toast } from "@/components/ui/toast"
import {
  askToPersist,
  clearPart,
  formatBytes,
  GROUPS,
  measurePart,
  overall,
  PARTS,
  type Overall,
  type PartInfo,
  type StorageEnv,
} from "@/lib/device-storage"
import { isApple, isSearchShortcut } from "@/lib/tool-search"

/** The browser's stores, read only when the panel opens, never on the server. */
function browserEnv(): StorageEnv {
  let localStorage: Storage | undefined
  try {
    localStorage = window.localStorage
  } catch {
    // Blocked by the browser's settings: nothing is kept there either.
  }
  return {
    caches: "caches" in window ? window.caches : undefined,
    indexedDB: "indexedDB" in window ? window.indexedDB : undefined,
    localStorage,
    storage: navigator.storage,
    serviceWorker:
      "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
  }
}

/** A part's size: a number, still being measured, or not readable here. */
type Size = number | "measuring" | "unknown"

function PartRow({
  part,
  size,
  onRemove,
}: {
  part: PartInfo
  size: Size
  onRemove: () => Promise<void>
}) {
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  const kept = typeof size === "number" && size > 0
  return (
    <li
      ref={row}
      tabIndex={-1}
      className="py-3 outline-none"
      data-testid={`kept-${part.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{part.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{part.detail}</p>
        </div>
        <p
          className={
            kept
              ? "shrink-0 font-mono text-sm tabular-nums"
              : "shrink-0 text-xs text-muted-foreground"
          }
          data-testid="kept-size"
        >
          {size === "measuring"
            ? "Measuring…"
            : size === "unknown"
              ? "Not readable"
              : kept
                ? formatBytes(size)
                : "Nothing kept"}
        </p>
      </div>
      {kept &&
        (asking ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="mr-auto text-xs text-muted-foreground">
              Remove it from this browser? This cannot be undone.
            </p>
            <Button
              variant="ghost"
              size="sm"
              autoFocus
              onClick={() => {
                setAsking(false)
                requestAnimationFrame(() => removeButton.current?.focus())
              }}
              disabled={removing}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={removing}
              onClick={async () => {
                setRemoving(true)
                try {
                  await onRemove()
                } finally {
                  setRemoving(false)
                  setAsking(false)
                  // The buttons go with what they removed; the row keeps the place.
                  row.current?.focus({ preventScroll: true })
                }
              }}
            >
              {removing ? "Removing…" : "Remove"}
            </Button>
          </div>
        ) : (
          <Button
            ref={removeButton}
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setAsking(true)}
          >
            Remove
            <span className="sr-only"> {part.name}</span>
          </Button>
        ))}
    </li>
  )
}

/** Mounted only while the panel is open: measures on opening and after each removal. */
function KeptParts({ env }: { env: StorageEnv }) {
  const [sizes, setSizes] = useState<Record<string, Size>>(() =>
    Object.fromEntries(PARTS.map((part) => [part.id, "measuring"]))
  )
  const [whole, setWhole] = useState<Overall | null>(null)
  const [asked, setAsked] = useState<boolean | null>(null)

  const measure = useCallback(
    async (parts: readonly PartInfo[]) => {
      const results = await Promise.all(
        parts.map((part) =>
          measurePart(env, part).then(
            (bytes): [string, Size] => [part.id, bytes],
            (): [string, Size] => [part.id, "unknown"]
          )
        )
      )
      setSizes((was) => ({ ...was, ...Object.fromEntries(results) }))
      setWhole(await overall(env))
    },
    [env]
  )

  useEffect(() => {
    let live = true
    void Promise.resolve().then(() => {
      if (live) void measure(PARTS)
    })
    return () => {
      live = false
    }
  }, [measure])

  const known = Object.values(sizes).filter(
    (size): size is number => typeof size === "number"
  )
  const measuring = Object.values(sizes).includes("measuring")
  const total = known.reduce((sum, size) => sum + size, 0)

  return (
    <div className="space-y-4">
      <section aria-label="Total kept" className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Kept by KeepSimp</p>
        <p
          className="mt-1 font-heading text-3xl font-medium tabular-nums"
          data-testid="kept-total"
        >
          {measuring && !known.length ? "Measuring…" : formatBytes(total)}
        </p>
        {whole?.usage != null && whole.quota != null && (
          <p className="mt-1 text-xs text-muted-foreground">
            The browser counts {formatBytes(whole.usage)} for this site, all
            stores together, and allows up to {formatBytes(whole.quota)}.
          </p>
        )}
      </section>

      {GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`kept-group-${group.id}`}>
          <h3
            id={`kept-group-${group.id}`}
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {group.name}
          </h3>
          <ul className="divide-y">
            {PARTS.filter((part) => part.group === group.id).map((part) => (
              <PartRow
                key={part.id}
                part={part}
                size={sizes[part.id]}
                onRemove={async () => {
                  try {
                    await clearPart(env, part)
                    toast.success(`${part.name}: removed`)
                  } catch (problem) {
                    toast.error(`${part.name} could not be removed`, {
                      description: (problem as Error).message,
                    })
                  }
                  setSizes((was) => ({ ...was, [part.id]: "measuring" }))
                  await measure([part])
                }}
              />
            ))}
          </ul>
        </section>
      ))}

      {whole?.persisted != null && (
        <section
          aria-label="Clearing when space runs low"
          className="rounded-lg border p-3 text-sm"
        >
          {whole.persisted || asked ? (
            <p data-testid="kept-persisted">
              The browser will keep all this when the device runs low on space.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                When the device runs low on space, the browser may clear all
                this, offline copy and drafts included.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  const granted = await askToPersist(env)
                  setAsked(granted)
                  if (!granted)
                    toast.info("The browser did not agree", {
                      description:
                        "Browsers decide for themselves; installing KeepSimp as an app makes it more likely.",
                    })
                }}
              >
                Ask the browser to keep it
              </Button>
            </>
          )}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Your choice of light or dark is kept too. None of this is ever sent
        anywhere; your browser’s settings for this site can remove all of it.{" "}
        <Link
          prefetch={false}
          href="/blog/see-what-keepsimp-keeps-in-your-browser/"
          className="text-primary"
        >
          What each part is
        </Link>
        {" · "}
        <Link prefetch={false} href="/privacy/" className="text-primary">
          Privacy
        </Link>
      </p>
    </div>
  )
}

/** The header's button and panel: what KeepSimp keeps in this browser, how big each part is, and a way to remove each. */
export function DeviceStorage() {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [env, setEnv] = useState<StorageEnv | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handToSearch = (event: KeyboardEvent) => {
      // Native opening is immediate, but its toggle event (and initial focus)
      // is queued. Catch the shortcut even if focus is still on the trigger,
      // before the search's bubbling listener opens its dialog.
      if (
        popup.current?.matches(":popover-open") &&
        isSearchShortcut(
          event,
          isApple(navigator.platform || navigator.userAgent)
        )
      )
        popup.current.hidePopover()
    }
    document.addEventListener("keydown", handToSearch, true)
    return () => document.removeEventListener("keydown", handToSearch, true)
  }, [])

  const show = (next: boolean) => {
    if (next && !env) setEnv(browserEnv())
    setOpen(next)
    if (next) closeButton.current?.focus({ preventScroll: true })
  }
  const close = () => {
    popup.current?.hidePopover()
    trigger.current?.focus({ preventScroll: true })
  }

  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label="Kept on this device"
        title="Kept on this device"
      >
        <IconDatabase aria-hidden="true" />
      </Button>
      <PopoverContent
        ref={popup}
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onToggle={(event) => {
          if (event.target === event.currentTarget)
            show(event.newState === "open")
        }}
        onBlur={(event) => {
          const next = event.relatedTarget
          if (
            next &&
            !event.currentTarget.contains(next) &&
            next !== trigger.current
          )
            popup.current?.hidePopover()
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            close()
          }
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <PopoverTitle id={`${id}-title`}>Kept on this device</PopoverTitle>
            <PopoverDescription id={`${id}-description`} className="mt-1">
              What KeepSimp stores in this browser, and nothing else.
            </PopoverDescription>
          </div>
          <Button
            ref={closeButton}
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Close kept on this device"
          >
            <IconX aria-hidden="true" />
          </Button>
        </div>
        <div
          data-testid="kept-body"
          className="min-h-0 touch-pan-y touch-pinch-zoom overflow-y-auto overscroll-contain p-4"
        >
          {open && env && <KeptParts env={env} />}
        </div>
      </PopoverContent>
    </>
  )
}
