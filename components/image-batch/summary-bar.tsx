"use client"

import { useEffect, useRef } from "react"
import {
  IconDownload,
  IconFileZip,
  IconLoader2,
  IconPhotoPlus,
  IconTrash,
} from "@tabler/icons-react"
import {
  FileInput,
  useDropTarget,
} from "@/components/image-compressor/drop-zone"
import { Button, buttonVariants } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
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
  noun = "image",
  accept,
  addIcon: AddIcon = IconPhotoPlus,
  applying = false,
}: {
  /** A change of settings has been seen and is about to be taken up: what is shown is about to be made again. */
  applying?: boolean
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
  /** What one item of the batch is called. */
  noun?: string
  /** File types offered by the picker; images by default. */
  accept?: string
  /** The picture on the button that adds files; a photo by default. */
  addIcon?: typeof IconPhotoPlus
}) {
  const { over, handlers } = useDropTarget(onFiles)
  const saved = savingsPercent(totals.originalBytes, totals.outputBytes)
  const working = applying || totals.pending > 0
  const plural = (count: number) => `${noun}${count === 1 ? "" : "s"}`
  // Work that ends is said in the corner too, where it is seen wherever the page is scrolled to.
  const before = useRef(working)
  useEffect(() => {
    if (before.current && !working && totals.done > 0)
      toast.success(
        totals.done === 1 && totals.images === 1
          ? `Your ${noun} is ready`
          : `${totals.done} ${plural(totals.done)} ready`,
        {
          description:
            totals.originalBytes > 0
              ? `${sizeLabel(totals.originalBytes)} → ${sizeLabel(totals.outputBytes)}`
              : undefined,
        }
      )
    before.current = working
    // Said once, as the work ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working])
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
      {working && (
        <div className="space-y-1.5" data-testid="batch-progress">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2
              className="size-4 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            {applying
              ? "Applying your changes…"
              : `${verb} ${totals.pending} ${plural(totals.pending)}…`}
          </p>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${noun}s ready`}
            aria-valuemin={0}
            aria-valuemax={totals.images}
            aria-valuenow={applying ? 0 : totals.done}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
              style={{
                width: `${applying || !totals.images ? 4 : Math.max(4, (totals.done / totals.images) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {single && applying ? (
          // While a change is taken up, the old file cannot be had: a button that says so, not a link.
          <Button size="lg" className="flex-1 sm:flex-none" disabled>
            <IconDownload aria-hidden="true" /> {singleLabel}
          </Button>
        ) : single ? (
          <a
            href={single.url}
            download={single.name}
            onClick={() =>
              toast.success("Download started", { description: single.name })
            }
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
            disabled={!totals.settled || zipping || applying}
            onClick={primary.onClick}
          >
            <IconDownload aria-hidden="true" /> {primary.label}
          </Button>
        ) : (
          <Button
            size="lg"
            className="flex-1 sm:flex-none"
            disabled={!totals.settled || zipping || applying}
            onClick={onZip}
          >
            <IconFileZip aria-hidden="true" />
            {zipping ? "Preparing ZIP…" : "Download all (ZIP)"}
          </Button>
        )}
        <div>
          <FileInput
            onFiles={onFiles}
            label={`Add more ${noun}s`}
            id={inputId}
            multiple
            accept={accept}
          />
          <label
            htmlFor={inputId}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
            )}
          >
            <AddIcon aria-hidden="true" /> Add {noun}s
          </label>
        </div>
        <Button variant="ghost" size="lg" onClick={onClear}>
          <IconTrash aria-hidden="true" /> Clear all
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {totals.pending > 0
          ? `${verb} ${totals.pending} ${plural(totals.pending)}…`
          : totals.done > 0
            ? `All ${noun}s are ready.`
            : ""}
      </p>
    </div>
  )
}
