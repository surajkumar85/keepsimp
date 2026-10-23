"use client"

import { useEffect, useId, useState, type RefObject } from "react"
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCamera,
  IconCut,
  IconScissors,
  IconPlayerPlay,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { keyAction, NUDGE_MORE, SKIP } from "@/lib/video/shortcuts"
import {
  clock,
  cutOut,
  isWhole,
  keepOnly,
  keptLength,
  parseClock,
  retime,
  sourceTime,
  whole,
  type Part,
} from "@/lib/video/trim"
import type { Trim } from "@/lib/video/queue"

/** Moves a player: the player is the workspace's, handed down by a ref. */
function moveTo(video: HTMLVideoElement, time: number) {
  video.currentTime = time
}

/** Keys a control answers to itself: typing, a slider's moves, a button's press, a choice's arrows. */
function ownKey(target: HTMLElement, key: string) {
  if (target instanceof HTMLInputElement)
    return target.type === "range"
      ? /^(Arrow|Home|End|Page)/.test(key)
      : key !== "Escape"
  if (target.getAttribute("role") === "radio")
    return key.startsWith("Arrow") || key === " "
  if (target instanceof HTMLButtonElement) return key === " " || key === "Enter"
  return false
}

/** Where the playhead is, read on a timer: animation frames stop in a hidden tab. */
function usePlayhead(player: RefObject<HTMLVideoElement | null>) {
  const [time, setTime] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      const video = player.current
      if (video) setTime(video.currentTime)
    }, 100)
    return () => clearInterval(timer)
  }, [player])
  return time
}

function TimeField({
  label,
  value,
  onChange,
  duration,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  duration: number
}) {
  const id = useId()
  const [text, setText] = useState(clock(value))
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setText(clock(value))
  }
  const parsed = parseClock(text)
  const wrong = parsed === null || parsed > duration
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium">
        {label}
      </label>
      <Input
        id={id}
        value={text}
        inputMode="decimal"
        aria-invalid={wrong || undefined}
        className="w-28 font-mono"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (!wrong) onChange(parsed)
          else setText(clock(value))
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !wrong) onChange(parsed)
        }}
      />
    </div>
  )
}

/** Keep or cut parts of the selected video, on a timeline over the player. */
export function TrimPanel({
  duration,
  frameRate,
  keyframes,
  trim,
  onTrim,
  onExact,
  onUndo,
  player,
  onFrame,
  saving,
}: {
  duration: number
  frameRate: number | null
  keyframes: number[] | null
  trim: Trim | null
  onTrim: (parts: Part[]) => void
  onExact: (exact: boolean) => void
  onUndo: (back: boolean) => void
  player: RefObject<HTMLVideoElement | null>
  onFrame: (time: number) => void
  saving: boolean
}) {
  const ids = useId()
  const parts = trim?.parts ?? whole(duration)
  const time = usePlayhead(player)
  const [selection, setSelection] = useState<Part>({ start: 0, end: duration })
  const [previewing, setPreviewing] = useState(false)
  const frame = 1 / (frameRate ?? 30)

  // Playing what is kept: the cut parts are stepped over, on a timer.
  useEffect(() => {
    if (!previewing) return
    const video = player.current
    if (!video) return
    const timer = setInterval(() => {
      if (video.paused) return
      const now = video.currentTime
      if (retime(now, parts) !== null) return
      const next = parts.find((part) => part.start > now)
      if (next) moveTo(video, next.start)
      else {
        video.pause()
        setPreviewing(false)
      }
    }, 40)
    return () => clearInterval(timer)
  }, [previewing, parts, player])

  const seek = (to: number) => {
    const video = player.current
    if (video) moveTo(video, Math.max(0, Math.min(duration, to)))
  }
  const keep = () =>
    onTrim(keepOnly(parts, selection.start, selection.end, duration))
  const cut = () =>
    onTrim(cutOut(parts, selection.start, selection.end, duration))
  const select = (change: Partial<Part>) =>
    setSelection((current) => ({ ...current, ...change }))

  function onKey(event: React.KeyboardEvent) {
    if (ownKey(event.target as HTMLElement, event.key)) return
    const action = keyAction(event)
    if (!action) return
    event.preventDefault()
    const video = player.current
    const at = video?.currentTime ?? 0
    if (action === "play") {
      if (video?.paused) void video.play()
      else video?.pause()
    } else if (action === "back") seek(at - frame)
    else if (action === "forward") seek(at + frame)
    else if (action === "back-more") seek(at - NUDGE_MORE)
    else if (action === "forward-more") seek(at + NUDGE_MORE)
    else if (action === "skip-back") seek(at - SKIP)
    else if (action === "skip-forward") seek(at + SKIP)
    else if (action === "start") seek(0)
    else if (action === "end") seek(duration)
    else if (action === "mark-in") select({ start: at })
    else if (action === "mark-out") select({ end: at })
    else if (action === "clear") setSelection({ start: 0, end: duration })
    else if (action === "keep") keep()
    else if (action === "cut") cut()
    else if (action === "undo") onUndo(true)
    else if (action === "redo") onUndo(false)
    else onFrame(at)
  }

  const percent = (value: number) => `${(value / duration) * 100}%`
  const [low, high] =
    selection.start <= selection.end
      ? [selection.start, selection.end]
      : [selection.end, selection.start]
  const ticks = keyframes && keyframes.length <= 400 ? keyframes : []
  const length = keptLength(parts)

  return (
    <div
      className="space-y-3 rounded-lg border p-3"
      data-testid="trim-panel"
      onKeyDown={onKey}
      // A group the keys work in; its controls are reached with Tab.
      role="group"
      aria-labelledby={`${ids}-title`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${ids}-title`} className="font-heading text-base font-medium">
          Trim
        </h3>
        <p className="text-xs text-muted-foreground" data-testid="trim-summary">
          {isWhole(parts, duration)
            ? `The whole video: ${clock(duration)}.`
            : `Keeping ${parts.length} ${parts.length === 1 ? "part" : "parts"}: ${clock(length)} of ${clock(duration)}.`}
        </p>
      </div>

      <div
        className="relative h-10 overflow-hidden rounded-md bg-muted"
        aria-hidden="true"
        data-testid="trim-timeline"
        onPointerDown={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          seek(((event.clientX - box.left) / box.width) * duration)
        }}
      >
        {parts.map((part) => (
          <div
            key={`${part.start}-${part.end}`}
            className="absolute inset-y-0 bg-primary/25"
            style={{
              left: percent(part.start),
              width: percent(part.end - part.start),
            }}
          />
        ))}
        <div
          className="absolute inset-y-1 rounded-sm border-2 border-primary"
          style={{ left: percent(low), width: percent(high - low) }}
        />
        {ticks.map((key) => (
          <div
            key={key}
            className="absolute bottom-0 h-2 w-px bg-foreground/40"
            style={{ left: percent(key) }}
          />
        ))}
        <div
          className="absolute inset-y-0 w-0.5 bg-foreground"
          style={{ left: percent(Math.min(time, duration)) }}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium">
          <span>Playhead {clock(time)}</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={frame}
            value={Math.min(time, duration)}
            onChange={(event) => seek(event.target.valueAsNumber)}
            className="block w-full accent-primary"
            aria-valuetext={clock(time)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>Selection start</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={frame}
            value={selection.start}
            onChange={(event) => select({ start: event.target.valueAsNumber })}
            className="block w-full accent-primary"
            aria-valuetext={clock(selection.start)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>Selection end</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={frame}
            value={selection.end}
            onChange={(event) => select({ end: event.target.valueAsNumber })}
            className="block w-full accent-primary"
            aria-valuetext={clock(selection.end)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <TimeField
          label="Start"
          value={selection.start}
          duration={duration}
          onChange={(start) => select({ start })}
        />
        <TimeField
          label="End"
          value={selection.end}
          duration={duration}
          onChange={(end) => select({ end })}
        />
        <Button variant="outline" onClick={() => select({ start: time })}>
          Start here (I)
        </Button>
        <Button variant="outline" onClick={() => select({ end: time })}>
          End here (O)
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={keep} disabled={high - low < 0.1}>
          <IconScissors aria-hidden="true" /> Keep the selection
        </Button>
        <Button variant="outline" onClick={cut} disabled={high - low < 0.1}>
          <IconCut aria-hidden="true" /> Cut it out
        </Button>
        <Button
          variant="ghost"
          onClick={() => onUndo(true)}
          disabled={!trim?.undo.length}
          aria-label="Undo"
        >
          <IconArrowBackUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => onUndo(false)}
          disabled={!trim?.redo.length}
          aria-label="Redo"
        >
          <IconArrowForwardUp aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setPreviewing(true)
            const video = player.current
            if (!video) return
            moveTo(video, sourceTime(0, parts))
            void video.play()
          }}
        >
          <IconPlayerPlay aria-hidden="true" /> Play what is kept
        </Button>
        <Button
          variant="outline"
          onClick={() => onFrame(time)}
          disabled={saving}
        >
          <IconCamera aria-hidden="true" />
          {saving ? "Saving the frame…" : "Save this frame"}
        </Button>
      </div>

      <ChoiceChips
        label="How it is cut"
        hint={
          trim?.exact
            ? "Exact: cut to the frame and the sound to the sample. The picture is encoded again."
            : "Lossless: the picture is copied as it is, so nothing is lost and it is quick; a part can only begin and end where the video holds a whole picture (a keyframe, shown under the timeline), and an MP4 or MOV starts exactly where asked."
        }
        value={trim?.exact ? "exact" : "lossless"}
        onValueChange={(value) => onExact(value === "exact")}
        options={[
          { value: "lossless", label: "Lossless" },
          { value: "exact", label: "Exact" },
        ]}
      />

      {!isWhole(parts, duration) && (
        <ul className="text-xs text-muted-foreground" aria-label="Parts kept">
          {parts.map((part) => (
            <li key={`${part.start}-${part.end}`}>
              <button
                type="button"
                className="inline-flex min-h-11 items-center underline-offset-2 hover:underline md:min-h-6"
                onClick={() => seek(part.start)}
              >
                {clock(part.start)} to {clock(part.end)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
