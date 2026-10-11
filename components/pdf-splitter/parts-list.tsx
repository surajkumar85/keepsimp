"use client"

import { memo, useId } from "react"
import { IconBook2, IconDownload } from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "cn"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { describePages } from "@/lib/pdf-splitter/parts"
import type { PlannedPart } from "@/lib/pdf-splitter/settings"

/** Rows shown at once; a split into thousands of parts lists the first of them. */
export const MOST_ROWS = 100

/** A part that has been written. */
export interface WrittenPart {
  name: string
  url: string
  bytes: number
  pages: number
}

/**
 * The parts a split makes, one row each: what it holds, its name, and
 * whether it is written. Once split, each row has its size and a download.
 */
export const PartsList = memo(function PartsList({
  parts,
  names,
  written,
  onName,
  onSkip,
  onRead,
  disabled,
}: {
  parts: readonly PlannedPart[]
  /** The file name each part gets, by its place in `parts`. */
  names: readonly string[]
  /** Parts that are written and up to date, by part number. */
  written: ReadonlyMap<number, WrittenPart>
  onName: (key: string, name: string) => void
  onSkip: (key: string, skipped: boolean) => void
  onRead: (number: number, from: HTMLElement) => void
  /** While a split is running, nothing can be changed. */
  disabled: boolean
}) {
  const ids = useId()
  const rows = parts.slice(0, MOST_ROWS)
  return (
    <div className="space-y-2">
      <ol aria-label="Parts" className="space-y-2" data-testid="parts-list">
        {rows.map((part, index) => {
          const result = written.get(part.number)
          const stem = names[index].replace(/\.pdf$/, "")
          return (
            <li
              key={part.key}
              data-testid="part-row"
              data-skipped={part.skipped || undefined}
              className={cn(
                "space-y-2 rounded-lg border p-3",
                part.skipped ? "border-dashed bg-muted/40" : "bg-background"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm">
                  <span className="font-medium">
                    {parts.length > 1 ? `Part ${part.number}` : "The result"}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {describePages(part)}
                    {part.pages.length > 1 &&
                      ` · ${part.pages.length.toLocaleString("en")} pages`}
                    {part.skipped && " · left out"}
                  </span>
                </p>
                {parts.length > 1 && (
                  <Switch
                    checked={!part.skipped}
                    disabled={disabled}
                    onCheckedChange={(checked) => onSkip(part.key, !checked)}
                    aria-label={`Include part ${part.number}`}
                    className="mt-0.5 shrink-0"
                  />
                )}
              </div>
              {!part.skipped && (
                <div className="flex items-center gap-1.5">
                  <label htmlFor={`${ids}-${part.key}`} className="sr-only">
                    Name of part {part.number}
                  </label>
                  <Input
                    id={`${ids}-${part.key}`}
                    value={part.typed}
                    disabled={disabled}
                    onChange={(event) => onName(part.key, event.target.value)}
                    placeholder={stem}
                    spellCheck={false}
                    autoComplete="off"
                    className="min-w-0 flex-1"
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    .pdf
                  </span>
                </div>
              )}
              {result && (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="mr-auto text-xs text-muted-foreground"
                    data-testid="part-size"
                  >
                    {sizeLabel(result.bytes)}
                  </span>
                  <Button
                    variant="outline"
                    onClick={(event) =>
                      onRead(part.number, event.currentTarget)
                    }
                    aria-label={`Read ${result.name}`}
                  >
                    <IconBook2 aria-hidden="true" /> Read
                  </Button>
                  <a
                    href={result.url}
                    download={result.name}
                    aria-label={`Download ${result.name}`}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <IconDownload aria-hidden="true" /> Download
                  </a>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {parts.length > rows.length && (
        <p className="text-xs text-muted-foreground" data-testid="parts-more">
          And {(parts.length - rows.length).toLocaleString("en")} more parts,
          named the same way. Every part is in the ZIP.
        </p>
      )}
    </div>
  )
})
