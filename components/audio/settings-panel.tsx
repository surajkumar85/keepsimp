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
import {
  FASTEST,
  MOST_PITCH,
  SLOWEST,
  TEMPOS,
  type ChannelChange,
  type Changes,
} from "@/lib/audio/change"
import { COMPRESSORS, type CompressorPreset } from "@/lib/audio/dynamics"
import type { Repair, Sibilance } from "@/lib/audio/repair"
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
  defaultSettings,
  PRESET_BITRATES,
  RATE_CHOICES,
  type AudioSettings,
  type Preset,
} from "@/lib/audio/settings"
import {
  AUDIO_GROUPS,
  audioChanged,
  audioReset,
  audioSummary,
  lossyOf,
  type AudioGroup,
} from "@/lib/audio/summary"
import type { SoundSettings } from "@/lib/audio/sound"
import {
  BASS_HZ,
  MID_HZ,
  MOST_BAND,
  presetOf,
  TONE_PRESETS,
  TREBLE_HZ,
  type Tone,
  type TonePreset,
} from "@/lib/audio/tone"

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

/** The fold of one group: its line, whether it changed, its reset and whether it starts open. */
type Fold = {
  summary: string
  changed: boolean
  onReset: () => void
  defaultOpen: boolean
}

const sizeText = (bytes: number | null) =>
  bytes ? String(Math.round((bytes / MB) * 10) / 10) : "3"

/**
 * The output: format, quality, sample rate, channels, depth, tags and a size
 * limit, with loudness, speed, repair and tone, each in a group that folds.
 * Format and quality stay open; a door's own group is open and at the top.
 */
export function SettingsPanel({
  settings,
  update,
  problem,
  focus,
  usual = defaultSettings,
}: {
  settings: AudioSettings
  update: Update
  problem: string | null
  /** The group a door is opened for: open from the start, and first. */
  focus?: AudioGroup
  /** The settings the page started with, which "changed" is measured against. */
  usual?: AudioSettings
}) {
  const ids = useId()
  const codec = lossyOf(settings.format)
  const sizeChoice =
    settings.targetBytes === null
      ? "none"
      : SIZES.includes(settings.targetBytes / MB)
        ? String(settings.targetBytes / MB)
        : "custom"
  const [customSize, setCustomSize] = useState(sizeText(settings.targetBytes))
  // A group put back starts again, so figures typed in it are not kept.
  const [resets, setResets] = useState<Partial<Record<AudioGroup, number>>>({})
  const group = (name: AudioGroup): Fold => ({
    summary: audioSummary(name, settings),
    changed: audioChanged(name, settings, usual),
    onReset: () => {
      update(audioReset(name, settings, usual))
      setResets((had) => ({ ...had, [name]: (had[name] ?? 0) + 1 }))
      if (name === "limit") setCustomSize(sizeText(usual.targetBytes))
    },
    defaultOpen:
      name === "format" ||
      name === "quality" ||
      name === "depth" ||
      name === focus,
  })

  const sections: Record<AudioGroup, React.ReactNode> = {
    format: (
      <Section key="format" title="Format" {...group("format")}>
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
    ),

    quality: codec && (
      <Section key="quality" title="Quality" {...group("quality")}>
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
    ),

    depth: !codec && (
      <Section key="depth" title="Bit depth" {...group("depth")}>
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
          hint={
            settings.format === "flac"
              ? "For WAV and FLAC. 16-bit is CD quality; 24-bit is for editing. FLAC holds no 32-bit float: choose WAV for it."
              : "For WAV and FLAC. 16-bit is CD quality; 24-bit and 32-bit float are for editing."
          }
        />
      </Section>
    ),

    level: (
      <LevelSection
        key={`level-${resets.level ?? 0}`}
        fold={group("level")}
        level={settings.level}
        update={(change) => update({ level: { ...settings.level, ...change } })}
      />
    ),

    changes: (
      <ChangesSection
        key={`changes-${resets.changes ?? 0}`}
        fold={group("changes")}
        changes={settings.changes}
        update={(change) =>
          update({ changes: { ...settings.changes, ...change } })
        }
      />
    ),

    repair: (
      <RepairSection
        key="repair"
        fold={group("repair")}
        repair={settings.sound.repair}
        update={(change) =>
          update({
            sound: {
              ...settings.sound,
              repair: { ...settings.sound.repair, ...change },
            },
          })
        }
      />
    ),

    tone: (
      <SoundSection
        key={`tone-${resets.tone ?? 0}`}
        fold={group("tone")}
        sound={settings.sound}
        leveled={settings.level.mode === "loudness"}
        update={(change) => update({ sound: { ...settings.sound, ...change } })}
      />
    ),

    output: (
      <Section key="output" title="Sound" {...group("output")}>
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
    ),

    limit: (
      <Section key="limit" title="File size limit" {...group("limit")}>
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
    ),
  }

  // The door's own group first, then the rest in their order.
  const order = focus
    ? [focus, ...AUDIO_GROUPS.filter((name) => name !== focus)]
    : AUDIO_GROUPS
  return (
    <div data-testid="audio-settings">
      {order.map((name) => sections[name])}
      {problem && (
        <p role="alert" className="pb-4 text-sm text-destructive">
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
  fold,
  level,
  update,
}: {
  fold: Fold
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
    <Section title="Loudness" {...fold}>
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
export function NumberField({
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

const BANDS: { key: "bass" | "mid" | "treble"; label: string }[] = [
  { key: "bass", label: `Bass, under ${BASS_HZ} Hz` },
  { key: "mid", label: `Mid, around ${MID_HZ / 1000} kHz` },
  { key: "treble", label: `Treble, over ${TREBLE_HZ / 1000} kHz` },
]

/** The equaliser and the compressor. */
function SoundSection({
  fold,
  sound,
  leveled,
  update,
}: {
  fold: Fold
  sound: SoundSettings
  leveled: boolean
  update: (change: Partial<SoundSettings>) => void
}) {
  const ids = useId()
  const named = presetOf(sound.tone)
  // Custom stays chosen even when its bands match a preset.
  const [own, setOwn] = useState(named === null)
  const preset: TonePreset | "custom" = own ? "custom" : (named ?? "custom")
  const tone = (change: Partial<Tone>) =>
    update({ tone: { ...sound.tone, ...change } })
  return (
    <Section title="Tone and dynamics" {...fold}>
      <ChoiceChips
        label="Equaliser"
        value={preset}
        onValueChange={(value) => {
          setOwn(value === "custom")
          if (value !== "custom") update({ tone: TONE_PRESETS[value].tone })
        }}
        options={[
          ...(Object.keys(TONE_PRESETS) as TonePreset[]).map((value) => ({
            value,
            label: TONE_PRESETS[value].label,
          })),
          { value: "custom" as const, label: "Custom" },
        ]}
        hint={
          preset === "custom"
            ? "Raise or lower each band by up to 12 dB."
            : TONE_PRESETS[preset].says
        }
      />
      {preset === "custom" && (
        <div className="space-y-3">
          {BANDS.map((band) => (
            <div key={band.key}>
              <div className="mb-1 flex justify-between text-sm">
                <label htmlFor={`${ids}-${band.key}`} className="font-medium">
                  {band.label}
                </label>
                <span className="font-mono text-muted-foreground">
                  {dbLabel(sound.tone[band.key], true)} dB
                </span>
              </div>
              <input
                id={`${ids}-${band.key}`}
                type="range"
                min={-MOST_BAND}
                max={MOST_BAND}
                step={1}
                value={sound.tone[band.key]}
                onChange={(event) =>
                  tone({ [band.key]: Number(event.target.value) })
                }
                className="h-11 w-full accent-primary md:h-9"
              />
            </div>
          ))}
          <ChoiceChips
            label="Cut rumble under"
            value={String(sound.tone.highPass ?? "off")}
            onValueChange={(value) =>
              tone({ highPass: value === "off" ? null : Number(value) })
            }
            options={[
              { value: "off", label: "Off" },
              { value: "80", label: "80 Hz" },
              { value: "120", label: "120 Hz" },
            ]}
          />
        </div>
      )}
      <ChoiceChips
        label="Compressor"
        value={sound.compressor}
        onValueChange={(compressor: CompressorPreset) => update({ compressor })}
        options={[
          { value: "off", label: "Off" },
          ...(
            Object.keys(COMPRESSORS) as Exclude<CompressorPreset, "off">[]
          ).map((value) => ({ value, label: COMPRESSORS[value].label })),
        ]}
        hint={
          sound.compressor === "off"
            ? "Evens out loud and quiet moments when it is on."
            : `${COMPRESSORS[sound.compressor].says} It makes the loud parts quieter${leveled ? "; the loudness setting brings the level back up." : ": choose Normalize loudness to bring the level back up."}`
        }
      />
      {(sound.compressor !== "off" || preset !== "flat") && (
        <p className="text-xs text-muted-foreground">
          A limiter keeps the peaks under the ceiling, or under −1 dBTP when the
          loudness is left as it is.
        </p>
      )}
    </Section>
  )
}

const CHANNEL_CHANGES: { value: ChannelChange; label: string }[] = [
  { value: "same", label: "As they are" },
  { value: "swap", label: "Swap left and right" },
  { value: "left", label: "Left only" },
  { value: "right", label: "Right only" },
  { value: "karaoke", label: "Karaoke" },
]

const CHANNEL_HINTS: Record<ChannelChange, string> = {
  same: "Each channel stays where it is.",
  swap: "What was on the left is on the right, and the other way round.",
  left: "The left channel, in both ears.",
  right: "The right channel, in both ears.",
  karaoke:
    "Takes away what is in the middle of a stereo mix, where the voice often is, and keeps the bass. It is not a real vocal remover: it works on some songs only, and takes away anything else in the middle too.",
}

const times = (tempo: number) =>
  `${tempo.toLocaleString("en", { maximumFractionDigits: 2 })}×`

/** Speed, pitch, direction and channels. */
function ChangesSection({
  fold,
  changes,
  update,
}: {
  fold: Fold
  changes: Changes
  update: (change: Partial<Changes>) => void
}) {
  const ids = useId()
  const listed =
    (TEMPOS as readonly number[]).includes(changes.tempo) || changes.tempo === 1
  const [own, setOwn] = useState(!listed)
  const [text, setText] = useState(String(changes.tempo))
  const preset = own ? "custom" : String(changes.tempo)
  const balance = Math.round(changes.balance * 100)
  return (
    <Section title="Speed, pitch and channels" {...fold}>
      <ChoiceChips
        label="Speed"
        value={preset}
        onValueChange={(value) => {
          setOwn(value === "custom")
          if (value === "custom")
            update({ tempo: Number(text.replace(",", ".")) })
          else update({ tempo: Number(value) })
        }}
        options={[
          ...[0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((tempo) => ({
            value: String(tempo),
            label: tempo === 1 ? "Normal" : times(tempo),
          })),
          { value: "custom", label: "Custom" },
        ]}
      />
      {preset === "custom" && (
        <NumberField
          id={`${ids}-tempo`}
          label="Times as fast"
          value={text}
          hint={`From ${SLOWEST} to ${FASTEST}: 1.2 is a fifth faster, 0.8 a fifth slower.`}
          onChange={(value) => {
            setText(value)
            update({ tempo: Number(value.replace(",", ".")) })
          }}
        />
      )}
      <ToggleRow
        label="Keep the pitch"
        hint={
          changes.keepPitch
            ? "The speed changes and the notes stay where they are."
            : "As a tape or a record does: faster is higher, slower is lower."
        }
        checked={changes.keepPitch}
        onCheckedChange={(keepPitch) => update({ keepPitch })}
      />
      {changes.keepPitch && (
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <label htmlFor={`${ids}-pitch`} className="font-medium">
              Pitch
            </label>
            <span className="font-mono text-muted-foreground">
              {changes.pitch === 0
                ? "As it is"
                : `${changes.pitch > 0 ? "+" : "−"}${Math.abs(changes.pitch)} ${Math.abs(changes.pitch) === 1 ? "semitone" : "semitones"}`}
            </span>
          </div>
          <input
            id={`${ids}-pitch`}
            type="range"
            min={-MOST_PITCH}
            max={MOST_PITCH}
            step={1}
            value={changes.pitch}
            onChange={(event) => update({ pitch: Number(event.target.value) })}
            aria-describedby={`${ids}-pitch-hint`}
            className="h-11 w-full accent-primary md:h-9"
          />
          <p id={`${ids}-pitch-hint`} className="text-xs text-muted-foreground">
            Up or down by up to an octave (12 semitones), keeping the length.
          </p>
        </div>
      )}
      <ChoiceChips
        label="Channels"
        value={changes.channels}
        onValueChange={(channels) => update({ channels })}
        options={CHANNEL_CHANGES}
        hint={CHANNEL_HINTS[changes.channels]}
      />
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <label htmlFor={`${ids}-balance`} className="font-medium">
            Balance
          </label>
          <span className="font-mono text-muted-foreground">
            {balance === 0
              ? "Centre"
              : balance < 0
                ? `Left ${-balance}%`
                : `Right ${balance}%`}
          </span>
        </div>
        <input
          id={`${ids}-balance`}
          type="range"
          min={-100}
          max={100}
          step={5}
          value={balance}
          onChange={(event) =>
            update({ balance: Number(event.target.value) / 100 })
          }
          className="h-11 w-full accent-primary md:h-9"
        />
      </div>
      <ToggleRow
        label="Play backwards"
        hint="The whole sound, from its end to its start."
        checked={changes.reverse}
        onCheckedChange={(reverse) => update({ reverse })}
      />
    </Section>
  )
}

/** Background noise, hum, clicks and harsh "s" sounds. */
function RepairSection({
  fold,
  repair,
  update,
}: {
  fold: Fold
  repair: Repair
  update: (change: Partial<Repair>) => void
}) {
  const ids = useId()
  const strength = Math.round(repair.denoise * 100)
  return (
    <Section title="Repair" {...fold}>
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <label htmlFor={`${ids}-noise`} className="font-medium">
            Take away background noise
          </label>
          <span className="font-mono text-muted-foreground">
            {strength === 0 ? "Off" : `${strength}%`}
          </span>
        </div>
        <input
          id={`${ids}-noise`}
          type="range"
          min={0}
          max={100}
          step={5}
          value={strength}
          onChange={(event) =>
            update({ denoise: Number(event.target.value) / 100 })
          }
          aria-describedby={`${ids}-noise-hint`}
          className="h-11 w-full accent-primary md:h-9"
        />
        <p id={`${ids}-noise-hint`} className="text-xs text-muted-foreground">
          RNNoise, a small neural network trained on speech, run on your device.
          It is made for voices: on music it can take away sounds you want, so
          listen and lower it if it does. The first time, its model (3.1 MB) is
          downloaded and then kept for working offline.
        </p>
      </div>
      <ChoiceChips
        label="Mains hum"
        value={String(repair.hum)}
        onValueChange={(value) => update({ hum: Number(value) as 0 | 50 | 60 })}
        options={[
          { value: "0", label: "Off" },
          { value: "50", label: "50 Hz" },
          { value: "60", label: "60 Hz" },
        ]}
        hint="The buzz of the mains and its harmonics, notched out 3 Hz wide each. 50 Hz in most of the world, 60 Hz in the Americas and parts of Asia."
      />
      <ToggleRow
        label="Remove clicks"
        hint="Short spikes, far louder than the sound around them, drawn over with a smooth curve. Drums and consonants are left as they are."
        checked={repair.declick}
        onCheckedChange={(declick) => update({ declick })}
      />
      <ChoiceChips
        label={'Harsh "s" sounds'}
        value={repair.deess}
        onValueChange={(deess: Sibilance) => update({ deess })}
        options={[
          { value: "off", label: "Off" },
          { value: "gentle", label: "Gentle" },
          { value: "strong", label: "Strong" },
        ]}
        hint="Turns down only the sound over 5 kHz while it is too loud, as in a sharp s or sh: by up to 6 dB, or 12 when strong."
      />
    </Section>
  )
}
