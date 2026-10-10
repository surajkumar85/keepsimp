"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  IconCamera,
  IconLoader2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
} from "@tabler/icons-react"
import { CompareSlider } from "@/components/image-compressor/compare-slider"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { FrameViewer, type ViewedFrames } from "@/lib/animation/client"
import type { SourceInput } from "@/lib/animation/protocol"
import { frameAt, sum, type Step } from "@/lib/animation/timeline"
import type { Rotation, Size } from "@/lib/image-compressor/geometry"

const seconds = (milliseconds: number) => (milliseconds / 1000).toFixed(2)
const tag =
  "pointer-events-none absolute top-3 rounded-full border bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"

/** How a file is shown while playing: as a picture, in a video player, or not at all. */
export type Playable = "image" | "video" | "none"

export interface PlayerOriginal {
  /** "none" for a set of stills, which has no single file to play. */
  kind: Playable
  url: string | null
  input: SourceInput
  inputKey: string
  size: Size
  /** Milliseconds each original frame is shown. */
  durations: number[]
}

export interface PlayerResult {
  /** "none" for a ZIP of frames or a sprite sheet. */
  kind: Playable
  url: string
  blob: Blob
  size: Size
}

function Moving({
  kind,
  url,
  size,
  label,
}: {
  kind: "image" | "video"
  url: string
  size: Size
  label: string
}) {
  const style = {
    aspectRatio: `${size.width} / ${size.height}`,
    width: `min(100cqw, calc(100cqh * ${size.width / size.height}))`,
  }
  return kind === "video" ? (
    <video
      src={url}
      aria-label={label}
      autoPlay
      loop
      muted
      playsInline
      className="m-auto block"
      style={style}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- local object URL
    <img src={url} alt={label} className="m-auto block" style={style} />
  )
}

/**
 * Preview for one animation. Playing shows the file as the browser plays it;
 * pausing shows a single moment with the before/after slider.
 */
export function Player({
  original,
  result,
  steps,
  orientation,
  originalLabel,
  resultLabel,
  status,
  onCancel,
  frameName,
}: {
  original: PlayerOriginal
  result: PlayerResult | null
  /** Which original frame each moment of the result shows. */
  steps: Step[]
  orientation: { rotation: Rotation; flipX: boolean; flipY: boolean }
  originalLabel: string
  resultLabel: string | null
  status: string | null
  onCancel: () => void
  /** File name for a saved frame, given its number. */
  frameName: (frame: number) => string
}) {
  const [playing, setPlaying] = useState(
    () =>
      typeof window === "undefined" ||
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
  const [show, setShow] = useState<"result" | "original">("result")
  /** Milliseconds into the result (or the original, before there is a result). */
  const [time, setTime] = useState(0)
  const [frames, setFrames] = useState<ViewedFrames>({})
  const [problem, setProblem] = useState("")
  const viewer = useRef<FrameViewer | null>(null)
  const clock = useRef({ started: 0, offset: 0 })

  const stepDurations = useMemo(
    () => steps.map((step) => step.duration),
    [steps]
  )
  const duration = sum(stepDurations)
  const position = Math.min(time, Math.max(0, duration - 1))
  const stepIndex = steps.length ? frameAt(stepDurations, position) : 0

  useEffect(() => {
    const instance = new FrameViewer(
      (next) =>
        setFrames((current) => {
          for (const frame of Object.values(current)) frame.close()
          return next
        }),
      setProblem
    )
    viewer.current = instance
    return () => {
      instance.dispose()
      viewer.current = null
    }
  }, [])
  const framesRef = useRef(frames)
  useEffect(() => {
    framesRef.current = frames
  }, [frames])
  useEffect(
    () => () => {
      for (const frame of Object.values(framesRef.current)) frame.close()
    },
    []
  )

  // What can be shown moving: the result if it plays, else the original if it does.
  const playable =
    result && result.kind !== "none" && (show === "result" || !original.url)
      ? ("result" as const)
      : original.kind !== "none" && original.url
        ? ("original" as const)
        : null
  // With nothing to play, the preview stays on single frames.
  const moving = playing && playable !== null

  // While playing, a clock follows the picture so the position bar can move.
  useEffect(() => {
    if (!moving || duration <= 0) return
    clock.current = { started: performance.now(), offset: clock.current.offset }
    let frame = requestAnimationFrame(function tick(now) {
      setTime((clock.current.offset + now - clock.current.started) % duration)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [moving, duration])

  // Paused: draw the moment under the position bar, before and after.
  const source = steps[stepIndex]?.source ?? 0
  const comparable = result && result.kind !== "none" ? result : null
  const resultBlob = comparable?.blob ?? null
  const resultUrl = comparable?.url ?? ""
  useEffect(() => {
    if (moving) return
    const timer = setTimeout(() => {
      setProblem("")
      viewer.current?.show([
        {
          slot: "original",
          input: original.input,
          inputKey: original.inputKey,
          time: sum(original.durations.slice(0, source)),
          orientation,
        },
        ...(resultBlob
          ? [
              {
                slot: "result" as const,
                input: { kind: "file" as const, file: resultBlob },
                inputKey: resultUrl,
                time: position,
              },
            ]
          : []),
      ])
    }, 60)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the input is named by its key; orientation by its parts
  }, [
    moving,
    original.inputKey,
    original.durations,
    source,
    resultBlob,
    resultUrl,
    position,
    orientation.rotation,
    orientation.flipX,
    orientation.flipY,
  ])

  const pause = (at: number) => {
    clock.current.offset = at
    setTime(at)
    setPlaying(false)
  }
  const play = () => {
    clock.current.offset = position
    setPlaying(true)
  }
  const step = (direction: 1 | -1) => {
    const next = (stepIndex + direction + steps.length) % steps.length
    pause(sum(stepDurations.slice(0, next)))
  }

  /** Save the frame on screen as a PNG: the result's if there is one, else the original's. */
  function saveFrame() {
    const bitmap = frames.result ?? frames.original
    if (!bitmap) return
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = frameName(stepIndex + 1)
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }, "image/png")
  }

  const size = comparable?.size ?? original.size
  const bundle = result?.kind === "none"

  return (
    <div className="space-y-3" data-testid="player" data-playing={moving}>
      {moving ? (
        <div
          data-testid="player-stage"
          className="checkerboard relative h-80 overflow-hidden rounded-xl border sm:h-96 lg:h-[30rem]"
        >
          <div
            className="absolute inset-0 flex"
            style={{ containerType: "size" }}
          >
            {playable === "result" ? (
              <Moving
                key={result!.url}
                kind={result!.kind as "image" | "video"}
                url={result!.url}
                size={result!.size}
                label="The converted animation, playing"
              />
            ) : (
              <Moving
                key={original.url}
                kind={original.kind as "image" | "video"}
                url={original.url!}
                // A turned original has the result's shape only once it is redrawn; playing shows the file as it is.
                size={original.size}
                label="The original animation, playing"
              />
            )}
          </div>
          <span className={`${tag} left-3`}>
            {playable === "result" ? resultLabel : originalLabel}
          </span>
          {status && (
            <div className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 py-1 pr-1 pl-3 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
              <IconLoader2
                className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span className="truncate" aria-hidden="true">
                {status}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 rounded-full px-3 text-xs md:h-7"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      ) : (
        <CompareSlider
          reference={frames.original ?? null}
          resultUrl={null}
          result={comparable ? (frames.result ?? null) : null}
          size={size}
          originalLabel={originalLabel}
          resultLabel={comparable ? resultLabel : null}
          status={status}
          onCancel={onCancel}
        />
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Playback"
          className="flex items-center gap-1"
        >
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous frame"
            onClick={() => step(-1)}
          >
            <IconPlayerSkipBackFilled aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            aria-label={moving ? "Pause" : "Play"}
            disabled={playable === null}
            onClick={() => (moving ? pause(position) : play())}
          >
            {moving ? (
              <IconPlayerPauseFilled aria-hidden="true" />
            ) : (
              <IconPlayerPlayFilled aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next frame"
            onClick={() => step(1)}
          >
            <IconPlayerSkipForwardFilled aria-hidden="true" />
          </Button>
        </div>
        <input
          type="range"
          aria-label="Position"
          aria-valuetext={`${seconds(position)} of ${seconds(duration)} seconds`}
          min={0}
          max={Math.max(1, Math.round(duration) - 1)}
          step={1}
          value={Math.round(position)}
          onChange={(event) => pause(Number(event.target.value))}
          className="min-h-11 min-w-32 flex-1 accent-primary md:min-h-9"
        />
        <p
          className="font-mono text-xs text-muted-foreground"
          data-testid="player-time"
        >
          {seconds(position)} / {seconds(duration)} s · frame {stepIndex + 1} of{" "}
          {steps.length}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {moving && result && result.kind !== "none" && original.url ? (
          <ChoiceChips
            label="Show"
            hideLabel
            value={show}
            onValueChange={setShow}
            options={[
              { value: "result", label: "Result" },
              { value: "original", label: "Original" },
            ]}
          />
        ) : !moving ? (
          <Button
            variant="outline"
            disabled={!frames.result && !frames.original}
            onClick={saveFrame}
          >
            <IconCamera aria-hidden="true" /> Save this frame
          </Button>
        ) : (
          <span />
        )}
        <p className="text-xs text-muted-foreground">
          {bundle
            ? "The result is a ZIP of pictures, so the preview shows the original."
            : playable === null
              ? "Step through the frames, or drag the handle on the picture to compare."
              : moving
                ? "Pause to compare a single frame before and after."
                : "Drag the handle on the picture to compare this frame."}
        </p>
      </div>
    </div>
  )
}
