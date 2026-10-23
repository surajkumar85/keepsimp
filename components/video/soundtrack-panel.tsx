"use client"

import { useId } from "react"
import { IconMusic, IconX } from "@tabler/icons-react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { clock } from "@/lib/video/trim"
import {
  TRACK_VOLUMES,
  type Soundtrack,
  type TrackFacts,
} from "@/lib/video/soundtrack"

/** The soundtrack chosen on the page: its file, what reading it found, and how it is used. */
export type ChosenTrack = Soundtrack & { file: File; facts: TrackFacts }

/** Sound files and videos whose sound can be a soundtrack. */
const TRACK_ACCEPT =
  "audio/*,video/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.mp4,.mov,.webm,.mkv"

/** Another file's sound under every video: in place of their own, or mixed under it. */
export function SoundtrackPanel({
  track,
  reading,
  problem,
  onChoose,
  onChange,
  onRemove,
}: {
  track: ChosenTrack | null
  reading: boolean
  problem: string | null
  onChoose: (file: File) => void
  onChange: (change: Partial<Soundtrack>) => void
  onRemove: () => void
}) {
  const id = useId()
  return (
    <Section title="Soundtrack">
      {track ? (
        <div className="space-y-4" data-testid="soundtrack">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <IconMusic className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate font-medium">{track.facts.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {clock(track.facts.duration)}
              </span>
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={`Remove the soundtrack ${track.facts.name}`}
            >
              <IconX aria-hidden="true" />
            </Button>
          </div>
          <ChoiceChips
            label="Use it"
            hint={
              track.mode === "replace"
                ? "In place of each video's own sound."
                : "Mixed under each video's own sound, at the volume below."
            }
            value={track.mode}
            onValueChange={(mode) => onChange({ mode })}
            options={[
              { value: "replace", label: "In place of the sound" },
              { value: "mix", label: "Under the sound" },
            ]}
          />
          {track.mode === "mix" && (
            <ChoiceChips
              label="Soundtrack volume"
              hint="How loud the soundtrack is against the video's own sound."
              value={String(track.volume)}
              onValueChange={(volume) => onChange({ volume: Number(volume) })}
              options={TRACK_VOLUMES.map((volume) => ({
                value: String(volume),
                label: volume === 0 ? "As it is" : `${volume} dB`,
              }))}
            />
          )}
          <ToggleRow
            label="Play it again until the video ends"
            hint="Otherwise a shorter soundtrack leaves the rest silent. A soundtrack still playing at the end fades out over 1 s."
            checked={track.loop}
            onCheckedChange={(loop) => onChange({ loop })}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Put music or a voice-over from another file under every video, in
            place of its sound or under it.
          </p>
          <input
            id={id}
            type="file"
            accept={TRACK_ACCEPT}
            className="sr-only"
            aria-label="Choose a soundtrack"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onChoose(file)
              event.target.value = ""
            }}
          />
          <Button
            variant="outline"
            disabled={reading}
            onClick={() => document.getElementById(id)?.click()}
          >
            <IconMusic aria-hidden="true" />
            {reading ? "Reading the soundtrack…" : "Add a soundtrack"}
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </Section>
  )
}
