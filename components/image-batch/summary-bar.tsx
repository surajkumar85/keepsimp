"use client"

import {
  IconDownload,
  IconFileZip,
  IconPhotoPlus,
  IconTrash,
} from "@tabler/icons-react"
import {
  FileInput,
  useDropTarget,
} from "@/components/image-compressor/drop-zone"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { savingsPercent } from "@/lib/image-compressor/quality"

export interface BatchTotals {
  images: number
  done: number
  pending: number
  files: number
  originalBytes: number
  outputBytes: number
  settled: boolean
}

/** Totals for a batch, the main download action, and adding or clearing images. */
export function SummaryBar({
  totals,
  single,
  singleLabel = "Download image",
  primary,
  zipping,
  onZip,
  onFiles,
  onClear,
  inputId,
  verb,
}: {
  totals: BatchTotals
  /** Set when the batch is exactly one file, which downloads directly. */
  single: { url: string; name: string } | null
  singleLabel?: string
  /** Replaces the ZIP button, for a batch that downloads as one built file. */
  primary?: { label: string; onClick: () => void } | null
  zipping: boolean
  onZip: () => void
  onFiles: (files: File[]) => void
  onClear: () => void
  inputId: string
  /** Present participle for screen readers, e.g. "Resizing". */
  verb: string
}) {
  const { over, handlers } = useDropTarget(onFiles)
  const saved = savingsPercent(totals.originalBytes, totals.outputBytes)
  return (
    <div
      {...handlers}
      data-testid="summary-bar"
      className={cn(
        "space-y-3 rounded-xl border bg-card p-4 transition-colors duration-150 motion-reduce:transition-none",
        over && "border-primary bg-primary/5"
      )}
    >
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
        role="status"
      >
        <p className="font-heading text-lg font-medium">
          {totals.done} of {totals.images} ready
        </p>
        {totals.done > 0 && (
          <span className="text-sm text-muted-foreground">
            {sizeLabel(totals.originalBytes)} → {sizeLabel(totals.outputBytes)}
            {saved > 0
              ? ` · ${saved}% smaller`
              : saved < 0
                ? ` · ${-saved}% larger`
                : ""}
            {totals.files !== totals.done ? ` · ${totals.files} files` : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {single ? (
          <a
            href={single.url}
            download={single.name}
            className={cn(
              buttonVariants({ size: "lg" }),
              "flex-1 sm:flex-none"
            )}
          >
            <IconDownload aria-hidden="true" /> {singleLabel}
          </a>
        ) : primary ? (
          <Button
            size="lg"
            className="flex-1 sm:flex-none"
            disabled={!totals.settled || zipping}
            onClick={primary.onClick}
          >
            <IconDownload aria-hidden="true" /> {primary.label}
          </Button>
        ) : (
          <Button
            size="lg"
            className="flex-1 sm:flex-none"
            disabled={!totals.settled || zipping}
            onClick={onZip}
          >
            <IconFileZip aria-hidden="true" />
            {zipping ? "Preparing ZIP…" : "Download all (ZIP)"}
          </Button>
        )}
        <div>
          <FileInput
            onFiles={onFiles}
            label="Add more images"
            id={inputId}
            multiple
          />
          <label
            htmlFor={inputId}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
            )}
          >
            <IconPhotoPlus aria-hidden="true" /> Add images
          </label>
        </div>
        <Button variant="ghost" size="lg" onClick={onClear}>
          <IconTrash aria-hidden="true" /> Clear all
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {totals.pending > 0
          ? `${verb} ${totals.pending} image${totals.pending === 1 ? "" : "s"}…`
          : totals.done > 0
            ? "All images are ready."
            : ""}
      </p>
    </div>
  )
}
