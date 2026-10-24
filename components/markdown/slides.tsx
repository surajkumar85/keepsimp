"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { renderMarkdown, type RenderOptions } from "@/lib/markdown/render"
import { slidesOf } from "@/lib/markdown/slides"
import { enrichHtml } from "./enrich"
import { useDark } from "./preview"

/**
 * The document shown as slides, one part between lines of --- at a time,
 * filling the screen. Arrow keys, Page Up and Down, the space bar, a press
 * on either side or a swipe move between them; Escape ends it. It grows in
 * and never fades in, as every window here does.
 */
export function Presenter({
  open,
  text,
  options,
  onOpenChange,
}: {
  open: boolean
  text: string
  options: RenderOptions
  onOpenChange: (open: boolean) => void
}) {
  const slides = useMemo(() => slidesOf(text), [text])
  const [index, setIndex] = useState(0)
  const at = Math.min(index, Math.max(0, slides.length - 1))
  const dark = useDark()
  const rendered = useMemo(
    () => renderMarkdown(slides[at] ?? "", options),
    [slides, at, options]
  )
  const [html, setHtml] = useState<{ from: string; html: string } | null>(null)
  useEffect(() => {
    let current = true
    void enrichHtml(rendered.html, rendered.needs, dark).then(
      (done) => current && setHtml({ from: rendered.html, html: done })
    )
    return () => {
      current = false
    }
  }, [rendered, dark])
  const shown = html?.from === rendered.html ? html.html : rendered.html
  const go = (by: number) =>
    setIndex(Math.min(slides.length - 1, Math.max(0, at + by)))
  const touch = useRef<number | null>(null)

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setIndex(0)
        onOpenChange(next)
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          data-testid="markdown-slides"
          className="fixed inset-0 z-50 flex flex-col bg-background text-foreground transition-transform duration-200 outline-none data-ending-style:scale-[0.98] data-starting-style:scale-[0.98] motion-reduce:transition-none"
          onKeyDown={(event) => {
            if (
              ["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)
            ) {
              event.preventDefault()
              go(1)
            } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
              event.preventDefault()
              go(-1)
            } else if (event.key === "Home") setIndex(0)
            else if (event.key === "End") setIndex(slides.length - 1)
          }}
          onTouchStart={(event) => {
            touch.current = event.touches[0].clientX
          }}
          onTouchEnd={(event) => {
            if (touch.current === null) return
            const moved = event.changedTouches[0].clientX - touch.current
            if (Math.abs(moved) > 50) go(moved < 0 ? 1 : -1)
            touch.current = null
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            Slides
          </DialogPrimitive.Title>
          <div
            className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10 sm:px-16"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a, button, input"))
                return
              go(event.clientX < window.innerWidth / 3 ? -1 : 1)
            }}
          >
            {slides.length ? (
              <article
                className="markdown-body slide w-full max-w-4xl"
                aria-live="polite"
                aria-roledescription="slide"
                aria-label={`Slide ${at + 1} of ${slides.length}`}
                // Made by markdown-it and cleaned by DOMPurify, as the preview is.
                dangerouslySetInnerHTML={{ __html: shown }}
              />
            ) : (
              <p className="text-muted-foreground">
                Nothing to show yet. Write something, and put --- on a line of
                its own between slides.
              </p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 border-t px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous slide"
              disabled={at === 0}
              onClick={() => go(-1)}
            >
              <IconChevronLeft aria-hidden="true" />
            </Button>
            <span
              className="min-w-16 text-center text-sm text-muted-foreground tabular-nums"
              data-testid="slide-count"
            >
              {slides.length ? `${at + 1} / ${slides.length}` : "0 / 0"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next slide"
              disabled={at >= slides.length - 1}
              onClick={() => go(1)}
            >
              <IconChevronRight aria-hidden="true" />
            </Button>
            <DialogPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="End the slides"
                  className="absolute right-3"
                />
              }
            >
              <IconX aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
