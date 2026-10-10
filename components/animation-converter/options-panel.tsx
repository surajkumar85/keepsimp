"use client"

import { useId } from "react"
import {
  IconFlipHorizontal,
  IconFlipVertical,
  IconLock,
  IconRotate2,
  IconRotateClockwise2,
} from "@tabler/icons-react"
import { Section } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  DEFAULT_PATTERN,
  keepsTransparency,
  MAX_EDGE,
  type AnimationSettings,
  type BackgroundChoice,
  type ResizeChoice,
} from "@/lib/animation/settings"
import { rotate } from "@/lib/image-compressor/geometry"
import { unknownTokens } from "@/lib/image-resizer/naming"
import type { Update } from "./format-panel"

const nameTokens = ["name", "format", "width", "height", "index"]
const sizeLabels: Record<Exclude<ResizeChoice, "original">, string> = {
  width: "Width (px)",
  height: "Height (px)",
  longEdge: "Longest side (px)",
  percent: "Size (%)",
}

/** Size, orientation, background and file names. */
export function OptionsPanel({
  settings,
  update,
  transparent,
  exampleName,
}: {
  settings: AnimationSettings
  update: Update
  /** Whether any animation in the batch has see-through pixels. */
  transparent: boolean
  exampleName: string | null
}) {
  const ids = useId()
  const unknown = unknownTokens(settings.pattern)

  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
      <Section title="Size">
        <ChoiceChips
          label="Resize"
          hideLabel
          value={settings.resize}
          onValueChange={(resize: ResizeChoice) =>
            update((current) => ({
              ...current,
              resize,
              // A percentage and a pixel count are not the same number.
              resizeValue:
                resize === "percent"
                  ? 50
                  : current.resize === "percent" ||
                      current.resize === "original"
                    ? 480
                    : current.resizeValue,
            }))
          }
          options={[
            { value: "original", label: "Original" },
            { value: "width", label: "Width" },
            { value: "height", label: "Height" },
            { value: "longEdge", label: "Longest side" },
            { value: "percent", label: "Percent" },
          ]}
          hint={`Proportions are kept. Results can be up to ${MAX_EDGE.toLocaleString("en")} px on the longest side.`}
        />
        {settings.resize !== "original" && (
          <div className="w-32">
            <label
              htmlFor={`${ids}-size`}
              className="mb-2 block text-sm font-medium"
            >
              {sizeLabels[settings.resize]}
            </label>
            <Input
              id={`${ids}-size`}
              type="number"
              inputMode="numeric"
              min={1}
              max={settings.resize === "percent" ? 400 : MAX_EDGE}
              value={
                Number.isNaN(settings.resizeValue) ? "" : settings.resizeValue
              }
              onChange={(event) =>
                update({ resizeValue: event.target.valueAsNumber })
              }
              className="font-mono"
            />
          </div>
        )}
      </Section>

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
              update((current) => ({
                ...current,
                rotation: rotate(current.rotation, "left"),
              }))
            }
          >
            <IconRotate2 aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Rotate right"
            onClick={() =>
              update((current) => ({
                ...current,
                rotation: rotate(current.rotation, "right"),
              }))
            }
          >
            <IconRotateClockwise2 aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Flip horizontally"
            aria-pressed={settings.flipX}
            onClick={() =>
              update((current) => ({ ...current, flipX: !current.flipX }))
            }
          >
            <IconFlipVertical aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Flip vertically"
            aria-pressed={settings.flipY}
            onClick={() =>
              update((current) => ({ ...current, flipY: !current.flipY }))
            }
          >
            <IconFlipHorizontal aria-hidden="true" />
          </Button>
        </div>
      </Section>

      <Section title="Background">
        <ChoiceChips
          label="Background"
          hideLabel
          value={settings.background}
          onValueChange={(background: BackgroundChoice) =>
            update({ background })
          }
          options={[
            { value: "keep", label: "Keep transparency" },
            { value: "white", label: "White" },
            { value: "black", label: "Black" },
            { value: "custom", label: "Custom" },
          ]}
          hint={
            settings.background !== "keep"
              ? "See-through areas are filled with this colour."
              : !keepsTransparency(settings)
                ? "This format has no transparency, so see-through areas are filled with white unless you choose a colour."
                : settings.target === "gif" && transparent
                  ? "GIF pixels are either solid or clear, so soft edges become hard. A background colour avoids that."
                  : "See-through areas stay see-through."
          }
        />
        {settings.background === "custom" && (
          <div>
            <label
              htmlFor={`${ids}-colour`}
              className="mb-2 block text-sm font-medium"
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
      </Section>

      <Section title="File names">
        <div>
          <label
            htmlFor={`${ids}-pattern`}
            className="mb-2 block text-sm font-medium"
          >
            Name pattern
          </label>
          <Input
            id={`${ids}-pattern`}
            value={settings.pattern}
            onChange={(event) => update({ pattern: event.target.value })}
            placeholder={DEFAULT_PATTERN}
            className="font-mono"
            spellCheck={false}
            aria-describedby={`${ids}-pattern-hint`}
            aria-invalid={unknown.length > 0}
          />
          <div
            className="mt-2 flex flex-wrap gap-1.5"
            role="group"
            aria-label="Add to the name"
          >
            {nameTokens.map((token) => (
              <Button
                key={token}
                variant="outline"
                size="sm"
                className="h-11 rounded-full font-mono text-xs md:h-7"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    pattern: `${current.pattern}${current.pattern ? "-" : ""}{${token}}`,
                  }))
                }
              >
                {`{${token}}`}
              </Button>
            ))}
          </div>
          <p
            id={`${ids}-pattern-hint`}
            className="mt-2 text-xs text-muted-foreground"
          >
            {exampleName ? (
              <>
                For example{" "}
                <span className="font-mono break-all">{exampleName}</span>
              </>
            ) : (
              "The file extension is added for you."
            )}
          </p>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Animations are converted on your device and are not uploaded.
        </p>
      </Section>
    </div>
  )
}
