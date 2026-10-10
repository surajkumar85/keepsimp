"use client"

import { useId } from "react"
import {
  IconArrowsExchange,
  IconFlipHorizontal,
  IconFlipVertical,
  IconRotate2,
  IconRotateClockwise2,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import type { Size } from "@/lib/image-compressor/geometry"
import { anchorOf, anchors, type Focus } from "@/lib/image-resizer/focus"
import {
  findPreset,
  presetGroups,
  PRESETS_CHECKED,
  presetsIn,
} from "@/lib/image-resizer/presets"
import {
  applyPreset,
  changeUnit,
  flipView,
  linkDimension,
  rotateView,
  swapSides,
  usesBox,
  type ResizerSettings,
} from "@/lib/image-resizer/settings"
import type { FitMode, Layout, SizeMode } from "@/lib/image-resizer/sizing"
import {
  dpiChoices,
  isPhysical,
  printLength,
  unitLabels,
  type Unit,
} from "@/lib/image-resizer/units"
import { AnchorGrid } from "./anchor-grid"
import { Section, ToggleRow } from "./controls"

export type Update = (
  change:
    Partial<ResizerSettings> | ((current: ResizerSettings) => ResizerSettings)
) => void

const modeHints: Record<SizeMode, string> = {
  dimensions:
    "Set both sides for an exact frame, or just one to keep each image's proportions.",
  width: "Every image gets this width; heights follow their proportions.",
  height: "Every image gets this height; widths follow their proportions.",
  longest: "The longer side of each image becomes this size.",
  shortest: "The shorter side of each image becomes this size.",
  percent: "Scale every image by the same percentage.",
  megapixels: "Resize to a total pixel count, keeping proportions.",
  preset: `Recommended sizes from public guides, checked ${PRESETS_CHECKED}. Platforms can change them.`,
}

const fitHints: Record<FitMode, string> = {
  cover: "Fills the frame exactly and trims what does not fit.",
  contain: "Shows the whole picture and fills the rest of the frame.",
  inside:
    "As large as possible within the frame. Nothing is cropped or padded.",
  outside: "As small as possible while covering the frame. Nothing is cropped.",
  stretch: "Fills the frame exactly, which can distort the picture.",
}

function DpiControl({
  settings,
  update,
}: {
  settings: ResizerSettings
  update: Update
}) {
  const id = useId()
  const preset = (dpiChoices as readonly number[]).includes(settings.dpi)
  return (
    <div className="space-y-3">
      <ChoiceChips
        label="Print resolution (DPI)"
        value={preset ? String(settings.dpi) : "custom"}
        onValueChange={(value) =>
          update({ dpi: value === "custom" ? 240 : Number(value) })
        }
        options={[
          ...dpiChoices.map((dpi) => ({ value: String(dpi), label: `${dpi}` })),
          { value: "custom", label: "Custom" },
        ]}
        hint="300 is standard for sharp prints; 72 to 96 suits screens."
      />
      {!preset && (
        <div>
          <label htmlFor={id} className="mb-2 block text-sm font-medium">
            Custom DPI
          </label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={2400}
            value={settings.dpi}
            onChange={(event) =>
              update({
                dpi: Math.min(
                  2400,
                  Math.max(1, Number(event.target.value) || 1)
                ),
              })
            }
          />
        </div>
      )}
    </div>
  )
}

export function SettingsPanel({
  settings,
  update,
  reference,
  layout,
  planError,
  focus,
  hasOverride,
  onAnchor,
  onResetFocus,
  onOrientation,
}: {
  settings: ResizerSettings
  update: Update
  /** The selected image after rotation, used to link width and height. */
  reference: Size | null
  layout: Layout | null
  planError: string | null
  /** Focus in effect for the selected image. */
  focus: Focus
  hasOverride: boolean
  onAnchor: (focus: Focus) => void
  onResetFocus: () => void
  onOrientation: (change: (current: ResizerSettings) => ResizerSettings) => void
}) {
  const ids = useId()
  const box = usesBox(settings)
  const sized =
    settings.mode === "dimensions" ||
    settings.mode === "width" ||
    settings.mode === "height"
  const base = reference ?? { width: 1, height: 1 }
  const preset = findPreset(settings.presetId)
  const unitSuffix = unitLabels[settings.unit]
  const dimension = (edge: "width" | "height") => (
    <div key={edge}>
      <label
        htmlFor={`${ids}-${edge}`}
        className="mb-2 block text-sm font-medium"
      >
        {edge === "width" ? "Width" : "Height"} ({unitSuffix})
      </label>
      <Input
        id={`${ids}-${edge}`}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        placeholder={settings.mode === "dimensions" ? "Auto" : undefined}
        value={settings[edge]}
        aria-invalid={Boolean(planError) || undefined}
        aria-describedby={`${ids}-summary`}
        onChange={(event) =>
          update((current) =>
            current.mode === "dimensions"
              ? linkDimension(current, base, edge, event.target.value)
              : { ...current, [edge]: event.target.value }
          )
        }
      />
    </div>
  )
  const single = (
    key: "side" | "percent" | "megapixels",
    label: string,
    quick: number[]
  ) => (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`${ids}-${key}`}
          className="mb-2 block text-sm font-medium"
        >
          {label}
        </label>
        <Input
          id={`${ids}-${key}`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={settings[key]}
          aria-invalid={Boolean(planError) || undefined}
          aria-describedby={`${ids}-summary`}
          onChange={(event) => update({ [key]: event.target.value })}
        />
      </div>
      <ChoiceChips
        label="Common values"
        hideLabel
        value={quick.includes(Number(settings[key])) ? settings[key] : ""}
        onValueChange={(value) => update({ [key]: value })}
        options={quick.map((value) => ({
          value: String(value),
          label: key === "percent" ? `${value}%` : `${value}`,
        }))}
      />
    </div>
  )

  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
      <Section title="Size">
        <ChoiceChips
          label="Resize by"
          value={settings.mode}
          onValueChange={(mode: SizeMode) =>
            update((current) => ({
              ...current,
              mode,
              unit:
                mode === "width" || mode === "height" || mode === "dimensions"
                  ? current.unit
                  : "px",
            }))
          }
          options={[
            { value: "dimensions", label: "Dimensions" },
            { value: "preset", label: "Presets" },
            { value: "width", label: "Width" },
            { value: "height", label: "Height" },
            { value: "longest", label: "Longest side" },
            { value: "shortest", label: "Shortest side" },
            { value: "percent", label: "Percent" },
            { value: "megapixels", label: "Megapixels" },
          ]}
          hint={modeHints[settings.mode]}
        />

        {sized && (
          <div className="space-y-4">
            <ChoiceChips
              label="Units"
              value={settings.unit}
              onValueChange={(unit: Unit) =>
                update((current) => changeUnit(current, base, unit))
              }
              options={[
                { value: "px", label: "Pixels" },
                { value: "percent", label: "Percent" },
                { value: "in", label: "Inches" },
                { value: "cm", label: "cm" },
                { value: "mm", label: "mm" },
              ]}
            />
            {settings.mode === "dimensions" ? (
              <>
                <div className="flex items-end gap-2">
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    {dimension("width")}
                    {dimension("height")}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Swap width and height"
                    onClick={() => update(swapSides)}
                  >
                    <IconArrowsExchange aria-hidden="true" />
                  </Button>
                </div>
                <ToggleRow
                  label="Keep proportions"
                  hint="Typing one side fills in the other from the selected image."
                  checked={settings.lock}
                  onCheckedChange={(lock) => update({ lock })}
                />
              </>
            ) : (
              dimension(settings.mode as "width" | "height")
            )}
            {isPhysical(settings.unit) && (
              <DpiControl settings={settings} update={update} />
            )}
          </div>
        )}
        {(settings.mode === "longest" || settings.mode === "shortest") &&
          single(
            "side",
            `${settings.mode === "longest" ? "Longest" : "Shortest"} side (px)`,
            [3840, 2560, 1920, 1280, 1080, 640]
          )}
        {settings.mode === "percent" &&
          single("percent", "Scale (%)", [200, 75, 50, 25])}
        {settings.mode === "megapixels" &&
          single("megapixels", "Megapixels", [1, 2, 4, 8, 12])}
        {settings.mode === "preset" && (
          <div className="space-y-4">
            <ChoiceChips
              label="Preset group"
              value={settings.presetGroup}
              onValueChange={(presetGroup) =>
                update((current) =>
                  applyPreset(current, presetsIn(presetGroup)[0])
                )
              }
              options={presetGroups.map((group) => ({
                value: group.id,
                label: group.label,
              }))}
            />
            <ChoiceChips
              label="Preset"
              value={settings.presetId}
              onValueChange={(id) =>
                update((current) => applyPreset(current, findPreset(id)!))
              }
              options={presetsIn(settings.presetGroup).map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              hint={
                preset
                  ? `${preset.width} × ${preset.height} px${preset.dpi ? ` at ${preset.dpi} DPI` : ""}`
                  : undefined
              }
            />
          </div>
        )}

        <ToggleRow
          label="Allow enlarging"
          hint="Turn off to leave images that are already smaller untouched."
          checked={settings.enlarge}
          onCheckedChange={(enlarge) => update({ enlarge })}
        />
        <p
          id={`${ids}-summary`}
          role={planError ? "alert" : undefined}
          data-testid="size-summary"
          className={
            planError
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {planError ??
            (layout
              ? `Selected image: ${layout.output.width.toLocaleString("en-US")} × ${layout.output.height.toLocaleString("en-US")} px${
                  isPhysical(settings.unit) || preset?.dpi
                    ? ` · prints at ${printLength(layout.output.width, settings.dpi, "cm")} × ${printLength(layout.output.height, settings.dpi, "cm")} cm`
                    : ""
                }`
              : "Add an image to see its output size.")}
        </p>
        {layout?.enlarged && (
          <p className="text-xs text-muted-foreground">
            This is larger than the source. Enlarging adds pixels, not detail.
          </p>
        )}
      </Section>

      {box && (
        <Section title="Fit">
          <ChoiceChips
            label="How the image fills the frame"
            hideLabel
            value={settings.fit}
            onValueChange={(fit: FitMode) => update({ fit })}
            options={[
              { value: "cover", label: "Crop to fill" },
              { value: "contain", label: "Fit with padding" },
              { value: "inside", label: "Fit inside" },
              { value: "outside", label: "Cover at least" },
              { value: "stretch", label: "Stretch" },
            ]}
            hint={fitHints[settings.fit]}
          />
          {settings.fit === "cover" && (
            <ChoiceChips
              label="Focus"
              value={settings.focusMode}
              onValueChange={(focusMode) => update({ focusMode })}
              options={[
                { value: "manual", label: "Choose position" },
                { value: "smart", label: "Smart focus" },
              ]}
              hint={
                settings.focusMode === "smart"
                  ? "Finds the most detailed, colourful or skin-toned area in each image."
                  : "Applies to every image. Dragging in the preview adjusts the selected image only."
              }
            />
          )}
          {(settings.fit === "contain" ||
            (settings.fit === "cover" && settings.focusMode === "manual")) && (
            <AnchorGrid
              label={
                settings.fit === "cover" ? "Keep this part" : "Place the image"
              }
              value={anchorOf(focus)}
              onValueChange={(anchor) =>
                onAnchor(anchors.find((item) => item.id === anchor)!.focus)
              }
            />
          )}
          {hasOverride && (
            <Button variant="ghost" onClick={onResetFocus}>
              Reset this image&apos;s position
            </Button>
          )}
          {settings.fit === "contain" && (
            <>
              <ChoiceChips
                label="Padding"
                value={settings.background}
                onValueChange={(background) => update({ background })}
                options={[
                  { value: "white", label: "White" },
                  { value: "black", label: "Black" },
                  { value: "transparent", label: "Transparent" },
                  { value: "blur", label: "Blurred image" },
                  { value: "custom", label: "Custom" },
                ]}
                hint={
                  settings.background === "transparent"
                    ? "Transparent padding needs PNG, WebP or AVIF; JPEG fills it with white."
                    : undefined
                }
              />
              {settings.background === "custom" && (
                <div className="flex items-center gap-3">
                  <label
                    htmlFor={`${ids}-colour`}
                    className="text-sm font-medium"
                  >
                    Padding colour
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
        </Section>
      )}

      <Section title="Rotate and flip">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Rotate and flip"
        >
          <Button
            variant="outline"
            size="icon"
            aria-label="Rotate left"
            onClick={() =>
              onOrientation((current) => rotateView(current, "left"))
            }
          >
            <IconRotate2 aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Rotate right"
            onClick={() =>
              onOrientation((current) => rotateView(current, "right"))
            }
          >
            <IconRotateClockwise2 aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Flip horizontally"
            aria-pressed={settings.flipX}
            onClick={() => onOrientation((current) => flipView(current, "x"))}
          >
            <IconFlipVertical aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Flip vertically"
            aria-pressed={settings.flipY}
            onClick={() => onOrientation((current) => flipView(current, "y"))}
          >
            <IconFlipHorizontal aria-hidden="true" />
          </Button>
        </div>
      </Section>
    </div>
  )
}
