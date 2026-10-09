"use client"

import { useId } from "react"
import {
  IconChevronDown,
  IconCrop,
  IconFlipHorizontal,
  IconFlipVertical,
  IconLock,
  IconRotate2,
  IconRotateClockwise2,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  inputFormats,
  outputFormats,
  type InputFormat,
} from "@/lib/image-compressor/formats"
import {
  aspectPresets,
  MAX_SIDE,
  type AspectPreset,
  type Size,
} from "@/lib/image-compressor/geometry"
import type { CompressionPreset } from "@/lib/image-compressor/quality"
import {
  candidateFormats,
  chooseAspect,
  flipView,
  linkedDimension,
  longEdgePresets,
  losslessAvailable,
  originalOutput,
  pngColorChoices,
  rotateView,
  type CompressorSettings,
  type FormatChoice,
  type SizeChoice,
} from "@/lib/image-compressor/settings"

type Update = (
  change:
    | Partial<CompressorSettings>
    | ((current: CompressorSettings) => CompressorSettings)
) => void

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 border-t pt-5 first:border-t-0 first:pt-0">
      <h3 className="font-heading text-base font-medium">{title}</h3>
      {children}
    </section>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5"
      />
    </div>
  )
}

function formatHint(
  choice: FormatChoice,
  input: InputFormat,
  transparent: boolean,
  settings: CompressorSettings
) {
  const resolved = originalOutput(input, transparent)
  const matte =
    settings.background === "black"
      ? "black"
      : settings.background === "custom"
        ? "your chosen colour"
        : "white"
  switch (choice) {
    case "original":
      return resolved === input
        ? `Keeps your file type (${outputFormats[resolved].label}), so it can replace the original.`
        : `${inputFormats[input].label} cannot be saved here, so you will get ${outputFormats[resolved].label}.`
    case "auto":
      return `Tries ${candidateFormats(
        "auto",
        input,
        transparent,
        settings.compression === "lossless"
      )
        .map((format) => outputFormats[format].label)
        .join(", ")} and keeps the smallest file.`
    case "webp":
      return "Small files with transparency, supported by all current browsers."
    case "avif":
      return "Often the smallest file. Encoding takes longer; supported by current browsers."
    case "jpeg":
      return transparent
        ? `Best compatibility for photos. Transparent areas become ${matte}.`
        : "Best compatibility for photos everywhere."
    case "png":
      return "Sharp edges and transparency. Best for graphics, logos and screenshots."
  }
}

const compressionHints: Record<CompressionPreset, string> = {
  smart:
    "Searches for the smallest file that keeps about 96% of the original's structure, measured with SSIM.",
  smallest: "Prioritises file size. Fine texture may soften.",
  high: "Keeps almost every detail, with larger files.",
  lossless: "Pixel-perfect output. Available for PNG and WebP.",
  custom: "Set the encoder quality yourself.",
  target: "Finds the best quality that fits within your size limit.",
}

export function SettingsPanel({
  settings,
  update,
  input,
  transparent,
  source,
  output,
  planError,
  cropping,
  onCrop,
}: {
  settings: CompressorSettings
  update: Update
  input: InputFormat
  transparent: boolean
  source: Size
  output: Size | null
  planError: string | null
  cropping: boolean
  onCrop: () => void
}) {
  const ids = useId()
  const resolved = candidateFormats(
    settings.format,
    input,
    transparent,
    false
  )[0]
  const canLossless = losslessAvailable(settings.format, resolved)
  const sizeBase = settings.crop
    ? { width: settings.crop.width, height: settings.crop.height }
    : settings.rotation % 180
      ? { width: source.height, height: source.width }
      : source

  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5 lg:sticky lg:top-20">
      <Section title="Format">
        <ChoiceChips
          label="Output format"
          hideLabel
          value={settings.format}
          onValueChange={(format) =>
            update((current) => {
              const next = { ...current, format }
              const target = candidateFormats(
                format,
                input,
                transparent,
                false
              )[0]
              if (
                current.compression === "lossless" &&
                !losslessAvailable(format, target)
              )
                next.compression = "smart"
              return next
            })
          }
          options={[
            { value: "original", label: "Same as original" },
            { value: "auto", label: "Auto (smallest)" },
            { value: "webp", label: "WebP" },
            { value: "avif", label: "AVIF" },
            { value: "jpeg", label: "JPEG" },
            { value: "png", label: "PNG" },
          ]}
          hint={formatHint(settings.format, input, transparent, settings)}
        />
      </Section>

      <Section title="Compression">
        <ChoiceChips
          label="Compression level"
          hideLabel
          value={settings.compression}
          onValueChange={(compression) => update({ compression })}
          options={[
            { value: "smart", label: "Smart" },
            { value: "smallest", label: "Smallest" },
            { value: "high", label: "High quality" },
            { value: "lossless", label: "Lossless", disabled: !canLossless },
            { value: "custom", label: "Custom" },
            { value: "target", label: "Target size" },
          ]}
          hint={
            !canLossless && settings.compression !== "lossless"
              ? `${compressionHints[settings.compression]} Lossless needs PNG or WebP.`
              : compressionHints[settings.compression]
          }
        />
        {settings.compression === "custom" && (
          <div>
            <label
              htmlFor={`${ids}-quality`}
              className="mb-2 flex justify-between text-sm font-medium"
            >
              <span>Quality</span>
              <span className="font-mono">{settings.quality}</span>
            </label>
            <input
              id={`${ids}-quality`}
              type="range"
              min={1}
              max={100}
              value={settings.quality}
              onChange={(event) =>
                update({ quality: Number(event.target.value) })
              }
              className="min-h-11 w-full accent-primary md:min-h-9"
            />
          </div>
        )}
        {settings.compression === "target" && (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label
                  htmlFor={`${ids}-target`}
                  className="mb-2 block text-sm font-medium"
                >
                  Maximum file size
                </label>
                <Input
                  id={`${ids}-target`}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="any"
                  value={settings.targetSize}
                  onChange={(event) =>
                    update({ targetSize: event.target.value })
                  }
                />
              </div>
              <ChoiceChips
                label="Size unit"
                hideLabel
                value={settings.targetUnit}
                onValueChange={(targetUnit) => update({ targetUnit })}
                options={[
                  { value: "KB", label: "KB" },
                  { value: "MB", label: "MB" },
                ]}
              />
            </div>
            <ToggleRow
              label="Allow smaller dimensions"
              hint="If quality alone cannot reach the target, shrink the image step by step."
              checked={settings.allowDownscale}
              onCheckedChange={(allowDownscale) => update({ allowDownscale })}
            />
          </div>
        )}
      </Section>

      <Section title="Size">
        <ChoiceChips
          label="Output size"
          hideLabel
          value={settings.size}
          onValueChange={(size: SizeChoice) => update({ size })}
          options={[
            { value: "original", label: "Original" },
            { value: "75", label: "75%" },
            { value: "50", label: "50%" },
            { value: "25", label: "25%" },
            { value: "long-edge", label: "Long edge" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {settings.size === "long-edge" && (
          <ChoiceChips
            label="Long edge in pixels"
            value={String(settings.longEdge)}
            onValueChange={(value) => update({ longEdge: Number(value) })}
            options={longEdgePresets.map((value) => ({
              value: String(value),
              label: `${value}`,
            }))}
          />
        )}
        {settings.size === "custom" && (
          <div className="space-y-4">
            <ChoiceChips
              label="Units"
              value={settings.unit}
              onValueChange={(unit) =>
                update((current) => ({
                  ...current,
                  unit,
                  customWidth:
                    unit === "percent" ? "100" : String(sizeBase.width),
                  customHeight:
                    unit === "percent" ? "100" : String(sizeBase.height),
                }))
              }
              options={[
                { value: "px", label: "Pixels" },
                { value: "percent", label: "Percent" },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              {(["width", "height"] as const).map((edge) => (
                <div key={edge}>
                  <label
                    htmlFor={`${ids}-${edge}`}
                    className="mb-2 block text-sm font-medium"
                  >
                    {edge === "width" ? "Width" : "Height"} (
                    {settings.unit === "px" ? "px" : "%"})
                  </label>
                  <Input
                    id={`${ids}-${edge}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={settings.unit === "px" ? MAX_SIDE : undefined}
                    step={settings.unit === "px" ? 1 : "any"}
                    placeholder={settings.lock ? "Auto" : undefined}
                    value={
                      edge === "width"
                        ? settings.customWidth
                        : settings.customHeight
                    }
                    aria-invalid={Boolean(planError) || undefined}
                    aria-describedby={
                      planError ? `${ids}-size-error` : undefined
                    }
                    onChange={(event) =>
                      update((current) =>
                        linkedDimension(
                          current,
                          sizeBase,
                          edge,
                          event.target.value
                        )
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <ToggleRow
              label="Keep proportions"
              hint={
                settings.lock
                  ? "Changing one side updates the other."
                  : "Set both sides, then choose how the image fits."
              }
              checked={settings.lock}
              onCheckedChange={(lock) =>
                update((current) =>
                  lock
                    ? linkedDimension(
                        { ...current, lock },
                        sizeBase,
                        "width",
                        current.customWidth
                      )
                    : { ...current, lock }
                )
              }
            />
            {!settings.lock && (
              <ChoiceChips
                label="Fit"
                value={settings.fit}
                onValueChange={(fit) => update({ fit })}
                options={[
                  { value: "contain", label: "Fit inside" },
                  { value: "cover", label: "Fill and crop" },
                  { value: "stretch", label: "Stretch" },
                ]}
                hint={
                  settings.fit === "contain"
                    ? "Shrinks to fit within the box without cropping."
                    : settings.fit === "cover"
                      ? "Fills the box exactly and trims the overflow from the centre."
                      : "Fills the box exactly, which can distort the image."
                }
              />
            )}
          </div>
        )}
        <p
          id={`${ids}-size-error`}
          role={planError ? "alert" : undefined}
          className={
            planError
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {planError ??
            (output
              ? `Output: ${output.width.toLocaleString("en-US")} × ${output.height.toLocaleString("en-US")} px`
              : "")}
        </p>
        {output &&
          (output.width > sizeBase.width ||
            output.height > sizeBase.height) && (
            <p className="text-xs text-muted-foreground">
              This is larger than the source. Enlarging adds pixels, not detail.
            </p>
          )}
      </Section>

      <Section title="Crop and rotate">
        <ChoiceChips
          label="Crop shape"
          value={settings.aspect}
          onValueChange={(aspect: AspectPreset) =>
            update((current) => chooseAspect(current, source, aspect))
          }
          options={aspectPresets.map((preset) => ({
            value: preset,
            label:
              preset === "free"
                ? "Free"
                : preset === "original"
                  ? "Original"
                  : preset,
          }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={cropping ? "default" : "outline"}
            onClick={onCrop}
            aria-pressed={cropping}
          >
            <IconCrop aria-hidden="true" />
            {cropping ? "Cropping…" : "Crop on image"}
          </Button>
          {settings.crop && (
            <Button
              variant="ghost"
              onClick={() => update({ crop: null, aspect: "free" })}
            >
              Clear crop
            </Button>
          )}
        </div>
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
              update((current) => rotateView(current, source, "left"))
            }
          >
            <IconRotate2 aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Rotate right"
            onClick={() =>
              update((current) => rotateView(current, source, "right"))
            }
          >
            <IconRotateClockwise2 aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Flip horizontally"
            aria-pressed={settings.flipX}
            onClick={() => update((current) => flipView(current, source, "x"))}
          >
            <IconFlipVertical aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Flip vertically"
            aria-pressed={settings.flipY}
            onClick={() => update((current) => flipView(current, source, "y"))}
          >
            <IconFlipHorizontal aria-hidden="true" />
          </Button>
        </div>
      </Section>

      <Collapsible className="border-t pt-4">
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between rounded-md text-left font-heading text-base font-medium md:min-h-9">
          Advanced options
          <IconChevronDown
            className="size-5 transition-transform duration-200 group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 pt-4">
          <ChoiceChips
            label="Encoder effort"
            value={settings.effort}
            onValueChange={(effort) => update({ effort })}
            options={[
              { value: "fast", label: "Fast" },
              { value: "balanced", label: "Balanced" },
              { value: "max", label: "Maximum" },
            ]}
            hint="Maximum squeezes out a few more bytes and takes longer."
          />
          <ChoiceChips
            label="Resampling"
            value={settings.resample}
            onValueChange={(resample) => update({ resample })}
            options={[
              { value: "lanczos3", label: "Lanczos (sharpest)" },
              { value: "mitchell", label: "Mitchell (smooth)" },
              { value: "catrom", label: "Catmull-Rom" },
            ]}
            hint="Used whenever the size changes. Resizing happens in linear light."
          />
          <ChoiceChips
            label="Background for transparency"
            value={settings.background}
            onValueChange={(background) => update({ background })}
            options={[
              { value: "white", label: "White" },
              { value: "black", label: "Black" },
              { value: "custom", label: "Custom" },
            ]}
            hint="Used only when saving transparent images as JPEG."
          />
          {settings.background === "custom" && (
            <div className="flex items-center gap-3">
              <label htmlFor={`${ids}-matte`} className="text-sm font-medium">
                Background colour
              </label>
              <input
                id={`${ids}-matte`}
                type="color"
                value={settings.backgroundColor}
                onChange={(event) =>
                  update({ backgroundColor: event.target.value })
                }
                className="h-11 w-16 cursor-pointer rounded-md border bg-background p-1 md:h-9"
              />
            </div>
          )}
          <ChoiceChips
            label="Colour detail (JPEG and AVIF)"
            value={settings.chroma444 ? "444" : "420"}
            onValueChange={(value) => update({ chroma444: value === "444" })}
            options={[
              { value: "420", label: "Standard 4:2:0" },
              { value: "444", label: "Full 4:4:4" },
            ]}
            hint="Full colour keeps red text and fine colour edges crisp, with larger files."
          />
          <ToggleRow
            label="Progressive JPEG"
            hint="Loads in passes and is usually a little smaller."
            checked={settings.progressive}
            onCheckedChange={(progressive) => update({ progressive })}
          />
          <ChoiceChips
            label="PNG colours"
            value={String(settings.pngColors)}
            onValueChange={(value) => update({ pngColors: Number(value) })}
            options={pngColorChoices.map((value) => ({
              value: String(value),
              label: `${value}`,
            }))}
            hint="Maximum palette size for compressed PNG. Lossless PNG keeps every colour."
          />
          <ToggleRow
            label="Dithering"
            hint="Smooths gradients in palette PNG files."
            checked={settings.dithering}
            onCheckedChange={(dithering) => update({ dithering })}
          />
        </CollapsibleContent>
      </Collapsible>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <IconLock className="size-3.5" aria-hidden="true" />
        Processed on your device. Metadata such as location is removed.
      </p>
    </div>
  )
}
