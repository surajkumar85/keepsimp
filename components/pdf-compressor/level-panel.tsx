"use client"

import { useId } from "react"
import { ToggleRow } from "@/components/image-batch/controls"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  customDpis,
  customQuality,
  modeChoices,
  modeNote,
  scanChoices,
  type CustomChoice,
  type Mode,
  type ScanChoice,
} from "@/lib/pdf-compressor/settings"
import { targetSizes } from "@/lib/pdf-compressor/target"
import type { SizeUnit } from "@/lib/pdf-splitter/size"

/** One of the usual sizes, by its bytes, or a size that is typed. */
export type SizeChoice = string

export const CUSTOM_SIZE = "custom"

/**
 * How much to compress: one of three levels, or a size to come out under.
 * A size is one of the usual ones or typed, in KB or MB.
 */
export function LevelPanel({
  mode,
  onMode,
  size,
  onSize,
  sizeText,
  onSizeText,
  sizeUnit,
  onSizeUnit,
  sizeWrong,
  further,
  onFurther,
  scans,
  onScans,
  custom,
  onCustom,
  disabled,
}: {
  mode: Mode
  onMode: (mode: Mode) => void
  size: SizeChoice
  onSize: (size: SizeChoice) => void
  sizeText: string
  onSizeText: (text: string) => void
  sizeUnit: SizeUnit
  onSizeUnit: (unit: SizeUnit) => void
  /** What is typed is not a size that can be used. */
  sizeWrong: boolean
  further: boolean
  onFurther: (further: boolean) => void
  /** What to do with pages that are one large picture. */
  scans: ScanChoice
  onScans: (scans: ScanChoice) => void
  custom: CustomChoice
  onCustom: (change: Partial<CustomChoice>) => void
  disabled: boolean
}) {
  const ids = useId()
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <ChoiceChips
        label="How much to compress"
        value={mode}
        onValueChange={onMode}
        options={modeChoices.map(({ value, label }) => ({ value, label }))}
        hint={modeNote(mode)}
        disabled={disabled}
      />
      {mode === "size" && (
        <>
          <ChoiceChips
            label="Come out under"
            value={size}
            onValueChange={onSize}
            options={[
              ...targetSizes.map(({ bytes, label }) => ({
                value: String(bytes),
                label,
              })),
              { value: CUSTOM_SIZE, label: "Another size" },
            ]}
            disabled={disabled}
          />
          {size === CUSTOM_SIZE && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor={`${ids}-size`}
                  className="mb-1 block text-sm font-medium"
                >
                  Size
                </label>
                <Input
                  id={`${ids}-size`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={sizeText}
                  onChange={(event) => onSizeText(event.target.value)}
                  aria-invalid={sizeWrong || undefined}
                  disabled={disabled}
                  className="w-24 font-mono"
                />
              </div>
              <ChoiceChips
                label="Unit"
                hideLabel
                value={sizeUnit}
                onValueChange={onSizeUnit}
                options={[
                  { value: "KB", label: "KB" },
                  { value: "MB", label: "MB" },
                ]}
                disabled={disabled}
              />
            </div>
          )}
          <ToggleRow
            label="Go further if it takes it"
            hint="Past the point where pictures are easy to read. Off, the smallest readable result is given when the size cannot be reached."
            checked={further}
            onCheckedChange={onFurther}
          />
        </>
      )}
      {mode === "custom" && (
        <>
          <ChoiceChips
            label="Resolution of pictures"
            value={String(custom.dpi)}
            onValueChange={(dpi) => onCustom({ dpi: Number(dpi) })}
            options={customDpis.map((dpi) => ({
              value: String(dpi),
              label: `${dpi} dpi`,
            }))}
            hint="Pictures with more pixels than this, at the size they are shown, are brought down to it. 150 suits screens and office printers; 300 suits print."
            disabled={disabled}
          />
          <div>
            <label
              htmlFor={`${ids}-quality`}
              className="mb-2 flex justify-between text-sm font-medium"
            >
              <span>Quality of photographs</span>
              <span className="font-mono">{custom.quality}</span>
            </label>
            <input
              id={`${ids}-quality`}
              type="range"
              min={customQuality.min}
              max={customQuality.max}
              value={custom.quality}
              disabled={disabled}
              onChange={(event) =>
                onCustom({ quality: Number(event.target.value) })
              }
              aria-describedby={`${ids}-quality-hint`}
              className="min-h-11 w-full accent-primary md:min-h-9"
            />
            <p
              id={`${ids}-quality-hint`}
              className="text-xs text-muted-foreground"
            >
              The JPEG quality, as it is. Around 80 is hard to tell from the
              original; below 50 shows.
            </p>
          </div>
          <ToggleRow
            label="Pictures in greyscale"
            hint="Colour is taken out of every picture. Text and drawings keep theirs."
            checked={custom.grey}
            onCheckedChange={(grey) => onCustom({ grey })}
          />
          <ToggleRow
            label="Cut fonts to the letters in use"
            hint="Saves the most in files that store whole fonts. Turn it off if the text will be edited later."
            checked={custom.fonts}
            onCheckedChange={(fonts) => onCustom({ fonts })}
          />
        </>
      )}
      {mode !== "lossless" && (
        <div className="border-t pt-4">
          <ChoiceChips
            label="Scanned pages"
            value={scans}
            onValueChange={onScans}
            options={scanChoices.map(({ value, label }) => ({ value, label }))}
            hint={scanChoices.find((choice) => choice.value === scans)!.note}
            disabled={disabled}
          />
        </div>
      )}
    </section>
  )
}
