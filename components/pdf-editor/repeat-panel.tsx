"use client"

import { useId, useRef, type ReactNode } from "react"
import { IconPhoto, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { ToggleRow } from "@/components/image-batch/controls"
import type { Colour } from "@/lib/pdf-editor/objects"
import {
  LARGEST_MARGIN,
  MOST_FIGURES,
  SPOT_NAMES,
  SPOTS,
  type Spot,
} from "@/lib/pdf-editor/repeated"
import { cssColour } from "@/lib/pdf-editor/styles"
import { cn } from "cn"
import {
  NUMBER_FORMATS,
  type NumberFormat,
  type Repeat,
  type RepeatKind,
} from "./use-repeat"

const KIND_NAMES: Record<RepeatKind, string> = {
  numbers: "Page numbers",
  words: "Header or footer",
  bates: "Bates numbers",
  mark: "Watermark",
}

const FORMAT_NAMES: Record<NumberFormat, string> = {
  plain: "1",
  page: "Page 1",
  of: "1 of 12",
  "page-of": "Page 1 of 12",
}

/** The colours a watermark is offered in. */
const MARK_COLOURS: { name: string; colour: Colour }[] = [
  { name: "Grey", colour: [0.5, 0.5, 0.5] },
  { name: "Red", colour: [0.8, 0.1, 0.1] },
  { name: "Blue", colour: [0.1, 0.3, 0.75] },
  { name: "Black", colour: [0, 0, 0] },
]

const field =
  "h-11 w-full min-w-0 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"

/** A field with its name above it. */
function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: (id: string, hintId: string | undefined) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {label}
      </label>
      {children(id, hint ? `${id}-hint` : undefined)}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A number that is typed: kept as it is typed, and taken when it is one within its bounds. */
function Count({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      defaultValue={value}
      onChange={(event) => {
        const typed = Number(event.target.value)
        if (event.target.value.trim() && typed >= min && typed <= max)
          onChange(typed)
      }}
      className={field}
    />
  )
}

/**
 * The panel for what is put on many pages at once: page numbers, a header
 * or footer, numbers that run on from page to page, or a watermark, with
 * where it lies, how it looks and which pages it is for.
 */
export function RepeatPanel({ repeat }: { repeat: Repeat }) {
  const ids = useId()
  const picker = useRef<HTMLInputElement>(null)
  const { kind, look, mark } = repeat
  const count = repeat.target.length
  return (
    <aside
      aria-labelledby={`${ids}-title`}
      data-testid="editor-repeat"
      className="absolute inset-x-0 bottom-0 z-10 flex h-[70%] flex-col border-t bg-popover shadow-lg md:static md:h-auto md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none"
    >
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <h2
          id={`${ids}-title`}
          className="px-1 font-heading text-sm font-medium"
        >
          Numbers and watermarks
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close numbers and watermarks"
          title="Close"
          onClick={() => repeat.setOn(false)}
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
      <form
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void repeat.add()
        }}
      >
        <ChoiceChips
          label="What to add"
          value={kind}
          onValueChange={repeat.setKind}
          options={(Object.keys(KIND_NAMES) as RepeatKind[]).map((value) => ({
            value,
            label: KIND_NAMES[value],
          }))}
        />

        {kind === "numbers" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Written as">
              {(id) => (
                <select
                  id={id}
                  value={repeat.format}
                  onChange={(event) =>
                    repeat.setFormat(event.target.value as NumberFormat)
                  }
                  className={field}
                >
                  {(Object.keys(NUMBER_FORMATS) as NumberFormat[]).map(
                    (format) => (
                      <option key={format} value={format}>
                        {FORMAT_NAMES[format]}
                      </option>
                    )
                  )}
                </select>
              )}
            </Field>
            <Field label="First number">
              {(id) => (
                <Count
                  id={id}
                  value={look.from}
                  min={0}
                  max={999_999}
                  onChange={(from) => repeat.setLook({ from })}
                />
              )}
            </Field>
          </div>
        )}

        {kind === "words" && (
          <Field
            label="Words"
            hint="{page} is the page's number, {pages} how many there are, {date} today's date, {name} the file's name."
          >
            {(id, hint) => (
              <input
                id={id}
                type="text"
                value={repeat.words}
                onChange={(event) => repeat.setWords(event.target.value)}
                aria-describedby={hint}
                maxLength={200}
                className={field}
              />
            )}
          </Field>
        )}

        {kind === "bates" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Before the number">
              {(id) => (
                <input
                  id={id}
                  type="text"
                  value={repeat.prefix}
                  onChange={(event) => repeat.setPrefix(event.target.value)}
                  maxLength={60}
                  className={field}
                />
              )}
            </Field>
            <Field label="After the number">
              {(id) => (
                <input
                  id={id}
                  type="text"
                  value={repeat.suffix}
                  onChange={(event) => repeat.setSuffix(event.target.value)}
                  maxLength={60}
                  className={field}
                />
              )}
            </Field>
            <Field label="First number">
              {(id) => (
                <Count
                  id={id}
                  value={look.first}
                  min={0}
                  max={999_999_999}
                  onChange={(first) => repeat.setLook({ first })}
                />
              )}
            </Field>
            <Field label="Figures">
              {(id) => (
                <Count
                  id={id}
                  value={look.figures}
                  min={1}
                  max={MOST_FIGURES}
                  onChange={(figures) => repeat.setLook({ figures })}
                />
              )}
            </Field>
          </div>
        )}

        {kind !== "mark" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Place" className="col-span-2">
              {(id) => (
                <select
                  id={id}
                  value={look.spot}
                  onChange={(event) =>
                    repeat.setSpot(event.target.value as Spot)
                  }
                  className={field}
                >
                  {SPOTS.map((spot) => (
                    <option key={spot} value={spot}>
                      {SPOT_NAMES[spot]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Size, in points">
              {(id) => (
                <Count
                  id={id}
                  value={look.size}
                  min={4}
                  max={72}
                  onChange={(size) => repeat.setLook({ size })}
                />
              )}
            </Field>
            <Field label="From the edge, in points">
              {(id) => (
                <Count
                  id={id}
                  value={look.margin}
                  min={0}
                  max={LARGEST_MARGIN}
                  onChange={(margin) => repeat.setLook({ margin })}
                />
              )}
            </Field>
          </div>
        )}

        {kind === "mark" && (
          <>
            {mark.picture ? (
              <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span className="min-w-0 truncate">
                  <IconPhoto
                    aria-hidden="true"
                    className="mr-1.5 inline size-4"
                  />
                  {repeat.pictureName}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 shrink-0 md:h-9"
                  onClick={repeat.dropPicture}
                >
                  Use words
                </Button>
              </div>
            ) : (
              <>
                <Field label="Words">
                  {(id) => (
                    <input
                      id={id}
                      type="text"
                      value={mark.text}
                      onChange={(event) =>
                        repeat.setMark({ text: event.target.value })
                      }
                      maxLength={60}
                      className={field}
                    />
                  )}
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 md:h-9"
                  onClick={() => picker.current?.click()}
                >
                  <IconPhoto aria-hidden="true" /> Use a picture instead
                </Button>
                <input
                  ref={picker}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  aria-label="A picture for the watermark"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(event) => {
                    const [chosen] = event.target.files ?? []
                    event.target.value = ""
                    if (chosen) void repeat.choosePicture(chosen)
                  }}
                />
                <div
                  role="group"
                  aria-label="Colour"
                  className="flex items-center gap-1"
                >
                  <span className="pr-1 text-xs text-muted-foreground">
                    Colour
                  </span>
                  {MARK_COLOURS.map((entry) => (
                    <button
                      key={entry.name}
                      type="button"
                      aria-label={`Colour: ${entry.name}`}
                      title={entry.name}
                      aria-pressed={entry.colour.every(
                        (part, at) => part === mark.colour[at]
                      )}
                      onClick={() => repeat.setMark({ colour: entry.colour })}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted md:size-9"
                    >
                      <span
                        className="block size-5 rounded-full ring-1 ring-foreground/20"
                        style={{ background: cssColour(entry.colour) }}
                      />
                    </button>
                  ))}
                </div>
                <ToggleRow
                  label="From corner to corner"
                  checked={mark.slanted}
                  onCheckedChange={(slanted) => repeat.setMark({ slanted })}
                />
              </>
            )}
            <Field label={`How solid: ${Math.round(mark.opacity * 100)}%`}>
              {(id) => (
                <input
                  id={id}
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(mark.opacity * 100)}
                  onChange={(event) =>
                    repeat.setMark({
                      opacity: Number(event.target.value) / 100,
                    })
                  }
                  className="h-11 w-full accent-primary md:h-9"
                />
              )}
            </Field>
            <Field
              label={`How large: ${Math.round(mark.share * 100)}% of the page`}
            >
              {(id) => (
                <input
                  id={id}
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={Math.round(mark.share * 100)}
                  onChange={(event) =>
                    repeat.setMark({ share: Number(event.target.value) / 100 })
                  }
                  className="h-11 w-full accent-primary md:h-9"
                />
              )}
            </Field>
          </>
        )}

        <Field
          label="Pages"
          hint="Leave empty for every page, or type pages like 1-3, 7, 10-, odd or even."
        >
          {(id, hint) => (
            <input
              id={id}
              type="text"
              value={repeat.range}
              onChange={(event) => repeat.setRange(event.target.value)}
              aria-describedby={hint}
              placeholder="All pages"
              className={field}
            />
          )}
        </Field>

        {repeat.problem && (
          <p role="alert" className="text-xs text-destructive">
            {repeat.problem}
          </p>
        )}
        <Button
          type="submit"
          disabled={Boolean(repeat.problem) || !count}
          className="h-11 w-full md:h-9"
        >
          {count === 1
            ? "Add to 1 page"
            : `Add to ${count.toLocaleString("en")} pages`}
        </Button>
        {repeat.said && (
          <p
            role="status"
            data-testid="repeat-said"
            className="text-xs text-muted-foreground"
          >
            {repeat.said}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {kind === "mark"
            ? "A watermark is laid over what the page shows, see-through as set."
            : "Numbers are written as the pages lie now: put the pages in order first."}
        </p>
      </form>
    </aside>
  )
}
