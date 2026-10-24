"use client"

import { IconListTree } from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import type { Heading } from "@/lib/markdown/render"
import { SidePanel } from "./side-panel"

/** The document's headings, nested by level; the one being read is marked, and each goes there. */
export function OutlinePanel({
  headings,
  current,
  onGo,
  onInsertToc,
  onClose,
}: {
  headings: Heading[]
  /** The source line at the top of the view. */
  current: number
  onGo: (line: number) => void
  onInsertToc: () => void
  onClose: () => void
}) {
  const top = Math.min(...headings.map((heading) => heading.level))
  // The heading being read: the last one at or above the top of the view.
  const reading = headings.reduce<Heading | null>(
    (found, heading) => (heading.line <= current + 0.5 ? heading : found),
    null
  )
  return (
    <SidePanel
      title="Outline"
      count={headings.length}
      onClose={onClose}
      testId="markdown-outline"
    >
      {headings.length ? (
        <nav aria-label="Headings">
          <ol className="space-y-0.5">
            {headings.map((heading) => (
              <li key={`${heading.id}-${heading.line}`}>
                <button
                  type="button"
                  onClick={() => onGo(heading.line)}
                  aria-current={heading === reading ? "location" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                    heading === reading
                      ? "bg-secondary font-medium text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  style={{
                    paddingLeft: `${0.5 + (heading.level - top) * 0.9}rem`,
                  }}
                >
                  <span className="truncate">
                    {heading.text || "Untitled heading"}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : (
        <p className="text-sm text-muted-foreground">
          Headings appear here as you write them: a line that starts with #.
        </p>
      )}
      <Button variant="outline" className="mt-4 w-full" onClick={onInsertToc}>
        <IconListTree aria-hidden="true" />
        Write a table of contents
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        It goes where the cursor is, between two comments, and is written again
        in its place each time you press this.
      </p>
    </SidePanel>
  )
}
