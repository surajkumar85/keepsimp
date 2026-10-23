"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import {
  IconAlertCircle,
  IconFileTypePdf,
  IconInfoCircle,
  IconLock,
  IconScale,
  IconStack2,
  IconTransform,
} from "@tabler/icons-react"
import { SettingsCard } from "@/components/image-batch/controls"
import { QueueList, type QueueRow } from "@/components/image-batch/queue-list"
import { SummaryBar } from "@/components/image-batch/summary-bar"
import { CompareSlider } from "@/components/image-compressor/compare-slider"
import {
  DropZone,
  type DropZoneCopy,
} from "@/components/image-compressor/drop-zone"
import {
  itemState,
  nextJob,
  queueReducer,
  queueTotals,
  releasedUrls,
  type QueueAction,
  type QueueItem,
} from "@/lib/image-batch/queue"
import { inspectFile, rasteriseSvg } from "@/lib/image-compressor/client"
import {
  inputFormats,
  sizeLabel,
  type InputFormat,
} from "@/lib/image-compressor/formats"
import {
  compareFormats,
  ConverterPool,
  poolSize,
} from "@/lib/image-converter/client"
import { rankComparisons } from "@/lib/image-converter/compare"
import { createPdf, type PdfImage } from "@/lib/image-converter/encoders/pdf"
import { pictureSnippet } from "@/lib/image-converter/picture"
import type { ConverterResponse } from "@/lib/image-converter/protocol"
import {
  defaultSettings,
  limitedSize,
  MAX_BATCH,
  pdfOptions,
  processingKey,
  settingsProblem,
  usesTarget,
  type ConverterSettings,
} from "@/lib/image-converter/settings"
import { comparable, targets, type Target } from "@/lib/image-converter/targets"
import { fileName, uniqueNames } from "@/lib/image-resizer/naming"
import { createZip } from "@/lib/image-resizer/zip"
import {
  CONVERTER_GROUPS,
  converterChanges,
  type ConverterGroup,
} from "@/lib/image-converter/summary"
import { resetAll, resetOf } from "@/lib/settings-groups"
import { toast } from "@/components/ui/toast"
import { ComparePanel, FormatPanel, type ComparisonState } from "./format-panel"
import { OptionsPanel } from "./options-panel"

type Item = QueueItem<Target>

const INPUT_ID = "converter-file"
const DEBOUNCE_MS = 350
const COMBINED_NAME = "keepsimp-images.pdf"

const copy: DropZoneCopy = {
  heading: "Drop images to convert",
  dropping: "Drop to add these images",
  body: "Add one image or a whole batch. You can also paste an image with ⌘V or Ctrl+V.",
  inputLabel: "Choose images to convert",
  action: "Choose images",
  limits: `Stays on your device · up to ${MAX_BATCH} images, 50 MB and 50 megapixels each`,
}

interface Meta {
  format: InputFormat
  animated: boolean
  pixels?: {
    data: Uint8ClampedArray<ArrayBuffer>
    width: number
    height: number
  }
}

/** The settings that change comparison results: everything except the format choice and naming. */
const comparisonKey = (id: string, settings: ConverterSettings) =>
  JSON.stringify([
    id,
    settings.quality,
    settings.customQuality,
    settings.limit,
    settings.customLimit,
    settings.greyscale,
    settings.background,
    settings.backgroundColor,
  ])

function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  toast.success("Download started", { description: name })
}

export function ImageConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [settings, setSettings] = useState<ConverterSettings>(defaultSettings)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, ImageBitmap>>({})
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState("")
  const [paused, setPaused] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [before, setBefore] = useState<{
    id: string
    bitmap: ImageBitmap
  } | null>(null)
  /** The output shown in the slider: the first one this browser can display. */
  const [shown, setShown] = useState<{
    key: string
    url: string | null
    target: Target | null
  } | null>(null)
  /** The settings the workers were last asked to take up. */
  const [takenUp, setTakenUp] = useState("")
  const [compared, setCompared] = useState<{
    key: string
    state: ComparisonState
  } | null>(null)

  const live = useRef({
    items: [] as Item[],
    settings: defaultSettings,
    selectedId: null as string | null,
    paused: false,
  })
  const meta = useRef(new Map<string, Meta>())
  const pool = useRef<ConverterPool | null>(null)
  const counter = useRef(0)
  const comparing = useRef<(() => void) | null>(null)

  const dispatch = useCallback((action: QueueAction<Target>) => {
    const previous = live.current.items
    const next = queueReducer(previous, action)
    live.current.items = next
    for (const url of releasedUrls(previous, next)) URL.revokeObjectURL(url)
    setItems(next)
  }, [])

  const select = useCallback((id: string | null) => {
    live.current.selectedId = id
    setSelectedId(id)
  }, [])

  const update = useCallback(
    (
      change:
        | Partial<ConverterSettings>
        | ((current: ConverterSettings) => ConverterSettings)
    ) => {
      const current = live.current.settings
      const next =
        typeof change === "function"
          ? change(current)
          : { ...current, ...change }
      live.current.settings = next
      live.current.paused = false
      setPaused(false)
      setSettings(next)
    },
    []
  )

  const handleMessage = useEffectEvent((message: ConverterResponse) => {
    const exists = live.current.items.some((item) => item.id === message.id)
    if (message.type === "opened") {
      const info = meta.current.get(message.id)
      if (!exists || !info) {
        message.thumbnail.close()
        return
      }
      setThumbnails((current) => ({
        ...current,
        [message.id]: message.thumbnail,
      }))
      dispatch({
        type: "opened",
        id: message.id,
        format: info.format,
        animated: info.animated,
        size: { width: message.width, height: message.height },
        transparent: message.transparent,
      })
      return
    }
    if (message.type === "progress") {
      if (exists)
        setLabels((current) => ({ ...current, [message.id]: message.label }))
      return
    }
    setLabels((current) => {
      const rest = { ...current }
      delete rest[message.id]
      return rest
    })
    if (!exists) return
    if (message.type === "open-error")
      dispatch({ type: "failed", id: message.id, message: message.message })
    else if (message.type === "error")
      dispatch({
        type: "job-failed",
        id: message.id,
        key: message.key,
        message: message.message,
      })
    else if (message.type === "done")
      dispatch({
        type: "done",
        id: message.id,
        key: message.key,
        outputs: message.outputs.map((output) => {
          const blob = new Blob([output.bytes], {
            type: targets[output.target].mime,
          })
          return {
            blob,
            url: URL.createObjectURL(blob),
            format: output.target,
            width: output.width,
            height: output.height,
            similarity: output.similarity,
            extra: output.page,
          }
        }),
      })
  })

  const pickJob = useEffectEvent((cachedId: string | null) => {
    const state = live.current
    if (state.paused || settingsProblem(state.settings)) return null
    const key = processingKey(state.settings)
    const item = nextJob(
      state.items.filter((entry) => meta.current.has(entry.id)),
      (entry) => (entry.status === "ready" ? key : null),
      pool.current?.inFlight() ?? new Set<string>(),
      state.selectedId,
      cachedId
    )
    if (!item) return null
    const info = meta.current.get(item.id)!
    return {
      id: item.id,
      file: item.file,
      format: info.format,
      pixels: info.pixels,
      settings: state.settings,
      key,
      describe: item.status === "reading",
    }
  })

  useEffect(() => {
    const instance = new ConverterPool(
      poolSize(navigator.hardwareConcurrency),
      (message) => handleMessage(message),
      (cachedId) => pickJob(cachedId)
    )
    pool.current = instance
    return () => {
      instance.dispose()
      pool.current = null
      comparing.current?.()
    }
  }, [])

  // Release bitmaps and object URLs when the tool unmounts.
  const thumbnailsRef = useRef(thumbnails)
  useEffect(() => {
    thumbnailsRef.current = thumbnails
  }, [thumbnails])
  useEffect(
    () => () => {
      for (const bitmap of Object.values(thumbnailsRef.current)) bitmap.close()
      for (const url of releasedUrls(live.current.items, []))
        URL.revokeObjectURL(url)
    },
    []
  )

  // Convert again shortly after settings settle.
  const key = processingKey(settings)
  const problem = settingsProblem(settings)
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => {
      setTakenUp(key)
      pool.current?.supersede()
      pool.current?.kick()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [key, paused])
  // A change seen but not yet taken up: said at once, so no press seems to do nothing.
  const applying = items.length > 0 && !paused && !problem && takenUp !== key

  function resetGroup(group: ConverterGroup) {
    update(resetOf(defaultSettings, CONVERTER_GROUPS[group]))
  }
  function resetEverything() {
    update(resetAll(defaultSettings, CONVERTER_GROUPS))
    toast.info("Settings put back to the usual")
  }

  const addFiles = useCallback(
    async (files: File[]) => {
      const room = MAX_BATCH - live.current.items.length
      setNotice(
        files.length > room
          ? `Only ${Math.max(0, room)} more image${room === 1 ? "" : "s"} fit in this batch of ${MAX_BATCH}.`
          : ""
      )
      const added = files
        .slice(0, Math.max(0, room))
        .map((file) => ({ id: `image-${++counter.current}`, file }))
      if (!added.length) return
      dispatch({ type: "add", items: added })
      if (!live.current.selectedId) select(added[0].id)
      await Promise.all(
        added.map(async ({ id, file }) => {
          try {
            const info = await inspectFile(file)
            const pixels =
              info.format === "svg" ? await rasteriseSvg(file) : undefined
            meta.current.set(id, { ...info, pixels })
            pool.current?.kick()
          } catch (failure) {
            dispatch({
              type: "failed",
              id,
              message: (failure as Error).message,
            })
          }
        })
      )
    },
    [dispatch, select]
  )

  async function loadSamples() {
    setNotice("")
    try {
      const samples = await Promise.all(
        [
          ["/images/coastline.jpg", "coastline.jpg", "image/jpeg"],
          ["/images/private-workspace.webp", "still-life.webp", "image/webp"],
        ].map(async ([url, name, type]) => {
          const response = await fetch(url)
          if (!response.ok) throw new Error()
          return new File([await response.blob()], name, { type })
        })
      )
      void addFiles(samples)
    } catch {
      setNotice(
        "The samples could not load. Check your connection and try again."
      )
    }
  }

  function forget(id: string) {
    meta.current.delete(id)
    pool.current?.forget(id)
    setThumbnails((current) => {
      current[id]?.close()
      const rest = { ...current }
      delete rest[id]
      return rest
    })
  }

  function remove(id: string) {
    forget(id)
    dispatch({ type: "remove", id })
    if (live.current.selectedId === id)
      select(live.current.items[0]?.id ?? null)
  }

  function clearAll() {
    for (const item of live.current.items) forget(item.id)
    dispatch({ type: "clear" })
    select(null)
    setLabels({})
    setNotice("")
  }

  function cancel() {
    pool.current?.cancel()
    live.current.paused = true
    setPaused(true)
    setLabels({})
  }

  // Paste images from the clipboard anywhere on the page.
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      const pasted = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/")
      )
      if (!pasted.length) return
      event.preventDefault()
      void addFiles(
        pasted.map((file) =>
          file.name && file.name !== "image.png"
            ? file
            : new File([file], "pasted-image.png", { type: file.type })
        )
      )
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [addFiles])

  const keyOf = useMemo(
    () => (item: Item) => (item.status === "ready" && !problem ? key : null),
    [key, problem]
  )
  const selected = items.find((item) => item.id === selectedId) ?? null
  const selectedState = selected ? itemState(selected, keyOf(selected)) : null
  const selectedOutputs =
    selected && selectedState === "done" ? selected.outputs! : null
  const combine = settings.pdfCombine && usesTarget(settings, "pdf")

  // Every finished file with its name; a combined PDF replaces the per-image PDFs.
  const { rows, files, combined } = useMemo(() => {
    const done = items.map((item) =>
      itemState(item, keyOf(item)) === "done" ? item.outputs! : []
    )
    const entries = items.flatMap((item, index) =>
      done[index]
        .filter((output) => !(combine && output.format === "pdf"))
        .map((output) => ({
          output,
          name: fileName(settings.pattern, {
            name: item.file.name,
            width: output.width,
            height: output.height,
            format: targets[output.format].extension,
            index: index + 1,
            preset: "",
          }),
        }))
    )
    const unique = uniqueNames(entries.map((entry) => entry.name))
    const names = new Map(
      entries.map((entry, index) => [entry.output.url, unique[index]])
    )
    const pages = combine
      ? done.flatMap((outputs) =>
          outputs
            .filter((output) => output.format === "pdf")
            .map((output) => output.extra as PdfImage)
        )
      : []
    const multi = settings.multi
    const queueRows: QueueRow[] = items.map((item, index) => {
      const state = itemState(item, keyOf(item))
      const outputs = done[index].filter((output) => names.has(output.url))
      return {
        id: item.id,
        name: item.file.name,
        thumbnail: thumbnails[item.id] ?? null,
        state,
        details: [
          item.format ? inputFormats[item.format].label : null,
          item.size ? `${item.size.width} × ${item.size.height}` : null,
          sizeLabel(item.file.size),
        ]
          .filter(Boolean)
          .join(" · "),
        message:
          state === "error"
            ? (item.error ?? null)
            : state === "failed"
              ? (item.jobError ?? null)
              : state === "waiting" && paused
                ? "Paused"
                : state === "waiting" && problem
                  ? "Waiting for settings"
                  : state === "done" && !outputs.length
                    ? "A page in the combined PDF"
                    : state === "done" && outputs.length === 1
                      ? `${targets[outputs[0].format].label} · ${sizeLabel(outputs[0].blob.size)}`
                      : (labels[item.id] ?? null),
        outputs: outputs.map((output) => ({
          name: names.get(output.url)!,
          url: output.url,
          width: output.width,
          height: output.height,
          bytes: output.blob.size,
          label: multi ? targets[output.format].label : undefined,
        })),
      }
    })
    return {
      rows: queueRows,
      files: entries.map((entry) => ({
        name: names.get(entry.output.url)!,
        url: entry.output.url,
        blob: entry.output.blob,
        target: entry.output.format,
        width: entry.output.width,
        height: entry.output.height,
      })),
      combined: pages.length ? createPdf(pages, pdfOptions(settings)) : null,
    }
  }, [items, keyOf, settings, combine, thumbnails, labels, paused, problem])

  const base = useMemo(() => queueTotals(items, keyOf), [items, keyOf])
  const totals = {
    ...base,
    files: files.length + (combined ? 1 : 0),
    outputBytes:
      files.reduce((sum, file) => sum + file.blob.size, 0) +
      (combined?.length ?? 0),
  }

  // A full-size "before" picture for the slider, when the browser can show the source.
  const selectedFile = selected?.status === "ready" ? selected.file : null
  const selectedReadyId = selectedFile ? selected!.id : null
  useEffect(() => {
    if (!selectedFile || !selectedReadyId) return
    let alive = true
    let bitmap: ImageBitmap | null = null
    createImageBitmap(selectedFile)
      .then((result) => {
        if (!alive) return result.close()
        bitmap = result
        setBefore({ id: selectedReadyId, bitmap: result })
      })
      .catch(() => {})
    return () => {
      alive = false
      bitmap?.close()
    }
  }, [selectedFile, selectedReadyId])

  // Find the first output this browser can display, for the comparison slider.
  const outputsKey =
    selectedOutputs?.map((output) => output.url).join("|") ?? ""
  useEffect(() => {
    if (!selectedOutputs?.length) return
    let alive = true
    void (async () => {
      for (const output of selectedOutputs) {
        if (output.format === "ico" || output.format === "pdf") continue
        try {
          const bitmap = await createImageBitmap(output.blob)
          bitmap.close()
          if (alive)
            setShown({
              key: outputsKey,
              url: output.url,
              target: output.format,
            })
          return
        } catch {
          // Try the next format.
        }
      }
      if (alive) setShown({ key: outputsKey, url: null, target: null })
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the outputs' URLs
  }, [outputsKey])

  function runComparison() {
    if (!selected || selected.status !== "ready") return
    const info = meta.current.get(selected.id)
    if (!info) return
    const forKey = comparisonKey(selected.id, settings)
    const originalBytes = selected.file.size
    const candidates = comparable.filter(
      (target) => !(selected.transparent && target === "jpeg")
    )
    comparing.current?.()
    setCompared({
      key: forKey,
      state: { status: "running", label: "Starting…" },
    })
    const { promise, cancel: stop } = compareFormats(
      {
        file: selected.file,
        format: info.format,
        pixels: info.pixels,
        settings,
        targets: candidates,
      },
      (label) =>
        setCompared((current) =>
          current?.key === forKey
            ? { key: forKey, state: { status: "running", label } }
            : current
        )
    )
    comparing.current = stop
    promise
      .then((results) => {
        const rows = rankComparisons(results, originalBytes)
        setCompared({ key: forKey, state: { status: "done", rows } })
        if (rows[0])
          toast.success("Formats compared", {
            description: `${targets[rows[0].target].label} is smallest, ${sizeLabel(rows[0].bytes)}`,
          })
      })
      .catch((failure: Error) =>
        setCompared((current) =>
          current?.key === forKey
            ? {
                key: forKey,
                state: { status: "error", message: failure.message },
              }
            : current
        )
      )
  }

  function cancelComparison() {
    comparing.current?.()
    comparing.current = null
    setCompared(null)
  }

  const comparison: ComparisonState =
    selected && compared?.key === comparisonKey(selected.id, settings)
      ? compared.state
      : { status: "idle" }

  const snippet =
    settings.multi && selectedOutputs
      ? pictureSnippet(
          files
            .filter((file) =>
              selectedOutputs.some((output) => output.url === file.url)
            )
            .map((file) => ({
              target: file.target,
              name: file.name,
              width: file.width,
              height: file.height,
            }))
        ) || null
      : null
  const exampleName =
    files.find((file) =>
      selectedOutputs?.some((output) => output.url === file.url)
    )?.name ?? null

  const single =
    totals.settled && files.length === 1 && !combined
      ? { url: files[0].url, name: files[0].name }
      : null
  const combinedOnly = Boolean(combined) && files.length === 0

  async function downloadZip() {
    setZipping(true)
    try {
      const entries = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          data: new Uint8Array(await file.blob.arrayBuffer()),
        }))
      )
      if (combined) entries.push({ name: COMBINED_NAME, data: combined })
      download(createZip(entries), "keepsimp-converted.zip", "application/zip")
    } catch {
      setNotice("The ZIP could not be created. Download the images one by one.")
    } finally {
      setZipping(false)
    }
  }

  if (!items.length)
    return (
      <div className="grid gap-6 lg:grid-cols-5" data-testid="image-converter">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <DropZone
            onFiles={(dropped) => void addFiles(dropped)}
            onSample={() => void loadSamples()}
            busy={false}
            copy={copy}
            inputId={INPUT_ID}
          />
          {notice && (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          )}
        </div>
        <div className="lg:col-span-2">
          <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="section-title">What you can do</h2>
            <ul className="space-y-3 text-sm">
              {[
                {
                  icon: IconTransform,
                  title: "Ten output formats",
                  text: "JPEG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO favicons and PDF, from eleven kinds of image.",
                },
                {
                  icon: IconStack2,
                  title: "Batches and several formats at once",
                  text: `Up to ${MAX_BATCH} images, each saved in every format you tick, with picture HTML and a ZIP.`,
                },
                {
                  icon: IconScale,
                  title: "See which format is smallest",
                  text: "Compare real file sizes and measured detail for the selected image before you choose.",
                },
                {
                  icon: IconFileTypePdf,
                  title: "Favicons and documents",
                  text: "Pack several icon sizes into one ICO, or put every image into a single PDF.",
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
        </div>
      </div>
    )

  // While a setting is invalid, keep showing the image at its own size.
  const previewSize = selected?.size
    ? problem
      ? selected.size
      : limitedSize(settings, selected.size)
    : null
  const visible =
    shown && shown.key === outputsKey && selectedOutputs ? shown : null
  const shownOutput = visible?.url
    ? selectedOutputs!.find((output) => output.url === visible.url)!
    : null
  const reference =
    selected && before?.id === selected.id
      ? before.bitmap
      : selected
        ? (thumbnails[selected.id] ?? null)
        : null

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="image-converter"
      data-settled={(totals.settled && !zipping) || undefined}
    >
      <div className="min-w-0 space-y-4 lg:col-span-3">
        {selected?.size && previewSize ? (
          selectedOutputs && visible && !visible.url ? (
            <div
              className="flex h-80 flex-col items-center justify-center gap-2 rounded-xl border bg-muted p-6 text-center sm:h-96"
              role="status"
              data-testid="no-preview"
            >
              <p className="text-sm font-medium">Your file is ready</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {selectedOutputs
                  .map((output) => targets[output.format].label)
                  .join(", ")}{" "}
                cannot be previewed in this browser. Download it to open it in
                another app.
              </p>
            </div>
          ) : (
            <CompareSlider
              reference={reference}
              resultUrl={shownOutput?.url ?? null}
              size={
                shownOutput
                  ? { width: shownOutput.width, height: shownOutput.height }
                  : previewSize
              }
              originalLabel={`Original · ${sizeLabel(selected.file.size)}`}
              resultLabel={
                shownOutput
                  ? `${targets[shownOutput.format].label} · ${sizeLabel(shownOutput.blob.size)}`
                  : null
              }
              status={
                selectedState === "waiting" && !paused && !problem
                  ? (labels[selected.id] ?? "Waiting…")
                  : null
              }
              onCancel={cancel}
            />
          )
        ) : (
          <div
            className="flex h-80 items-center justify-center rounded-xl border bg-muted p-6 text-center text-sm text-muted-foreground sm:h-96"
            role="status"
          >
            {selected?.status === "error"
              ? "This image could not be read. Choose another from the list."
              : "Reading your image…"}
          </div>
        )}
        {(selected?.animated || selected?.format === "svg") &&
          selected.size && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <IconInfoCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {selected.animated ? (
                <span>
                  This image is animated. Only the first frame is converted. To
                  keep it moving, use the{" "}
                  <Link
                    href="/dashboard/animation-converter/"
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    animation converter
                  </Link>
                  .
                </span>
              ) : (
                `SVG is vector art, so it is drawn at ${selected.size.width} × ${selected.size.height} px before converting.`
              )}
            </p>
          )}
        {paused && (
          <p className="text-sm text-muted-foreground">
            Converting cancelled. Change a setting to start again.
          </p>
        )}
        {notice && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <IconAlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {notice}
          </p>
        )}

        <SummaryBar
          totals={totals}
          single={single}
          primary={
            combinedOnly
              ? {
                  label: "Download PDF",
                  onClick: () =>
                    download(combined!, COMBINED_NAME, "application/pdf"),
                }
              : null
          }
          zipping={zipping}
          onZip={() => void downloadZip()}
          onFiles={(dropped) => void addFiles(dropped)}
          onClear={clearAll}
          inputId={INPUT_ID}
          verb="Converting"
          applying={applying}
        />

        <QueueList
          rows={rows}
          selectedId={selected?.id ?? null}
          onSelect={select}
          onRemove={remove}
        />
      </div>

      <div className="min-w-0 lg:col-span-2">
        <SettingsCard
          state={
            !paused && !problem && (applying || totals.pending > 0)
              ? "pending"
              : totals.done > 0 && !problem
                ? "done"
                : "idle"
          }
          pendingText={
            applying
              ? "Applying your changes…"
              : `Converting ${totals.pending} ${totals.pending === 1 ? "image" : "images"}…`
          }
          doneText={`Up to date: ${totals.done} of ${totals.images} ready`}
          changed={converterChanges(settings, defaultSettings)}
          onResetAll={resetEverything}
        >
          <FormatPanel
            settings={settings}
            update={update}
            problem={problem}
            usual={defaultSettings}
            onResetGroup={resetGroup}
          />
          <OptionsPanel
            settings={settings}
            update={update}
            exampleName={exampleName}
            usual={defaultSettings}
            onResetGroup={resetGroup}
          />
          <ComparePanel
            settings={settings}
            update={update}
            comparison={comparison}
            canCompare={selected?.status === "ready" && !problem}
            onCompare={runComparison}
            onCancelCompare={cancelComparison}
            snippet={snippet}
          />
          <p className="flex items-center gap-1.5 border-t py-4 text-xs text-muted-foreground">
            <IconLock className="size-3.5" aria-hidden="true" />
            Processed on your device. Metadata such as location is removed.
          </p>
        </SettingsCard>
      </div>
    </div>
  )
}
