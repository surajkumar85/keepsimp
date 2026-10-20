"use client"

import { useId, useState } from "react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  outputChoices,
  writtenFormats,
  type OutputFormat,
} from "@/lib/audio/formats"
import { rateLabel } from "@/lib/audio/labels"
import {
  dbLabel,
  LOUDEST_TARGET,
  MOST_LOUDER,
  QUIETEST_TARGET,
  TARGETS,
  type Level,
  type LevelMode,
} from "@/lib/audio/level"
import {
  BITRATES,
  PRESET_BITRATES,
  RATE_CHOICES,
  type AudioSettings,
  type Lossy,
  type Preset,
} from "@/lib/audio/settings"

export type Update = (change: Partial<AudioSettings>) => void

const FORMAT_HINTS: Record<OutputFormat, string> = {
  same: "Keeps the file's own sound as it is, without encoding it again, when nothing about it has to change. The quickest way to take sound out of a video.",
  mp3: "Plays everywhere. Written with LAME.",
  m4a: "AAC: smaller than MP3 at the same quality. Plays on every phone and computer.",
  opus: "The best quality for its size, for voice above all. Plays in browsers, Android, VLC and recent Apple devices.",
  flac: "Lossless, about half the size of WAV. Keeps every sample.",
  wav: "Lossless and uncompressed. For editing programs and the highest quality.",
  m4r: "An iPhone ringtone: AAC in an M4R file, at most 40 seconds.",
}

const PRESET_LABELS: Record<Preset, string> = {
  small: "Small",
  balanced: "Balanced",
  high: "High",
  custom: "Custom",
}

const SIZES = [1, 2, 5, 10, 25]
const MB = 1024 * 1024

/** The output: format, quality, sample rate, channels, depth, tags and a size limit. */
export function SettingsPanel({
  settings,
  update,
  problem,
}: {
  settings: AudioSettings
  update: Update
  problem: string | null
}) {
  const ids = useId()
  const codec: Lossy | null =
    settings.format === "mp3"
      ? "mp3"
      : settings.format === "m4a" || settings.format === "m4r"
        ? "aac"
        : settings.format === "opus"
          ? "opus"
          : null
  const lossless = settings.format === "flac" || settings.format === "wav"
  const sizeChoice =
    settings.targetBytes === null
      ? "none"
      : SIZES.includes(settings.targetBytes / MB)
        ? String(settings.targetBytes / MB)
        : "custom"
  const [customSize, setCustomSize] = useState(
    settings.targetBytes
      ? String(Math.round((settings.targetBytes / MB) * 10) / 10)
      : "3"
  )

  return (
    <div
      className="space-y-5 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="audio-settings"
    >
      <Section title="Format">
        <ChoiceChips
          label="Write as"
          hideLabel
          value={settings.format}
          onValueChange={(format) => update({ format })}
          options={outputChoices.map((format) => ({
            value: format,
            label:
              format === "same"
                ? "Same as the file"
                : writtenFormats[format].label,
          }))}
          hint={FORMAT_HINTS[settings.format]}
        />
      </Section>

      <LevelSection
        level={settings.level}
        update={(change) => update({ level: { ...settings.level, ...change } })}
      />

      {codec && (
        <Section title="Quality">
          <ChoiceChips
            label="Quality"
            hideLabel
            value={settings.preset}
            onValueChange={(preset) => update({ preset })}
            options={(Object.keys(PRESET_LABELS) as Preset[]).map((preset) => ({
              value: preset,
              label:
                preset === "custom"
                  ? PRESET_LABELS[preset]
                  : `${PRESET_LABELS[preset]} · ${PRESET_BITRATES[codec][preset][0]} kbit/s`,
            }))}
            hint="Bitrates are for stereo; mono uses less. Higher keeps more detail and makes larger files."
          />
          {settings.preset === "custom" && (
            <div>
              <label
                htmlFor={`${ids}-bitrate`}
                className="mb-2 block text-sm font-medium"
              >
                Bitrate
              </label>
              <select
                id={`${ids}-bitrate`}
                className="form-select"
                value={settings.bitrate}
                onChange={(event) =>
                  update({ bitrate: Number(event.target.value) })
                }
              >
                {BITRATES[codec].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate} kbit/s
                  </option>
                ))}
              </select>
            </div>
          )}
        </Section>
      )}

      {(lossless || settings.format === "same") && (
        <Section title="Bit depth">
          <ChoiceChips
            label="Bit depth"
            hideLabel
            value={String(settings.depth)}
            onValueChange={(depth) =>
              update({
                depth:
                  depth === "same" ? "same" : (Number(depth) as 16 | 24 | 32),
              })
            }
            options={[
              { value: "same", label: "Same as the file" },
              { value: "16", label: "16-bit" },
              { value: "24", label: "24-bit" },
              {
                value: "32",
                label: "32-bit float",
                disabled: settings.format === "flac",
              },
            ]}
            hint="For WAV and FLAC. 16-bit is CD quality; 24-bit and 32-bit float are for editing."
          />
        </Section>
      )}

      <Section title="Sound">
        <div>
          <label
            htmlFor={`${ids}-rate`}
            className="mb-2 block text-sm font-medium"
          >
            Sample rate
          </label>
          <select
            id={`${ids}-rate`}
            className="form-select"
            value={String(settings.sampleRate)}
            onChange={(event) =>
              update({
                sampleRate:
                  event.target.value === "same"
                    ? "same"
                    : Number(event.target.value),
              })
            }
          >
            <option value="same">Same as the file</option>
            {RATE_CHOICES.map((rate) => (
              <option key={rate} value={rate}>
                {rateLabel(rate)}
              </option>
            ))}
          </select>
        </div>
        <ChoiceChips
          label="Channels"
          value={String(settings.channels)}
          onValueChange={(channels) =>
            update({
              channels:
                channels === "same" ? "same" : (Number(channels) as 1 | 2),
            })
          }
          options={[
            { value: "same", label: "Same as the file" },
            { value: "1", label: "Mono" },
            { value: "2", label: "Stereo" },
          ]}
        />
        <ToggleRow
          label="Keep the title, artist and cover"
          hint="Tags and cover art go into the new file where its format holds them."
          checked={settings.keepTags}
          onCheckedChange={(keepTags) => update({ keepTags })}
        />
      </Section>

      <Section title="File size limit">
        <ChoiceChips
          label="File size limit"
          hideLabel
          value={sizeChoice}
          onValueChange={(choice) => {
            if (choice === "none") update({ targetBytes: null })
            else if (choice === "custom")
              update({
                targetBytes: Math.round(Number(customSize) * MB) || null,
              })
            else update({ targetBytes: Number(choice) * MB })
          }}
          options={[
            { value: "none", label: "No limit" },
            ...SIZES.map((size) => ({
              value: String(size),
              label: `${size} MB`,
            })),
            { value: "custom", label: "Custom" },
          ]}
          hint="MP3, M4A and Opus are written at the highest bitrate that keeps each file under the limit."
        />
        {sizeChoice === "custom" && (
          <div>
            <label
              htmlFor={`${ids}-size`}
              className="mb-2 block text-sm font-medium"
            >
              Megabytes
            </label>
            <Input
              id={`${ids}-size`}
              type="number"
              inputMode="decimal"
              min={0.02}
              step={0.1}
              value={customSize}
              onChange={(event) => {
                setCustomSize(event.target.value)
                const megabytes = Number(event.target.value)
                update({
                  targetBytes: megabytes > 0 ? Math.round(megabytes * MB) : 0,
                })
              }}
            />
          </div>
        )}
      </Section>

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </div>
  )
}

const LEVEL_MODES: { value: LevelMode; label: string }[] = [
  { value: "same", label: "As it is" },
  { value: "loudness", label: "Normalize loudness" },
  { value: "peak", label: "Normalize peaks" },
  { value: "louder", label: "Make louder" },
]

const LEVEL_HINTS: Record<LevelMode, string> = {
  same: "Each file keeps its own level.",
  loudness:
    "Each file is measured as it will be written (ITU-R BS.1770) and made louder or quieter to reach the loudness chosen, so files played together sound as loud as each other. A limiter keeps peaks under the ceiling.",
  peak: "Each file is made louder or quieter so its highest peak, between samples too, reaches the level chosen. Its loudness is not matched to other files.",
  louder:
    "Each file is made louder by the amount chosen; a limiter lowers only the loudest moments, so nothing goes over the ceiling and nothing clips.",
}

const CEILINGS = [-0.1, -1, -2, -3]

/** How loud each result is to be. */
function LevelSection({
  level,
  update,
}: {
  level: Level
  update: (change: Partial<Level>) => void
}) {
  const ids = useId()
  // Custom stays chosen even when its figure is one of the targets.
  const [ownTarget, setOwnTarget] = useState(
    !TARGETS.some((target) => target.lufs === level.target)
  )
  const preset = ownTarget ? "custom" : String(level.target)
  const [custom, setCustom] = useState(String(level.target))
  const [peak, setPeak] = useState(String(level.ceiling))
  const [louder, setLouder] = useState(String(level.louder))
  const number = (text: string) => {
    const value = Number(text.replace("−", "-").replace(",", "."))
    return text.trim() === "" ? NaN : value
  }
  return (
    <Section title="Loudness">
      <ChoiceChips
        label="Loudness"
        hideLabel
        value={level.mode}
        onValueChange={(mode) => update({ mode })}
        options={LEVEL_MODES}
        hint={LEVEL_HINTS[level.mode]}
      />
      {level.mode === "loudness" && (
        <>
          <ChoiceChips
            label="Loudness to reach"
            value={preset}
            onValueChange={(value) => {
              setOwnTarget(value === "custom")
              if (value === "custom") update({ target: number(custom) })
              else update({ target: Number(value) })
            }}
            options={[
              ...TARGETS.map((target) => ({
                value: String(target.lufs),
                label: `${target.label} · ${target.for}`,
              })),
              { value: "custom", label: "Custom" },
            ]}
          />
          {preset === "custom" && (
            <NumberField
              id={`${ids}-target`}
              label="LUFS"
              value={custom}
              hint={`From ${dbLabel(QUIETEST_TARGET)} to ${dbLabel(LOUDEST_TARGET)}.`}
              onChange={(text) => {
                setCustom(text)
                update({ target: number(text) })
              }}
            />
          )}
        </>
      )}
      {level.mode === "louder" && (
        <NumberField
          id={`${ids}-louder`}
          label="How much louder, in dB"
          value={louder}
          hint={`Up to ${MOST_LOUDER} dB. 6 dB is about twice as loud in its peaks; 10 dB sounds about twice as loud.`}
          onChange={(text) => {
            setLouder(text)
            update({ louder: number(text) })
          }}
        />
      )}
      {(level.mode === "loudness" || level.mode === "louder") && (
        <ChoiceChips
          label="Peak ceiling"
          value={String(level.ceiling)}
          onValueChange={(value) => update({ ceiling: Number(value) })}
          options={CEILINGS.map((ceiling) => ({
            value: String(ceiling),
            label: `${dbLabel(ceiling)} dBTP`,
          }))}
          hint="The highest a peak may reach, between samples too. −1 dBTP leaves room for MP3 and AAC encoders, which raise peaks a little."
        />
      )}
      {level.mode === "peak" && (
        <NumberField
          id={`${ids}-peak`}
          label="Highest peak, in dBTP"
          value={peak}
          hint="From −9 to 0. −1 leaves room for MP3 and AAC encoders, which raise peaks a little."
          onChange={(text) => {
            setPeak(text)
            update({ ceiling: number(text) })
          }}
        />
      )}
    </Section>
  )
}

/** A labelled field for a number that may be negative. */
function NumberField({
  id,
  label,
  value,
  hint,
  onChange,
}: {
  id: string
  label: string
  value: string
  hint: string
  onChange: (text: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
        className="w-32 font-mono"
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}
