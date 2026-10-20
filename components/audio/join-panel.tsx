"use client"

import { useId } from "react"
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsJoin2,
  IconDownload,
} from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { clockLabel, timeLabel } from "@/lib/audio/labels"
import { CROSSFADES, GAPS, type Joining } from "@/lib/audio/join"
import type { AudioResult } from "@/lib/audio/queue"
import { sizeLabel } from "@/lib/image-compressor/formats"

export interface JoinRow {
  id: string
  name: string
  /** Seconds, as edited. */
  length: number
  edited: boolean
}

/** What the page knows of the joined file. */
export interface JoinedState {
  /** Being written now. */
  working: boolean
  progress?: number
  error?: string
  result: AudioResult | null
  /** The result was made before the last change. */
  outOfDate: boolean
}

type Between = "straight" | "gap" | "crossfade"

/**
 * Join the files in the list into one, in the order shown (each as
 * edited), straight on, with silence between or crossfaded, and with a
 * chapter for each where the format holds chapters.
 */
export function JoinPanel({
  rows,
  length,
  joining,
  onJoining,
  chapters,
  onChapters,
  holdsChapters,
  onMove,
  onJoin,
  state,
  check,
  canJoin,
}: {
  rows: JoinRow[]
  /** Seconds, joined. */
  length: number
  joining: Joining
  onJoining: (joining: Joining) => void
  chapters: boolean
  onChapters: (on: boolean) => void
  holdsChapters: boolean
  onMove: (id: string, by: -1 | 1) => void
  onJoin: () => void
  state: JoinedState
  /** What the check found of the result, as the page says it. */
  check: React.ReactNode
  canJoin: boolean
}) {
  const ids = useId()
  const between: Between =
    joining.crossfade > 0 ? "crossfade" : joining.gap > 0 ? "gap" : "straight"
  const { result } = state
  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid="join-panel"
    >
      <h2 id={`${ids}-title`} className="section-title">
        Join into one file
      </h2>
      <ol className="divide-y rounded-lg border" data-testid="join-order">
        {rows.map((row, index) => (
          <li
            key={row.id}
            className="flex items-center gap-2 p-2 text-sm"
            data-testid="join-row"
          >
            <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{row.name}</span>
              <span className="text-muted-foreground">
                {timeLabel(row.length, true)}
                {row.edited ? " · edited" : ""}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={index === 0}
              onClick={() => onMove(row.id, -1)}
              aria-label={`Move ${row.name} up`}
            >
              <IconArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={index === rows.length - 1}
              onClick={() => onMove(row.id, 1)}
              aria-label={`Move ${row.name} down`}
            >
              <IconArrowDown aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      <ChoiceChips
        label="Between files"
        value={between}
        onValueChange={(value) =>
          onJoining(
            value === "gap"
              ? { gap: 1, crossfade: 0 }
              : value === "crossfade"
                ? { gap: 0, crossfade: 2 }
                : { gap: 0, crossfade: 0 }
          )
        }
        options={[
          { value: "straight", label: "Straight on" },
          { value: "gap", label: "Silence" },
          { value: "crossfade", label: "Crossfade" },
        ]}
      />
      {between === "gap" && (
        <ChoiceChips
          label="Silence between"
          value={String(joining.gap)}
          onValueChange={(value) =>
            onJoining({ gap: Number(value), crossfade: 0 })
          }
          options={GAPS.map((gap) => ({
            value: String(gap),
            label: `${gap} s`,
          }))}
        />
      )}
      {between === "crossfade" && (
        <ChoiceChips
          label="Crossfade over"
          value={String(joining.crossfade)}
          onValueChange={(value) =>
            onJoining({ gap: 0, crossfade: Number(value) })
          }
          options={CROSSFADES.map((crossfade) => ({
            value: String(crossfade),
            label: `${crossfade} s`,
          }))}
          hint="One fades out as the next fades in. Never longer than half of either file."
        />
      )}
      {holdsChapters && (
        <ToggleRow
          label="A chapter for each file"
          hint="Named after each file. MP3 chapters are read by most players and podcast apps; M4A chapters by VLC, FFmpeg and foobar2000 (Apple's apps read another kind)."
          checked={chapters}
          onCheckedChange={onChapters}
        />
      )}
      <p className="text-sm text-muted-foreground" data-testid="join-length">
        Joined: {clockLabel(length)}. Each file joins as you edited it; choose
        Normalize loudness to make them equally loud.
      </p>
      <Button
        type="button"
        disabled={!canJoin || state.working}
        onClick={onJoin}
      >
        <IconArrowsJoin2 data-icon="inline-start" aria-hidden="true" />
        {state.working ? "Joining…" : `Join ${rows.length} files`}
      </Button>
      {state.working && state.progress !== undefined && (
        <div
          role="progressbar"
          aria-label="Joining"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.progress * 100)}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${Math.round(state.progress * 100)}%` }}
          />
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {result && !state.working && (
        <div className="space-y-2" data-testid="join-result">
          {state.outOfDate && (
            <p className="text-sm text-muted-foreground">
              This was joined before the last change: join again to bring it up
              to date.
            </p>
          )}
          <p className="text-sm">
            <span className="font-medium">{result.name}</span> ·{" "}
            {result.heard ? timeLabel(result.heard.duration, true) : ""} ·{" "}
            {sizeLabel(result.blob.size)}
          </p>
          <audio
            key={result.url}
            src={result.url}
            controls
            preload="metadata"
            className="block h-14 w-full"
            aria-label="The joined file"
          />
          {check}
          <a
            href={result.downloadUrl}
            download={result.name}
            className={buttonVariants()}
            data-testid="join-download"
          >
            <IconDownload data-icon="inline-start" aria-hidden="true" />
            Download the joined file
          </a>
        </div>
      )}
    </section>
  )
}
