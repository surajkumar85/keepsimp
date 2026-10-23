"use client"

import { useId, useState } from "react"
import { IconCheck, IconCopy, IconLock } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { ToggleChips } from "@/components/ui/toggle-chips"
import {
  outputFormats,
  type OutputFormat,
} from "@/lib/image-compressor/formats"
import { carriesDensity } from "@/lib/image-resizer/metadata"
import { nameTokens, unknownTokens } from "@/lib/image-resizer/naming"
import {
  losslessAllowed,
  type FormatChoice,
  type KernelChoice,
  type QualityChoice,
  type ResizerSettings,
} from "@/lib/image-resizer/settings"
import type { Sharpen } from "@/lib/image-resizer/sharpen"
import { MAX_SET, responsiveWidths } from "@/lib/image-resizer/srcset"
import { dpiChoices, isPhysical } from "@/lib/image-resizer/units"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import type { ResizerGroup } from "@/lib/image-resizer/summary"
import { groupProps, type Update } from "./settings-panel"

const qualityHints: Record<QualityChoice, string> = {
  balanced:
    "Finds the smallest file that still measures close to the resized image.",
  high: "Keeps almost every detail, with larger files.",
  small: "Prioritises file size. Fine texture may soften.",
  lossless: "Keeps every pixel exactly. PNG and WebP only.",
  custom: "Set the encoder quality yourself.",
}

export function OutputPanel({
  settings,
  update,
  format,
  exampleName,
  snippet,
  usual,
  onResetGroup,
}: {
  /** The usual settings, which "changed" and "Reset" are measured against. */
  usual: ResizerSettings
  onResetGroup: (group: ResizerGroup) => void
  settings: ResizerSettings
  update: Update
  /** Format the selected image will be saved as. */
  format: OutputFormat | null
  exampleName: string | null
  /** Responsive `<img>` markup for the selected image, when a set is ready. */
  snippet: string | null
}) {
  const ids = useId()
  const [copied, setCopied] = useState(false)
  const unknown = unknownTokens(settings.pattern)
  const canLossless = format ? losslessAllowed(format) : true
  const density = format ? carriesDensity(format) : true
  const physical =
    isPhysical(settings.unit) &&
    (settings.mode === "dimensions" ||
      settings.mode === "width" ||
      settings.mode === "height")

  async function copy() {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      toast.success("Copied to the clipboard", {
        description: "The HTML for the selected image.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const group = (name: ResizerGroup) =>
    groupProps(name, settings, usual, onResetGroup)

  return (
    <>
      <Section title="Output" {...group("output")}>
        <ChoiceChips
          label="Format"
          value={settings.format}
          onValueChange={(next: FormatChoice) =>
            update((current) => ({
              ...current,
              format: next,
              quality:
                current.quality === "lossless" &&
                next !== "original" &&
                !losslessAllowed(next)
                  ? "balanced"
                  : current.quality,
            }))
          }
          options={[
            { value: "original", label: "Same as original" },
            { value: "webp", label: "WebP" },
            { value: "avif", label: "AVIF" },
            { value: "jpeg", label: "JPEG" },
            { value: "png", label: "PNG" },
          ]}
          hint={
            format && settings.format === "original"
              ? `The selected image will be saved as ${outputFormats[format].label}.`
              : undefined
          }
        />
        <ChoiceChips
          label="Quality"
          value={settings.quality}
          onValueChange={(quality: QualityChoice) => update({ quality })}
          options={[
            { value: "balanced", label: "Balanced" },
            { value: "high", label: "High" },
            { value: "small", label: "Small file" },
            { value: "lossless", label: "Lossless", disabled: !canLossless },
            { value: "custom", label: "Custom" },
          ]}
          hint={qualityHints[settings.quality]}
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

      <Section title="Names and print resolution" {...group("names")}>
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
                : "Placeholders are replaced for each image."}
          </p>
        </div>
        {!physical && (
          <ToggleRow
            label="Save print resolution"
            hint={
              density
                ? `Writes ${settings.dpi} DPI into JPEG and PNG files.`
                : "WebP and AVIF files cannot store a print resolution."
            }
            checked={settings.embedDpi}
            onCheckedChange={(embedDpi) => update({ embedDpi })}
          />
        )}
        {!physical && settings.embedDpi && (
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

      <Section title="Several sizes" {...group("sizes")}>
        <ToggleRow
          label="Export a responsive set"
          hint="Makes one file per width from every image, ready for srcset."
          checked={settings.multi}
          onCheckedChange={(multi) => update({ multi })}
        />
        {settings.multi && (
          <>
            <ToggleChips
              label="Widths (px)"
              value={settings.widths.map(String)}
              onValueChange={(values) =>
                update({ widths: values.map(Number).sort((a, b) => a - b) })
              }
              options={responsiveWidths.map((width) => ({
                value: String(width),
                label: `${width}`,
              }))}
            />
            <div>
              <label
                htmlFor={`${ids}-widths`}
                className="mb-2 block text-sm font-medium"
              >
                More widths
              </label>
              <Input
                id={`${ids}-widths`}
                inputMode="numeric"
                placeholder="For example 480, 800"
                value={settings.customWidths}
                onChange={(event) =>
                  update({ customWidths: event.target.value })
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Separate with commas. Up to {MAX_SET} widths in total.
              </p>
            </div>
            {snippet && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    HTML for the selected image
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 md:h-7"
                    onClick={() => void copy()}
                  >
                    {copied ? (
                      <IconCheck aria-hidden="true" />
                    ) : (
                      <IconCopy aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre
                  tabIndex={0}
                  aria-label="Responsive image HTML"
                  data-testid="srcset-snippet"
                  className="max-h-56 overflow-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed"
                >
                  {snippet}
                </pre>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {copied
                    ? "Copied to the clipboard."
                    : "Adjust sizes to match your layout."}
                </p>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Advanced options" {...group("advanced")}>
        <ChoiceChips
          label="Resampling"
          value={settings.kernel}
          onValueChange={(kernel: KernelChoice) => update({ kernel })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "lanczos3", label: "Lanczos" },
            { value: "magicKernelSharp2021", label: "Magic Kernel Sharp" },
            { value: "mitchell", label: "Mitchell" },
            { value: "catrom", label: "Catmull-Rom" },
            { value: "triangle", label: "Bilinear" },
            { value: "nearest", label: "Nearest (pixel art)" },
          ]}
          hint="Auto uses Lanczos to shrink and Mitchell to enlarge, both in linear light."
        />
        <ChoiceChips
          label="Sharpen after shrinking"
          value={settings.sharpen}
          onValueChange={(sharpen: Sharpen) => update({ sharpen })}
          options={[
            { value: "off", label: "Off" },
            { value: "light", label: "Light" },
            { value: "medium", label: "Medium" },
            { value: "strong", label: "Strong" },
          ]}
          hint="Restores edge contrast that shrinking softens. Not applied when enlarging."
        />
        <ChoiceChips
          label="Round dimensions"
          value={String(settings.multiple)}
          onValueChange={(value) =>
            update({ multiple: Number(value) as 1 | 2 | 8 })
          }
          options={[
            { value: "1", label: "Exact" },
            { value: "2", label: "Even numbers" },
            { value: "8", label: "Multiples of 8" },
          ]}
          hint="Some video tools and encoders need even or 8-pixel sizes."
        />
      </Section>

      <p className="flex items-center gap-1.5 border-t py-4 text-xs text-muted-foreground">
        <IconLock className="size-3.5" aria-hidden="true" />
        Processed on your device. Metadata such as location is removed.
      </p>
    </>
  )
}
