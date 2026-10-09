"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useWebpExport } from "@/hooks/use-webp-export"
import {
  IconUpload,
  IconDownload,
  IconPhoto,
  IconLock,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  decodeImage,
  processImage,
  sizeLabel,
  type ImageFormat,
} from "@/lib/image-tools"

export function ImageTool({ mode }: { mode: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState("")
  const [result, setResult] = useState<{
    url: string
    filename: string
    size: number
    width: number
    height: number
  } | null>(null)
  const [width, setWidth] = useState("1200")
  const [quality, setQuality] = useState(80)
  const [format, setFormat] = useState<ImageFormat>("image/jpeg")
  const webpSupported = useWebpExport()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const operation = useRef(0)
  useEffect(
    () => () => {
      operation.current++
    },
    []
  )
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview]
  )
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url)
    },
    [result]
  )
  async function chooseFile(selected?: File) {
    if (!selected) return
    const id = ++operation.current
    setResult(null)
    setError("")
    setBusy(true)
    setFile(null)
    setPreview("")
    try {
      const bitmap = await decodeImage(selected)
      const defaultWidth = Math.round(
        bitmap.width * Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height))
      )
      bitmap.close()
      if (id === operation.current) {
        setFile(selected)
        setPreview(URL.createObjectURL(selected))
        setWidth(String(defaultWidth))
      }
    } catch (e) {
      if (id === operation.current) setError((e as Error).message)
    } finally {
      if (id === operation.current) setBusy(false)
    }
  }
  async function run() {
    if (!file) return
    const id = ++operation.current
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const processed = await processImage(file, {
        width: Number(width),
        quality: quality / 100,
        format,
      })
      if (id === operation.current)
        setResult({
          url: URL.createObjectURL(processed.blob),
          filename: processed.filename,
          size: processed.blob.size,
          width: processed.width,
          height: processed.height,
        })
    } catch (e) {
      if (id === operation.current) setError((e as Error).message)
    } finally {
      if (id === operation.current) setBusy(false)
    }
  }
  function resetResult() {
    setResult(null)
    setError("")
  }
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div
          className="rounded-xl border border-dashed bg-accent/40 p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (!busy) void chooseFile(e.dataTransfer.files[0])
          }}
        >
          <IconUpload
            className="mx-auto mb-3 size-8 text-primary"
            aria-hidden="true"
          />
          <label
            htmlFor="image-file"
            className="mb-2 block font-heading text-xl"
          >
            Choose an image to get started
          </label>
          <p className="mb-4 text-sm text-muted-foreground">
            Drop a JPEG, PNG or WebP here. Up to 20 MB and 16 megapixels.
          </p>
          <Input
            id="image-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              void chooseFile(e.target.files?.[0])
              e.target.value = ""
            }}
            disabled={busy}
            className="mx-auto max-w-sm cursor-pointer text-sm"
          />
        </div>
        {preview && (
          <div className="rounded-xl border p-4">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate">{file!.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {sizeLabel(file!.size)}
              </span>
            </div>
            <Image
              src={preview}
              alt="Your original image"
              width={4096}
              height={4096}
              unoptimized
              className="mt-3 h-64 w-full rounded-md object-contain"
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="space-y-5 rounded-xl border p-5 lg:col-span-2">
        <h2 className="section-title">Make it yours</h2>
        <div>
          <label
            htmlFor="image-format"
            className="mb-2 block text-sm font-medium"
          >
            Output format
          </label>
          <select
            id="image-format"
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as ImageFormat)
              resetResult()
            }}
            disabled={busy}
            className="form-select"
          >
            <option value="image/webp" disabled={!webpSupported}>
              {webpSupported
                ? "WebP"
                : "WebP (export unavailable in this browser)"}
            </option>
            <option value="image/jpeg">JPEG</option>
            <option value="image/png">PNG</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="image-width"
            className="mb-2 block text-sm font-medium"
          >
            Width in pixels
          </label>
          <Input
            id="image-width"
            type="number"
            min="1"
            max="4096"
            step="1"
            value={width}
            onChange={(e) => {
              setWidth(e.target.value)
              resetResult()
            }}
            disabled={busy}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Height adjusts to keep the original proportions.
          </p>
        </div>
        <div>
          <label
            htmlFor="image-quality"
            className="mb-2 flex justify-between text-sm font-medium"
          >
            <span>Quality</span>
            <span>{quality}%</span>
          </label>
          <input
            id="image-quality"
            type="range"
            min="10"
            max="100"
            value={quality}
            onChange={(e) => {
              setQuality(Number(e.target.value))
              resetResult()
            }}
            disabled={busy || format === "image/png"}
            className="min-h-11 w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            {format === "image/png"
              ? "PNG is lossless; this quality slider does not apply."
              : "Higher quality usually means a larger file."}
          </p>
        </div>
        {format === "image/jpeg" && (
          <p className="text-xs text-muted-foreground">
            Transparent areas become white in JPEG.
          </p>
        )}
        <Button
          onClick={() => void run()}
          disabled={!file || busy}
          className="w-full"
        >
          <IconPhoto aria-hidden="true" />{" "}
          {busy
            ? "Processing…"
            : mode === "image-resizer"
              ? "Resize image"
              : mode === "image-converter"
                ? "Convert image"
                : "Compress image"}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <IconLock className="size-3.5" aria-hidden="true" /> Processed on your
          device
        </p>
        {result && (
          <div className="space-y-3 border-t pt-4" role="status">
            <p className="font-medium">Your image is ready</p>
            <p className="text-sm text-muted-foreground">
              {result.width} × {result.height} · {sizeLabel(result.size)}
              {file && result.size < file.size
                ? ` · ${Math.round((1 - result.size / file.size) * 100)}% smaller`
                : " · Size depends on the source"}
            </p>
            <a
              href={result.url}
              download={result.filename}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-3 font-medium text-primary-foreground"
            >
              <IconDownload className="size-4" aria-hidden="true" /> Download
              image
            </a>
          </div>
        )}
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            Working locally. Large images may take a moment.
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Still images only. Exporting may remove metadata, color profiles and
          animation. Keep your original file.
        </p>
      </div>
    </div>
  )
}
