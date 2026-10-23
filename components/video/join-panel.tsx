"use client"

import { IconArrowDown, IconArrowUp, IconDownload } from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/components/ui/toast"
import { sizeLabel } from "@/lib/image-compressor/formats"
import type { JoinPlan } from "@/lib/video/join"
import { factsLine } from "@/lib/video/queue"
import type { VideoFacts } from "@/lib/video/settings"

/** A joined file, as the worker wrote and checked it. */
export interface Joined {
  key: string
  file: Blob
  url: string
  downloadUrl: string
  name: string
  scratch: string | null
  written: VideoFacts
  problems: string[]
  copied: boolean
}

/** The videos written, joined in an order of one's own into one file. */
export function JoinPanel({
  names,
  plan,
  onMove,
  onJoin,
  progress,
  joined,
  problem,
}: {
  /** The finished videos, in the order they are joined. */
  names: string[]
  plan: JoinPlan
  onMove: (index: number, by: -1 | 1) => void
  onJoin: () => void
  /** How far the join is; null when it is not running. */
  progress: number | null
  joined: Joined | null
  problem: string | null
}) {
  return (
    <section
      aria-label="Join into one video"
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid="join-panel"
    >
      <h2 className="font-heading text-base font-medium">
        Join into one video
      </h2>
      <ol className="space-y-1" aria-label="Order of the videos">
        {names.map((name, index) => (
          <li
            key={`${index}-${name}`}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate">
              {index + 1}. {name}
            </span>
            <span className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
                aria-label={`Move ${name} earlier`}
              >
                <IconArrowUp aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={index === names.length - 1}
                onClick={() => onMove(index, 1)}
                aria-label={`Move ${name} later`}
              >
                <IconArrowDown aria-hidden="true" />
              </Button>
            </span>
          </li>
        ))}
      </ol>
      <div
        className="space-y-1 text-sm text-muted-foreground"
        data-testid="join-plan"
      >
        {plan.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
      {plan.problem && (
        <p role="alert" className="text-sm text-destructive">
          {plan.problem}
        </p>
      )}
      <Button onClick={onJoin} disabled={progress !== null || !!plan.problem}>
        {progress !== null
          ? `Joining… ${Math.round(progress * 100)}%`
          : `Join ${names.length} videos`}
      </Button>
      {progress !== null && (
        <Progress value={progress} label="Joining the videos" />
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {joined && (
        <div className="space-y-2" data-testid="join-result">
          <video
            src={joined.url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-lg bg-black"
            aria-label="The joined video"
          />
          <p className="text-sm text-muted-foreground">
            {factsLine(joined.written)} · {sizeLabel(joined.file.size)} ·{" "}
            {joined.copied
              ? "the pictures copied as they are"
              : "the pictures encoded again"}
          </p>
          {joined.problems.map((one) => (
            <p key={one} role="alert" className="text-sm text-destructive">
              {one}
            </p>
          ))}
          <a
            href={joined.downloadUrl}
            download={joined.name}
            onClick={() =>
              toast.success("Download started", { description: joined.name })
            }
            className={buttonVariants()}
          >
            <IconDownload aria-hidden="true" /> Download {joined.name}
          </a>
        </div>
      )}
    </section>
  )
}
