"use client"

import { useId } from "react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  flattenedTargets,
  losslessAvailable,
  qualityApplies,
  type ConverterSettings,
  type Limit,
  type QualityChoice,
} from "@/lib/image-converter/settings"
import { targets } from "@/lib/image-converter/targets"
import { unknownTokens } from "@/lib/image-resizer/naming"
import { dpiChoices } from "@/lib/image-resizer/units"
import type { ConverterGroup } from "@/lib/image-converter/summary"
import { groupProps, type Update } from "./format-panel"

const qualityHints: Record<QualityChoice, string> = {
  balanced:
    "Finds the smallest file that still measures close to the original.",
  high: "Keeps almost every detail, with larger files.",
  small: "Prioritises file size. Fine texture may soften.",
  lossless: "Keeps every pixel exactly, in formats that can.",
  custom: "Set the encoder quality yourself.",
}
const nameTokens = ["name", "format", "width", "height", "index"]

export function OptionsPanel({
  settings,
  update,
  exampleName,
  usual,
  onResetGroup,
}: {
  /** The usual settings, which "changed" and "Reset" are measured against. */
  usual: ConverterSettings
  onResetGroup: (group: ConverterGroup) => void
  settings: ConverterSettings
  update: Update
  exampleName: string | null
}) {
  const ids = useId()
  const flattened = flattenedTargets(settings)
  const canLossless = losslessAvailable(settings)
  const unknown = unknownTokens(settings.pattern).filter(
    (token) => token !== "preset"
  )
  const density = ["jpeg", "png", "bmp", "tiff"] as const

  const group = (name: ConverterGroup) =>
    groupProps(name, settings, usual, onResetGroup)

  return (
    <>
      {qualityApplies(settings) && (
        <Section title="Quality" {...group("quality")}>
          <ChoiceChips
            label="Quality"
            hideLabel
            value={settings.quality}
            onValueChange={(quality: QualityChoice) => update({ quality })}
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "high", label: "High" },
              { value: "small", label: "Small file" },
              { value: "lossless", label: "Lossless", disabled: !canLossless },
              { value: "custom", label: "Custom" },
            ]}
            hint={
              settings.quality === "lossless" && settings.multi
                ? "Lossless applies to PNG, WebP, JPEG XL and PDF; other formats use High."
                : qualityHints[settings.quality]
            }
          />
          {settings.quality === "custom" && (
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
        </Section>
      )}

      <Section title="Options" {...group("options")}>
        {flattened.length > 0 && (
          <>
            <ChoiceChips
              label="Background for transparency"
              value={settings.background}
              onValueChange={(background) => update({ background })}
              options={[
                { value: "white", label: "White" },
                { value: "black", label: "Black" },
                { value: "custom", label: "Custom" },
              ]}
              hint={`${flattened.map((target) => targets[target].label).join(" and ")} cannot store transparency, so transparent areas take this colour.`}
            />
            {settings.background === "custom" && (
              <div className="flex items-center gap-3">
                <label
                  htmlFor={`${ids}-colour`}
                  className="text-sm font-medium"
                >
                  Background colour
                </label>
                <input
                  id={`${ids}-colour`}
                  type="color"
                  value={settings.backgroundColor}
                  onChange={(event) =>
                    update({ backgroundColor: event.target.value })
                  }
                  className="h-11 w-16 cursor-pointer rounded-md border bg-background p-1 md:h-9"
                />
              </div>
            )}
          </>
        )}
        <ChoiceChips
          label="Limit the longest side"
          value={settings.limit}
          onValueChange={(limit: Limit) => update({ limit })}
          options={[
            { value: "original", label: "Original size" },
            { value: "4096", label: "4096" },
            { value: "2560", label: "2560" },
            { value: "1920", label: "1920" },
            { value: "1280", label: "1280" },
            { value: "custom", label: "Custom" },
          ]}
          hint="Larger images are reduced to this many pixels; smaller ones are never enlarged."
        />
        {settings.limit === "custom" && (
          <div>
            <label
              htmlFor={`${ids}-limit`}
              className="mb-2 block text-sm font-medium"
            >
              Longest side (px)
            </label>
            <Input
              id={`${ids}-limit`}
              type="number"
              inputMode="numeric"
              min={1}
              value={settings.customLimit}
              onChange={(event) => update({ customLimit: event.target.value })}
            />
          </div>
        )}
        <ToggleRow
          label="Convert to greyscale"
          hint="Removes colour and keeps transparency."
          checked={settings.greyscale}
          onCheckedChange={(greyscale) => update({ greyscale })}
        />
        <ToggleRow
          label="Save print resolution"
          hint={`Writes ${settings.dpi} DPI into ${density
            .map((target) => targets[target].label)
            .join(", ")} files. Other formats cannot store it.`}
          checked={settings.embedDpi}
          onCheckedChange={(embedDpi) => update({ embedDpi })}
        />
        {settings.embedDpi && (
          <ChoiceChips
            label="Resolution (DPI)"
            value={String(settings.dpi)}
            onValueChange={(value) => update({ dpi: Number(value) })}
            options={dpiChoices.map((dpi) => ({
              value: String(dpi),
              label: `${dpi}`,
            }))}
          />
        )}
      </Section>

      <Section title="Naming" {...group("names")}>
        <div className="space-y-2">
          <label
            htmlFor={`${ids}-pattern`}
            className="block text-sm font-medium"
          >
            File names
          </label>
          <Input
            id={`${ids}-pattern`}
            value={settings.pattern}
            spellCheck={false}
            autoComplete="off"
            aria-describedby={`${ids}-pattern-hint`}
            aria-invalid={unknown.length > 0 || undefined}
            onChange={(event) => update({ pattern: event.target.value })}
          />
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Insert a placeholder"
          >
            {nameTokens.map((token) => (
              <Button
                key={token}
                variant="outline"
                size="sm"
                className="h-11 rounded-full px-3 font-mono text-xs md:h-7"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    pattern: `${current.pattern}{${token}}`,
                  }))
                }
              >
                {`{${token}}`}
              </Button>
            ))}
          </div>
          <p
            id={`${ids}-pattern-hint`}
            className={
              unknown.length
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {unknown.length
              ? `Unknown placeholder: {${unknown[0]}}. It will be kept as text.`
              : exampleName
                ? `Example: ${exampleName}`
                : "The new extension is added for you."}
          </p>
        </div>
      </Section>
    </>
  )
}
