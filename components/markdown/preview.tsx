"use client"

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react"
import type { Anchor } from "@/lib/markdown/scroll"
import type { Rendered } from "@/lib/markdown/render"
import { enrichHtml } from "./enrich"

export interface PreviewHandle {
  /** Every block's source line and how far down the preview it starts. */
  anchors: () => Anchor[]
  scrollTop: () => number
  setScrollTop: (top: number) => void
  /** How far the preview can scroll. */
  height: () => number
}

/** Whether the site is drawn dark, followed as the theme changes. */
export function useDark() {
  return useSyncExternalStore(
    (changed) => {
      const watcher = new MutationObserver(changed)
      watcher.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      })
      return () => watcher.disconnect()
    },
    () => document.documentElement.classList.contains("dark"),
    () => false
  )
}

/** The block a part of the preview was made from, by the line it starts on. */
const lineOf = (element: Element | null) => {
  const block = element?.closest<HTMLElement>("[data-source-line]")
  return block ? Number(block.dataset.sourceLine) : null
}

/**
 * The document as it will be read. Drawn at once from the text, then its
 * maths, diagrams and code are filled in. A box ticked here is ticked in
 * the text; a double click finds the line it was written on; a link to a
 * heading moves the preview, not the page.
 */
export function MarkdownPreview({
  rendered,
  empty,
  onToggleTask,
  onLocate,
  onScroll,
  ref,
}: {
  rendered: Rendered
  /** What shows while there is nothing to read. */
  empty: React.ReactNode
  onToggleTask: (line: number) => void
  onLocate: (line: number) => void
  onScroll: () => void
  ref?: Ref<PreviewHandle>
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const dark = useDark()
  const [enriched, setEnriched] = useState<{
    from: string
    dark: boolean
    html: string
  } | null>(null)

  useEffect(() => {
    const { needs, html } = rendered
    if (!needs.math && !needs.diagrams && !needs.code) return
    let current = true
    void enrichHtml(html, needs, dark).then((done) => {
      if (current) setEnriched({ from: html, dark, html: done })
    })
    return () => {
      current = false
    }
  }, [rendered, dark])

  const shown =
    enriched && enriched.from === rendered.html && enriched.dark === dark
      ? enriched.html
      : rendered.html

  useImperativeHandle(
    ref,
    () => ({
      anchors: () => {
        const box = scroller.current!
        const top = box.getBoundingClientRect().top - box.scrollTop
        return Array.from(
          box.querySelectorAll<HTMLElement>("[data-source-line]"),
          (element) => ({
            line: Number(element.dataset.sourceLine),
            top: element.getBoundingClientRect().top - top,
          })
        )
      },
      scrollTop: () => scroller.current!.scrollTop,
      setScrollTop: (top) => {
        scroller.current!.scrollTop = top
      },
      height: () => scroller.current!.scrollHeight,
    }),
    []
  )

  return (
    <div
      ref={scroller}
      className="h-full min-h-0 overflow-y-auto px-5 py-4 sm:px-8"
      data-testid="markdown-preview"
      role="region"
      aria-label="Preview"
      tabIndex={0}
      onScroll={onScroll}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.matches("input.task-list-item-checkbox")) {
          // The text decides: the box follows once the text is changed.
          event.preventDefault()
          const line = lineOf(target)
          if (line !== null) onToggleTask(line)
          return
        }
        const href = target.closest("a")?.getAttribute("href")
        if (!href?.startsWith("#")) return
        event.preventDefault()
        scroller.current
          ?.querySelector(`#${CSS.escape(decodeURIComponent(href.slice(1)))}`)
          ?.scrollIntoView({ block: "start" })
      }}
      onDoubleClick={(event) => {
        const line = lineOf(event.target as Element)
        if (line !== null) onLocate(line)
      }}
    >
      {rendered.html ? (
        <article
          className="markdown-body mx-auto max-w-3xl"
          data-enriched={shown !== rendered.html || undefined}
          // Made by markdown-it and cleaned by DOMPurify (lib/markdown/clean.ts); filled in by enrich.ts from cleaned parts.
          dangerouslySetInnerHTML={{ __html: shown }}
        />
      ) : (
        empty
      )}
    </div>
  )
}
