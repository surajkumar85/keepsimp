"use client"

import { useEffect, useRef } from "react"
import {
  IconAlertCircle,
  IconDownload,
  IconLoader2,
  IconX,
} from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import { sizeLabel } from "@/lib/image-compressor/formats"
import type { ItemState } from "@/lib/image-batch/queue"

export interface QueueRow {
  id: string
  name: string
  thumbnail: ImageBitmap | null
  state: ItemState
  /** For example "JPEG · 4032 × 3024 · 2.41 MB". */
  details: string
  message: string | null
  outputs: {
    name: string
    url: string
    width: number
    height: number
    bytes: number
    /** Shown on the download chip; defaults to the dimensions. */
    label?: string
  }[]
}

function Thumbnail({ bitmap }: { bitmap: ImageBitmap | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element || !bitmap) return
    const scale = 96 / Math.max(bitmap.width, bitmap.height)
    element.width = Math.max(1, Math.round(bitmap.width * scale))
    element.height = Math.max(1, Math.round(bitmap.height * scale))
    element
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, element.width, element.height)
  }, [bitmap])
  return (
    <span className="checkerboard flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border">
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="max-h-full max-w-full"
      />
    </span>
  )
}

/** The batch: one row per image with its status, result and downloads. */
export function QueueList({
  rows,
  selectedId,
  onSelect,
  onRemove,
  label = "Images",
}: {
  rows: QueueRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  /** Names the list for screen readers. */
  label?: string
}) {
  return (
    <ul aria-label={label} data-testid="queue" className="space-y-2">
      {rows.map((row) => {
        const selected = row.id === selectedId
        const total = row.outputs.reduce((sum, output) => sum + output.bytes, 0)
        return (
          <li
            key={row.id}
            data-testid="queue-item"
            data-state={row.state}
            className={cn(
              "rounded-xl border bg-card p-2 transition-colors duration-150 motion-reduce:transition-none",
              selected && "border-primary"
            )}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`Preview ${row.name}`}
                onClick={() => onSelect(row.id)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Thumbnail bitmap={row.thumbnail} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {row.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.details}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 truncate text-xs",
                      row.state === "error" || row.state === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {(row.state === "reading" || row.state === "waiting") && (
                      <IconLoader2
                        className="size-3 shrink-0 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    )}
                    {(row.state === "error" || row.state === "failed") && (
                      <IconAlertCircle
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">
                      {row.message ??
                        (row.state === "done"
                          ? row.outputs.length === 1
                            ? `${row.outputs[0].width} × ${row.outputs[0].height} · ${sizeLabel(total)}`
                            : `${row.outputs.length} files · ${sizeLabel(total)}`
                          : row.state === "reading"
                            ? "Reading…"
                            : "Waiting…")}
                    </span>
                  </span>
                </span>
              </button>
              {row.outputs.length === 1 && (
                <a
                  href={row.outputs[0].url}
                  download={row.outputs[0].name}
                  aria-label={`Download ${row.outputs[0].name}`}
                  className={buttonVariants({
                    variant: "outline",
                    size: "icon",
                  })}
                >
                  <IconDownload aria-hidden="true" />
                </a>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${row.name}`}
                onClick={() => onRemove(row.id)}
              >
                <IconX aria-hidden="true" />
              </Button>
            </div>
            {row.outputs.length > 1 && (
              <ul
                aria-label={`Files for ${row.name}`}
                className="mt-2 flex flex-wrap gap-1.5 pl-1"
              >
                {row.outputs.map((output) => (
                  <li key={output.url}>
                    <a
                      href={output.url}
                      download={output.name}
                      aria-label={`Download ${output.name}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-11 rounded-full px-3 text-xs md:h-7"
                      )}
                    >
                      <IconDownload aria-hidden="true" />
                      {output.label ?? `${output.width} × ${output.height}`}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
