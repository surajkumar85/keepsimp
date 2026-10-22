"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconCrop,
  IconInfoCircle,
  IconScale,
  IconSparkles,
} from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { CompareSlider } from "./compare-slider"
import { CropOverlay } from "./crop-overlay"
import { DropZone, FileBar } from "./drop-zone"
import { ResultBar, type CompressedResult } from "./result-bar"
import { SettingsPanel } from "./settings-panel"
import {
  CompressorClient,
  inspectFile,
  rasteriseSvg,
} from "@/lib/image-compressor/client"
import {
  inputFormats,
  outputFilename,
  outputFormats,
  sameFormatOutput,
  sizeLabel,
  type InputFormat,
} from "@/lib/image-compressor/formats"
import { aspectValue } from "@/lib/image-compressor/geometry"
import type {
  CompressRequest,
  WorkerResponse,
} from "@/lib/image-compressor/protocol"
import { originalIsBetter } from "@/lib/image-compressor/quality"
import {
  backgroundRgb,
  buildPlan,
  candidateFormats,
  cropBounds,
  defaultSettings,
  isEdited,
  settingsForImage,
  targetBytes,
  type CompressorSettings,
} from "@/lib/image-compressor/settings"

interface Source {
  width: number
  height: number
  transparent: boolean
  preview: ImageBitmap
}

type Result = CompressedResult & { reference: ImageBitmap; key: string }

const DEBOUNCE_MS = 350

export function ImageCompressor() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<InputFormat | null>(null)
  const [animated, setAnimated] = useState(false)
  const [source, setSource] = useState<Source | null>(null)
  const [opening, setOpening] = useState(false)
  const [settings, setSettings] = useState<CompressorSettings>(defaultSettings)
  const [result, setResult] = useState<Result | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [jobError, setJobError] = useState("")
  const [cropping, setCropping] = useState(false)
  const [paused, setPaused] = useState(false)
  const [originalUrl, setOriginalUrl] = useState("")

  const client = useRef<CompressorClient | null>(null)
  const jobId = useRef(0)
  const jobKeys = useRef(new Map<number, string>())
  const openToken = useRef(0)
  const reopening = useRef(false)
  const fileRef = useRef<File | null>(null)

  const handleMessage = useEffectEvent((message: WorkerResponse) => {
    if (message.type === "opened") {
      if (reopening.current) {
        reopening.current = false
        message.preview.close()
        return
      }
      setSource({
        width: message.width,
        height: message.height,
        transparent: message.transparent,
        preview: message.preview,
      })
      setSettings((current) =>
        settingsForImage(current, {
          width: message.width,
          height: message.height,
        })
      )
      setOpening(false)
    } else if (message.type === "open-error") {
      reopening.current = false
      setOpening(false)
      setFile(null)
      setFormat(null)
      setError(message.message)
    } else if (message.type === "progress") {
      if (message.id === jobId.current) setStatus(message.label)
    } else if (message.type === "done") {
      if (message.id !== jobId.current || !fileRef.current) {
        message.reference.close()
        return
      }
      const blob = new Blob([message.bytes], {
        type: outputFormats[message.format].mime,
      })
      setResult({
        url: URL.createObjectURL(blob),
        filename: outputFilename(fileRef.current.name, message.format),
        bytes: blob.size,
        format: message.format,
        size: message.size,
        similarity: message.similarity,
        quality: message.quality,
        fits: message.fits,
        downscaled: message.downscaled,
        reference: message.reference,
        key: jobKeys.current.get(message.id) ?? "",
      })
      setStatus(null)
    } else if (message.id === jobId.current) {
      setStatus(null)
      setJobError(message.message)
    }
  })

  // A layout effect: React runs it in the task that puts the tool on the
  // page, so a file chosen at once already finds the client. A passive
  // effect can run after that first event, and what it asked for is lost.
  useLayoutEffect(() => {
    const instance = new CompressorClient((message) => handleMessage(message))
    client.current = instance
    return () => {
      instance.dispose()
      client.current = null
    }
  }, [])

  // Release object URLs and bitmaps when they are replaced or on unmount.
  useEffect(
    () => () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl)
    },
    [originalUrl]
  )
  useEffect(
    () => () => {
      if (result) {
        URL.revokeObjectURL(result.url)
        result.reference.close()
      }
    },
    [result]
  )
  useEffect(() => () => source?.preview.close(), [source])

  const clear = useCallback(() => {
    jobId.current++
    setResult(null)
    setSource(null)
    setStatus(null)
    setError("")
    setJobError("")
    setCropping(false)
    setPaused(false)
    setAnimated(false)
  }, [])

  const chooseFile = useCallback(
    async (selected: File) => {
      const token = ++openToken.current
      clear()
      setFile(null)
      fileRef.current = null
      setFormat(null)
      setOriginalUrl("")
      setOpening(true)
      try {
        const inspected = await inspectFile(selected)
        const pixels =
          inspected.format === "svg" ? await rasteriseSvg(selected) : undefined
        if (token !== openToken.current) return
        setFile(selected)
        fileRef.current = selected
        setFormat(inspected.format)
        setAnimated(inspected.animated)
        setOriginalUrl(URL.createObjectURL(selected))
        reopening.current = false
        client.current?.open({
          type: "open",
          file: selected,
          format: inspected.format,
          pixels,
        })
      } catch (problem) {
        if (token !== openToken.current) return
        setOpening(false)
        setError((problem as Error).message)
      }
    },
    [clear]
  )

  async function loadSample() {
    setError("")
    try {
      const response = await fetch("/images/coastline.jpg")
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      void chooseFile(new File([blob], "coastline.jpg", { type: "image/jpeg" }))
    } catch {
      setError(
        "The sample could not load. Check your connection and try again."
      )
    }
  }

  function remove() {
    openToken.current++
    clear()
    setFile(null)
    fileRef.current = null
    setFormat(null)
    setOriginalUrl("")
    setOpening(false)
  }

  // Paste an image from the clipboard anywhere on the page.
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      const pasted = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/")
      )
      if (!pasted) return
      event.preventDefault()
      void chooseFile(
        pasted.name && pasted.name !== "image.png"
          ? pasted
          : new File([pasted], "pasted-image.png", { type: pasted.type })
      )
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [chooseFile])

  const sourceSize = useMemo(
    () => (source ? { width: source.width, height: source.height } : null),
    [source]
  )
  const { plan, error: planError } = useMemo(
    () =>
      sourceSize
        ? buildPlan(settings, sourceSize)
        : { plan: null, error: null },
    [settings, sourceSize]
  )
  const target = targetBytes(settings)
  const targetError =
    settings.compression === "target" && !target
      ? "Enter a target size greater than zero."
      : null

  const update = useCallback(
    (
      change:
        | Partial<CompressorSettings>
        | ((current: CompressorSettings) => CompressorSettings)
    ) => {
      setPaused(false)
      setSettings((current) =>
        typeof change === "function"
          ? change(current)
          : { ...current, ...change }
      )
    },
    []
  )

  // Everything the worker needs except the job id; its JSON identifies a result.
  const request = useMemo(() => {
    if (!source || !format || !plan || targetError) return null
    const body: Omit<CompressRequest, "id"> = {
      type: "compress",
      plan,
      candidates: candidateFormats(
        settings.format,
        format,
        source.transparent,
        settings.compression === "lossless"
      ),
      compression: settings.compression,
      quality: settings.quality,
      targetBytes: target,
      allowDownscale: settings.allowDownscale,
      effort: settings.effort,
      chroma444: settings.chroma444,
      progressive: settings.progressive,
      pngColors: settings.pngColors,
      dithering: settings.dithering,
      resample: settings.resample,
      background: backgroundRgb(settings),
    }
    return { body, key: JSON.stringify(body) }
  }, [source, format, plan, targetError, settings, target])

  // Recompress shortly after settings settle; newer jobs supersede older ones.
  const shownKey = useRef<string | null>(null)
  useEffect(() => {
    shownKey.current = result?.key ?? null
  }, [result])
  useEffect(() => {
    if (!request || paused) return
    const timer = setTimeout(() => {
      const id = ++jobId.current
      if (shownKey.current === request.key) {
        // The visible result already matches (for example after switching back).
        client.current?.supersede(id)
        setStatus(null)
        return
      }
      jobKeys.current.set(id, request.key)
      setJobError("")
      setStatus("Starting…")
      client.current?.compress({ ...request.body, id })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [request, paused])

  function cancel() {
    jobId.current++
    reopening.current = true
    client.current?.cancel()
    setStatus(null)
    setPaused(true)
  }

  const bounds = source && sourceSize ? cropBounds(settings, sourceSize) : null
  const originalBetter =
    result && file && format && sourceSize
      ? originalIsBetter({
          originalBytes: file.size,
          resultBytes: result.bytes,
          sameFormat: result.format === sameFormatOutput(format),
          sameDimensions:
            result.size.width === sourceSize.width &&
            result.size.height === sourceSize.height,
          edited: isEdited(settings),
        })
      : false
  const details =
    file && format
      ? [
          inputFormats[format].label,
          sizeLabel(file.size),
          source ? `${source.width} × ${source.height} px` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : ""
  const outputSize = result?.size ?? plan?.output ?? sourceSize

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="image-compressor"
      data-settled={
        Boolean(result && !status && request && result.key === request.key) ||
        undefined
      }
    >
      <div className="min-w-0 space-y-4 lg:col-span-3">
        {file && format ? (
          <FileBar
            name={file.name}
            details={details}
            preview={source?.preview ?? null}
            onFile={(selected) => void chooseFile(selected)}
            onRemove={remove}
            busy={opening}
          />
        ) : (
          <DropZone
            onFile={(selected) => void chooseFile(selected)}
            onSample={() => void loadSample()}
            busy={opening}
          />
        )}
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <IconAlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {error}
          </p>
        )}
        {opening && (
          <div className="space-y-3" role="status">
            <Skeleton className="h-80 w-full rounded-xl sm:h-96 lg:h-[30rem]" />
            <p className="text-sm text-muted-foreground">Reading your image…</p>
          </div>
        )}
        {(animated || format === "svg") && source && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <IconInfoCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {animated
              ? "This image is animated. Only the first frame is compressed."
              : `SVG is vector art, so it is drawn at ${source.width} × ${source.height} px before compressing.`}
          </p>
        )}
        {source && bounds && sourceSize && (
          <>
            {cropping ? (
              <CropOverlay
                preview={source.preview}
                bounds={bounds}
                rotation={settings.rotation}
                flipX={settings.flipX}
                flipY={settings.flipY}
                crop={settings.crop}
                aspect={aspectValue(settings.aspect, bounds)}
                onChange={(crop) => update({ crop })}
                onReset={() => update({ crop: null, aspect: "free" })}
                onDone={() => setCropping(false)}
              />
            ) : (
              <CompareSlider
                reference={
                  result?.reference ??
                  (isEdited(settings) ? null : source.preview)
                }
                resultUrl={result?.url ?? null}
                size={outputSize!}
                originalLabel={`Original · ${sizeLabel(file!.size)}`}
                resultLabel={
                  result
                    ? `${outputFormats[result.format].label} · ${sizeLabel(result.bytes)}`
                    : null
                }
                status={status}
                onCancel={cancel}
              />
            )}
            <p className="sr-only" aria-live="polite">
              {status ? "Compressing your image…" : ""}
            </p>
            {paused && !status && (
              <p className="text-sm text-muted-foreground">
                Compression cancelled. Change a setting to try again.
              </p>
            )}
            {jobError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <IconAlertCircle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {jobError}
              </p>
            )}
            {targetError && (
              <p role="alert" className="text-sm text-destructive">
                {targetError}
              </p>
            )}
            {result && !cropping && file && (
              <ResultBar
                result={result}
                originalBytes={file.size}
                originalUrl={originalUrl}
                originalName={file.name}
                originalBetter={originalBetter}
                target={
                  settings.compression === "target" && target
                    ? sizeLabel(target)
                    : null
                }
                stale={Boolean(status)}
              />
            )}
          </>
        )}
      </div>
      <div className="lg:col-span-2">
        {source && format && sourceSize ? (
          <SettingsPanel
            settings={settings}
            update={update}
            input={format}
            transparent={source.transparent}
            source={sourceSize}
            output={plan?.output ?? null}
            planError={planError}
            cropping={cropping}
            onCrop={() => {
              if (!cropping && !settings.crop)
                update((current) => ({
                  ...current,
                  crop: { x: 0, y: 0, ...cropBounds(current, sourceSize) },
                }))
              setCropping((value) => !value)
            }}
          />
        ) : (
          <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="section-title">What you can do</h2>
            <ul className="space-y-3 text-sm">
              {[
                {
                  icon: IconSparkles,
                  title: "Smart compression",
                  text: "MozJPEG, WebP, AVIF and pngquant’s palette engine, tuned per image by measuring how much detail each file keeps.",
                },
                {
                  icon: IconScale,
                  title: "Compare before you download",
                  text: "Drag a slider across the original and the result at full size.",
                },
                {
                  icon: IconCrop,
                  title: "Resize, crop and rotate",
                  text: "Any pixel size, percentages, aspect ratios and exact crops.",
                },
                {
                  icon: IconAdjustmentsHorizontal,
                  title: "Target a file size",
                  text: "Ask for 200 KB, or any limit, and get the best quality that fits.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-medium">{item.title}</span>
                    <span className="text-muted-foreground">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
