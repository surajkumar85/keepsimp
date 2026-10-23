"use client"

import { useId, useState } from "react"
import { IconPhoto, IconX } from "@tabler/icons-react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import type { Corner } from "@/lib/animation/effects"
import {
  LOGO_SIZES,
  LONGEST_CAPTION,
  type LogoFacts,
  type VideoSettings,
} from "@/lib/video/settings"
import { differs, resetOf } from "@/lib/settings-groups"
import { defaultSettings } from "@/lib/video/settings"
import { VIDEO_GROUPS, videoSummary } from "@/lib/video/summary"
import type { Update } from "./settings-panel"

/** The logo chosen on the page: its file and what reading it found. */
export interface ChosenLogo {
  file: File
  facts: LogoFacts
}

const CORNERS: { value: Corner; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "centre", label: "Middle" },
]

/** A text field, labelled above. */
function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        maxLength={LONGEST_CAPTION}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/** A time in seconds, empty for the start or the end. */
function SecondsField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  const id = useId()
  const [text, setText] = useState(value === null ? "" : String(value))
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        value={text}
        inputMode="decimal"
        className="w-28"
        onChange={(event) => {
          setText(event.target.value)
          const seconds = Number(event.target.value)
          onChange(
            event.target.value.trim() === ""
              ? null
              : Number.isFinite(seconds)
                ? seconds
                : NaN
          )
        }}
      />
    </div>
  )
}

/** Text along the top and bottom of every video, and a logo in a corner. */
export function OverlayPanel({
  settings,
  update,
  logo,
  reading,
  problem,
  onLogo,
  onRemoveLogo,
  open = false,
  usual = defaultSettings,
}: {
  /** The settings the page started with, which "changed" is measured against. */
  usual?: VideoSettings
  /** Open from the start, for the page opened to add text. */
  open?: boolean
  settings: VideoSettings
  update: Update
  logo: ChosenLogo | null
  reading: boolean
  problem: string | null
  onLogo: (file: File) => void
  onRemoveLogo: () => void
}) {
  const id = useId()
  const writing = Boolean(
    settings.captionTop.trim() || settings.captionBottom.trim()
  )
  return (
    <Section
      title="Text and logo"
      summary={videoSummary("overlay", settings, logo !== null)}
      changed={logo !== null || differs(settings, usual, VIDEO_GROUPS.overlay)}
      onReset={() => {
        update(resetOf(usual, VIDEO_GROUPS.overlay))
        onRemoveLogo()
      }}
      defaultOpen={open}
    >
      <TextField
        label="Text at the top"
        value={settings.captionTop}
        onChange={(captionTop) => update({ captionTop })}
      />
      <TextField
        label="Text at the bottom"
        value={settings.captionBottom}
        onChange={(captionBottom) => update({ captionBottom })}
      />
      {writing && (
        <>
          <ChoiceChips
            label="Text size"
            value={settings.captionSize}
            onValueChange={(captionSize) => update({ captionSize })}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
          <ChoiceChips
            label="Text colour"
            value={settings.captionColour}
            onValueChange={(captionColour) => update({ captionColour })}
            options={[
              { value: "white", label: "White" },
              { value: "black", label: "Black" },
            ]}
          />
          <ToggleRow
            label="Outline the letters"
            hint="A line of the other colour around them, so they can be read on any picture."
            checked={settings.captionOutline}
            onCheckedChange={(captionOutline) => update({ captionOutline })}
          />
          <div className="flex flex-wrap gap-3">
            <SecondsField
              label="Show from (s)"
              value={settings.captionFrom}
              onChange={(captionFrom) => update({ captionFrom })}
            />
            <SecondsField
              label="Until (s)"
              value={settings.captionUntil}
              onChange={(captionUntil) => update({ captionUntil })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Seconds of the result; leave them empty for the whole video.
          </p>
        </>
      )}
      <ChoiceChips
        label="Subtitle size"
        hint="For subtitles added to a video (Add subtitles, under its player): white with a black outline along the bottom."
        value={settings.subtitleSize}
        onValueChange={(subtitleSize) => update({ subtitleSize })}
        options={[
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ]}
      />
      {logo ? (
        <div className="space-y-4" data-testid="logo">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <IconPhoto className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate font-medium">{logo.facts.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {logo.facts.width} × {logo.facts.height}
              </span>
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemoveLogo}
              aria-label={`Remove the logo ${logo.facts.name}`}
            >
              <IconX aria-hidden="true" />
            </Button>
          </div>
          <ChoiceChips
            label="Logo place"
            value={settings.logoCorner}
            onValueChange={(logoCorner) => update({ logoCorner })}
            options={CORNERS}
          />
          <ChoiceChips
            label="Logo width"
            hint="As a share of the picture's width; its own shape is kept."
            value={String(settings.logoSize)}
            onValueChange={(size) => update({ logoSize: Number(size) })}
            options={LOGO_SIZES.map((size) => ({
              value: String(size),
              label: `${size}%`,
            }))}
          />
          <ChoiceChips
            label="Logo opacity"
            value={String(settings.logoOpacity)}
            onValueChange={(opacity) =>
              update({ logoOpacity: Number(opacity) })
            }
            options={[100, 75, 50, 25].map((opacity) => ({
              value: String(opacity),
              label: opacity === 100 ? "Solid" : `${opacity}%`,
            }))}
          />
        </div>
      ) : (
        <div>
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="sr-only"
            aria-label="Choose a logo"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onLogo(file)
              event.target.value = ""
            }}
          />
          <Button
            variant="outline"
            disabled={reading}
            onClick={() => document.getElementById(id)?.click()}
          >
            <IconPhoto aria-hidden="true" />
            {reading ? "Reading the logo…" : "Add a logo"}
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </Section>
  )
}
