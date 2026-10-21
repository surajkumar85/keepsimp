"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  IconDownload,
  IconMovie,
  IconPhoto,
  IconPlayerStop,
} from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import type { Cover } from "@/lib/audio/tags"
import { clock } from "@/lib/audio/transcript"
import { startVideo } from "@/lib/audio/video-client"
import { decodeOnPage } from "@/lib/audio/client"
import { wavFromPlanes } from "@/lib/audio/wav"
import {
  defaultLook,
  SHAPES,
  type VideoColours,
  type VideoLook,
  type VideoShape,
} from "@/lib/audio/video"
import { sizeLabel } from "@/lib/image-compressor/formats"

/** The sound a video is made of: the file's result, with its name, cover and tags. */
export interface VideoSource {
  id: string
  name: string
  /** The sound as written with the current settings; null until it is. */
  sound: Blob | null
  cover: Cover | null
  title: string
  artist: string
}

interface Made {
  url: string
  downloadUrl: string
  name: string
  bytes: number
  container: "mp4" | "webm"
  seconds: number
  sound: Blob
}

/** A theme colour as rgb(), read by drawing it, for the canvas in the worker. */
function colourOf(element: Element, name: string) {
  const probe = document.createElement("canvas")
  probe.width = probe.height = 1
  const context = probe.getContext("2d", { willReadFrequently: true })
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  if (!context || !value) return "rgb(128, 128, 128)"
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return `rgb(${red}, ${green}, ${blue})`
}

const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"]

/** A sound as a video to share: a picture, a moving waveform and the title. */
export function VideoPanel({ source }: { source: VideoSource }) {
  const ids = useId()
  const [look, setLook] = useState<VideoLook>(defaultLook)
  const [picture, setPicture] = useState<"cover" | "own" | "none">(
    source.cover ? "cover" : "none"
  )
  const [own, setOwn] = useState<Blob | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [made, setMade] = useState<Made | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const panel = useRef<HTMLElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => () => stop.current?.(), [])
  useEffect(
    () => () => {
      if (made) {
        URL.revokeObjectURL(made.url)
        URL.revokeObjectURL(made.downloadUrl)
      }
    },
    [made]
  )
  const ownUrl = useMemo(() => (own ? URL.createObjectURL(own) : null), [own])
  useEffect(
    () => () => {
      if (ownUrl) URL.revokeObjectURL(ownUrl)
    },
    [ownUrl]
  )

  const chosen =
    picture === "cover" && source.cover
      ? new Blob([source.cover.data as BlobPart], {
          type: source.cover.mimeType,
        })
      : picture === "own"
        ? own
        : null

  function make(sound = source.sound, decodedHere = false) {
    if (!sound || !panel.current) return
    stop.current?.()
    setProblem(null)
    setMade(null)
    setProgress(0)
    const element = panel.current
    const colours: VideoColours = {
      background: colourOf(element, "--background"),
      foreground: colourOf(element, "--foreground"),
      muted: colourOf(element, "--muted-foreground"),
      accent: colourOf(element, "--primary"),
    }
    stop.current = startVideo(
      {
        file: sound,
        look,
        colours,
        picture: chosen,
        title: source.title,
        artist: source.artist,
      },
      (message) => {
        if (message.type === "progress") setProgress(message.fraction)
        else if (message.type === "undecodable") {
          stop.current?.()
          stop.current = null
          // Decoded by the page, as a WAV, and asked again (once).
          if (decodedHere) {
            setProgress(null)
            setProblem("This browser cannot decode this sound to make a video.")
            return
          }
          decodeOnPage(sound)
            .then(({ planes, sampleRate }) =>
              make(
                new Blob([wavFromPlanes(planes, sampleRate) as BlobPart], {
                  type: "audio/wav",
                }),
                true
              )
            )
            .catch(() => {
              setProgress(null)
              setProblem(
                "This browser cannot decode this sound to make a video."
              )
            })
        } else {
          stop.current?.()
          stop.current = null
          setProgress(null)
          if (message.type === "error") setProblem(message.message)
          else if (!message.check.video || !message.check.audio)
            setProblem(
              "The video was written without its picture or its sound, so it is not offered."
            )
          else if (
            Math.abs(message.check.seconds - message.video.seconds) > 0.1
          )
            setProblem(
              `The video came out ${clock(message.check.seconds)} long for ${clock(message.video.seconds)} of sound, so it is not offered.`
            )
          else {
            const { video } = message
            const type = video.container === "mp4" ? "video/mp4" : "video/webm"
            const blob = new Blob([video.bytes as BlobPart], { type })
            setMade({
              url: URL.createObjectURL(blob),
              downloadUrl: URL.createObjectURL(
                new Blob([blob], { type: "application/octet-stream" })
              ),
              name: `${source.name.replace(/\.[^.]+$/, "")}-video.${video.container}`,
              bytes: blob.size,
              container: video.container,
              seconds: message.check.seconds,
              sound: source.sound!,
            })
          }
        }
      }
    )
  }

  return (
    <section
      ref={panel}
      aria-labelledby={`${ids}-title`}
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="video-panel"
    >
      <h2 id={`${ids}-title`} className="section-title">
        Video
      </h2>
      <p className="text-sm text-muted-foreground">
        The sound as written with your settings, with a picture, for places that
        take only video. Made on this device.
      </p>
      <ChoiceChips
        label="Shape"
        value={look.shape}
        onValueChange={(shape: VideoShape) =>
          setLook((had) => ({ ...had, shape }))
        }
        options={(Object.keys(SHAPES) as VideoShape[]).map((shape) => ({
          value: shape,
          label: SHAPES[shape].label,
        }))}
      />
      <ChoiceChips
        label="Picture"
        value={picture}
        onValueChange={setPicture}
        options={[
          ...(source.cover
            ? [{ value: "cover" as const, label: "The cover" }]
            : []),
          { value: "own" as const, label: "A picture of my own" },
          { value: "none" as const, label: "None" },
        ]}
      />
      {picture === "own" && (
        <div className="flex flex-wrap items-center gap-3">
          {ownUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a picture chosen on the device
            <img
              src={ownUrl}
              alt="The picture chosen"
              className="size-16 rounded-md border object-cover"
            />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => picker.current?.click()}
          >
            <IconPhoto data-icon="inline-start" aria-hidden="true" />
            {own ? "Choose another picture" : "Choose a picture"}
          </Button>
          <input
            ref={picker}
            type="file"
            accept={PICTURE_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a picture for the video"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (!file) return
              if (!PICTURE_TYPES.includes(file.type)) {
                setProblem("Choose a JPEG, PNG or WebP picture.")
                return
              }
              setProblem(null)
              setOwn(file)
            }}
          />
        </div>
      )}
      <ToggleRow
        label="Waveform with a moving playhead"
        hint="24 frames a second. Without it the picture stands still, at one frame a second, and the video is made far faster."
        checked={look.waveform}
        onCheckedChange={(waveform) => setLook((had) => ({ ...had, waveform }))}
      />
      <ToggleRow
        label="Title and artist"
        hint={
          source.title
            ? `“${source.title}”${source.artist ? ` by ${source.artist}` : ""}, from the tags.`
            : "From the tags; this file has no title."
        }
        checked={look.title}
        onCheckedChange={(title) => setLook((had) => ({ ...had, title }))}
      />

      {progress === null ? (
        <div className="space-y-1">
          <Button
            type="button"
            onClick={() => make()}
            disabled={!source.sound || (picture === "own" && !own)}
          >
            <IconMovie data-icon="inline-start" aria-hidden="true" />
            {made ? "Make it again" : "Make the video"}
          </Button>
          {!source.sound && (
            <p className="text-xs text-muted-foreground">
              Waiting for the sound to be written with your settings.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p role="status" className="text-sm" data-testid="video-status">
            Making the video: {Math.round(progress * 100)}%
          </p>
          <div
            role="progressbar"
            aria-label="Making the video"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stop.current?.()
              stop.current = null
              setProgress(null)
            }}
          >
            <IconPlayerStop data-icon="inline-start" aria-hidden="true" />
            Stop
          </Button>
        </div>
      )}

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}

      {made && progress === null && (
        <div className="space-y-2" data-testid="video-made">
          <video
            src={made.url}
            controls
            preload="metadata"
            className="w-full rounded-lg border"
            aria-label="The video"
          />
          <p className="text-sm text-muted-foreground" data-testid="video-said">
            Checked:{" "}
            {made.container === "mp4"
              ? "MP4 with H.264 and AAC"
              : "WebM with VP9 and Opus, as this browser cannot write H.264; it plays in browsers and on most sites, not in every app"}
            , {clock(made.seconds)} long, {sizeLabel(made.bytes)}.
            {made.sound !== source.sound &&
              " The settings have changed since: make it again to have them."}
          </p>
          <a
            href={made.downloadUrl}
            download={made.name}
            className={buttonVariants()}
            data-testid="video-download"
          >
            <IconDownload data-icon="inline-start" aria-hidden="true" />
            Download {made.name}
          </a>
        </div>
      )}
    </section>
  )
}
