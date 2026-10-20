"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBell,
  IconCut,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconRepeat,
  IconScissors,
  IconTrendingDown,
  IconTrendingUp,
  IconVolume,
  IconVolume3,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  apply,
  editedBy,
  editsKey,
  gainAt,
  lengthOf,
  MOST_GAIN,
  outputAt,
  piecesOf,
  sourceAt,
  stepProblem,
  stepSaid,
  type Curve,
  type Step,
} from "@/lib/audio/edits"
import type { OutputFormat } from "@/lib/audio/formats"
import { clockLabel, parseClock, timeLabel } from "@/lib/audio/labels"
import { dbLabel, loudnessSaid } from "@/lib/audio/level"
import {
  KEPT_PAUSE,
  PAUSES,
  shortenPauses,
  SILENCE_LEVELS,
  silentRuns,
  trimEnds,
} from "@/lib/audio/silence"
import {
  decibels,
  loudnessOfParts,
  SEGMENTS_PER_SECOND,
  shortTerm,
  type LoudnessMap,
} from "@/lib/audio/loudness"
import type { Peaks } from "@/lib/audio/peaks"
import { playFrom } from "@/lib/audio/playback"
import {
  ringtonePart,
  RINGTONES,
  ringtoneSteps,
  type RingtoneKind,
} from "@/lib/audio/ringtone"
import {
  keyAction,
  NUDGE,
  NUDGE_MORE,
  SKIP,
  type KeyAction,
} from "@/lib/audio/shortcuts"
import { columnsOf, ticksOf, windowAround } from "@/lib/audio/view"

/** What the editor is opened for: everything, trimming, or making a ringtone. */
export type EditorFocus = "edit" | "trim" | "ringtone"

interface Part {
  from: number
  to: number
}

/** Within this many pixels of a selection's edge, a drag moves that edge. */
const GRAB = 8
/** A press that moves less than this is a click, not a drag. */
const CLICK = 4
/** Silence at an end this long or more is offered to trim, in seconds. */
const ENDS_AT_LEAST = 0.2
/** How often, while playing, cuts are skipped and loudness followed. */
const TICK_MS = 10
/** The narrowest view, in seconds. */
const NARROWEST = 0.05

const CURVES: { value: Curve; label: string }[] = [
  { value: "linear", label: "Even" },
  { value: "power", label: "Smooth" },
  { value: "s-curve", label: "S-curve" },
]

/** Read a colour the theme gives a CSS variable, for drawing on a canvas. */
function themeColour(element: Element, name: string) {
  return (
    getComputedStyle(element).getPropertyValue(name).trim() || "currentColor"
  )
}

/** The quietest the loudness graph shows, in LUFS; its top is 0. */
const GRAPH_FLOOR = -60

/** A ruler mark's words, as fine as its step. */
function tickLabel(seconds: number, step: number) {
  if (step >= 1) return timeLabel(seconds)
  if (step >= 0.1) return timeLabel(seconds, true)
  return clockLabel(seconds)
}

/** The page plays through this, so that cuts are skipped and fades heard. */
interface Graph {
  context: AudioContext
  gain: GainNode
}

/**
 * The waveform editor: a zoomable view of the sound as edited, a part chosen
 * with the pointer, the keys or the time fields, and the steps that change
 * it. The steps are kept by the workspace; this shows them and adds to them.
 * Playing here is a preview of the edits, from the file itself.
 */
export function SoundEditor({
  name,
  duration,
  peaks,
  url,
  changes,
  canRedo,
  focus,
  onChange,
  onUndo,
  onRedo,
  onReset,
  onFormat,
  loudness = null,
}: {
  name: string
  /** The source's length, in seconds. */
  duration: number
  peaks: Peaks | null
  /** The file, to play. */
  url: string | null
  /** The changes made, each one or more steps. */
  changes: Step[][]
  canRedo: boolean
  focus: EditorFocus
  onChange: (steps: Step[]) => void
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  /** Choose the format a ringtone is written in. */
  onFormat: (format: OutputFormat) => void
  /** The file's loudness, 100 ms at a time, when it has been measured. */
  loudness?: LoudnessMap | null
}) {
  const id = useId()
  const steps = useMemo(() => changes.flat(), [changes])
  const edited = useMemo(() => editedBy(duration, steps), [duration, steps])
  const length = lengthOf(edited)

  const [view, setView] = useState<Part>({ from: 0, to: length })
  const [selection, setSelection] = useState<Part | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState<Part | null>(null)
  const [loop, setLoop] = useState(false)
  const [curve, setCurve] = useState<Curve>("s-curve")
  const [gainText, setGainText] = useState("3")
  const [announced, announce] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [ringtone, setRingtone] = useState<RingtoneKind>("iphone")
  const [pixels, setPixels] = useState(0)

  const area = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const graph = useRef<Graph | null>(null)
  const frame = useRef(0)
  const drag = useRef<{
    edge: "from" | "to" | "new"
    anchor: number
    x: number
    moved: boolean
  } | null>(null)
  // The newest state, for the playing loop and the window's listeners.
  const live = useRef({ edited, length, playing, loop, view })
  useEffect(() => {
    live.current = { edited, length, playing, loop, view }
  })

  // A change of the sound keeps the view, playhead and selection inside it.
  // The selection was in the old times: it is let go.
  // Compared by what they say: the page may hand over an equal list anew.
  const key = editsKey(steps)
  const lastSteps = useRef({ key, length })
  useEffect(() => {
    const last = lastSteps.current
    if (last.key === key) return
    lastSteps.current = { key, length }
    setSelection(null)
    setPlayhead((at) => Math.min(at, length))
    // A view of all of it stays all of it; a closer one stays where it was, inside.
    setView((had) => {
      const width = had.to - had.from
      if ((had.from <= 0 && had.to >= last.length - 1e-9) || width >= length)
        return { from: 0, to: length }
      const from = Math.min(had.from, length - width)
      return { from, to: from + width }
    })
  }, [key, length])

  // The canvas follows its width.
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const measure = () => setPixels(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const span = Math.max(view.to - view.from, 1e-9)
  const columns = Math.max(
    1,
    Math.round(
      pixels * (typeof window === "undefined" ? 1 : window.devicePixelRatio)
    )
  )
  // Short-term loudness under the waveform, where the edited sound plays.
  const series = useMemo(
    () => (loudness ? shortTerm(loudness) : null),
    [loudness]
  )
  const chart = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = chart.current
    if (!element || !series) return
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(element.clientWidth * ratio))
    const height = Math.max(1, Math.round(element.clientHeight * ratio))
    element.width = width
    element.height = height
    const context = element.getContext("2d")
    if (!context) return
    context.clearRect(0, 0, width, height)
    context.fillStyle = themeColour(element, "--primary")
    for (let x = 0; x < width; x++) {
      const time = view.from + ((x + 0.5) / width) * (view.to - view.from)
      const source = sourceAt(edited, time)
      const segment = Math.min(
        series.length - 1,
        Math.floor(source * SEGMENTS_PER_SECOND)
      )
      const level = series[segment] + decibels(gainAt(edited, source))
      if (!(level > GRAPH_FLOOR)) continue
      const top = height * (Math.min(0, level) / GRAPH_FLOOR)
      context.fillRect(x, top, 1, height - top)
    }
  }, [series, edited, view, pixels])

  // The meter for the part chosen, as measured in the file.
  const chosen = useMemo(
    () =>
      loudness && selection
        ? loudnessOfParts(
            loudness,
            piecesOf(edited, selection.from, selection.to).map(
              (piece) => [piece.from, piece.to] as const
            )
          )
        : null,
    [loudness, selection, edited]
  )

  const shown = useMemo(
    () =>
      peaks && length > 0
        ? columnsOf(peaks, duration, edited, view.from, view.to, columns)
        : null,
    [peaks, duration, edited, view, columns, length]
  )

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(element.clientWidth * ratio))
    const height = Math.max(1, Math.round(element.clientHeight * ratio))
    element.width = width
    element.height = height
    const context = element.getContext("2d")
    if (!context) return
    context.clearRect(0, 0, width, height)
    const middle = height / 2
    if (!shown) {
      context.fillStyle = themeColour(element, "--muted-foreground")
      context.fillRect(0, Math.floor(middle), width, Math.max(1, ratio))
      return
    }
    context.fillStyle = themeColour(element, "--primary")
    for (let x = 0; x < width; x++) {
      const index = Math.min(
        shown.max.length - 1,
        Math.floor((x / width) * shown.max.length)
      )
      const top = middle - shown.max[index] * middle * 0.95
      const bottom = middle - shown.min[index] * middle * 0.95
      context.fillRect(x, top, 1, Math.max(ratio, bottom - top))
    }
  }, [shown, pixels])

  const timeAt = useCallback(
    (clientX: number) => {
      const box = area.current!.getBoundingClientRect()
      const fraction = Math.min(
        1,
        Math.max(0, (clientX - box.left) / Math.max(1, box.width))
      )
      return Math.min(length, Math.max(0, view.from + fraction * span))
    },
    [length, view.from, span]
  )
  const xOf = (time: number) => ((time - view.from) / span) * 100

  /** Keep a moment in view, moving the view the least. */
  const reveal = useCallback((time: number) => {
    const { view: now, length: total } = live.current
    const width = now.to - now.from
    if (time >= now.from && time <= now.to) return
    const from = Math.min(
      Math.max(0, time < now.from ? time : time - width),
      Math.max(0, total - width)
    )
    setView({ from, to: from + width })
  }, [])

  // Playing ----------------------------------------------------------------

  // A timer, not animation frames: those stop in a tab that is not shown,
  // and the sound would then play on through what was cut.
  const stopFrame = () => window.clearTimeout(frame.current)

  const pause = useCallback(() => {
    stopFrame()
    audio.current?.pause()
    setPlaying(null)
  }, [])

  // Each frame: past what was cut, as loud as the edits make it, and stopped
  // (or looped) at the end of what is being played.
  const tick = useRef(() => {})
  useEffect(() => {
    tick.current = () => {
      const element = audio.current
      const { edited: now, playing: part, loop: looping } = live.current
      if (!element || !part) return
      let source = element.currentTime
      const next = playFrom(now, source)
      let at = next === null ? Infinity : (outputAt(now, next) ?? 0)
      if (at >= part.to - 0.005 || element.ended) {
        if (looping) {
          source = sourceAt(now, part.from)
          element.currentTime = source
          at = part.from
          if (element.paused) void element.play().catch(() => undefined)
        } else {
          pause()
          setPlayhead(part.from)
          return
        }
      } else if (next !== null && next - source > 0.003) {
        element.currentTime = next
        source = next
      }
      const sound = graph.current
      if (sound)
        sound.gain.gain.setTargetAtTime(
          gainAt(now, source),
          sound.context.currentTime,
          0.005
        )
      setPlayhead(at)
      reveal(at)
      frame.current = window.setTimeout(() => tick.current(), TICK_MS)
    }
  }, [pause, reveal])

  const play = useCallback((part: Part) => {
    const element = audio.current
    if (!element || part.to - part.from <= 0) return
    // The page's sound goes through a gain, made on the first press (a
    // phone allows sound to start only from one).
    if (!graph.current && typeof AudioContext !== "undefined") {
      try {
        const context = new AudioContext()
        const gain = context.createGain()
        context.createMediaElementSource(element).connect(gain)
        gain.connect(context.destination)
        graph.current = { context, gain }
      } catch {
        // Without it the preview plays at the file's own loudness.
      }
    }
    const source = sourceAt(live.current.edited, part.from)
    element.currentTime = source
    if (graph.current) {
      graph.current.gain.gain.value = gainAt(live.current.edited, source)
      void graph.current.context.resume()
    }
    live.current.playing = part
    setPlaying(part)
    element.play().then(
      () => {
        stopFrame()
        frame.current = window.setTimeout(() => tick.current(), TICK_MS)
      },
      () => {
        setPlaying(null)
        setRefused("This browser would not play the sound.")
      }
    )
  }, [])

  useEffect(() => () => stopFrame(), [])
  useEffect(
    () => () => {
      void graph.current?.context.close()
    },
    []
  )
  // Another file, or a change while playing: playing stops.
  useEffect(() => pause, [url, pause])

  const togglePlay = () => {
    if (playing) return pause()
    const from = playhead >= length - 0.01 ? 0 : playhead
    play({ from, to: length })
  }
  const playSelection = () => {
    if (!selection) return
    if (playing) pause()
    play(selection)
  }

  /** Move the playhead, and the sound with it when it plays. */
  const moveTo = useCallback(
    (time: number) => {
      const at = Math.min(live.current.length, Math.max(0, time))
      setPlayhead(at)
      reveal(at)
      const part = live.current.playing
      if (part && audio.current) {
        if (at >= part.to || at < part.from) {
          pause()
          return
        }
        audio.current.currentTime = sourceAt(live.current.edited, at)
      }
    },
    [pause, reveal]
  )

  // Steps -------------------------------------------------------------------

  const make = (made: Step[], words?: string) => {
    let check = edited
    for (const step of made) {
      const problem = stepProblem(step, lengthOf(check))
      if (problem) {
        setRefused(problem)
        return
      }
      check = apply(check, step)
    }
    pause()
    setRefused(null)
    announce(words ?? made.map(stepSaid).join("; "))
    onChange(made)
  }

  const onPart = (kind: "keep" | "cut" | "silence") => {
    if (!selection) {
      setRefused("Choose a part of the sound first.")
      return
    }
    make([{ do: kind, ...selection }])
  }

  const fade = (direction: "in" | "out") => {
    if (!selection) {
      setRefused("Choose a part of the sound first.")
      return
    }
    make([{ do: "fade", ...selection, direction, curve }])
  }

  const db = Number(gainText.replace(",", "."))
  const changeVolume = () => {
    const part = selection ?? { from: 0, to: length }
    if (!Number.isFinite(db) || gainText.trim() === "") {
      setRefused("Type how many decibels, such as 3 or −6.")
      return
    }
    make([{ do: "gain", ...part, db }])
  }

  // Silence, found in the sound as edited.
  const [silentUnder, setSilentUnder] = useState<number>(-50)
  const [pauseOver, setPauseOver] = useState<number>(1)
  const runs = useMemo(
    () =>
      peaks && length > 0
        ? silentRuns(peaks, duration, edited, silentUnder, ENDS_AT_LEAST)
        : [],
    [peaks, duration, edited, length, silentUnder]
  )
  const ends = trimEnds(runs, length)
  const pauses = shortenPauses(runs, length, pauseOver)

  const makeRingtone = () => {
    const part = ringtonePart(ringtone, playhead, selection, length)
    onFormat(RINGTONES[ringtone].format)
    make(
      ringtoneSteps(part, length),
      `Made a ${RINGTONES[ringtone].label.toLowerCase()} of ${clockLabel(part.from)}–${clockLabel(part.to)}, faded at its ends`
    )
  }

  // Zoom -------------------------------------------------------------------

  const zoom = (factor: number, centre?: number) => {
    const middle =
      centre ??
      (selection
        ? (selection.from + selection.to) / 2
        : playhead >= view.from && playhead <= view.to
          ? playhead
          : (view.from + view.to) / 2)
    const wanted = Math.min(length, Math.max(NARROWEST, span * factor))
    // Zooming about a point keeps that point under the pointer.
    const fraction = centre === undefined ? 0.5 : (centre - view.from) / span
    const from = Math.min(
      Math.max(0, middle - wanted * fraction),
      Math.max(0, length - wanted)
    )
    setView(
      centre === undefined
        ? windowAround(middle, wanted, length)
        : { from, to: from + wanted }
    )
  }
  const fit = () => setView({ from: 0, to: length })
  const zoomed = span < length - 1e-6

  // The wheel zooms with Ctrl or ⌘ (and a trackpad's pinch), and pans sideways.
  useEffect(() => {
    const element = area.current
    if (!element) return
    function wheel(event: WheelEvent) {
      const { view: now, length: total } = live.current
      const width = now.to - now.from
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const box = element!.getBoundingClientRect()
        const at = now.from + ((event.clientX - box.left) / box.width) * width
        const wanted = Math.min(
          total,
          Math.max(NARROWEST, width * Math.exp(event.deltaY * 0.01))
        )
        const fraction = (at - now.from) / width
        const from = Math.min(
          Math.max(0, at - wanted * fraction),
          Math.max(0, total - wanted)
        )
        setView({ from, to: from + wanted })
        return
      }
      const sideways = event.shiftKey ? event.deltaY : event.deltaX
      if (Math.abs(sideways) < 1 || width >= total) return
      event.preventDefault()
      const box = element!.getBoundingClientRect()
      const from = Math.min(
        Math.max(0, now.from + (sideways / box.width) * width),
        total - width
      )
      setView({ from, to: from + width })
    }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  }, [])

  // The pointer ------------------------------------------------------------

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || length <= 0) return
    const at = timeAt(event.clientX)
    const box = area.current!.getBoundingClientRect()
    const near = (time: number) =>
      Math.abs(
        ((time - view.from) / span) * box.width + box.left - event.clientX
      ) <= GRAB
    let edge: "from" | "to" | "new" = "new"
    let anchor = at
    if (selection && near(selection.to)) {
      edge = "to"
      anchor = selection.from
    } else if (selection && near(selection.from)) {
      edge = "from"
      anchor = selection.to
    }
    drag.current = { edge, anchor, x: event.clientX, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
  }

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current
    if (!held) return
    if (!held.moved && Math.abs(event.clientX - held.x) < CLICK) return
    held.moved = true
    const at = timeAt(event.clientX)
    setSelection({
      from: Math.min(held.anchor, at),
      to: Math.max(held.anchor, at),
    })
  }

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current
    drag.current = null
    if (!held) return
    if (!held.moved) {
      // A click puts the playhead there; a click outside the part lets it go.
      const at = timeAt(event.clientX)
      if (selection && (at < selection.from || at > selection.to))
        setSelection(null)
      moveTo(at)
    } else
      setSelection((had) => (had && had.to - had.from < 0.001 ? null : had))
  }

  // The keys -----------------------------------------------------------------

  const run = (action: KeyAction) => {
    switch (action) {
      case "play":
        return togglePlay()
      case "play-selection":
        return playSelection()
      case "back":
        return moveTo(playhead - NUDGE)
      case "forward":
        return moveTo(playhead + NUDGE)
      case "back-more":
        return moveTo(playhead - NUDGE_MORE)
      case "forward-more":
        return moveTo(playhead + NUDGE_MORE)
      case "skip-back":
        return moveTo(playhead - SKIP)
      case "skip-forward":
        return moveTo(playhead + SKIP)
      case "start":
        return moveTo(0)
      case "end":
        return moveTo(length)
      case "mark-in":
        return setSelection((had) => ({
          from: Math.min(playhead, had?.to ?? length),
          to: had && had.to > playhead ? had.to : length,
        }))
      case "mark-out":
        return setSelection((had) => ({
          from: had && had.from < playhead ? had.from : 0,
          to: Math.max(playhead, had?.from ?? 0),
        }))
      case "select-all":
        return setSelection({ from: 0, to: length })
      case "clear":
        return setSelection(null)
      case "cut":
        return onPart("cut")
      case "undo":
        pause()
        return onUndo()
      case "redo":
        pause()
        return onRedo()
      case "zoom-in":
        return zoom(0.5)
      case "zoom-out":
        return zoom(2)
      case "zoom-fit":
        return fit()
    }
  }

  const keyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const action = keyAction(event)
    if (!action) return
    const target = event.target as HTMLElement
    const onWave = target === area.current
    // Elsewhere in the editor only undo and redo are taken, and never from a field.
    if (!onWave) {
      if (target.closest("input, textarea, select")) return
      if (action !== "undo" && action !== "redo") return
    }
    event.preventDefault()
    run(action)
  }

  // Exact times ----------------------------------------------------------------

  // A field shows the selection, or what is being typed into it.
  const [typing, setTyping] = useState<{
    which: "from" | "to"
    text: string
  } | null>(null)
  const fieldText = (which: "from" | "to") =>
    typing?.which === which
      ? typing.text
      : selection
        ? clockLabel(selection[which])
        : ""
  const startText = fieldText("from")
  const endText = fieldText("to")
  const setStartText = (text: string) => setTyping({ which: "from", text })
  const setEndText = (text: string) => setTyping({ which: "to", text })

  const commitTime = (which: "from" | "to", text: string) => {
    setTyping(null)
    if (text.trim() === "") return
    const time = parseClock(text)
    if (time === null || time > length + 1e-9) {
      setRefused(
        `Type a time from 0:00.000 to ${clockLabel(length)}, such as 1:05.5.`
      )
      return
    }
    setRefused(null)
    const had = selection ?? { from: 0, to: length }
    const next = { ...had, [which]: time }
    if (next.from > next.to) {
      setRefused("The start must come before the end.")
      return
    }
    setSelection(next)
    reveal(time)
  }

  const selectionSaid = selection
    ? `Selected ${clockLabel(selection.from)} to ${clockLabel(selection.to)}, ${(
        selection.to - selection.from
      ).toFixed(3)} seconds.`
    : "Nothing selected."

  const ticks = pixels > 0 ? ticksOf(view.from, view.to, pixels) : null
  // Where kept parts meet: what was cut lies between.
  const joins = useMemo(() => {
    const found: number[] = []
    let at = 0
    for (const [from, to] of edited.segments.slice(0, -1)) {
      at += to - from
      found.push(at)
    }
    return found
  }, [edited])

  const hint = `${id}-hint`
  const kind = RINGTONES[ringtone]

  return (
    <div className="space-y-3" data-testid="sound-editor" onKeyDown={keyDown}>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="auto"
          className="hidden"
          data-testid="editor-audio"
          onEnded={() => {
            if (!live.current.loop) {
              stopFrame()
              setPlaying(null)
            }
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={togglePlay}
          disabled={!url || length <= 0}
        >
          {playing ? (
            <IconPlayerPause data-icon="inline-start" aria-hidden="true" />
          ) : (
            <IconPlayerPlay data-icon="inline-start" aria-hidden="true" />
          )}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={playSelection}
          disabled={!url || !selection}
        >
          Play the selection
        </Button>
        <Button
          type="button"
          variant={loop ? "secondary" : "ghost"}
          aria-pressed={loop}
          onClick={() => setLoop((had) => !had)}
        >
          <IconRepeat data-icon="inline-start" aria-hidden="true" />
          Loop
        </Button>
        <span
          className="ml-auto font-mono text-sm tabular-nums"
          data-testid="editor-time"
        >
          {clockLabel(playhead)} / {clockLabel(length)}
        </span>
      </div>

      <div className="space-y-1">
        <div
          className="relative h-5 overflow-hidden text-xs text-muted-foreground"
          aria-hidden="true"
        >
          {ticks?.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute top-0 border-l border-border pl-1 whitespace-nowrap"
              style={{ left: `${xOf(tick)}%` }}
            >
              {tickLabel(tick, ticks.step)}
            </span>
          ))}
        </div>
        <div
          ref={area}
          role="slider"
          tabIndex={0}
          aria-label={`Playhead in ${name}`}
          aria-describedby={hint}
          aria-valuemin={0}
          aria-valuemax={Math.round(length * 1000) / 1000}
          aria-valuenow={Math.round(playhead * 1000) / 1000}
          aria-valuetext={`${clockLabel(playhead)} of ${clockLabel(length)}`}
          className="relative h-32 cursor-text touch-pan-y overflow-hidden rounded-lg border bg-muted/40 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
          data-testid="waveform-area"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            drag.current = null
          }}
        >
          <canvas
            ref={canvas}
            className="absolute inset-0 size-full"
            data-testid="waveform"
            aria-hidden="true"
          />
          {joins.map((join) =>
            join >= view.from && join <= view.to ? (
              <span
                key={join}
                className="absolute inset-y-0 border-l border-dashed border-foreground/40"
                style={{ left: `${xOf(join)}%` }}
                aria-hidden="true"
              />
            ) : null
          )}
          {selection &&
            selection.to > view.from &&
            selection.from < view.to && (
              <span
                className="absolute inset-y-0 border-x-2 border-primary bg-primary/15"
                style={{
                  left: `${Math.max(0, xOf(selection.from))}%`,
                  width: `${Math.min(100, xOf(selection.to)) - Math.max(0, xOf(selection.from))}%`,
                }}
                data-testid="editor-selection"
                aria-hidden="true"
              />
            )}
          {playhead >= view.from && playhead <= view.to && (
            <span
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground"
              style={{ left: `${xOf(playhead)}%` }}
              aria-hidden="true"
            />
          )}
          {!peaks && (
            <span className="absolute inset-x-0 bottom-2 text-center text-xs text-muted-foreground">
              Drawing the waveform…
            </span>
          )}
        </div>
        {series && (
          <canvas
            ref={chart}
            className="h-10 w-full rounded-md border bg-muted/40"
            aria-hidden="true"
            data-testid="loudness-graph"
          />
        )}
        <p id={hint} className="text-xs text-muted-foreground">
          Drag across the waveform to choose a part, or click to move the
          playhead. On the waveform: Space plays, I and O start and end the part
          at the playhead, Delete cuts it out.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => zoom(0.5)}
          aria-label="Zoom in"
          disabled={span <= NARROWEST + 1e-9}
        >
          <IconZoomIn aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => zoom(2)}
          aria-label="Zoom out"
          disabled={!zoomed}
        >
          <IconZoomOut aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={fit}
          aria-label="Show all of it"
          disabled={!zoomed}
        >
          <IconZoomReset aria-hidden="true" />
        </Button>
        {zoomed && (
          <input
            type="range"
            aria-label="Scroll along the sound"
            className="h-11 min-w-32 flex-1 accent-primary md:h-9"
            min={0}
            max={Math.max(0, length - span)}
            step={span / 100}
            value={view.from}
            onChange={(event) => {
              const from = Number(event.target.value)
              setView({ from, to: from + span })
            }}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor={`${id}-start`}>Start</Label>
          <Input
            id={`${id}-start`}
            inputMode="decimal"
            autoComplete="off"
            value={startText}
            onChange={(event) => setStartText(event.target.value)}
            onBlur={() => commitTime("from", startText)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitTime("from", startText)
            }}
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-end`}>End</Label>
          <Input
            id={`${id}-end`}
            inputMode="decimal"
            autoComplete="off"
            value={endText}
            onChange={(event) => setEndText(event.target.value)}
            onBlur={() => commitTime("to", endText)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitTime("to", endText)
            }}
            className="font-mono"
          />
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => setSelection({ from: 0, to: length })}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSelection(null)}
            disabled={!selection}
          >
            Clear
          </Button>
        </div>
      </div>
      <p
        className="text-sm text-muted-foreground"
        aria-live="polite"
        data-testid="editor-selection-said"
      >
        {selectionSaid}
      </p>
      {chosen && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="editor-loudness"
        >
          <span className="font-medium text-foreground">
            Loudness of the selection:
          </span>{" "}
          {loudnessSaid(chosen)}
          {edited.effects.length > 0 &&
            " (as in the file, before fades and volume changes)"}
        </p>
      )}

      {focus === "ringtone" && (
        <RingtonePanel
          kind={ringtone}
          onKind={setRingtone}
          onMake={makeRingtone}
          length={length}
        />
      )}

      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">
          {selection ? "Change the selection" : "Choose a part to change it"}
        </legend>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => onPart("keep")}
            disabled={!selection}
          >
            <IconScissors data-icon="inline-start" aria-hidden="true" />
            Keep only this
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onPart("cut")}
            disabled={!selection}
          >
            <IconCut data-icon="inline-start" aria-hidden="true" />
            Cut out
          </Button>
          {focus !== "trim" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onPart("silence")}
              disabled={!selection}
            >
              <IconVolume3 data-icon="inline-start" aria-hidden="true" />
              Silence
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => fade("in")}
            disabled={!selection}
          >
            <IconTrendingUp data-icon="inline-start" aria-hidden="true" />
            Fade in
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fade("out")}
            disabled={!selection}
          >
            <IconTrendingDown data-icon="inline-start" aria-hidden="true" />
            Fade out
          </Button>
        </div>
        <ChoiceChips
          label="Fade shape"
          value={curve}
          onValueChange={setCurve}
          options={CURVES}
        />
        {focus !== "trim" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-gain`}>
                {selection ? "Volume of the selection" : "Volume of all of it"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${id}-gain`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={gainText}
                  onChange={(event) => setGainText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") changeVolume()
                  }}
                  aria-describedby={`${id}-gain-hint`}
                  className="w-24 font-mono"
                />
                <span className="text-sm text-muted-foreground">dB</span>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={changeVolume}>
              <IconVolume data-icon="inline-start" aria-hidden="true" />
              {Number.isFinite(db) && db < 0 ? "Make quieter" : "Make louder"}
            </Button>
            <p
              id={`${id}-gain-hint`}
              className="w-full text-xs text-muted-foreground"
            >
              Up to {MOST_GAIN} dB either way; 6 dB is about twice as loud in
              its peaks. Louder can clip: listen before you download.
            </p>
          </div>
        )}
      </fieldset>

      {focus !== "ringtone" && (
        <fieldset
          className="space-y-3 rounded-lg border p-3"
          data-testid="silence-panel"
        >
          <legend className="px-1 text-sm font-medium">Silence</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <ChoiceChips
              label="Silent under"
              value={String(silentUnder)}
              onValueChange={(value) => setSilentUnder(Number(value))}
              options={SILENCE_LEVELS.map((level) => ({
                value: String(level),
                label: `${dbLabel(level)} dBFS`,
              }))}
            />
            <ChoiceChips
              label="Pauses longer than"
              value={String(pauseOver)}
              onValueChange={(value) => setPauseOver(Number(value))}
              options={PAUSES.map((pause) => ({
                value: String(pause),
                label: `${pause} s`,
              }))}
            />
          </div>
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            data-testid="silence-found"
          >
            {!peaks
              ? "Looking for silence once the waveform is drawn."
              : [
                  ends
                    ? `Silence at the ends: ${(length - (ends.to - ends.from)).toFixed(1)} s.`
                    : "No silence at the ends.",
                  pauses.steps.length
                    ? `${pauses.steps.length} ${pauses.steps.length === 1 ? "pause" : "pauses"} longer than ${pauseOver} s; shortening ${pauses.steps.length === 1 ? "it" : "them"} to ${KEPT_PAUSE} s takes out ${pauses.removed.toFixed(1)} s.`
                    : `No pauses longer than ${pauseOver} s.`,
                ].join(" ")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!ends}
              onClick={() =>
                ends && make([ends], "Trimmed the silence at the ends")
              }
            >
              Trim silence at the ends
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!pauses.steps.length}
              onClick={() =>
                make(
                  pauses.steps,
                  `Shortened ${pauses.steps.length} ${pauses.steps.length === 1 ? "pause" : "pauses"}, taking out ${pauses.removed.toFixed(1)} s`
                )
              }
            >
              Shorten long pauses
            </Button>
          </div>
        </fieldset>
      )}

      {refused && (
        <p role="alert" className="text-sm text-destructive">
          {refused}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>

      <section aria-labelledby={`${id}-steps`} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${id}-steps`} className="text-sm font-medium">
            Edits
          </h3>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Undo"
              onClick={() => run("undo")}
              disabled={!changes.length}
            >
              <IconArrowBackUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Redo"
              onClick={() => run("redo")}
              disabled={!canRedo}
            >
              <IconArrowForwardUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                pause()
                onReset()
              }}
              disabled={!changes.length}
            >
              <IconRefresh data-icon="inline-start" aria-hidden="true" />
              Start again
            </Button>
          </div>
        </div>
        {changes.length ? (
          <ol
            className="list-decimal space-y-1 pl-5 text-sm"
            data-testid="editor-steps"
          >
            {changes.map((change, index) => (
              <li key={index}>{change.map(stepSaid).join("; ")}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            No edits yet: the file is written as it is. Your file itself is
            never changed.
          </p>
        )}
      </section>
      {focus === "ringtone" && <RingtoneHelp kind={kind.format} />}
    </div>
  )
}

/** Choose a phone and make the ringtone from the selection or the playhead. */
function RingtonePanel({
  kind,
  onKind,
  onMake,
  length,
}: {
  kind: RingtoneKind
  onKind: (kind: RingtoneKind) => void
  onMake: () => void
  length: number
}) {
  const ringtone = RINGTONES[kind]
  return (
    <div
      className="space-y-3 rounded-lg border p-3"
      data-testid="ringtone-panel"
    >
      <ChoiceChips
        label="Ringtone for"
        value={kind}
        onValueChange={onKind}
        options={(Object.keys(RINGTONES) as RingtoneKind[]).map((value) => ({
          value,
          label: RINGTONES[value].label,
        }))}
        hint={
          ringtone.limit
            ? `An iPhone takes at most ${ringtone.seconds} seconds, as M4R. The selection is used, cut to ${ringtone.seconds} s; with none, ${ringtone.seconds} s from the playhead.`
            : `Written as MP3. The selection is used, up to ${ringtone.seconds} s; with none, ${ringtone.seconds} s from the playhead.`
        }
      />
      <Button type="button" onClick={onMake} disabled={length <= 0}>
        <IconBell data-icon="inline-start" aria-hidden="true" />
        Make the ringtone
      </Button>
    </div>
  )
}

/** How to put a ringtone on a phone. */
function RingtoneHelp({ kind }: { kind: OutputFormat }) {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        How to put it on your phone
      </summary>
      {kind === "m4r" ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            With a Mac: connect the iPhone, open it in Finder, and drag the M4R
            file onto its window. It appears in Settings, Sounds &amp; Haptics,
            Ringtone.
          </li>
          <li>
            With Windows: connect the iPhone, open it in iTunes or Apple
            Devices, and drag the file onto the device under Tones.
          </li>
        </ul>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Copy the MP3 into the phone&apos;s Ringtones folder, or open
            Settings, Sound, Ringtone and add it from there. The menus differ a
            little from one phone to another.
          </li>
        </ul>
      )}
    </details>
  )
}
