"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  IconCopy,
  IconDownload,
  IconPlayerStop,
  IconTextRecognition,
} from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import type { ReadFacts } from "@/lib/audio/mediabunny-audio"
import { startTranscription } from "@/lib/audio/transcribe-client"
import {
  clock,
  doubtful,
  found,
  LANGUAGES,
  segmentAt,
  toSrt,
  toText,
  toVtt,
  type Segment,
} from "@/lib/audio/transcript"
import {
  downloadBytes,
  WHISPER_CHOICES,
  type WhisperId,
} from "@/lib/audio/whisper"
import { sizeLabel } from "@/lib/image-compressor/formats"

interface Transcript {
  status: "loading" | "running" | "done" | "stopped" | "error"
  segments: Segment[]
  /** Seconds of sound heard so far. */
  done: number
  /** How much of the model has come, from 0 to 1. */
  loaded: number
  error?: string
  /** What it was made with. */
  model: WhisperId
  /** The language Whisper found, when none was chosen. */
  found?: string
  translate: boolean
}

/** The file a transcription is of: the file itself, or the WAV the page decoded it to. */
export interface TranscriptSource {
  id: string
  name: string
  file: Blob
  kept: ReadFacts["kept"]
  duration: number
  /** For playing it here. */
  url: string
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, "")

/** A language's name in English, from its code. */
function languageName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

/** Text saved as a file: an untyped link, so no browser renames it or opens it instead. */
function save(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/octet-stream" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Whisper on the device: what a file says, with times, to search, play along and save. */
export function TranscriptPanel({ source }: { source: TranscriptSource }) {
  const ids = useId()
  const [model, setModel] = useState<WhisperId>("base")
  const [language, setLanguage] = useState("")
  const [translate, setTranslate] = useState(false)
  const [transcripts, setTranscripts] = useState<Record<string, Transcript>>({})
  const [query, setQuery] = useState("")
  const [time, setTime] = useState(0)
  const [copied, setCopied] = useState(false)
  const stops = useRef(new Map<string, () => void>())
  const player = useRef<HTMLAudioElement>(null)
  const transcript = transcripts[source.id]

  // Leaving the page stops every transcription.
  useEffect(() => {
    const running = stops.current
    return () => running.forEach((stop) => stop())
  }, [])

  const update = (id: string, change: Partial<Transcript>) =>
    setTranscripts((all) => ({ ...all, [id]: { ...all[id], ...change } }))

  function start() {
    const id = source.id
    stops.current.get(id)?.()
    setTranscripts((all) => ({
      ...all,
      [id]: {
        status: "loading",
        segments: [],
        done: 0,
        loaded: 0,
        model,
        translate,
      },
    }))
    const stop = startTranscription(
      {
        file: source.file,
        kept: source.kept,
        duration: source.duration,
        model,
        language,
        translate,
      },
      (message) => {
        if (message.type === "loading") update(id, { loaded: message.fraction })
        else if (message.type === "language")
          update(id, { found: message.code })
        else if (message.type === "segments")
          update(id, {
            status: "running",
            segments: message.segments,
            done: message.done,
          })
        else {
          stops.current.get(id)?.()
          stops.current.delete(id)
          update(
            id,
            message.type === "done"
              ? { status: "done", done: source.duration }
              : { status: "error", error: message.message }
          )
        }
      }
    )
    stops.current.set(id, stop)
  }

  function stop() {
    stops.current.get(source.id)?.()
    stops.current.delete(source.id)
    update(source.id, { status: "stopped" })
  }

  const segments = useMemo(() => transcript?.segments ?? [], [transcript])
  const hits = useMemo(() => new Set(found(segments, query)), [segments, query])
  const playing = segmentAt(segments, time)
  const busy =
    transcript?.status === "loading" || transcript?.status === "running"
  const name = baseName(source.name)

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="transcript-panel"
    >
      <h2 id={`${ids}-title`} className="section-title">
        Transcript
      </h2>

      {!busy && (
        <div className="space-y-4">
          <ChoiceChips
            label="Model"
            value={model}
            onValueChange={setModel}
            options={WHISPER_CHOICES.map((choice) => ({
              value: choice.id,
              label: `${choice.label} · ${sizeLabel(downloadBytes(choice.id))}`,
            }))}
            hint={`${WHISPER_CHOICES.find((choice) => choice.id === model)!.says} Whisper is downloaded from this site the first time, then kept for working offline; the sound never leaves this device.`}
          />
          <div>
            <label
              htmlFor={`${ids}-language`}
              className="mb-1.5 block text-sm font-medium"
            >
              Language spoken
            </label>
            <select
              id={`${ids}-language`}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="h-11 w-full rounded-md border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm dark:bg-input/30"
            >
              {LANGUAGES.map((one) => (
                <option key={one.code} value={one.code}>
                  {one.label}
                </option>
              ))}
            </select>
          </div>
          <ToggleRow
            label="Translate into English"
            hint="Whisper writes what is said in English instead of the language spoken. It is a quick translation, not a careful one."
            checked={translate}
            onCheckedChange={setTranslate}
          />
          <Button type="button" onClick={start}>
            <IconTextRecognition data-icon="inline-start" aria-hidden="true" />
            {transcript ? "Transcribe again" : "Transcribe"}
          </Button>
        </div>
      )}

      {busy && (
        <div className="space-y-2">
          <p role="status" className="text-sm" data-testid="transcript-status">
            {transcript.status === "loading"
              ? `Loading Whisper: ${Math.round(transcript.loaded * 100)}%`
              : `Transcribed ${clock(transcript.done)} of ${clock(source.duration)}`}
          </p>
          <div
            role="progressbar"
            aria-label="Transcribing"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              (transcript.status === "loading"
                ? transcript.loaded
                : transcript.done / Math.max(source.duration, 1)) * 100
            )}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{
                width: `${Math.round(
                  (transcript.status === "loading"
                    ? transcript.loaded
                    : Math.min(
                        1,
                        transcript.done / Math.max(source.duration, 1)
                      )) * 100
                )}%`,
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={stop}>
            <IconPlayerStop data-icon="inline-start" aria-hidden="true" />
            Stop
          </Button>
        </div>
      )}

      {transcript?.found && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="transcript-language"
        >
          Whisper heard {languageName(transcript.found)}. If that is wrong,
          choose the language and transcribe again.
        </p>
      )}

      {transcript?.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {transcript.error}
        </p>
      )}
      {transcript?.status === "stopped" && (
        <p className="text-sm text-muted-foreground">
          Stopped. What was heard so far is below.
        </p>
      )}
      {transcript?.status === "done" && !segments.length && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="transcript-empty"
        >
          Whisper heard no speech in this sound.
        </p>
      )}

      {segments.length > 0 && (
        <div className="space-y-3">
          <audio
            ref={player}
            src={source.url}
            controls
            preload="metadata"
            className="block h-14 w-full"
            aria-label="Listen along"
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          />
          <div>
            <label
              htmlFor={`${ids}-find`}
              className="mb-1.5 block text-sm font-medium"
            >
              Find in the transcript
            </label>
            <Input
              id={`${ids}-find`}
              type="search"
              value={query}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              aria-describedby={`${ids}-found`}
            />
            <p
              id={`${ids}-found`}
              className="mt-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {query.trim()
                ? hits.size === 1
                  ? "Found in 1 place."
                  : `Found in ${hits.size} places.`
                : `${segments.length} parts. Press a time to listen from there.`}
            </p>
          </div>
          <ol
            className="max-h-96 space-y-1 overflow-y-auto rounded-lg border p-2"
            data-testid="transcript"
          >
            {segments.map((segment, index) =>
              query.trim() && !hits.has(index) ? null : (
                <li
                  key={`${segment.start}-${index}`}
                  className={`flex gap-3 rounded-md p-1.5 text-sm ${index === playing ? "bg-muted" : ""}`}
                  aria-current={index === playing ? "true" : undefined}
                >
                  <button
                    type="button"
                    className="min-h-11 shrink-0 rounded-md px-1 font-mono text-xs text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0"
                    aria-label={`Listen from ${clock(segment.start)}`}
                    onClick={() => {
                      const element = player.current
                      if (!element) return
                      element.currentTime = segment.start
                      void element.play().catch(() => undefined)
                    }}
                  >
                    {clock(segment.start)}
                  </button>
                  {doubtful(segment.text) ? (
                    <span className="text-muted-foreground">
                      {segment.text}{" "}
                      <span
                        className="text-xs"
                        data-testid="transcript-doubtful"
                      >
                        (Whisper often writes this over silence or noise: check
                        it)
                      </span>
                    </span>
                  ) : (
                    <span>{segment.text}</span>
                  )}
                </li>
              )
            )}
          </ol>
          <p className="text-xs text-muted-foreground">
            Whisper can mishear names, quiet words and speech over noise: read
            it through before you rely on it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(toText(segments))
                  .then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  })
                  .catch(() => setCopied(false))
              }}
            >
              <IconCopy data-icon="inline-start" aria-hidden="true" />
              {copied ? "Copied" : "Copy the text"}
            </Button>
            {(
              [
                ["Text", () => save(toText(segments), `${name}.txt`)],
                [
                  "Text with times",
                  () => save(toText(segments, true), `${name}-times.txt`),
                ],
                ["SRT", () => save(toSrt(segments), `${name}.srt`)],
                ["WebVTT", () => save(toVtt(segments), `${name}.vtt`)],
              ] as const
            ).map(([label, action]) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                onClick={action}
              >
                <IconDownload data-icon="inline-start" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
