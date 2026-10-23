"use client"

import { useId } from "react"
import { IconExternalLink } from "@tabler/icons-react"
import { Section } from "@/components/image-batch/controls"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  applyDestination,
  destinations,
  DESTINATIONS_CHECKED,
  matchingDestination,
} from "@/lib/animation/presets"
import type { AnimationSettings } from "@/lib/animation/settings"
import { destinationSummary } from "@/lib/animation/summary"
import { fold, FaultNote, type Fault, type Update } from "./format-panel"

const limits = [128_000, 256_000, 512_000, 1_000_000, 5_000_000, 10_000_000]
const label = (bytes: number) =>
  bytes >= 1_000_000 ? `${bytes / 1_000_000} MB` : `${bytes / 1000} KB`

/** Where the animation is going, and the largest file that place accepts. */
export function DestinationPanel({
  settings,
  update,
  fault,
}: {
  settings: AnimationSettings
  update: Update
  fault: Fault | null
}) {
  const ids = useId()
  const destination = matchingDestination(settings)
  const limit = settings.sizeLimit
  const chosen =
    limit === null ? "none" : limits.includes(limit) ? String(limit) : "custom"
  // A custom limit is shown in megabytes once it reaches one.
  const inMegabytes = limit !== null && limit >= 1_000_000

  return (
    <>
      {/* Open from the start: a destination sets the format, size and limit in one go. */}
      <Section
        title="Where is it going?"
        summary={destinationSummary(settings)}
      >
        <ChoiceChips
          label="Destination"
          hideLabel
          value={destination?.id ?? "none"}
          onValueChange={(id) => {
            const next = destinations.find((item) => item.id === id)
            update((current) =>
              next
                ? applyDestination(current, next)
                : // "Anywhere" lifts what a destination set: its limits and its size.
                  {
                    ...current,
                    sizeLimit: null,
                    maxSeconds: null,
                    fps: null,
                    resize: "original",
                    enlarge: true,
                  }
            )
          }}
          options={[
            { value: "none", label: "Anywhere" },
            ...destinations.map((item) => ({
              value: item.id,
              label: item.label,
            })),
          ]}
          hint={
            destination
              ? undefined
              : "Pick a destination to set its format, size and file-size limit in one go."
          }
        />
        {destination && (
          <div
            className="space-y-1 text-xs text-muted-foreground"
            data-testid="destination"
          >
            <p>{destination.note}</p>
            <p>
              {destination.official ? "Source: " : "Reported by: "}
              <a
                href={destination.source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
              >
                {destination.source.label}
                <IconExternalLink className="size-3" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              . Checked {DESTINATIONS_CHECKED}; services change these without
              notice.
            </p>
          </div>
        )}
      </Section>

      <Section
        title="File size limit"
        {...fold("limit", settings, update, fault)}
      >
        <ChoiceChips
          label="Largest file"
          hideLabel
          value={chosen}
          onValueChange={(value) =>
            update({
              sizeLimit:
                value === "none"
                  ? null
                  : value === "custom"
                    ? 2_000_000
                    : Number(value),
            })
          }
          options={[
            { value: "none", label: "No limit" },
            ...limits.map((bytes) => ({
              value: String(bytes),
              label: label(bytes),
            })),
            { value: "custom", label: "Custom" },
          ]}
          hint={
            limit === null
              ? "Set a limit and the tool lowers quality, then frame rate, then size until the file fits."
              : "Each try is a real file, measured. The facts line says what was changed to fit."
          }
        />
        {chosen === "custom" && limit !== null && (
          <div className="flex items-end gap-2">
            <div className="w-28">
              <label
                htmlFor={`${ids}-limit`}
                className="mb-2 block text-sm font-medium"
              >
                Largest file ({inMegabytes ? "MB" : "KB"})
              </label>
              <Input
                id={`${ids}-limit`}
                key={limit}
                type="number"
                inputMode="decimal"
                min={inMegabytes ? 1 : 10}
                step={inMegabytes ? 0.1 : 1}
                defaultValue={inMegabytes ? limit / 1_000_000 : limit / 1000}
                onBlur={(event) => {
                  const typed = Number(event.target.value)
                  if (Number.isFinite(typed) && typed > 0)
                    update({
                      sizeLimit: Math.round(
                        typed * (inMegabytes ? 1_000_000 : 1000)
                      ),
                    })
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur()
                }}
                className="font-mono"
              />
            </div>
            <ChoiceChips
              label="Unit"
              hideLabel
              value={inMegabytes ? "mb" : "kb"}
              onValueChange={(unit) =>
                update({ sizeLimit: unit === "mb" ? 2_000_000 : 300_000 })
              }
              options={[
                { value: "kb", label: "KB" },
                { value: "mb", label: "MB" },
              ]}
            />
          </div>
        )}
        <FaultNote fault={fault} group="limit" />
      </Section>
    </>
  )
}
