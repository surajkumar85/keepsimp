"use client"

import { useEffect, useRef, useState } from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { PageEntry } from "@/lib/pdf-merger/pages"

const EDGE = 1400

/** One page of the result, large, in a side sheet, with the pages either side a press away. */
export function PagePreview({
  entries,
  at,
  describe,
  render,
  onStep,
  onClose,
}: {
  entries: PageEntry[]
  /** Which page is shown, counted from 0; null when the sheet is closed. */
  at: number | null
  describe: (entry: PageEntry) => string
  /** Draw a page at a size; null when it cannot be drawn. */
  render: (
    file: string,
    page: number,
    edge: number
  ) => Promise<ImageBitmap | null>
  onStep: (to: number) => void
  onClose: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  /** The page last drawn, or tried, so a new page shows as "drawing" at once. */
  const [last, setLast] = useState<{ page: string; drawn: boolean } | null>(
    null
  )
  const entry = at === null ? null : (entries[at] ?? null)
  const file = entry?.kind === "page" ? entry.file : null
  const page = entry?.kind === "page" ? entry.page : null
  const state =
    last?.page !== `${file}/${page}`
      ? "drawing"
      : last.drawn
        ? "drawn"
        : "failed"

  useEffect(() => {
    if (file === null || page === null) return
    let alive = true
    void render(file, page, EDGE).then((bitmap) => {
      if (!alive) {
        bitmap?.close()
        return
      }
      const target = canvas.current
      if (!bitmap || !target) {
        setLast({ page: `${file}/${page}`, drawn: false })
        return
      }
      target.width = bitmap.width
      target.height = bitmap.height
      target.getContext("2d")?.drawImage(bitmap, 0, 0)
      bitmap.close()
      setLast({ page: `${file}/${page}`, drawn: true })
    })
    return () => {
      alive = false
    }
  }, [file, page, render])

  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        {entry && at !== null && (
          <>
            <SheetHeader>
              <SheetTitle>
                Page {at + 1} of {entries.length}
              </SheetTitle>
              <SheetDescription>{describe(entry)}</SheetDescription>
            </SheetHeader>
            <div
              className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted p-4"
              data-testid="page-preview"
              data-state={entry.kind === "blank" ? "drawn" : state}
            >
              {entry.kind === "blank" ? (
                <span className="flex h-80 w-56 items-center justify-center border bg-background text-sm text-muted-foreground shadow-sm">
                  Blank page
                </span>
              ) : (
                <>
                  <canvas
                    ref={canvas}
                    role="img"
                    aria-label={`${describe(entry)}, as it will appear`}
                    hidden={state !== "drawn"}
                    className="max-h-full max-w-full bg-background shadow-md transition-transform duration-200 motion-reduce:transition-none"
                    style={{ transform: `rotate(${entry.rotation}deg)` }}
                  />
                  {state !== "drawn" && (
                    <p className="text-sm text-muted-foreground">
                      {state === "drawing"
                        ? "Drawing the page…"
                        : "This page could not be drawn. It will still be merged."}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 p-4 pt-0">
              <Button
                variant="outline"
                disabled={at === 0}
                onClick={() => onStep(at - 1)}
              >
                <IconChevronLeft aria-hidden="true" /> Previous
              </Button>
              <Button
                variant="outline"
                disabled={at === entries.length - 1}
                onClick={() => onStep(at + 1)}
              >
                Next <IconChevronRight aria-hidden="true" />
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
