"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"
import {
  IconLock,
  IconPhotoUp,
  IconRefresh,
  IconSparkles,
  IconX,
} from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import { acceptedInput } from "@/lib/image-compressor/formats"

export const INPUT_ID = "compressor-file"

const listedFormats = [
  "JPEG",
  "PNG",
  "WebP",
  "AVIF",
  "HEIC",
  "GIF",
  "BMP",
  "TIFF",
  "SVG",
  "JPEG XL",
]

function FileInput({
  onFile,
  disabled,
  label,
}: {
  onFile: (file: File) => void
  disabled?: boolean
  label: string
}) {
  return (
    <input
      id={INPUT_ID}
      type="file"
      accept={acceptedInput}
      aria-label={label}
      disabled={disabled}
      className="peer sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (file) onFile(file)
      }}
    />
  )
}

function useDropTarget(onFile: (file: File) => void, disabled?: boolean) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  return {
    over,
    handlers: {
      onDragEnter: (event: DragEvent) => {
        event.preventDefault()
        depth.current++
        setOver(true)
      },
      onDragOver: (event: DragEvent) => event.preventDefault(),
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1)
        if (!depth.current) setOver(false)
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        depth.current = 0
        setOver(false)
        const file = event.dataTransfer.files[0]
        if (file && !disabled) onFile(file)
      },
    },
  }
}

export function DropZone({
  onFile,
  onSample,
  busy,
}: {
  onFile: (file: File) => void
  onSample: () => void
  busy: boolean
}) {
  const { over, handlers } = useDropTarget(onFile, busy)
  return (
    <div
      {...handlers}
      data-testid="drop-zone"
      data-dragging={over || undefined}
      className={cn(
        "flex flex-col items-center rounded-xl border-2 border-dashed bg-card px-4 py-10 text-center transition-[border-color,background-color,transform] duration-200 motion-reduce:transition-none sm:px-8 sm:py-14",
        over &&
          "scale-[1.01] border-primary bg-primary/5 motion-reduce:scale-100"
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <IconPhotoUp className="size-6" stroke={1.7} aria-hidden="true" />
      </div>
      <h2 className="font-heading text-xl font-medium">
        {over ? "Drop to start compressing" : "Drop an image to compress"}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Or choose one from your device. You can also paste an image with ⌘V or
        Ctrl+V.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <div>
          <FileInput
            onFile={onFile}
            disabled={busy}
            label="Choose an image to compress"
          />
          <label
            htmlFor={INPUT_ID}
            className={cn(
              buttonVariants({ size: "lg" }),
              "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50"
            )}
          >
            <IconPhotoUp aria-hidden="true" /> Choose image
          </label>
        </div>
        <Button variant="outline" size="lg" onClick={onSample} disabled={busy}>
          <IconSparkles aria-hidden="true" /> Try a sample
        </Button>
      </div>
      <ul
        aria-label="Supported formats"
        className="mt-6 flex max-w-lg flex-wrap justify-center gap-1.5"
      >
        {listedFormats.map((format) => (
          <li
            key={format}
            className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground"
          >
            {format}
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <IconLock className="size-3.5" aria-hidden="true" />
        Stays on your device · up to 50 MB and 50 megapixels
      </p>
    </div>
  )
}

export function FileBar({
  name,
  details,
  preview,
  onFile,
  onRemove,
  busy,
}: {
  name: string
  details: string
  preview: ImageBitmap | null
  onFile: (file: File) => void
  onRemove: () => void
  busy: boolean
}) {
  const thumbnail = useRef<HTMLCanvasElement>(null)
  const { over, handlers } = useDropTarget(onFile, busy)
  useEffect(() => {
    const canvas = thumbnail.current
    if (!canvas || !preview) return
    const scale = 96 / Math.max(preview.width, preview.height)
    canvas.width = Math.max(1, Math.round(preview.width * scale))
    canvas.height = Math.max(1, Math.round(preview.height * scale))
    canvas
      .getContext("2d")
      ?.drawImage(preview, 0, 0, canvas.width, canvas.height)
  }, [preview])
  return (
    <div
      {...handlers}
      data-testid="file-bar"
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors duration-150",
        over && "border-primary bg-primary/5"
      )}
    >
      <div className="checkerboard flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border">
        <canvas
          ref={thumbnail}
          aria-hidden="true"
          className="max-h-full max-w-full"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{details}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <FileInput onFile={onFile} disabled={busy} label="Replace image" />
        <label
          htmlFor={INPUT_ID}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50"
          )}
        >
          <IconRefresh aria-hidden="true" />
          <span className="hidden sm:inline">Replace</span>
        </label>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove image"
          onClick={onRemove}
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
