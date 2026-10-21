"use client"

import { useEffect, useId, useRef, useState } from "react"
import {
  IconMicrophone,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
} from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import {
  floatWavHeader,
  levelOf,
  recordingName,
  Take,
} from "@/lib/audio/record"
import {
  addToDraft,
  clearDraft,
  readDraft,
  startDraft,
  type DraftInfo,
} from "@/lib/audio/record-draft"

type Phase = "idle" | "starting" | "recording" | "paused" | "stopping"

/** Where the level meter starts, in dBFS. */
const FLOOR = -60
/** Peaks this close to full scale are said to be too loud. */
const CLIPPING = -0.5

/** A time as minutes, seconds and tenths. */
function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`
}

/** Why the microphone could not be used, in a sentence. */
function refused(error: unknown) {
  const name = (error as { name?: string })?.name
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The browser was not allowed to use the microphone. Allow it for this site (in the address bar or the browser's settings), then try again."
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found. Plug one in, or choose another, and try again."
  if (name === "NotReadableError")
    return "The microphone is in use by another app, or could not be started. Close the other app and try again."
  return "The microphone could not be started in this browser."
}

interface Live {
  stream: MediaStream
  context: AudioContext
  node: AudioWorkletNode
  take: Take
  started: Date
  wake: { release: () => Promise<void> } | null
}

/** Recording from a microphone, raw, straight into the list of files. */
export function Recorder({ onTake }: { onTake: (file: File) => void }) {
  const ids = useId()
  const [phase, setPhase] = useState<Phase>("idle")
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [device, setDevice] = useState("default")
  const [stereo, setStereo] = useState(false)
  const [clean, setClean] = useState(false)
  const [keepDraft, setKeepDraft] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(FLOOR)
  const [loud, setLoud] = useState(false)
  const [draft, setDraft] = useState<DraftInfo | null>(null)
  const live = useRef<Live | null>(null)
  const paused = useRef(false)
  const shown = useRef(0)

  // A take left by a closed tab is offered back.
  useEffect(() => {
    let gone = false
    readDraft()
      .then((found) => {
        if (!gone && found?.parts.length) setDraft(found.info)
      })
      .catch(() => undefined)
    return () => {
      gone = true
    }
  }, [])

  // Leaving the page ends the take and lets the microphone go.
  useEffect(
    () => () => {
      const now = live.current
      if (!now) return
      now.stream.getTracks().forEach((track) => track.stop())
      void now.context.close()
      void now.wake?.release()
    },
    []
  )

  async function listDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter((one) => one.kind === "audioinput" && one.deviceId))
    } catch {
      setDevices([])
    }
  }

  async function start() {
    setProblem(null)
    setNotice(null)
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      setProblem(
        "This browser cannot record here: recording needs a secure page (https) and a browser that can hand the page its sound."
      )
      return
    }
    setPhase("starting")
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: device === "default" ? undefined : { exact: device },
          echoCancellation: clean,
          noiseSuppression: clean,
          autoGainControl: clean,
          channelCount: stereo ? 2 : 1,
        },
      })
      void listDevices()
      context = new AudioContext()
      await context.resume()
      await context.audioWorklet.addModule("/worklets/capture.js")
      const channels = stereo ? 2 : 1
      const node = new AudioWorkletNode(context, "keepsimp-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: channels,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
      })
      context.createMediaStreamSource(stream).connect(node)
      // Some browsers only run a node whose sound goes somewhere: nowhere audible.
      const silent = context.createGain()
      silent.gain.value = 0
      node.connect(silent).connect(context.destination)
      const started = new Date()
      let index = 0
      const info: DraftInfo = {
        started: started.getTime(),
        sampleRate: context.sampleRate,
        channels,
        frames: 0,
        parts: 0,
      }
      const drafting = keepDraft
      if (drafting)
        await startDraft(info).catch(() =>
          setNotice(
            "The draft could not be kept in this browser; the take goes on."
          )
        )
      const take = new Take(context.sampleRate, channels, (part) => {
        if (!drafting) return
        const at = index++
        void part
          .arrayBuffer()
          .then((buffer) =>
            addToDraft(at, new Uint8Array(buffer), {
              ...info,
              frames: take.frames,
              parts: at + 1,
            })
          )
          .catch(() =>
            setNotice(
              "The draft could not be kept in this browser; the take goes on."
            )
          )
      })
      let wake: Live["wake"] = null
      try {
        wake =
          (await (
            navigator as Navigator & {
              wakeLock?: { request: (kind: "screen") => Promise<Live["wake"]> }
            }
          ).wakeLock?.request("screen")) ?? null
      } catch {
        wake = null
      }
      live.current = { stream, context, node, take, started, wake }
      paused.current = false
      node.port.onmessage = (event: MessageEvent<Float32Array[] | string>) => {
        const planes = event.data
        if (typeof planes === "string" || paused.current) return
        if (!take.push(planes)) {
          setNotice(
            "The take reached the most a WAV file holds, so it was stopped there."
          )
          void stop()
          return
        }
        const { peak } = levelOf(planes)
        if (peak >= CLIPPING) setLoud(true)
        // The page is told ten times a second, not fifty.
        const now = performance.now()
        if (now - shown.current < 100) return
        shown.current = now
        setSeconds(take.seconds)
        setLevel(Math.max(FLOOR, peak))
      }
      setSeconds(0)
      setLoud(false)
      setPhase("recording")
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      void context?.close()
      setProblem(refused(error))
      setPhase("idle")
    }
  }

  function pause() {
    const now = live.current
    if (!now) return
    paused.current = true
    now.take.pause()
    setPhase("paused")
    setLevel(FLOOR)
  }

  function resume() {
    paused.current = false
    setPhase("recording")
  }

  async function stop() {
    const now = live.current
    if (!now) return
    live.current = null
    setPhase("stopping")
    // What the worklet still holds comes first.
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 500)
      const handler = now.node.port.onmessage
      now.node.port.onmessage = (event) => {
        if (event.data === "flushed") {
          window.clearTimeout(timer)
          resolve()
        } else handler?.call(now.node.port, event)
      }
      now.node.port.postMessage("flush")
    })
    now.stream.getTracks().forEach((track) => track.stop())
    await now.context.close().catch(() => undefined)
    await now.wake?.release().catch(() => undefined)
    const wav = now.take.wav()
    onTake(new File([wav], recordingName(now.started), { type: "audio/wav" }))
    await clearDraft().catch(() => undefined)
    setPhase("idle")
    setLevel(FLOOR)
  }

  async function recover() {
    const found = await readDraft().catch(() => null)
    setDraft(null)
    if (!found) return
    const bytes = found.parts.reduce((sum, part) => sum + part.length, 0)
    const frames = Math.floor(bytes / (found.info.channels * 4))
    const header = floatWavHeader(
      frames,
      found.info.sampleRate,
      found.info.channels
    )
    onTake(
      new File(
        [header as BlobPart, ...(found.parts as BlobPart[])],
        recordingName(new Date(found.info.started)),
        { type: "audio/wav" }
      )
    )
    await clearDraft().catch(() => undefined)
  }

  const recording = phase === "recording" || phase === "paused"
  const meterWidth = ((level - FLOOR) / -FLOOR) * 100

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="recorder"
    >
      <h2 id={`${ids}-title`} className="section-title">
        Record
      </h2>

      {draft && (
        <div
          className="space-y-2 rounded-lg border p-3 text-sm"
          data-testid="recorder-draft"
        >
          <p>
            A take from{" "}
            {new Date(draft.started).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            was not finished ({clock(draft.frames / draft.sampleRate)} kept, up
            to the last second before it stopped).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void recover()}>
              Add it to the files
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(null)
                void clearDraft().catch(() => undefined)
              }}
            >
              <IconTrash data-icon="inline-start" aria-hidden="true" />
              Delete it
            </Button>
          </div>
        </div>
      )}

      {!recording && phase !== "stopping" && (
        <div className="space-y-4">
          {devices.length > 1 && (
            <div>
              <label
                htmlFor={`${ids}-device`}
                className="mb-1.5 block text-sm font-medium"
              >
                Microphone
              </label>
              <select
                id={`${ids}-device`}
                value={device}
                onChange={(event) => setDevice(event.target.value)}
                className="h-11 w-full rounded-md border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm dark:bg-input/30"
              >
                {devices.map((one, index) => (
                  <option key={one.deviceId} value={one.deviceId}>
                    {one.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <ChoiceChips
            label="Channels"
            value={stereo ? "stereo" : "mono"}
            onValueChange={(value) => setStereo(value === "stereo")}
            options={[
              { value: "mono", label: "Mono" },
              { value: "stereo", label: "Stereo" },
            ]}
            hint="Mono for a voice. Stereo only when the microphone has two channels; otherwise both sides are the same."
          />
          <ToggleRow
            label="Let the browser clean up the voice"
            hint="Its echo cancelling, noise suppression and automatic level, made for calls. Off, the sound is exactly what the microphone gives."
            checked={clean}
            onCheckedChange={setClean}
          />
          <ToggleRow
            label="Keep a draft while recording"
            hint="The take is kept on this device as it is recorded, so a closed tab or a crash does not lose it; it is deleted when the take is finished. Starts off every time."
            checked={keepDraft}
            onCheckedChange={setKeepDraft}
          />
          <Button
            type="button"
            onClick={() => void start()}
            disabled={phase === "starting"}
          >
            <IconMicrophone data-icon="inline-start" aria-hidden="true" />
            {phase === "starting" ? "Starting the microphone…" : "Record"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The browser asks before the microphone is used. The sound stays on
            this device and goes into the list of files as a WAV, ready to be
            edited and written in any format.
          </p>
        </div>
      )}

      {(recording || phase === "stopping") && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p
              role="status"
              className="text-sm font-medium"
              data-testid="recorder-status"
            >
              {phase === "paused"
                ? "Paused"
                : phase === "stopping"
                  ? "Finishing the take…"
                  : "Recording"}
            </p>
            <p
              className="font-mono text-2xl tabular-nums"
              data-testid="recorder-time"
            >
              {clock(seconds)}
            </p>
          </div>
          <div
            role="meter"
            aria-label="Input level"
            aria-valuemin={FLOOR}
            aria-valuemax={0}
            aria-valuenow={Math.round(level)}
            aria-valuetext={
              level <= FLOOR ? "Silent" : `${Math.round(level)} dB`
            }
            className="h-3 overflow-hidden rounded-full bg-muted"
            data-testid="recorder-level"
          >
            <div
              className={`h-full transition-[width] duration-100 motion-reduce:transition-none ${loud ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${meterWidth}%` }}
            />
          </div>
          {loud && (
            <p className="text-xs text-destructive">
              The sound reached full scale and may be cut off: move back from
              the microphone, or turn its input down.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {phase === "paused" ? (
              <Button type="button" variant="outline" onClick={resume}>
                <IconPlayerPlay data-icon="inline-start" aria-hidden="true" />
                Go on
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={pause}
                disabled={phase === "stopping"}
              >
                <IconPlayerPause data-icon="inline-start" aria-hidden="true" />
                Pause
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void stop()}
              disabled={phase === "stopping"}
            >
              <IconPlayerStop data-icon="inline-start" aria-hidden="true" />
              Stop and keep
            </Button>
          </div>
        </div>
      )}

      {problem && (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-testid="recorder-problem"
        >
          {problem}
        </p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    </section>
  )
}
