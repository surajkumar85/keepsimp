"use client"

import { useEffect, useId, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import {
  IconChevronDown,
  IconCpu,
  IconInfoCircle,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
} from "@/components/ui/popover"
import { tools } from "@/lib/catalogue"
import { isApple, isSearchShortcut } from "@/lib/tool-search"
import {
  createMemoryReader,
  type MemoryPerformance,
  type MemoryReading,
} from "@/lib/browser-memory"
import {
  appendSample,
  formatMemory,
  highestSample,
  trendPoints,
  type MemorySample,
} from "@/lib/memory"

const SAMPLE_INTERVAL = 2_000

type ReadState = {
  reading: MemoryReading | null
  measuring: boolean
  samples: readonly MemorySample[]
  highest: MemorySample | null
}

/** The component mounts only while the panel is open. Nothing is persisted. */
function MemoryReadings({
  reader,
}: {
  reader: ReturnType<typeof createMemoryReader>
}) {
  const [state, setState] = useState<ReadState>({
    reading: null,
    measuring: true,
    samples: [],
    highest: null,
  })
  const [request, setRequest] = useState(0)

  useEffect(() => {
    let disposed = false
    let pending = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const sample = async () => {
      if (disposed || pending || document.hidden) return
      pending = true
      setState((before) => ({ ...before, measuring: true }))
      const reading = await reader.read()
      pending = false
      if (disposed || document.hidden) return
      setState((before) => ({
        reading,
        measuring: false,
        samples:
          reading.status === "ready"
            ? appendSample(before.samples, reading.sample)
            : before.samples,
        highest:
          reading.status === "ready"
            ? highestSample(before.highest, reading.sample)
            : before.highest,
      }))
      // A whole-page measurement may wait for garbage collection. Request
      // those only on opening/refresh; only the cheap heap fallback is polled.
      if (reading.status === "ready" && reading.sample.kind === "javascript")
        timer = setTimeout(sample, SAMPLE_INTERVAL)
    }
    const visibility = () => {
      clearTimeout(timer)
      if (!document.hidden) void sample()
    }
    document.addEventListener("visibilitychange", visibility)
    void sample()
    return () => {
      disposed = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [reader, request])

  const current =
    state.reading?.status === "ready" ? state.reading.sample : null
  const unavailable = state.reading?.status === "unsupported"
  const error = state.reading?.status === "error"
  const javascript = current?.kind === "javascript"

  return (
    <>
      {current ? (
        <section aria-label="Memory reading" className="space-y-4">
          <div>
            <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{javascript ? "JavaScript memory" : "Page memory"}</span>
              <span className="rounded-full border px-2 py-0.5">Estimate</span>
            </p>
            <p
              data-testid="memory-current"
              className="mt-1 font-heading text-3xl font-medium tabular-nums"
            >
              {formatMemory(current.bytes)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {javascript
                ? "A partial reading, not total tab memory."
                : "Includes this page and its dedicated workers."}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Recent readings</span>
              <span>{javascript ? "Every 2 seconds" : "On refresh"}</span>
            </div>
            <svg
              viewBox="0 0 280 48"
              className="mt-2 h-12 w-full text-primary"
              role="img"
              aria-label="Memory trend while this panel is open; scale adjusts to the readings"
            >
              {state.samples.length === 1 && (
                <circle cx="140" cy="24" r="3" fill="currentColor" />
              )}
              <polyline
                points={trendPoints(state.samples)}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <dl className="mt-2 flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Highest seen</dt>
              <dd data-testid="memory-peak" className="font-mono tabular-nums">
                {state.highest ? formatMemory(state.highest.bytes) : "—"}
              </dd>
            </dl>
          </div>
        </section>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4">
          <IconInfoCircle
            className="mb-3 size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-medium">
            {unavailable
              ? "This browser doesn’t report memory usage."
              : error
                ? "A memory reading isn’t available right now."
                : "Measuring memory…"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {unavailable
              ? "Your tools still run on your device. This browser doesn’t share a reading with websites."
              : error
                ? "The browser couldn’t provide a reading. Your tools are still available."
                : "The browser may need a few moments to finish its measurement."}
          </p>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {state.measuring
            ? "Measuring…"
            : current
              ? `Updated ${new Date(current.takenAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "No reading available"}
        </p>
        <Button
          variant="outline"
          aria-label="Refresh memory reading"
          disabled={state.measuring || unavailable}
          onClick={() => setRequest((before) => before + 1)}
        >
          <IconRefresh aria-hidden="true" />
          Refresh
        </Button>
      </div>
      <details className="group mt-4 border-t pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 [&::-webkit-details-marker]:hidden">
          About these readings
          <IconChevronDown
            className="size-4 shrink-0 text-muted-foreground group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-3 pt-2 text-sm text-muted-foreground">
          <p>
            {javascript || !current
              ? "JavaScript readings can miss workers, processing engines, images and other browser memory. They may also include shared memory from other pages."
              : "The browser estimates memory for this page and its dedicated workers. This is not your device’s total RAM or its free memory."}
          </p>
          <p>
            Tools share this tab. The browser cannot reliably separate how much
            belongs to each tool, so this reading isn’t a per-tool total.
          </p>
          <p>
            The trend and highest reading cover only this opening of the panel.
            They reset when you change pages. Readings pause when the tab is
            hidden and stop when you close the panel. Nothing is stored or sent.
          </p>
        </div>
      </details>
    </>
  )
}

export function MemoryUsage() {
  const pathname = usePathname()
  const id = useId()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  // Lazily created in an event, never on the server. The reader coalesces a
  // pending browser measurement even if the popover is closed and reopened.
  const [reader, setReader] = useState<ReturnType<
    typeof createMemoryReader
  > | null>(null)

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

  const tool = tools.find(
    (item) =>
      pathname === `/dashboard/${item.id}/` ||
      pathname === `/dashboard/${item.id}`
  )
  const name =
    tool?.name ??
    (pathname.startsWith("/design-system") ? "Design reference" : "All tools")
  const show = (next: boolean) => {
    if (next && !reader)
      setReader(
        createMemoryReader(
          performance as Performance & MemoryPerformance,
          window.crossOriginIsolated
        )
      )
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
        aria-label="Memory usage"
        title="Memory usage"
      >
        <IconCpu aria-hidden="true" />
      </Button>
      <PopoverContent
        ref={popup}
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onToggle={(event) => {
          // React also bubbles a nested <details> toggle to this handler.
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
            <PopoverTitle id={`${id}-title`}>Memory usage</PopoverTitle>
            <PopoverDescription
              id={`${id}-description`}
              className="mt-1 truncate"
              title={name}
            >
              Viewing: {name}
            </PopoverDescription>
          </div>
          <Button
            ref={closeButton}
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Close memory usage"
          >
            <IconX aria-hidden="true" />
          </Button>
        </div>
        <div
          data-testid="memory-body"
          className="min-h-0 touch-pan-y touch-pinch-zoom overflow-y-auto overscroll-contain p-4"
        >
          {open && reader && <MemoryReadings key={pathname} reader={reader} />}
        </div>
      </PopoverContent>
    </>
  )
}
