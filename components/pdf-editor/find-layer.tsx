"use client"

import { cn } from "cn"
import type { Find } from "./use-find"

/**
 * Where the words that are looked for are on a page: a frame around every
 * line or paragraph that has them, and a stronger one around the place
 * that is shown. Nothing here takes a press.
 */
export function FindSpots({
  find,
  page,
}: {
  find: Find
  /** Counted from 0. */
  page: number
}) {
  const units = find.found.filter((one) => one.page === page)
  if (!units.length) return null
  return (
    <>
      {units.flatMap((unit, at) =>
        unit.lines.map((line, index) => (
          <span
            key={`${at}/${index}`}
            aria-hidden="true"
            data-testid="editor-found"
            data-current={unit === find.current?.found ? "true" : undefined}
            className={cn(
              "pointer-events-none absolute rounded-xs",
              unit === find.current?.found
                ? "bg-primary/15 outline-2 outline-primary"
                : "bg-primary/5 outline-1 outline-primary/50"
            )}
            style={{
              left: line.box.x - 1,
              top: line.box.y,
              width: line.box.width + 2,
              height: line.box.height,
            }}
          />
        ))
      )}
    </>
  )
}
