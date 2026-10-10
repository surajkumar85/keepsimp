"use client"

import { useId } from "react"
import { IconInfoCircle } from "@tabler/icons-react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  losslessApplies,
  targetOrder,
  targets,
  type AnimationSettings,
  type QualityChoice,
  type Target,
} from "@/lib/animation/settings"

export type Update = (
  change:
    | Partial<AnimationSettings>
    | ((current: AnimationSettings) => AnimationSettings)
) => void

const qualityHints: Record<QualityChoice, string> = {
  balanced: "A good picture at a sensible size.",
  high: "Keeps the most detail, with larger files.",
  small: "Prioritises file size. Colours and fine texture may soften.",
  lossless: "Keeps every pixel exactly.",
  custom: "Set the encoder yourself.",
}

/** Format, GIF encoder and quality. */
export function FormatPanel({
  settings,
  update,
  problem,
}: {
  settings: AnimationSettings
  update: Update
  /** The first thing wrong with the settings, shown under the controls. */
  problem: string | null
}) {
  const ids = useId()
  const gif = settings.target === "gif"
  const best = gif && settings.gifEngine === "best"
  // WebP and gifski take a quality number; the palette formats take colours.
  const numeric = settings.target === "webp" || best
  const palette =
    settings.quality !== "lossless" &&
    ((gif && !best) ||
      (settings.target === "apng" && settings.quality !== "high"))

  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
      <Section title="Convert to">
        <ChoiceChips
          label="Format"
          hideLabel
          value={settings.target}
          onValueChange={(target: Target) => update({ target })}
          options={targetOrder.map((target) => ({
            value: target,
            label: targets[target].label,
          }))}
          hint={targets[settings.target].hint}
        />
        {gif && (
          <ChoiceChips
            label="GIF encoder"
            value={settings.gifEngine}
            onValueChange={(gifEngine) => update({ gifEngine })}
            options={[
              { value: "fast", label: "Fast" },
              { value: "best", label: "Best (gifski)" },
            ]}
            hint={
              best
                ? "gifski gives each frame its own colours for the smoothest GIF. It is slow: allow a few seconds for every ten frames."
                : "One set of colours for the whole animation, and only what changes between frames is stored."
            }
          />
        )}
      </Section>

      <Section title="Quality">
        <ChoiceChips
          label="Quality"
          hideLabel
          value={settings.quality}
          onValueChange={(quality: QualityChoice) => update({ quality })}
          options={[
            { value: "balanced", label: "Balanced" },
            { value: "high", label: "High" },
            { value: "small", label: "Small file" },
            {
              value: "lossless",
              label: "Lossless",
              disabled: !losslessApplies(settings),
            },
            { value: "custom", label: "Custom" },
          ]}
          hint={
            gif && settings.quality === "lossless"
              ? "GIF holds 256 colours at most, so it cannot be lossless. High is used."
              : qualityHints[settings.quality]
          }
        />
        {settings.quality === "custom" && numeric && (
          <div>
            <label
              htmlFor={`${ids}-quality`}
              className="mb-2 flex justify-between text-sm font-medium"
            >
              <span>Encoder quality</span>
              <span className="font-mono">{settings.customQuality}</span>
            </label>
            <input
              id={`${ids}-quality`}
              type="range"
              min={1}
              max={100}
              value={settings.customQuality}
              onChange={(event) =>
                update({ customQuality: Number(event.target.value) })
              }
              className="min-h-11 w-full accent-primary md:min-h-9"
            />
          </div>
        )}
        {settings.quality === "custom" && !numeric && (
          <div className="w-32">
            <label
              htmlFor={`${ids}-colours`}
              className="mb-2 block text-sm font-medium"
            >
              Colours
            </label>
            <Input
              id={`${ids}-colours`}
              type="number"
              inputMode="numeric"
              min={2}
              max={256}
              value={Number.isNaN(settings.colours) ? "" : settings.colours}
              onChange={(event) =>
                update({ colours: event.target.valueAsNumber })
              }
              className="font-mono"
            />
          </div>
        )}
        {palette && settings.quality !== "small" && (
          <ToggleRow
            label="Dithering"
            hint="Mixes neighbouring colours to smooth gradients. Files are a little larger."
            checked={settings.dithering}
            onCheckedChange={(dithering) => update({ dithering })}
          />
        )}
        {problem && (
          <p
            role="alert"
            className="flex items-start gap-2 text-sm text-destructive"
          >
            <IconInfoCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {problem}
          </p>
        )}
      </Section>
    </div>
  )
}
