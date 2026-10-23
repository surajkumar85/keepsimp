"use client"

import { useEffect, useRef, useState } from "react"
import { IconDownload, IconGif } from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { toast } from "@/components/ui/toast"
import { AnimationPool } from "@/lib/animation/client"
import type { AnimationResponse } from "@/lib/animation/protocol"
import {
  defaultGif,
  GIF_RATES,
  GIF_SIDES,
  GIF_TARGETS,
  gifJob,
  gifName,
  gifSaid,
  LONG_GIF,
  type GifChoice,
} from "@/lib/video/gif"

let made = 0

interface Made {
  /** What it was made from: shown only while the file and the choices are the same. */
  file: Blob
  choice: GifChoice
  url: string
  name: string
  said: string
  note: string | null
}

/**
 * Makes an animation of the video's result with the animation converter's
 * own worker: a GIF, an animated WebP or an APNG, at a size and frame rate.
 */
export function GifPanel({
  file,
  name,
  seconds,
}: {
  /** The video as written, with every edit in it. */
  file: Blob
  name: string
  seconds: number
}) {
  const [choice, setChoice] = useState<GifChoice>(defaultGif)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<Made | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const pool = useRef<AnimationPool | null>(null)
  const waiting = useRef<ReturnType<typeof gifJob> | null>(null)
  const sent = useRef<string | null>(null)
  /** The choices the job in hand was made with. */
  const asked = useRef<{ choice: GifChoice; file: Blob }>({ choice, file })
  const shown =
    result && result.file === file && result.choice === choice ? result : null

  useEffect(
    () => () => {
      pool.current?.dispose()
    },
    []
  )
  useEffect(() => {
    const url = result?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [result])

  function make() {
    const job = gifJob(`gif-${++made}`, file, choice)
    waiting.current = job
    asked.current = { choice, file }
    setBusy("Starting")
    setProblem(null)
    if (!pool.current)
      pool.current = new AnimationPool(
        1,
        (message: AnimationResponse) => {
          if (!("id" in message) || message.id !== waiting.current?.id) return
          if (message.type === "progress") setBusy(message.label)
          else if (message.type === "done") {
            const blob = new Blob([message.output.bytes], {
              type: `image/${message.output.target === "apng" ? "png" : message.output.target}`,
            })
            const made = gifName(name, choice.target)
            setResult({
              file: asked.current.file,
              choice: asked.current.choice,
              url: URL.createObjectURL(blob),
              name: made,
              said: gifSaid(message.output, blob.size),
              note: message.output.note,
            })
            toast.success("Your animation is ready", { description: made })
            setBusy(null)
            waiting.current = null
          } else if (
            message.type === "error" ||
            message.type === "open-error"
          ) {
            toast.error("The animation could not be made", {
              description: "What went wrong is said under the button.",
            })
            setProblem(message.message)
            setBusy(null)
            waiting.current = null
          }
        },
        () => {
          const next = waiting.current
          // Each job is handed out once.
          if (!next || sent.current === next.id) return null
          sent.current = next.id
          return next
        }
      )
    pool.current.kick()
  }

  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="gif-panel">
      <h3 className="font-heading text-base font-medium">
        Make a GIF of the result
      </h3>
      <ChoiceChips
        label="Kind"
        hint="GIF plays everywhere; WebP is far smaller and plays in every browser; APNG keeps full colour."
        value={choice.target}
        onValueChange={(target) => setChoice({ ...choice, target })}
        options={GIF_TARGETS}
      />
      <ChoiceChips
        label="Longest side"
        value={String(choice.side)}
        onValueChange={(side) =>
          setChoice({ ...choice, side: side === "null" ? null : Number(side) })
        }
        options={[
          ...GIF_SIDES.map((side) => ({
            value: String(side),
            label: `${side} px`,
          })),
          { value: "null", label: "As the video" },
        ]}
      />
      <ChoiceChips
        label="Frames a second"
        value={String(choice.fps)}
        onValueChange={(fps) => setChoice({ ...choice, fps: Number(fps) })}
        options={GIF_RATES.map((fps) => ({
          value: String(fps),
          label: String(fps),
        }))}
      />
      {seconds > LONG_GIF && (
        <p className="text-sm text-muted-foreground">
          This video is {Math.round(seconds)} s long: an animation of all of it
          is large and slow to make. Trim it to the moment you want first.
        </p>
      )}
      <Button onClick={make} disabled={busy !== null}>
        <IconGif aria-hidden="true" />
        {busy
          ? `${busy}…`
          : `Make ${choice.target === "gif" ? "a GIF" : choice.target === "webp" ? "a WebP" : "an APNG"}`}
      </Button>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {shown && (
        <div className="space-y-2" data-testid="gif-result">
          {/* eslint-disable-next-line @next/next/no-img-element -- an animation made on the page */}
          <img
            src={shown.url}
            alt={`The animation made of ${name}`}
            className="max-h-64 rounded-md border"
          />
          <p className="text-sm text-muted-foreground">{shown.said}</p>
          {shown.note && (
            <p className="text-sm text-muted-foreground">{shown.note}</p>
          )}
          <a
            href={shown.url}
            download={shown.name}
            onClick={() =>
              toast.success("Download started", { description: shown.name })
            }
            className={buttonVariants()}
          >
            <IconDownload aria-hidden="true" /> Download {shown.name}
          </a>
        </div>
      )}
    </div>
  )
}
