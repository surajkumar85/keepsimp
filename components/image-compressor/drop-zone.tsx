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

export function FileInput({
  onFiles,
  disabled,
  label,
  id = INPUT_ID,
  multiple,
  accept = acceptedInput,
}: {
  onFiles: (files: File[]) => void
  disabled?: boolean
  label: string
  id?: string
  multiple?: boolean
  /** File types offered by the picker; images by default. */
  accept?: string
}) {
  return (
    <input
      id={id}
      type="file"
      accept={accept}
      aria-label={label}
      disabled={disabled}
      multiple={multiple}
      className="peer sr-only"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ""
        if (files.length) onFiles(files)
      }}
    />
  )
}

export function useDropTarget(
  onFiles: (files: File[]) => void,
  disabled?: boolean
) {
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
        const files = Array.from(event.dataTransfer.files)
        if (files.length && !disabled) onFiles(files)
      },
    },
  }
}

export interface DropZoneCopy {
  heading: string
  dropping: string
  body: string
  inputLabel: string
  action: string
  limits: string
}

const compressorCopy: DropZoneCopy = {
  heading: "Drop an image to compress",
  dropping: "Drop to start compressing",
  body: "Or choose one from your device. You can also paste an image with ⌘V or Ctrl+V.",
  inputLabel: "Choose an image to compress",
  action: "Choose image",
  limits: "Stays on your device · up to 50 MB and 50 megapixels",
}

export function DropZone({
  onFile,
  onFiles,
  onSample,
  busy,
  copy = compressorCopy,
  inputId = INPUT_ID,
  formats = listedFormats,
  accept,
  icon: Icon = IconPhotoUp,
}: {
  /** Receives the first file; use `onFiles` to accept several at once. */
  onFile?: (file: File) => void
  onFiles?: (files: File[]) => void
  onSample: () => void
  busy: boolean
  copy?: DropZoneCopy
  inputId?: string
  /** Format names listed under the buttons. */
  formats?: string[]
  accept?: string
  /** Shown above the heading and on the button; a picture by default. */
  icon?: typeof IconPhotoUp
}) {
  const emit = (files: File[]) =>
    onFiles ? onFiles(files) : onFile?.(files[0])
  const { over, handlers } = useDropTarget(emit, busy)
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
        <Icon className="size-6" stroke={1.7} aria-hidden="true" />
      </div>
      <h2 className="font-heading text-xl font-medium">
        {over ? copy.dropping : copy.heading}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{copy.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <div>
          <FileInput
            onFiles={emit}
            disabled={busy}
            label={copy.inputLabel}
            id={inputId}
            multiple={Boolean(onFiles)}
            accept={accept}
          />
          <label
            htmlFor={inputId}
            className={cn(
              buttonVariants({ size: "lg" }),
              "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50"
            )}
          >
            <Icon aria-hidden="true" /> {copy.action}
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
        {formats.map((format) => (
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
        {copy.limits}
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
  const { over, handlers } = useDropTarget((files) => onFile(files[0]), busy)
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
        <FileInput
          onFiles={(files) => onFile(files[0])}
          disabled={busy}
          label="Replace image"
        />
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
