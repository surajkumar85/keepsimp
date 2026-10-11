"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { CompareSlider } from "@/components/image-compressor/compare-slider"
import { Button } from "@/components/ui/button"
import { chipClassName } from "@/components/ui/choice-chips"
import type { PdfClient } from "@/lib/pdf-merger/client"
import { cn } from "cn"

/** The longer side, in pixels, of the pages drawn to compare: enough to judge a picture at twice its size. */
const EDGE = 1600

interface Drawn {
  key: string
  before: ImageBitmap | null
  after: ImageBitmap | null
}

/**
 * One page before and after, under a divider that can be dragged. The
 * pages are drawn by the worker from the file as it was and from the result.
 */
export function CompareView({
  client,
  before,
  after,
  pages,
  page,
  onPage,
  flagged,
  beforeLabel,
  afterLabel,
}: {
  client: RefObject<PdfClient | null>
  /** The file as it was, and the result, as the worker knows them. */
  before: string
  after: string
  pages: number
  /** The page shown, counted from 0. */
  page: number
  onPage: (page: number) => void
  /** Pages that changed more than expected, counted from 0. */
  flagged: readonly number[]
  beforeLabel: string
  afterLabel: string
}) {
  const key = `${before}/${after}/${page}`
  const [drawn, setDrawn] = useState<Drawn | null>(null)
  /** The pictures on show, to be given back when others take their place. */
  const held = useRef<Drawn | null>(null)

  useEffect(() => {
    const instance = client.current
    if (!instance) return
    let live = true
    const was = instance.draw(before, page, EDGE)
    const is = instance.draw(after, page, EDGE)
    void Promise.all([was.promise, is.promise]).then(([first, second]) => {
      if (!live) {
        first?.close()
        second?.close()
        return
      }
      held.current?.before?.close()
      held.current?.after?.close()
      held.current = { key, before: first, after: second }
      setDrawn(held.current)
    })
    return () => {
      live = false
      instance.forget([was.request, is.request])
    }
  }, [client, before, after, page, key])

  useEffect(
    () => () => {
      held.current?.before?.close()
      held.current?.after?.close()
      held.current = null
    },
    []
  )

  const current = drawn?.key === key ? drawn : null
  const failed = current !== null && (!current.before || !current.after)
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="compare"
      data-page={page + 1}
      data-drawn={current && !failed ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Before and after</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 0}
            onClick={() => onPage(page - 1)}
          >
            <IconChevronLeft aria-hidden="true" />
          </Button>
          <p className="min-w-24 text-center text-sm tabular-nums">
            Page {(page + 1).toLocaleString("en")} of{" "}
            {pages.toLocaleString("en")}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}
          >
            <IconChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      {flagged.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Changed more than expected:
          </p>
          {flagged.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={entry === page}
              onClick={() => onPage(entry)}
              className={cn(chipClassName, "aria-pressed:border-primary")}
            >
              Page {entry + 1}
            </button>
          ))}
        </div>
      )}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          This page could not be drawn. Open the result in the reader instead.
        </p>
      ) : (
        <CompareSlider
          reference={current?.before ?? null}
          result={current?.after ?? null}
          resultUrl={null}
          size={
            current?.before
              ? { width: current.before.width, height: current.before.height }
              : { width: 3, height: 4 }
          }
          originalLabel={beforeLabel}
          resultLabel={afterLabel}
          status={null}
          onCancel={() => {}}
        />
      )}
      {!current && (
        <p role="status" className="text-xs text-muted-foreground">
          Drawing the page…
        </p>
      )}
    </section>
  )
}
