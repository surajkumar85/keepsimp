"use client"

import { useEffect, useId, useRef, useState, type PointerEvent } from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import type { ReaderSource } from "@/components/pdf-reader/types"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import type { BlankChoice, Sensitivity } from "@/lib/pdf-splitter/blank"
import type { FrontChoice } from "@/lib/pdf-splitter/bookmarks"
import {
  clampCut,
  defaultHalves,
  type HalveChoice,
} from "@/lib/pdf-splitter/halves"
import { tidyArea, type Area } from "@/lib/pdf-splitter/text-rule"

/** The controls for splitting at blank pages. */
export function BlankRules({
  sensitivity,
  onSensitivity,
  how,
  onHow,
  status,
  several,
}: {
  sensitivity: Sensitivity
  onSensitivity: (sensitivity: Sensitivity) => void
  how: BlankChoice
  onHow: (how: BlankChoice) => void
  /** How the looking is going, or what it found, for the file shown. */
  status: string
  several: boolean
}) {
  return (
    <>
      <ChoiceChips
        label="What counts as blank"
        value={sensitivity}
        onValueChange={onSensitivity}
        options={[
          { value: "strict", label: "Nothing at all" },
          { value: "normal", label: "Specks or a page number" },
          { value: "loose", label: "Holes or a short line" },
        ]}
        hint="Scans are never perfectly clean. The middle setting lets dust and a lone page number pass for blank; the last also lets punch holes, a header or a line such as “left blank” pass."
      />
      <ChoiceChips
        label="At a blank page"
        value={how}
        onValueChange={onHow}
        options={[
          { value: "drop", label: "Cut, and leave it out" },
          { value: "keep", label: "Cut after it, and keep it" },
          { value: "remove", label: "Only remove it" },
        ]}
      />
      <p role="status" className="text-sm" data-testid="blank-status">
        {status}
      </p>
      <p className="text-xs text-muted-foreground">
        Pages found blank are marked below. Press a page to turn that round: to
        keep a page that was found blank, or to call another page blank.
        {several && " Pressed pages belong to the file shown."}
      </p>
    </>
  )
}

const PRESETS: { label: string; area: Area }[] = [
  { label: "Top left", area: { left: 0, top: 0, right: 0.5, bottom: 0.2 } },
  { label: "Top right", area: { left: 0.5, top: 0, right: 1, bottom: 0.2 } },
  { label: "Top strip", area: { left: 0, top: 0, right: 1, bottom: 0.15 } },
  { label: "Bottom strip", area: { left: 0, top: 0.85, right: 1, bottom: 1 } },
]

const percent = (share: number) => String(Math.round(share * 100))

/**
 * Mark part of a page: drag over the picture, type the four edges, or take
 * one of the usual places. The same part of every page is then read.
 */
function AreaPicker({
  file,
  pages,
  source,
  area,
  onArea,
  reads,
}: {
  file: string
  pages: number
  source: ReaderSource
  area: Area | null
  onArea: (area: Area | null) => void
  /** What the marked area says on each page, once that has been read. */
  reads: readonly string[] | null
}) {
  const ids = useId()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState(0)
  const [drawn, setDrawn] = useState(false)
  /** The area while it is being dragged out. */
  const [draft, setDraft] = useState<Area | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const at = Math.min(page, Math.max(pages - 1, 0))

  useEffect(() => {
    let alive = true
    const asked = source.draw(file, at, 900, true)
    let waiting = true
    void asked.promise.then((bitmap) => {
      waiting = false
      const target = canvas.current
      if (!alive || !bitmap || !target) {
        bitmap?.close()
        return
      }
      target.width = bitmap.width
      target.height = bitmap.height
      target.getContext("2d")?.drawImage(bitmap, 0, 0)
      bitmap.close()
      setDrawn(true)
    })
    return () => {
      alive = false
      if (waiting) source.forget([asked.request])
    }
  }, [file, at, source])

  const spot = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - box.left) / Math.max(box.width, 1),
      y: (event.clientY - box.top) / Math.max(box.height, 1),
    }
  }
  const shown = draft ?? area
  /** Edges as they are being typed; they are applied together when the fields are left. */
  const [typed, setTyped] = useState<Partial<Record<keyof Area, string>>>({})
  /** Mark an area by dragging or by a usual place; what was being typed gives way. */
  const mark = (next: Area | null) => {
    setTyped({})
    onArea(next)
  }
  const applyTyped = () => {
    if (!Object.keys(typed).length) return
    const next = { ...(area ?? { left: 0, top: 0, right: 1, bottom: 1 }) }
    for (const side of ["left", "top", "right", "bottom"] as const) {
      const text = typed[side]
      if (text !== undefined && /^\s*\d{1,3}\s*$/.test(text))
        next[side] = Number(text) / 100
    }
    setTyped({})
    onArea(tidyArea(next))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Where to read</p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Show the page before"
            title="Show the page before"
            disabled={at === 0}
            onClick={() => {
              setDrawn(false)
              setPage(at - 1)
            }}
          >
            <IconChevronLeft aria-hidden="true" />
          </Button>
          <span className="font-mono text-xs" data-testid="area-page">
            Page {at + 1} of {pages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Show the next page"
            title="Show the next page"
            disabled={at >= pages - 1}
            onClick={() => {
              setDrawn(false)
              setPage(at + 1)
            }}
          >
            <IconChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex justify-center rounded-lg bg-muted p-3">
        <div
          role="img"
          aria-label={`Page ${at + 1}. Drag over it to mark the area to read.`}
          data-testid="area-stage"
          className="relative max-w-sm cursor-crosshair touch-none select-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            start.current = spot(event)
            setDraft(null)
          }}
          onPointerMove={(event) => {
            if (!start.current) return
            const now = spot(event)
            setDraft({
              left: start.current.x,
              top: start.current.y,
              right: now.x,
              bottom: now.y,
            })
          }}
          onPointerUp={(event) => {
            if (!start.current) return
            const now = spot(event)
            const made = tidyArea({
              left: start.current.x,
              top: start.current.y,
              right: now.x,
              bottom: now.y,
            })
            start.current = null
            setDraft(null)
            // A press without a drag marks nothing, and leaves what was marked.
            if (made) mark(made)
          }}
          onPointerCancel={() => {
            start.current = null
            setDraft(null)
          }}
        >
          <canvas
            ref={canvas}
            aria-hidden="true"
            className={cn(
              "block h-auto max-h-96 w-auto max-w-full bg-background shadow-sm",
              !drawn && "min-h-48 min-w-36"
            )}
          />
          {shown && (
            <span
              aria-hidden="true"
              data-testid="area-mark"
              className="absolute border-2 border-primary bg-primary/15"
              style={{
                left: `${Math.min(shown.left, shown.right) * 100}%`,
                top: `${Math.min(shown.top, shown.bottom) * 100}%`,
                width: `${Math.abs(shown.right - shown.left) * 100}%`,
                height: `${Math.abs(shown.bottom - shown.top) * 100}%`,
              }}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            onClick={() => mark(preset.area)}
          >
            {preset.label}
          </Button>
        ))}
        <Button variant="ghost" disabled={!area} onClick={() => mark(null)}>
          Clear
        </Button>
      </div>
      <fieldset
        onBlur={(event) => {
          // The edges are read together, once the fields are left.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            applyTyped()
        }}
      >
        <legend className="mb-1 text-sm font-medium">
          Edges, in percent of the page
        </legend>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["left", "Left"],
              ["top", "Top"],
              ["right", "Right"],
              ["bottom", "Bottom"],
            ] as const
          ).map(([side, label]) => (
            <div key={side}>
              <label
                htmlFor={`${ids}-${side}`}
                className="mb-1 block text-xs text-muted-foreground"
              >
                {label}
              </label>
              <Input
                id={`${ids}-${side}`}
                inputMode="numeric"
                autoComplete="off"
                value={typed[side] ?? (area ? percent(area[side]) : "")}
                onChange={(event) =>
                  setTyped({ ...typed, [side]: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyTyped()
                }}
                className="w-16 text-center font-mono"
              />
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Measured from the left and from the top. They are used once you leave
          the fields or press Enter.
        </p>
      </fieldset>
      {area && (
        <p className="text-sm" data-testid="area-reads">
          {reads === null
            ? "Reading…"
            : reads[at]
              ? `On this page it reads: “${reads[at]}”`
              : "On this page there is no text there."}
        </p>
      )}
    </div>
  )
}

/** The controls for splitting by text: at pages that hold some words, or where the text in one place changes. */
export function TextRules({
  kind,
  onKind,
  words,
  onWords,
  front,
  onFront,
  hasFront,
  status,
  file,
  pages,
  source,
  area,
  onArea,
  reads,
  several,
}: {
  kind: "contains" | "area"
  onKind: (kind: "contains" | "area") => void
  words: string
  onWords: (words: string) => void
  front: FrontChoice
  onFront: (front: FrontChoice) => void
  /** There are pages before the first page that holds the words. */
  hasFront: boolean
  status: string
  /** The file shown, and how many pages it has. */
  file: string | null
  pages: number
  source: ReaderSource
  area: Area | null
  onArea: (area: Area | null) => void
  reads: readonly string[] | null
  several: boolean
}) {
  const ids = useId()
  return (
    <>
      <ChoiceChips
        label="Start a new part"
        value={kind}
        onValueChange={onKind}
        options={[
          { value: "contains", label: "At pages with certain words" },
          { value: "area", label: "Where the text in one place changes" },
        ]}
        hint={
          kind === "contains"
            ? "For files where every document starts with the same words, such as “Invoice” or “Dear”."
            : "For files where a number or a name sits in the same place on every page, such as an invoice number. Each part is named after what it reads there."
        }
      />
      {kind === "contains" ? (
        <>
          <div>
            <label
              htmlFor={`${ids}-words`}
              className="mb-1 block text-sm font-medium"
            >
              Words that a part starts with
            </label>
            <Input
              id={`${ids}-words`}
              value={words}
              onChange={(event) => onWords(event.target.value)}
              placeholder="Such as Invoice number"
              spellCheck={false}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Capitals and accents make no difference.
              {several && " The same words are looked for in every file."}
            </p>
          </div>
          {hasFront && (
            <ChoiceChips
              label="Pages before the first of them"
              value={front}
              onValueChange={onFront}
              options={[
                { value: "own", label: "A part of their own" },
                { value: "join", label: "Join the first part" },
              ]}
            />
          )}
        </>
      ) : file && pages > 0 ? (
        <AreaPicker
          key={file}
          file={file}
          pages={pages}
          source={source}
          area={area}
          onArea={onArea}
          reads={reads}
        />
      ) : null}
      <p role="status" className="text-sm" data-testid="text-status">
        {status}
      </p>
      <p className="text-xs text-muted-foreground">
        This reads the text a PDF holds. A scan holds pictures of text, which
        cannot be read here; use blank pages or cuts for scans.
      </p>
    </>
  )
}

/** Whether pages are scans of two pages each, and how they are cut in half. */
export function HalvePanel({
  choice,
  onChoice,
  disabled,
}: {
  /** Null while pages are left whole. */
  choice: HalveChoice | null
  onChoice: (choice: HalveChoice | null) => void
  disabled: boolean
}) {
  const ids = useId()
  /** The cut while the slider is being moved; it is applied when let go. */
  const [sliding, setSliding] = useState<number | null>(null)
  const across = choice?.direction !== "down"
  const at = sliding ?? choice?.at ?? 0.5
  const commit = () => {
    if (sliding === null || !choice) return
    onChoice({ ...choice, at: clampCut(sliding) })
    setSliding(null)
  }
  return (
    <div
      className="space-y-3 rounded-lg border bg-card p-3"
      data-testid="halve-panel"
    >
      <ToggleRow
        label="Each page is a scan of two pages"
        hint="Cuts such pages down the middle first, so the file has single pages. Nothing is drawn or compressed again."
        checked={choice !== null}
        onCheckedChange={(on) =>
          !disabled &&
          onChoice(on ? { ...defaultHalves, which: "all", cover: false } : null)
        }
      />
      {choice && (
        <>
          <ChoiceChips
            label="The two pages sit"
            value={choice.direction}
            disabled={disabled}
            onValueChange={(direction) => onChoice({ ...choice, direction })}
            options={[
              { value: "across", label: "Side by side" },
              { value: "down", label: "One above the other" },
            ]}
          />
          <ChoiceChips
            label="Read first"
            value={choice.first}
            disabled={disabled}
            onValueChange={(first) => onChoice({ ...choice, first })}
            options={[
              {
                value: "start",
                label: across ? "The left page" : "The top page",
              },
              {
                value: "end",
                label: across ? "The right page" : "The bottom page",
              },
            ]}
            hint={
              across
                ? "Books read from right to left have the right page first."
                : undefined
            }
          />
          <ChoiceChips
            label="Cut"
            value={choice.which}
            disabled={disabled}
            onValueChange={(which) => onChoice({ ...choice, which })}
            options={[
              { value: "all", label: "Every page" },
              {
                value: "wide",
                label: across
                  ? "Only pages wider than tall"
                  : "Only pages taller than wide",
              },
            ]}
          />
          <ToggleRow
            label="The first page is a single cover"
            hint="It is kept whole."
            checked={choice.cover}
            onCheckedChange={(cover) =>
              !disabled && onChoice({ ...choice, cover })
            }
          />
          <div>
            <label
              htmlFor={`${ids}-cut`}
              className="mb-1 flex items-center justify-between text-sm font-medium"
            >
              <span>Where the cut is</span>
              <span className="font-mono text-xs" data-testid="cut-at">
                {Math.round(at * 100)}% from the {across ? "left" : "top"}
              </span>
            </label>
            <input
              id={`${ids}-cut`}
              type="range"
              min={20}
              max={80}
              step={1}
              disabled={disabled}
              value={Math.round(at * 100)}
              onChange={(event) => setSliding(Number(event.target.value) / 100)}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
              className="h-11 w-full accent-primary md:h-9"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The pages below show the result. Move the cut when the fold is not
              in the middle of the scan.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
