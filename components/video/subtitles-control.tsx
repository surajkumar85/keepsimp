"use client"

import { useId, useState } from "react"
import { IconBadgeCc, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { parseSubtitles } from "@/lib/video/subtitles"
import type { VideoItem } from "@/lib/video/queue"

/** The largest subtitle file read: a feature film's is well under 1 MB. */
const LARGEST_FILE = 5 * 1024 * 1024

/** Subtitles for one video, from an SRT or WebVTT file, written on its picture. */
export function SubtitlesControl({
  subtitles,
  onSubtitles,
}: {
  subtitles: VideoItem["subtitles"]
  onSubtitles: (subtitles: VideoItem["subtitles"]) => void
}) {
  const id = useId()
  const [problem, setProblem] = useState<string | null>(null)
  async function read(file: File) {
    setProblem(null)
    if (file.size > LARGEST_FILE) {
      setProblem(`${file.name} is too large to be a subtitle file.`)
      return
    }
    const cues = parseSubtitles(await file.text())
    if (!cues.length) {
      setProblem(
        `${file.name} has no subtitles in it that can be read. Use an SRT or WebVTT file.`
      )
      return
    }
    onSubtitles({ name: file.name, cues })
  }
  return (
    <div className="space-y-2" data-testid="subtitles">
      {subtitles ? (
        <div className="flex flex-wrap items-center gap-2">
          <IconBadgeCc className="size-4 shrink-0" aria-hidden="true" />
          <span className="text-sm">
            {subtitles.cues.length}{" "}
            {subtitles.cues.length === 1 ? "subtitle" : "subtitles"} from{" "}
            <span className="font-medium">{subtitles.name}</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSubtitles(null)}
            aria-label={`Remove the subtitles ${subtitles.name}`}
          >
            <IconX aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <input
            id={id}
            type="file"
            accept=".srt,.vtt,text/vtt,application/x-subrip"
            className="sr-only"
            aria-label="Choose subtitles"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void read(file)
              event.target.value = ""
            }}
          />
          <Button
            variant="outline"
            onClick={() => document.getElementById(id)?.click()}
          >
            <IconBadgeCc aria-hidden="true" /> Add subtitles
          </Button>
        </>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </div>
  )
}
