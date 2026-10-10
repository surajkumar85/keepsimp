"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  IconAlertCircle,
  IconAspectRatio,
  IconFocusCentered,
  IconInfoCircle,
  IconPhotoPlus,
  IconStack2,
} from "@tabler/icons-react"
import {
  DropZone,
  type DropZoneCopy,
} from "@/components/image-compressor/drop-zone"
import { inspectFile, rasteriseSvg } from "@/lib/image-compressor/client"
import {
  inputFormats,
  outputFormats,
  sizeLabel,
  type InputFormat,
} from "@/lib/image-compressor/formats"
import { orientedSize } from "@/lib/image-compressor/geometry"
import { poolSize, ResizerPool } from "@/lib/image-resizer/client"
import type { Focus } from "@/lib/image-resizer/focus"
import { fileName, uniqueNames } from "@/lib/image-resizer/naming"
import { findPreset } from "@/lib/image-resizer/presets"
import type { ResizerResponse } from "@/lib/image-resizer/protocol"
import {
  itemState,
  nextJob,
  queueReducer,
  queueTotals,
  releasedUrls,
  type QueueAction,
  type QueueItem,
} from "@/lib/image-resizer/queue"
import {
  backdrop,
  defaultSettings,
  MAX_BATCH,
  planOutputs,
  processingKey,
  resolveFormat,
  type ResizerSettings,
} from "@/lib/image-resizer/settings"
import { imgSnippet } from "@/lib/image-resizer/srcset"
import { createZip } from "@/lib/image-resizer/zip"
import { FramePreview } from "./frame-preview"
import { OutputPanel } from "./output-panel"
import { QueueList, type QueueRow } from "@/components/image-batch/queue-list"
import { SummaryBar } from "@/components/image-batch/summary-bar"
import { SettingsPanel } from "./settings-panel"

const INPUT_ID = "resizer-file"
const DEBOUNCE_MS = 350

const copy: DropZoneCopy = {
  heading: "Drop images to resize",
  dropping: "Drop to add these images",
  body: "Add one image or a whole batch. You can also paste an image with ⌘V or Ctrl+V.",
  inputLabel: "Choose images to resize",
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

const expectedKey = (settings: ResizerSettings) => (item: QueueItem) =>
  item.status === "ready" ? processingKey(settings, item.focus ?? null) : null

/** Everything the preview and panels need to know about the selected image. */
function deriveSelection(
  items: QueueItem[],
  selectedId: string | null,
  settings: ResizerSettings
) {
  const selected = items.find((item) => item.id === selectedId) ?? null
  const focus: Focus =
    selected?.focus ??
    (settings.focusMode === "smart" && selected?.usedFocus
      ? selected.usedFocus
      : settings.focus)
  const planned = selected?.size
    ? planOutputs(settings, { size: selected.size, focus })
    : null
  return {
    selected,
    selectedState: selected
      ? itemState(selected, expectedKey(settings)(selected))
      : null,
    focus,
    planned,
    layout: planned?.plans.at(-1)?.layout ?? null,
    reference: selected?.size
      ? orientedSize(selected.size, settings.rotation)
      : null,
    background: backdrop(settings),
    selectedFormat:
      selected?.format && selected.transparent !== undefined
        ? resolveFormat(settings, selected.format, selected.transparent)
        : null,
    preset: settings.mode === "preset" ? findPreset(settings.presetId) : null,
  }
}

export function ImageResizer() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [settings, setSettings] = useState<ResizerSettings>(defaultSettings)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, ImageBitmap>>({})
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState("")
  const [paused, setPaused] = useState(false)
  const [revision, setRevision] = useState(0)
  const [zipping, setZipping] = useState(false)

  // Workers ask for work between renders, so the queue also lives in refs that
  // are updated the moment something changes.
  const live = useRef({
    items: [] as QueueItem[],
    settings: defaultSettings,
    selectedId: null as string | null,
    paused: false,
  })
  const meta = useRef(new Map<string, Meta>())
  const pool = useRef<ResizerPool | null>(null)
  const counter = useRef(0)

  const dispatch = useCallback((action: QueueAction) => {
    const before = live.current.items
    const after = queueReducer(before, action)
    live.current.items = after
    for (const url of releasedUrls(before, after)) URL.revokeObjectURL(url)
    setItems(after)
  }, [])

  const select = useCallback((id: string | null) => {
    live.current.selectedId = id
    setSelectedId(id)
  }, [])

  const update = useCallback(
    (
      change:
        | Partial<ResizerSettings>
        | ((current: ResizerSettings) => ResizerSettings)
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

  const handleMessage = useEffectEvent((message: ResizerResponse) => {
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
        usedFocus: message.usedFocus,
        outputs: message.outputs.map((output) => {
          const blob = new Blob([output.bytes], {
            type: outputFormats[output.format].mime,
          })
          return {
            blob,
            url: URL.createObjectURL(blob),
            format: output.format,
            width: output.width,
            height: output.height,
            similarity: output.similarity,
          }
        }),
      })
  })

  const pickJob = useEffectEvent((cachedId: string | null) => {
    const state = live.current
    if (state.paused) return null
    const item = nextJob(
      state.items.filter((entry) => meta.current.has(entry.id)),
      (entry) =>
        entry.status === "ready"
          ? processingKey(state.settings, entry.focus ?? null)
          : null,
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
      focus: item.focus ?? null,
      key: processingKey(state.settings, item.focus ?? null),
      describe: item.status === "reading",
    }
  })

  useEffect(() => {
    const instance = new ResizerPool(
      poolSize(navigator.hardwareConcurrency),
      (message) => handleMessage(message),
      (cachedId) => pickJob(cachedId)
    )
    pool.current = instance
    return () => {
      instance.dispose()
      pool.current = null
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

  // Reprocess shortly after settings (or one image's focus) settle.
  const settingsKey = processingKey(settings, null)
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => {
      pool.current?.supersede()
      pool.current?.kick()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [settingsKey, revision, paused])

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
          } catch (problem) {
            dispatch({
              type: "failed",
              id,
              message: (problem as Error).message,
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

  const keyOf = useMemo(() => expectedKey(settings), [settings])
  const totals = useMemo(() => queueTotals(items, keyOf), [items, keyOf])
  const {
    selected,
    selectedState,
    focus,
    planned,
    layout,
    reference,
    background,
    selectedFormat,
    preset,
  } = useMemo(
    () => deriveSelection(items, selectedId, settings),
    [items, selectedId, settings]
  )

  // File names are applied here, after processing, so renaming is instant.
  const names = useMemo(() => {
    const entries = items.flatMap((item, index) =>
      itemState(item, keyOf(item)) === "done"
        ? item.outputs!.map((output) => ({
            url: output.url,
            name: fileName(settings.pattern, {
              name: item.file.name,
              width: output.width,
              height: output.height,
              format: outputFormats[output.format].extension,
              index: index + 1,
              preset: preset?.id ?? "",
            }),
          }))
        : []
    )
    const unique = uniqueNames(entries.map((entry) => entry.name))
    return new Map(entries.map((entry, index) => [entry.url, unique[index]]))
  }, [items, keyOf, settings.pattern, preset])

  const rows: QueueRow[] = items.map((item) => {
    const state = itemState(item, keyOf(item))
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
              : (labels[item.id] ?? null),
      outputs:
        state === "done"
          ? item.outputs!.map((output) => ({
              name: names.get(output.url)!,
              url: output.url,
              width: output.width,
              height: output.height,
              bytes: output.blob.size,
            }))
          : [],
    }
  })

  const selectedOutputs =
    selected && selectedState === "done" ? selected.outputs! : null
  const snippet =
    settings.multi && selectedOutputs
      ? imgSnippet(
          selectedOutputs.map((output) => ({
            name: names.get(output.url)!,
            width: output.width,
            height: output.height,
          }))
        )
      : null
  const exampleName = selectedOutputs
    ? (names.get(selectedOutputs.at(-1)!.url) ?? null)
    : null
  const onlyFile =
    totals.settled && totals.files === 1
      ? rows.find((row) => row.outputs.length === 1)!.outputs[0]
      : null

  async function downloadZip() {
    setZipping(true)
    try {
      const blobs = new Map(
        items.flatMap((item) =>
          (item.outputs ?? []).map(
            (output) => [output.url, output.blob] as const
          )
        )
      )
      const entries = await Promise.all(
        rows.flatMap((row) =>
          row.outputs.map(async (output) => ({
            name: output.name,
            data: new Uint8Array(await blobs.get(output.url)!.arrayBuffer()),
          }))
        )
      )
      const url = URL.createObjectURL(
        new Blob([createZip(entries)], { type: "application/zip" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = "keepsimp-resized.zip"
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setNotice("The ZIP could not be created. Download the images one by one.")
    } finally {
      setZipping(false)
    }
  }

  if (!items.length)
    return (
      <div className="grid gap-6 lg:grid-cols-5" data-testid="image-resizer">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <DropZone
            onFiles={(files) => void addFiles(files)}
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
                  icon: IconStack2,
                  title: "Resize a whole batch",
                  text: `Up to ${MAX_BATCH} images with one set of settings, downloaded together as a ZIP.`,
                },
                {
                  icon: IconAspectRatio,
                  title: "Any size, any unit",
                  text: "Pixels, percent, megapixels, or inches and centimetres at a print resolution. Presets for social, web, screens, print and icons.",
                },
                {
                  icon: IconFocusCentered,
                  title: "Crop without losing the subject",
                  text: "Drag each picture inside its frame, pick a position, or let Smart focus find the interesting part.",
                },
                {
                  icon: IconPhotoPlus,
                  title: "Responsive sets",
                  text: "Export several widths at once with ready-to-paste srcset HTML.",
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

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="image-resizer"
      data-settled={(totals.settled && !zipping) || undefined}
    >
      <div className="min-w-0 space-y-4 lg:col-span-3">
        {selected?.size && layout && reference ? (
          <FramePreview
            thumbnail={thumbnails[selected.id] ?? null}
            source={selected.size}
            rotation={settings.rotation}
            flipX={settings.flipX}
            flipY={settings.flipY}
            layout={layout}
            focus={focus}
            background={background}
            resultUrl={selectedOutputs?.at(-1)?.url ?? null}
            safeArea={preset?.safeArea ?? null}
            status={
              selectedState === "waiting" && !paused
                ? (labels[selected.id] ?? "Waiting…")
                : null
            }
            onFocus={(next) => {
              dispatch({ type: "focus", id: selected.id, focus: next })
              setRevision((value) => value + 1)
            }}
            onCancel={cancel}
          />
        ) : (
          <div
            className="flex h-80 items-center justify-center rounded-xl border bg-muted p-6 text-center text-sm text-muted-foreground sm:h-96"
            role="status"
          >
            {selected?.status === "error"
              ? "This image could not be read. Choose another from the list."
              : planned?.error
                ? "Fix the size on the right to see a preview."
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
              {selected.animated
                ? "This image is animated. Only the first frame is resized."
                : `SVG is vector art, so it is drawn at ${selected.size.width} × ${selected.size.height} px before resizing.`}
            </p>
          )}
        {paused && (
          <p className="text-sm text-muted-foreground">
            Resizing cancelled. Change a setting to start again.
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
          single={onlyFile}
          zipping={zipping}
          onZip={() => void downloadZip()}
          onFiles={(files) => void addFiles(files)}
          onClear={clearAll}
          inputId={INPUT_ID}
          verb="Resizing"
        />

        <QueueList
          rows={rows}
          selectedId={selected?.id ?? null}
          onSelect={select}
          onRemove={remove}
        />
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-2">
        <SettingsPanel
          settings={settings}
          update={update}
          reference={reference}
          layout={layout}
          planError={planned?.error ?? null}
          focus={focus}
          hasOverride={Boolean(selected?.focus)}
          onAnchor={(next) => {
            dispatch({ type: "reset-focus" })
            update({ focus: next, focusMode: "manual" })
          }}
          onResetFocus={() => {
            if (!selected) return
            dispatch({ type: "focus", id: selected.id, focus: undefined })
            setRevision((value) => value + 1)
          }}
          onOrientation={(change) => {
            dispatch({ type: "reset-focus" })
            update(change)
          }}
        />
        <OutputPanel
          settings={settings}
          update={update}
          format={selectedFormat}
          exampleName={exampleName}
          snippet={snippet}
        />
      </div>
    </div>
  )
}
