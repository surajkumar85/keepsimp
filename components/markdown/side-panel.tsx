"use client"

import { IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

/**
 * A panel beside the source and preview: a 288px column from 1024px, and a
 * layer over them below that, each with its title and a close button.
 */
export function SidePanel({
  title,
  count,
  onClose,
  children,
  testId,
}: {
  title: string
  /** A number said beside the title, such as how many findings. */
  count?: number
  onClose: () => void
  children: React.ReactNode
  testId?: string
}) {
  return (
    <aside
      aria-label={title}
      data-testid={testId}
      className="absolute inset-0 z-20 flex min-h-0 flex-col bg-card lg:static lg:z-auto lg:w-72 lg:shrink-0 lg:border-l"
    >
      <div className="flex min-h-12 items-center gap-2 border-b px-3">
        <h2 className="min-w-0 flex-1 truncate font-heading text-sm font-medium">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}
