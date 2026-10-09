"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import {
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconLock,
  IconPhoto,
  IconWand,
} from "@tabler/icons-react"
import { EditorialImage } from "@/components/editorial-image"
import { Button } from "@/components/ui/button"
import { useWebpExport } from "@/hooks/use-webp-export"
import { processImage, sizeLabel } from "@/lib/image-tools"

export function LandingDemo() {
  const [result, setResult] = useState<{
    url: string
    size: number
    original: number
    filename: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const operation = useRef(0)
  const webpSupported = useWebpExport()
  useEffect(
    () => () => {
      operation.current++
    },
    []
  )
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url)
    },
    [result]
  )
  async function run() {
    const id = ++operation.current
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/images/coastline.jpg")
      if (!response.ok)
        throw new Error("The sample could not load. Please try again.")
      const source = await response.blob()
      const file = new File([source], "coastline.jpg", { type: "image/jpeg" })
      const processed = await processImage(file, {
        width: 960,
        quality: 0.78,
        format: webpSupported ? "image/webp" : "image/jpeg",
      })
      if (id === operation.current)
        setResult({
          url: URL.createObjectURL(processed.blob),
          size: processed.blob.size,
          original: source.size,
          filename: processed.filename,
        })
    } catch (e) {
      if (id === operation.current) setError((e as Error).message)
    } finally {
      if (id === operation.current) setBusy(false)
    }
  }
  return (
    <div className="demo-window enter-delayed mx-auto max-w-4xl overflow-hidden rounded-2xl border bg-card text-left">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <IconPhoto className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium">
            A little lighter. Just as lovely.
          </span>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <IconLock className="size-3.5" aria-hidden="true" /> All on your
          device
        </span>
      </div>
      <div className="grid gap-5 p-4 sm:grid-cols-2 sm:gap-6 sm:p-6">
        <div className="relative overflow-hidden rounded-lg">
          {result ? (
            <Image
              src={result.url}
              alt="The optimized coastal image, ready to download"
              width={960}
              height={640}
              className="aspect-3/2 w-full object-cover"
              unoptimized
            />
          ) : (
            <EditorialImage
              src="/images/coastline-display.webp"
              alt="A sunlit coastal house overlooking turquoise water, used as the sample image"
              width={960}
              height={640}
              className="aspect-3/2 w-full object-cover"
              eager
              sizes="(max-width: 639px) calc(100vw - 66px), 404px"
            />
          )}
          <span className="absolute bottom-3 left-3 rounded-md bg-card/95 px-2.5 py-1.5 text-xs font-medium">
            {result
              ? `${result.filename.replace("-keepsimp", "")} · Optimized`
              : "coastline.jpg · Original"}
          </span>
        </div>
        <div className="flex flex-col justify-center">
          <p className="eyebrow text-primary">Try a real example</p>
          <h2 className="mt-2 font-heading text-2xl font-medium tracking-tight">
            Same view. Less baggage.
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Turn this sample into a smaller {webpSupported ? "WebP" : "JPEG"}.
            Your browser does the work, and you can download the result.
          </p>
          <ol
            className="my-5 flex items-center gap-2 text-xs text-muted-foreground"
            aria-label="Example workflow"
          >
            <li className="flex items-center gap-1">
              <IconCheck className="size-3.5 text-primary" aria-hidden="true" />{" "}
              Choose
            </li>
            <li aria-hidden="true">
              <IconArrowRight className="size-3.5" />
            </li>
            <li className={busy || result ? "text-primary" : ""}>Optimize</li>
            <li aria-hidden="true">
              <IconArrowRight className="size-3.5" />
            </li>
            <li className={result ? "text-primary" : ""}>Download</li>
          </ol>
          <div className={busy ? "demo-working" : ""}>
            {result ? (
              <div className="space-y-3">
                <p role="status" className="text-sm font-medium text-primary">
                  {sizeLabel(result.original)} → {sizeLabel(result.size)} ·{" "}
                  {Math.max(
                    0,
                    Math.round((1 - result.size / result.original) * 100)
                  )}
                  % smaller
                </p>
                <a
                  href={result.url}
                  download={result.filename}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  <IconDownload className="size-4" aria-hidden="true" />{" "}
                  Download example
                </a>
                <Button
                  variant="ghost"
                  onClick={() => setResult(null)}
                  className="ml-1"
                >
                  Try again
                </Button>
              </div>
            ) : (
              <Button size="lg" onClick={() => void run()} disabled={busy}>
                <IconWand aria-hidden="true" />{" "}
                {busy ? "Optimizing locally…" : "Try image compression"}
              </Button>
            )}
          </div>
          {busy && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Processing the sample in this browser.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            No upload. No sign-up. Just a smaller image.
          </p>
        </div>
      </div>
    </div>
  )
}
