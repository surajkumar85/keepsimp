"use client"

import { useId } from "react"
import { IconInfoCircle, IconLoader2, IconScale } from "@tabler/icons-react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { differs, resetOf } from "@/lib/settings-groups"
import {
  customIsNumeric,
  defaultSettings,
  frameFormats,
  losslessApplies,
  targetOrder,
  targets,
  type AnimationSettings,
  type FrameFormat,
  type QualityChoice,
  type Target,
} from "@/lib/animation/settings"
import {
  ANIMATION_GROUPS,
  animationSummary,
  comparisonSummary,
  usesPalette,
  type AnimationGroup,
  type ComparisonState,
} from "@/lib/animation/summary"

export type { ComparisonState }

export type Update = (
  change:
    | Partial<AnimationSettings>
    | ((current: AnimationSettings) => AnimationSettings)
) => void

/** A setting that cannot work, and the group it is in. */
export interface Fault {
  group: AnimationGroup
  text: string
}

/**
 * A group's fold: its settings in a line (or what is wrong with them),
 * whether they differ from the usual, and the press that puts them back.
 * Folded at first unless `open`.
 */
export function fold(
  name: AnimationGroup,
  settings: AnimationSettings,
  update: Update,
  fault: Fault | null,
  open = false
) {
  return {
    summary:
      fault?.group === name
        ? `Needs a change: ${fault.text}`
        : animationSummary(name, settings),
    changed: differs(settings, defaultSettings, ANIMATION_GROUPS[name]),
    onReset: () => update(resetOf(defaultSettings, ANIMATION_GROUPS[name])),
    defaultOpen: open,
  }
}

/** What is wrong with the settings, said in the group they are in. */
export function FaultNote({
  fault,
  group,
}: {
  fault: Fault | null
  group: AnimationGroup
}) {
  if (fault?.group !== group) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <IconInfoCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {fault.text}
    </p>
  )
}

const qualityHints: Record<QualityChoice, string> = {
  balanced: "A good picture at a sensible size.",
  high: "Keeps the most detail, with larger files.",
  small: "Prioritises file size. Colours and fine texture may soften.",
  lossless: "Keeps every pixel exactly.",
  custom: "Set the encoder yourself.",
}

/** Format, GIF encoder and quality, and a comparison of every format's size. */
export function FormatPanel({
  settings,
  update,
  fault,
  video,
  comparison,
  canCompare,
  onCompare,
  onCancelCompare,
}: {
  settings: AnimationSettings
  update: Update
  /** The first thing wrong with the settings, said in its group. */
  fault: Fault | null
  /** Which video formats this browser can write; null while that is being checked. */
  video: { mp4: boolean; webm: boolean } | null
  comparison: ComparisonState
  canCompare: boolean
  onCompare: () => void
  onCancelCompare: () => void
}) {
  const ids = useId()
  const gif = settings.target === "gif"
  const best = gif && settings.gifEngine === "best"
  const kind = targets[settings.target].kind
  // WebP, video and gifski take a quality number; the palette formats take colours.
  const numeric = customIsNumeric(settings)
  const palette = usesPalette(settings)
  const unavailable = (target: Target) =>
    targets[target].kind === "video" &&
    !(video && video[target as "mp4" | "webm"])

  return (
    <>
      <Section
        title="Convert to"
        {...fold("format", settings, update, fault, true)}
      >
        <ChoiceChips
          label="Format"
          hideLabel
          value={settings.target}
          onValueChange={(target: Target) => update({ target })}
          options={targetOrder.map((target) => ({
            value: target,
            label: targets[target].label,
            disabled: unavailable(target),
          }))}
          hint={targets[settings.target].hint}
        />
        {video && !(video.mp4 && video.webm) && (
          <p className="text-xs text-muted-foreground">
            {video.mp4 || video.webm
              ? `This browser cannot write ${video.mp4 ? "WebM" : "MP4"} video.`
              : "This browser cannot write video, so MP4 and WebM are not offered."}
          </p>
        )}
        {kind === "bundle" && (
          <ChoiceChips
            label={
              settings.target === "sprite" ? "Sheet format" : "Frame format"
            }
            value={settings.frameFormat}
            onValueChange={(frameFormat: FrameFormat) =>
              update({ frameFormat })
            }
            options={(Object.keys(frameFormats) as FrameFormat[]).map(
              (format) => ({ value: format, label: frameFormats[format].label })
            )}
            hint={
              settings.frameFormat === "jpeg"
                ? "JPEG has no transparency; see-through areas are filled."
                : settings.frameFormat === "png"
                  ? "PNG keeps every pixel exactly."
                  : "WebP is smaller, and exact at High or Lossless quality."
            }
          />
        )}
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

      <Section
        title="Quality"
        {...fold("quality", settings, update, fault, true)}
      >
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
              : kind === "bundle" && settings.frameFormat === "png"
                ? "PNG frames are always exact, whatever the quality."
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
        <FaultNote fault={fault} group="quality" />
      </Section>

      <Section
        title="Which format is smallest?"
        summary={comparisonSummary(comparison)}
        defaultOpen={false}
      >
        <p className="text-sm text-muted-foreground">
          Convert the selected animation to every format with your settings and
          compare the real sizes.
        </p>
        {comparison.status === "running" ? (
          <div className="space-y-2" data-testid="comparison-progress">
            <div className="flex flex-wrap items-center gap-3">
              <p
                className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <IconLoader2
                  className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span>
                  {comparison.label}{" "}
                  <span className="whitespace-nowrap">
                    ({comparison.done} of {comparison.total} done)
                  </span>
                </span>
              </p>
              <Button variant="outline" onClick={onCancelCompare}>
                Cancel
              </Button>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Formats compared"
              aria-valuemin={0}
              aria-valuemax={comparison.total}
              aria-valuenow={comparison.done}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
                style={{
                  width: `${Math.max(4, (comparison.done / Math.max(1, comparison.total)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={onCompare}
              disabled={!canCompare}
              aria-describedby={canCompare ? undefined : `${ids}-compare-why`}
            >
              <IconScale aria-hidden="true" />
              {comparison.status === "done"
                ? "Compare again"
                : "Compare formats"}
            </Button>
            {!canCompare && (
              <p
                id={`${ids}-compare-why`}
                className="text-xs text-muted-foreground"
              >
                Ready once the selected animation has been read and the settings
                work.
              </p>
            )}
          </>
        )}
        {comparison.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {comparison.message}
          </p>
        )}
        {comparison.status === "done" && (
          <div className="relative overflow-x-auto rounded-lg border">
            <table
              className="w-full text-left text-sm"
              data-testid="comparison"
            >
              <caption className="sr-only">
                File size for each format, smallest first
              </caption>
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-2 pl-3 font-medium">
                    Format
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Size
                  </th>
                  <th scope="col" className="py-2 pr-1">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.target} className="border-t align-top">
                    <th scope="row" className="py-2 pr-2 pl-3 font-medium">
                      {targets[row.target].label}
                      {row.smallest && (
                        <span className="mt-1 block w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Smallest
                        </span>
                      )}
                    </th>
                    <td className="px-2 py-2">
                      <span className="block whitespace-nowrap">
                        {sizeLabel(row.bytes)}
                      </span>
                      <span className="block text-xs whitespace-nowrap text-muted-foreground">
                        {row.ratio < 1
                          ? `${Math.round((1 - row.ratio) * 100)}% smaller`
                          : row.ratio > 1
                            ? `${Math.round((row.ratio - 1) * 100)}% larger`
                            : "same"}
                      </span>
                    </td>
                    <td className="py-1 pr-1 pl-0 text-right">
                      <Button
                        variant="ghost"
                        aria-label={`Use ${targets[row.target].label}`}
                        disabled={settings.target === row.target}
                        onClick={() => update({ target: row.target })}
                      >
                        Use
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  )
}
