"use client"

import { useId, useMemo, useState } from "react"
import {
  IconAlertCircle,
  IconCircleCheck,
  IconDownload,
  IconFileZip,
  IconScissors,
} from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import type { Edited } from "@/lib/audio/edits"
import { clockLabel, timeLabel } from "@/lib/audio/labels"
import type { Peaks } from "@/lib/audio/peaks"
import type { AudioItem } from "@/lib/audio/queue"
import { PAUSES, silentRuns } from "@/lib/audio/silence"
import {
  MOST_PARTS,
  partsOf,
  splitProblem,
  type PartTimes,
  type SplitRule,
} from "@/lib/audio/split"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { NumberField } from "./settings-panel"

type By = SplitRule["by"]

/** Pauses are found under this level, as the editor's silence tools find them by default. */
const PAUSE_LEVEL = -50
/** How many parts the preview lists before it says how many more. */
const LISTED = 8

/**
 * Split one file into parts: by a rule, previewed before anything is
 * written, then written part by part (each checked) and offered one by one
 * or as one ZIP. The parts are of the sound as edited.
 */
export function SplitPanel({
  item,
  duration,
  edited,
  length,
  peaks,
  marks,
  current,
  onSplit,
  onZip,
  zipping,
}: {
  item: AudioItem
  /** The source's length, and the sound as edited with its length. */
  duration: number
  edited: Edited
  length: number
  peaks: Peaks | null
  /** Markers in the times of the sound as edited. */
  marks: number[]
  /** The key the parts would be written for now; null when the settings cannot be used. */
  current: (parts: PartTimes[]) => string | null
  onSplit: (parts: PartTimes[], key: string) => void
  onZip: () => void
  zipping: boolean
}) {
  const ids = useId()
  const [by, setBy] = useState<By>(marks.length ? "marks" : "every")
  const [minutesText, setMinutes] = useState("5")
  const [countText, setCount] = useState("3")
  const [pause, setPause] = useState<number>(1)
  const [drop, setDrop] = useState(false)
  const rule: SplitRule =
    by === "every"
      ? { by, minutes: Number(minutesText.replace(",", ".")) }
      : by === "count"
        ? { by, parts: Number(countText) }
        : by === "marks"
          ? { by }
          : { by, pause, drop }
  const problem = splitProblem(rule)
  const pauses = useMemo(
    () =>
      by === "silence" && peaks
        ? silentRuns(peaks, duration, edited, PAUSE_LEVEL, 0.2)
        : [],
    [by, peaks, duration, edited]
  )
  const ruleKey = JSON.stringify(rule)
  const parts = useMemo(
    () => partsOf(JSON.parse(ruleKey) as SplitRule, length, marks, pauses),
    [ruleKey, length, marks, pauses]
  )
  const key = current(parts)
  const written = item.split
  const wanted = item.splitWanted
  const working = Boolean(wanted && written?.key !== wanted.key)
  const outOfDate = Boolean(written && key !== written.key)

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid="split-panel"
    >
      <h2 id={`${ids}-title`} className="section-title">
        Split into parts
      </h2>
      <ChoiceChips
        label="Split"
        hideLabel
        value={by}
        onValueChange={setBy}
        options={[
          { value: "every", label: "Every few minutes" },
          { value: "count", label: "Into equal parts" },
          { value: "marks", label: `At markers (${marks.length})` },
          { value: "silence", label: "At pauses" },
        ]}
      />
      {by === "every" && (
        <NumberField
          id={`${ids}-minutes`}
          label="Minutes in each part"
          value={minutesText}
          hint="The last part is what is left."
          onChange={setMinutes}
        />
      )}
      {by === "count" && (
        <NumberField
          id={`${ids}-count`}
          label="How many parts"
          value={countText}
          hint={`From 2 to ${MOST_PARTS}, all the same length.`}
          onChange={setCount}
        />
      )}
      {by === "marks" && (
        <p className="text-sm text-muted-foreground">
          {marks.length
            ? "The sound is cut at each marker."
            : "Add markers in the editor (the button, or M on the waveform), then split at them."}
        </p>
      )}
      {by === "silence" && (
        <div className="space-y-3">
          <ChoiceChips
            label="At pauses longer than"
            value={String(pause)}
            onValueChange={(value) => setPause(Number(value))}
            options={PAUSES.map((value) => ({
              value: String(value),
              label: `${value} s`,
            }))}
            hint="Silence under −50 dBFS. Each part ends at the middle of a pause."
          />
          <ChoiceChips
            label="The pauses"
            value={drop ? "drop" : "keep"}
            onValueChange={(value) => setDrop(value === "drop")}
            options={[
              { value: "keep", label: "Keep them" },
              { value: "drop", label: "Leave them out" },
            ]}
          />
        </div>
      )}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : (
        <div className="text-sm" data-testid="split-preview">
          <p className="font-medium">
            {parts.length < 2
              ? "This makes one part, the whole sound: choose another way to split it."
              : `${parts.length} parts:`}
          </p>
          {parts.length >= 2 && (
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 font-mono text-muted-foreground">
              {parts.slice(0, LISTED).map((part) => (
                <li key={part.from}>
                  {clockLabel(part.from)}–{clockLabel(part.to)}
                </li>
              ))}
              {parts.length > LISTED && (
                <li className="list-none font-sans">
                  and {parts.length - LISTED} more
                </li>
              )}
            </ol>
          )}
        </div>
      )}
      <Button
        type="button"
        disabled={!key || parts.length < 2 || Boolean(problem) || working}
        onClick={() => key && onSplit(parts, key)}
      >
        <IconScissors data-icon="inline-start" aria-hidden="true" />
        {working
          ? "Splitting…"
          : parts.length >= 2
            ? `Split into ${parts.length} files`
            : "Split"}
      </Button>
      {working && item.splitProgress !== undefined && (
        <div
          role="progressbar"
          aria-label="Splitting"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(item.splitProgress * 100)}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${Math.round(item.splitProgress * 100)}%` }}
          />
        </div>
      )}
      {item.splitError && (
        <p role="alert" className="text-sm text-destructive">
          {item.splitError}
        </p>
      )}
      {written && !working && (
        <div className="space-y-2" data-testid="split-results">
          {outOfDate && (
            <p className="text-sm text-muted-foreground">
              These parts were made before the last change: split again to bring
              them up to date.
            </p>
          )}
          <ul className="divide-y rounded-lg border">
            {written.parts.map((part) => (
              <li
                key={part.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 text-sm"
                data-testid="split-part"
              >
                {part.problems.length ? (
                  <IconAlertCircle
                    className="size-4 shrink-0 text-destructive"
                    aria-label="Not quite as asked"
                  />
                ) : (
                  <IconCircleCheck
                    className="size-4 shrink-0 text-primary"
                    aria-label={part.heard ? "Checked" : "Written"}
                  />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {part.name}
                </span>
                <span className="text-muted-foreground">
                  {part.heard ? timeLabel(part.heard.duration, true) : ""} ·{" "}
                  {sizeLabel(part.blob.size)}
                </span>
                <a
                  href={part.downloadUrl}
                  download={part.name}
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                  aria-label={`Download ${part.name}`}
                >
                  <IconDownload aria-hidden="true" />
                </a>
                {part.problems.length > 0 && (
                  <p className="w-full text-destructive">
                    {part.problems.join(" ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            onClick={onZip}
            disabled={zipping}
          >
            <IconFileZip data-icon="inline-start" aria-hidden="true" />
            {zipping ? "Making the ZIP…" : "Download all parts (ZIP)"}
          </Button>
        </div>
      )}
    </section>
  )
}
