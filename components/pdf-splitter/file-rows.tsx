"use client"

import { memo, useEffect, useRef } from "react"
import {
  IconAlertCircle,
  IconBook2,
  IconInfoCircle,
  IconLock,
  IconX,
} from "@tabler/icons-react"
import { PasswordRow } from "@/components/pdf/password-row"
import { Button } from "@/components/ui/button"
import { cn } from "cn"
import { sizeLabel } from "@/lib/image-compressor/formats"
import type { FileFacts } from "@/lib/pdf-merger/files"
import type { SplitFile } from "@/lib/pdf-splitter/files"

/** What the page says about a file it has read, beyond its size. */
function notesFor(facts: FileFacts | undefined) {
  if (!facts) return []
  return [
    facts.repaired && "This file was damaged and has been repaired.",
    facts.unlocked && "Unlocked. The parts have no password.",
    facts.restricted &&
      "Its author restricted changes. Make sure you have the right to split it.",
    facts.signed &&
      "Its digital signature cannot stay valid in the parts. The signature's picture is kept.",
    facts.tagged && "Its accessibility tags are not carried over.",
  ].filter((note): note is string => Boolean(note))
}

function Thumbnail({ bitmap }: { bitmap: ImageBitmap | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const target = canvas.current
    if (!target || !bitmap) return
    target.width = bitmap.width
    target.height = bitmap.height
    target.getContext("2d")?.drawImage(bitmap, 0, 0)
  }, [bitmap])
  return bitmap ? (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="max-h-full max-w-full bg-background shadow-sm"
    />
  ) : null
}

/** What will be made of a file, in a few words, or what stands in the way. */
export interface FileSummary {
  text: string
  /** The file is left out as things stand. */
  problem: boolean
}

/**
 * The files to split, one row each. With several, one of them is the file
 * whose pages are shown below; pressing a row's name shows that file.
 */
export const FileRows = memo(function FileRows({
  files,
  active,
  pictures,
  summaries,
  onShow,
  onRead,
  onRemove,
  onUnlock,
  disabled,
}: {
  files: readonly SplitFile[]
  /** The file whose pages are shown. */
  active: string | null
  /** Pictures of pages, by "file/page". */
  pictures: Record<string, ImageBitmap>
  summaries: Readonly<Record<string, FileSummary>>
  onShow: (id: string) => void
  onRead: (id: string, from: HTMLElement) => void
  onRemove: (id: string) => void
  onUnlock: (id: string, password: string) => void
  /** While a split is running, files cannot be removed. */
  disabled: boolean
}) {
  const several = files.length > 1
  return (
    <ol aria-label="Files to split" className="space-y-2" data-testid="files">
      {files.map((file) => {
        const shown = several && file.id === active
        const summary = summaries[file.id]
        const pages = file.facts?.pages ?? 0
        return (
          <li
            key={file.id}
            data-testid="file-row"
            data-status={file.status}
            data-shown={shown || undefined}
            className={cn(
              "flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3",
              file.status === "error" && "border-destructive/40",
              shown && "border-primary ring-1 ring-primary"
            )}
          >
            {file.status === "ready" ? (
              <button
                type="button"
                aria-label={`Read ${file.name}`}
                onClick={(event) => onRead(file.id, event.currentTarget)}
                className="flex size-16 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border bg-muted outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Thumbnail bitmap={pictures[`${file.id}/0`]} />
              </button>
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted" />
            )}
            <div className="min-w-0 flex-1 basis-48">
              {several && file.status === "ready" ? (
                <button
                  type="button"
                  aria-pressed={shown}
                  aria-label={`Show the pages of ${file.name}`}
                  onClick={() => onShow(file.id)}
                  // Padding and a matching pull keep the line where it was, and make the name large enough to press.
                  className="-my-3 block max-w-full truncate rounded-sm py-3 text-left text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {file.name}
                </button>
              ) : (
                <p className="truncate text-sm font-medium">{file.name}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {file.status === "reading" && "Reading…"}
                {file.status === "ready" &&
                  `${pages.toLocaleString("en")} ${pages === 1 ? "page" : "pages"} · ${sizeLabel(file.size)}`}
                {file.status === "locked" && (
                  <span className="inline-flex items-center gap-1">
                    <IconLock className="size-3.5" aria-hidden="true" />
                    Locked · {sizeLabel(file.size)}
                  </span>
                )}
                {shown && " · shown below"}
              </p>
              {file.status === "error" && (
                <p
                  role="alert"
                  className="mt-1 flex items-start gap-1.5 text-xs text-destructive"
                >
                  <IconAlertCircle
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {file.error}
                  {several && " It is left out."}
                </p>
              )}
              {file.status === "ready" && several && summary && (
                <p
                  data-testid="file-summary"
                  className={cn(
                    "mt-1 text-xs",
                    summary.problem
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {summary.text}
                </p>
              )}
              {file.status === "locked" && (
                <PasswordRow
                  name={file.name}
                  wrong={Boolean(file.wrongPassword)}
                  onUnlock={(password) => onUnlock(file.id, password)}
                />
              )}
              {notesFor(file.facts).map((note) => (
                <p
                  key={note}
                  className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <IconInfoCircle
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {note}
                </p>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Open ${file.name} in the reader`}
                title="Open in the reader"
                disabled={file.status !== "ready"}
                onClick={(event) => onRead(file.id, event.currentTarget)}
              >
                <IconBook2 aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${file.name}`}
                title="Remove"
                disabled={disabled}
                onClick={() => onRemove(file.id)}
              >
                <IconX aria-hidden="true" />
              </Button>
            </div>
          </li>
        )
      })}
    </ol>
  )
})
