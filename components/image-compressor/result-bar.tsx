"use client"

import {
  IconArrowRight,
  IconDownload,
  IconInfoCircle,
} from "@tabler/icons-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import {
  outputFormats,
  sizeLabel,
  type OutputFormat,
} from "@/lib/image-compressor/formats"
import type { Size } from "@/lib/image-compressor/geometry"
import { savingsPercent } from "@/lib/image-compressor/quality"

export interface CompressedResult {
  url: string
  filename: string
  bytes: number
  format: OutputFormat
  size: Size
  similarity: number
  quality: number | null
  fits: boolean | null
  downscaled: boolean
}

export function ResultBar({
  result,
  originalBytes,
  originalUrl,
  originalName,
  originalBetter,
  target,
  stale,
}: {
  result: CompressedResult
  originalBytes: number
  originalUrl: string
  originalName: string
  originalBetter: boolean
  target: string | null
  stale: boolean
}) {
  const saved = savingsPercent(originalBytes, result.bytes)
  const detail = Math.min(100, result.similarity * 100)
  return (
    <div
      role="status"
      aria-busy={stale}
      className={cn(
        "space-y-4 rounded-xl border bg-card p-4 transition-opacity duration-200 motion-reduce:transition-none",
        stale && "opacity-70"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-heading text-lg font-medium">
          {sizeLabel(originalBytes)}
          <IconArrowRight
            className="mx-1.5 inline size-4 text-muted-foreground"
            aria-label="to"
          />
          {sizeLabel(result.bytes)}
        </p>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-sm font-medium",
            saved > 0
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {saved > 0
            ? `${saved}% smaller`
            : saved === 0
              ? "Same size"
              : `${-saved}% larger`}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Format</dt>
          <dd className="font-medium">{outputFormats[result.format].label}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Dimensions</dt>
          <dd className="font-medium">
            {result.size.width} × {result.size.height}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Detail kept</dt>
          <dd className="font-medium">
            {detail >= 99.95 ? "100%" : `${detail.toFixed(1)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Quality</dt>
          <dd className="font-medium">
            {result.quality !== null
              ? result.quality
              : result.similarity >= 0.99995
                ? "Lossless"
                : "Palette"}
          </dd>
        </div>
      </dl>
      {target && result.fits === false && (
        <p className="flex gap-2 text-sm text-destructive">
          <IconInfoCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          This is the smallest file we could make, but it is still above{" "}
          {target}. Try a smaller size or another format.
        </p>
      )}
      {target && result.fits && result.downscaled && (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <IconInfoCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          To fit within {target}, the image was reduced to {result.size.width} ×{" "}
          {result.size.height} px.
        </p>
      )}
      {originalBetter && (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <IconInfoCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          Your original is already smaller. It is well optimised; keep it or try
          another format.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          href={result.url}
          download={result.filename}
          aria-disabled={stale || undefined}
          className={cn(
            buttonVariants({ size: "lg" }),
            "flex-1 sm:flex-none",
            stale && "pointer-events-none opacity-50"
          )}
        >
          <IconDownload aria-hidden="true" /> Download{" "}
          {outputFormats[result.format].label}
          <span className="font-normal">· {sizeLabel(result.bytes)}</span>
        </a>
        {originalBetter && (
          <a
            href={originalUrl}
            download={originalName}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Download original
          </a>
        )}
      </div>
    </div>
  )
}
