"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
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
import { frameAt, sum, type Step } from "@/lib/animation/timeline"
import type { Rotation, Size } from "@/lib/image-compressor/geometry"

const seconds = (milliseconds: number) => (milliseconds / 1000).toFixed(2)
const tag =
  "pointer-events-none absolute top-3 rounded-full border bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"

export interface PlayerResult {
  url: string
  blob: Blob
  size: Size
  /** Milliseconds for one play. */
  duration: number
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
}: {
  original: { url: string; file: File; size: Size; durations: number[] }
  result: PlayerResult | null
  /** Which original frame each moment of the result shows. */
  steps: Step[]
  orientation: { rotation: Rotation; flipX: boolean; flipY: boolean }
  originalLabel: string
  resultLabel: string | null
  status: string | null
  onCancel: () => void
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

  // While playing, a clock follows the picture so the position bar can move.
  useEffect(() => {
    if (!playing || duration <= 0) return
    clock.current = { started: performance.now(), offset: clock.current.offset }
    let frame = requestAnimationFrame(function tick(now) {
      setTime((clock.current.offset + now - clock.current.started) % duration)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, duration])

  // Paused: draw the moment under the position bar, before and after.
  const source = steps[stepIndex]?.source ?? 0
  const resultBlob = result?.blob ?? null
  useEffect(() => {
    if (playing) return
    const timer = setTimeout(() => {
      setProblem("")
      viewer.current?.show([
        {
          slot: "original",
          file: original.file,
          time: sum(original.durations.slice(0, source)),
          orientation,
        },
        ...(resultBlob
          ? [{ slot: "result" as const, file: resultBlob, time: position }]
          : []),
      ])
    }, 60)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orientation is read when the frame is asked for
  }, [
    playing,
    original.file,
    original.durations,
    source,
    resultBlob,
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

  const size = result?.size ?? original.size
  const showing = result && show === "result" ? "result" : "original"
  // A turned original has the result's shape only once it is redrawn; playing shows the file as it is.
  const shown = showing === "result" ? size : original.size

  return (
    <div className="space-y-3" data-testid="player" data-playing={playing}>
      {playing ? (
        <div
          data-testid="player-stage"
          className="checkerboard relative h-80 overflow-hidden rounded-xl border sm:h-96 lg:h-[30rem]"
        >
          <div
            className="absolute inset-0 flex"
            style={{ containerType: "size" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img
              key={showing}
              src={showing === "result" ? result!.url : original.url}
              alt={
                showing === "result"
                  ? "The converted animation, playing"
                  : "The original animation, playing"
              }
              className="m-auto block"
              style={{
                aspectRatio: `${shown.width} / ${shown.height}`,
                width: `min(100cqw, calc(100cqh * ${shown.width / shown.height}))`,
              }}
            />
          </div>
          <span className={`${tag} left-3`}>
            {showing === "result" ? resultLabel : originalLabel}
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
          result={result ? (frames.result ?? null) : null}
          size={size}
          originalLabel={originalLabel}
          resultLabel={result ? resultLabel : null}
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
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => (playing ? pause(position) : play())}
          >
            {playing ? (
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
        {playing && result ? (
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
        ) : (
          <span />
        )}
        <p className="text-xs text-muted-foreground">
          {playing
            ? "Pause to compare a single frame before and after."
            : "Drag the handle on the picture to compare this frame."}
        </p>
      </div>
    </div>
  )
}
