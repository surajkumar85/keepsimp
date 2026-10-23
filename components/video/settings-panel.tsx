"use client"

import { Section, ToggleRow } from "@/components/image-batch/controls"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { outputInfo, type OutContainer } from "@/lib/video/formats"
import { useState } from "react"
import {
  FADES,
  FRAME_RATES,
  SHAPES,
  SPEEDS,
  HOLDS,
  LEAST_BITRATE,
  LEAST_LIMIT,
  LIMIT_SHARES,
  LIMIT_SIZES,
  MB,
  MOST_BITRATE,
  MOST_LIMIT,
  SHORT_SIDES,
  videoCodecLabels,
  type Quality,
  type Shape,
  type Turn,
  type VideoSettings,
} from "@/lib/video/settings"

export type Update = (change: Partial<VideoSettings>) => void

const FORMAT_HINTS: Record<VideoSettings["format"], string> = {
  same: "Keeps each file's own kind (MPEG-TS becomes MP4), copying what does not have to change.",
  mp4: "Plays everywhere: phones, computers, TVs and every site. H.264 unless you choose another.",
  webm: "Made for the web: VP9 or AV1 with Opus sound. Plays in browsers and on Android; not in QuickTime.",
  mov: "Apple's own kind, for Final Cut, iMovie and QuickTime. H.264 or HEVC.",
  mkv: "Holds almost any picture and sound as it is. Plays in VLC and most desktop players.",
}

const QUALITY_HINTS: Record<Quality, string> = {
  original:
    "Copies the picture as it is wherever nothing has to change: nothing is lost and it is quick. When it must be encoded, it is at High.",
  high: "YouTube's recommended upload bitrate for the size and frame rate.",
  balanced: "Half of High: hard to tell apart on most screens, half the size.",
  small: "A quarter of High, for sending and sharing.",
  custom: "A bitrate of your own for the picture.",
}

const TURNS: { value: string; label: string }[] = [
  { value: "0", label: "None" },
  { value: "90", label: "90° right" },
  { value: "180", label: "180°" },
  { value: "270", label: "90° left" },
]

const SHARE_LABELS: Record<number, string> = {
  0.5: "Half",
  0.25: "A quarter",
}

/** A size to fit under: none, a size in MB, a share of each file, or one's own. */
function LimitChoice({
  settings,
  update,
}: {
  settings: VideoSettings
  update: Update
}) {
  const limit = settings.limit
  const chosen =
    limit === null
      ? "none"
      : "share" in limit
        ? `share:${limit.share}`
        : LIMIT_SIZES.some((size) => size * MB === limit.bytes)
          ? `mb:${limit.bytes / MB}`
          : "custom"
  const [custom, setCustom] = useState(
    limit && "bytes" in limit ? String(limit.bytes / MB) : "5"
  )
  return (
    <>
      <ChoiceChips
        label="Size limit"
        hideLabel
        hint={
          limit === null
            ? "No limit: the quality and size above decide."
            : "Each file is written to fit under this: its bitrate is chosen for it, and its frame rate and size lowered if need be. A file already under it is copied as it is."
        }
        value={chosen}
        onValueChange={(value) => {
          if (value === "none") update({ limit: null })
          else if (value === "custom")
            update({ limit: { bytes: Math.round(Number(custom) * MB) } })
          else if (value.startsWith("share:"))
            update({ limit: { share: Number(value.slice(6)) } })
          else update({ limit: { bytes: Number(value.slice(3)) * MB } })
        }}
        options={[
          { value: "none", label: "None" },
          ...LIMIT_SIZES.map((size) => ({
            value: `mb:${size}`,
            label: `${size} MB`,
          })),
          ...LIMIT_SHARES.map((share) => ({
            value: `share:${share}`,
            label: SHARE_LABELS[share],
          })),
          { value: "custom", label: "Custom" },
        ]}
      />
      {chosen === "custom" && (
        <label className="block max-w-60 space-y-2 text-sm font-medium">
          <span>Size limit (MB)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={LEAST_LIMIT}
            max={MOST_LIMIT}
            step={0.5}
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value)
              update({
                limit: {
                  bytes: Math.round(event.target.valueAsNumber * MB),
                },
              })
            }}
          />
        </label>
      )}
    </>
  )
}

/** How each file is written: kind, codec, quality, size, frame rate, turn and sound. */
export function SettingsPanel({
  settings,
  update,
  problem,
  limitFirst = false,
}: {
  settings: VideoSettings
  update: Update
  problem: string | null
  /** The size limit at the top, for the page opened to compress. */
  limitFirst?: boolean
}) {
  const limitSection = (
    <Section title="Size limit">
      <LimitChoice settings={settings} update={update} />
    </Section>
  )
  const container: OutContainer | null =
    settings.format === "same" ? null : settings.format
  const codecs = container ? HOLDS[container].video : null
  return (
    <div className="space-y-5">
      {limitFirst && limitSection}
      <Section title="Format">
        <ChoiceChips
          label="Format"
          hideLabel
          hint={FORMAT_HINTS[settings.format]}
          value={settings.format}
          onValueChange={(format) => {
            const holds =
              format === "same" ||
              settings.codec === "auto" ||
              HOLDS[format].video.includes(settings.codec)
            update({ format, ...(holds ? {} : { codec: "auto" }) })
          }}
          options={[
            { value: "mp4", label: "MP4" },
            { value: "webm", label: "WebM" },
            { value: "mov", label: "MOV" },
            { value: "mkv", label: "MKV" },
            { value: "same", label: "Same as the file" },
          ]}
        />
        <ChoiceChips
          label="Video codec"
          hint={
            settings.codec === "auto"
              ? "The most widely played codec the format holds, when the picture has to be encoded."
              : settings.codec === "hevc"
                ? "Half the size of H.264 for the same look. Plays on Apple devices and most phones; some Windows and Android players lack it."
                : settings.codec === "av1"
                  ? "The smallest files. Plays on recent phones, computers and browsers; older devices lack it, and writing it is slow."
                  : settings.codec === "vp9"
                    ? "Smaller than H.264. Plays in every browser and on Android."
                    : settings.codec === "vp8"
                      ? "An older WebM codec, for players that lack VP9."
                      : "Plays on every device."
          }
          value={settings.codec}
          onValueChange={(codec) => update({ codec })}
          options={[
            { value: "auto", label: "Automatic" },
            ...(["avc", "hevc", "vp9", "av1", "vp8"] as const)
              .filter((codec) => !codecs || codecs.includes(codec))
              .map((codec) => ({
                value: codec,
                label: videoCodecLabels[codec],
              })),
          ]}
        />
      </Section>

      <Section title="Quality and size">
        <ChoiceChips
          label="Quality"
          hint={QUALITY_HINTS[settings.quality]}
          value={settings.quality}
          onValueChange={(quality) => update({ quality })}
          options={[
            { value: "original", label: "Original" },
            { value: "high", label: "High" },
            { value: "balanced", label: "Balanced" },
            { value: "small", label: "Small" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {settings.quality === "custom" && (
          <label className="block max-w-60 space-y-2 text-sm font-medium">
            <span>Picture bitrate (kbit/s)</span>
            <Input
              type="number"
              inputMode="numeric"
              min={LEAST_BITRATE}
              max={MOST_BITRATE}
              step={100}
              value={Number.isFinite(settings.bitrate) ? settings.bitrate : ""}
              onChange={(event) =>
                update({ bitrate: event.target.valueAsNumber })
              }
            />
          </label>
        )}
        <ChoiceChips
          label="Size"
          hint="The shorter side at most. A video is never made larger."
          value={String(settings.size)}
          onValueChange={(size) =>
            update({
              size: size === "same" ? "same" : (Number(size) as never),
            })
          }
          options={[
            { value: "same", label: "Same" },
            ...SHORT_SIDES.map((side) => ({
              value: String(side),
              label: side === 2160 ? "4K" : `${side}p`,
            })),
          ]}
        />
        <ChoiceChips
          label="Frame rate"
          hint="At most this many frames a second. Never raised."
          value={String(settings.frameRate)}
          onValueChange={(rate) =>
            update({
              frameRate: rate === "same" ? "same" : (Number(rate) as never),
            })
          }
          options={[
            { value: "same", label: "Same" },
            ...FRAME_RATES.map((rate) => ({
              value: String(rate),
              label: `${rate} fps`,
            })),
          ]}
        />
      </Section>

      {!limitFirst && limitSection}

      <Section title="Turn and shape">
        <ChoiceChips
          label="Turn"
          hideLabel
          hint="MP4 and MOV carry a turn as a setting players follow, so nothing is encoded again; other formats turn the picture as it is drawn."
          value={String(settings.rotate)}
          onValueChange={(turn) => update({ rotate: Number(turn) as Turn })}
          options={TURNS}
        />
        <ToggleRow
          label="Mirror"
          hint="Flips the picture left to right, as a front camera shows it."
          checked={settings.flip}
          onCheckedChange={(flip) => update({ flip })}
        />
        <ChoiceChips
          label="Shape"
          hint={
            settings.shape === "same"
              ? "Keeps the whole picture."
              : `Cuts each picture to ${settings.shape} around its middle, after the turn: ${settings.shape === "9:16" ? "for Reels, Shorts and TikTok" : settings.shape === "1:1" ? "square, for feeds" : settings.shape === "4:5" ? "for portrait posts" : settings.shape === "16:9" ? "widescreen" : "for older screens"}. The picture is encoded again.`
          }
          value={settings.shape}
          onValueChange={(shape) => update({ shape: shape as Shape })}
          options={[
            { value: "same", label: "Same" },
            ...SHAPES.map((shape) => ({ value: shape, label: shape })),
          ]}
        />
      </Section>

      <Section title="Speed and fades">
        <ChoiceChips
          label="Speed"
          hint="Faster keeps the frame rate; slower plays every frame for longer. The sound keeps its pitch. The picture and sound are encoded again."
          value={String(settings.speed)}
          onValueChange={(speed) => update({ speed: Number(speed) })}
          options={[...SPEEDS.slice(0, 2), 1, ...SPEEDS.slice(2)].map(
            (speed) => ({
              value: String(speed),
              label: speed === 1 ? "Normal" : `${speed}×`,
            })
          )}
        />
        <ChoiceChips
          label="Fade in"
          hint="From black and silence at the start."
          value={String(settings.fadeIn)}
          onValueChange={(fade) => update({ fadeIn: Number(fade) })}
          options={[0, ...FADES].map((fade) => ({
            value: String(fade),
            label: fade === 0 ? "None" : `${fade} s`,
          }))}
        />
        <ChoiceChips
          label="Fade out"
          hint="To black and silence at the end."
          value={String(settings.fadeOut)}
          onValueChange={(fade) => update({ fadeOut: Number(fade) })}
          options={[0, ...FADES].map((fade) => ({
            value: String(fade),
            label: fade === 0 ? "None" : `${fade} s`,
          }))}
        />
      </Section>

      <Section title="Sound and details">
        <ChoiceChips
          label="Sound"
          hideLabel
          hint={
            settings.sound === "keep"
              ? "Copies the sound as it is when the format plays it everywhere; otherwise converts it."
              : settings.sound === "convert"
                ? container === "webm" || container === "mkv"
                  ? "Converts the sound to Opus, whose own header keeps it in step with the picture."
                  : container
                    ? "Converts the sound to AAC, with an edit list that keeps it in step with the picture."
                    : "Converts the sound: AAC in MP4 and MOV, Opus in WebM and MKV."
                : "Writes the picture alone."
          }
          value={settings.sound}
          onValueChange={(sound) => update({ sound })}
          options={[
            { value: "keep", label: "Keep" },
            { value: "convert", label: "Convert" },
            { value: "none", label: "Leave out" },
          ]}
        />
        <ToggleRow
          label="Keep the title and details"
          hint="Title, artist, date and comments, where the format holds them."
          checked={settings.keepTags}
          onCheckedChange={(keepTags) => update({ keepTags })}
        />
      </Section>

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Bitrates follow YouTube&apos;s recommended upload settings; Balanced and
        Small are KeepSimp&apos;s own shares of them. Writing to{" "}
        {container ? outputInfo[container].label : "each file's own kind"}{" "}
        happens on this device.
      </p>
    </div>
  )
}
