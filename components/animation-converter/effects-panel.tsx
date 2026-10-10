"use client"

import { useId, useRef } from "react"
import { IconPhotoPlus, IconX } from "@tabler/icons-react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  adjusts,
  type CaptionSize,
  type Corner,
  type Filter,
} from "@/lib/animation/effects"
import { hasCaption, type AnimationSettings } from "@/lib/animation/settings"
import type { Update } from "./format-panel"

const fadeChoices = ["0", "0.5", "1", "2"]
const fadeOptions = fadeChoices.map((value) => ({
  value,
  label: value === "0" ? "Off" : `${value} s`,
}))
const sliders = [
  ["brightness", "Brightness"],
  ["contrast", "Contrast"],
  ["saturation", "Saturation"],
] as const

/** Captions, colour changes, fades and a logo, applied to every animation. */
export function EffectsPanel({
  settings,
  update,
  overlay,
  overlayProblem,
  onOverlay,
}: {
  settings: AnimationSettings
  update: Update
  /** The logo or watermark that was added, if any. */
  overlay: { name: string; url: string } | null
  /** Why the last image chosen could not be used; empty when it could. */
  overlayProblem: string
  onOverlay: (file: File | null) => void
}) {
  const ids = useId()
  const picker = useRef<HTMLInputElement>(null)
  const written = hasCaption(settings)
  const seconds = (value: number | null) =>
    value === null || Number.isNaN(value) ? "" : value

  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
      <Section title="Text">
        {(["captionTop", "captionBottom"] as const).map((field) => (
          <div key={field}>
            <label
              htmlFor={`${ids}-${field}`}
              className="mb-2 block text-sm font-medium"
            >
              {field === "captionTop" ? "Top text" : "Bottom text"}
            </label>
            <Input
              id={`${ids}-${field}`}
              value={settings[field]}
              maxLength={200}
              onChange={(event) => update({ [field]: event.target.value })}
              placeholder={
                field === "captionTop"
                  ? "Written at the top"
                  : "Written at the bottom"
              }
            />
          </div>
        ))}
        {written && (
          <>
            <ChoiceChips
              label="Text size"
              value={settings.captionSize}
              onValueChange={(captionSize: CaptionSize) =>
                update({ captionSize })
              }
              options={[
                { value: "small", label: "Small" },
                { value: "medium", label: "Medium" },
                { value: "large", label: "Large" },
              ]}
              hint="Long text wraps onto more lines, and gets smaller when a word is wider than the picture."
            />
            <ChoiceChips
              label="Text colour"
              value={settings.captionColour}
              onValueChange={(
                captionColour: AnimationSettings["captionColour"]
              ) => update({ captionColour })}
              options={[
                { value: "white", label: "White" },
                { value: "black", label: "Black" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {settings.captionColour === "custom" && (
              <div>
                <label
                  htmlFor={`${ids}-text-colour`}
                  className="mb-2 block text-sm font-medium"
                >
                  Custom text colour
                </label>
                <input
                  id={`${ids}-text-colour`}
                  type="color"
                  value={settings.captionCustomColour}
                  onChange={(event) =>
                    update({ captionCustomColour: event.target.value })
                  }
                  className="h-11 w-16 cursor-pointer rounded-md border bg-background p-1 md:h-9"
                />
              </div>
            )}
            <ToggleRow
              label="Outline"
              hint="A contrasting line around the letters keeps them readable on any picture."
              checked={settings.captionOutline}
              onCheckedChange={(captionOutline) => update({ captionOutline })}
            />
            <ToggleRow
              label="Capital letters"
              checked={settings.captionUppercase}
              onCheckedChange={(captionUppercase) =>
                update({ captionUppercase })
              }
            />
            <div>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    ["captionFrom", "Show from (s)", "Start"],
                    ["captionUntil", "Until (s)", "End"],
                  ] as const
                ).map(([field, label, placeholder]) => (
                  <div key={field} className="w-32">
                    <label
                      htmlFor={`${ids}-${field}`}
                      className="mb-2 block text-sm font-medium"
                    >
                      {label}
                    </label>
                    <Input
                      id={`${ids}-${field}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.1}
                      value={seconds(settings[field])}
                      placeholder={placeholder}
                      onChange={(event) =>
                        update({
                          [field]:
                            event.target.value === ""
                              ? null
                              : event.target.valueAsNumber,
                        })
                      }
                      className="font-mono"
                      aria-describedby={`${ids}-times-hint`}
                    />
                  </div>
                ))}
              </div>
              <p
                id={`${ids}-times-hint`}
                className="mt-2 text-xs text-muted-foreground"
              >
                Seconds into the result. Leave both empty to show the text all
                the way through.
              </p>
            </div>
          </>
        )}
      </Section>

      <Section title="Colour">
        <ChoiceChips
          label="Filter"
          hideLabel
          value={settings.filter}
          onValueChange={(filter: Filter) => update({ filter })}
          options={[
            { value: "none", label: "None" },
            { value: "greyscale", label: "Greyscale" },
            { value: "sepia", label: "Sepia" },
            { value: "invert", label: "Invert" },
          ]}
        />
        {sliders.map(([field, label]) => (
          <div key={field}>
            <label
              htmlFor={`${ids}-${field}`}
              className="mb-1 flex items-center justify-between text-sm font-medium"
            >
              {label}
              <span className="font-mono">
                {settings[field] > 0 ? "+" : ""}
                {settings[field]}
              </span>
            </label>
            <input
              id={`${ids}-${field}`}
              type="range"
              min={-100}
              max={100}
              step={5}
              value={settings[field]}
              onChange={(event) =>
                update({ [field]: Number(event.target.value) })
              }
              className="min-h-11 w-full accent-primary md:min-h-9"
            />
          </div>
        ))}
        {adjusts(settings) && (
          <Button
            variant="outline"
            onClick={() =>
              update({
                filter: "none",
                brightness: 0,
                contrast: 0,
                saturation: 0,
              })
            }
          >
            Reset colour
          </Button>
        )}
      </Section>

      <Section title="Fade">
        {(
          [
            ["fadeIn", "Fade in"],
            ["fadeOut", "Fade out"],
          ] as const
        ).map(([field, label]) => (
          <ChoiceChips
            key={field}
            label={label}
            value={String(settings[field])}
            onValueChange={(value) => update({ [field]: Number(value) })}
            options={fadeOptions}
          />
        ))}
        <p className="text-xs text-muted-foreground">
          The picture fades from and to black, or the background colour when one
          is chosen. A fade adds in-between pictures, so the file gets larger.
        </p>
      </Section>

      <Section title="Logo or watermark">
        <input
          ref={picker}
          type="file"
          accept="image/*,.heic,.heif,.jxl"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a logo or watermark image"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onOverlay(file)
            event.target.value = ""
          }}
        />
        {overlay ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local file chosen by the person */}
            <img
              src={overlay.url}
              alt=""
              className="size-11 shrink-0 rounded-md border bg-muted object-contain"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {overlay.name}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Remove the logo"
              onClick={() => onOverlay(null)}
            >
              <IconX aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => picker.current?.click()}>
            <IconPhotoPlus aria-hidden="true" />
            Add an image
          </Button>
        )}
        {overlayProblem && (
          <p role="alert" className="text-sm text-destructive">
            {overlayProblem}
          </p>
        )}
        {overlay ? (
          <>
            <ChoiceChips
              label="Position"
              value={settings.overlayCorner}
              onValueChange={(overlayCorner: Corner) =>
                update({ overlayCorner })
              }
              options={[
                { value: "top-left", label: "Top left" },
                { value: "top-right", label: "Top right" },
                { value: "bottom-left", label: "Bottom left" },
                { value: "bottom-right", label: "Bottom right" },
                { value: "centre", label: "Centre" },
              ]}
            />
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["overlaySize", "Width (%)", 5],
                  ["overlayOpacity", "Opacity (%)", 10],
                ] as const
              ).map(([field, label, least]) => (
                <div key={field} className="w-32">
                  <label
                    htmlFor={`${ids}-${field}`}
                    className="mb-2 block text-sm font-medium"
                  >
                    {label}
                  </label>
                  <Input
                    id={`${ids}-${field}`}
                    type="number"
                    inputMode="numeric"
                    min={least}
                    max={100}
                    value={Number.isNaN(settings[field]) ? "" : settings[field]}
                    onChange={(event) =>
                      update({ [field]: event.target.valueAsNumber })
                    }
                    className="font-mono"
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            A picture painted on every frame, such as a logo with a see-through
            background. It stays on your device.
          </p>
        )}
      </Section>
    </div>
  )
}
