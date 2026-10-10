"use client"

import { useEffect, useId, useRef, useState } from "react"
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconInfoCircle,
  IconLock,
  IconRotateClockwise2,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { chosenPages, type PdfFile } from "@/lib/pdf-merger/files"

/** What the page says about a file it has read, beyond its size. */
function notesFor(file: PdfFile) {
  const facts = file.facts
  if (!facts) return []
  return [
    facts.repaired && "This file was damaged and has been repaired.",
    facts.unlocked && "Unlocked. The merged file will not have a password.",
    facts.restricted &&
      "Its author restricted changes. Make sure you have the right to merge it.",
    facts.signed &&
      "Its digital signature cannot stay valid in a merged file. The signature's picture is kept.",
    facts.tagged && "Its accessibility tags are not carried over.",
  ].filter((note): note is string => Boolean(note))
}

function Thumbnail({
  bitmap,
  rotation,
}: {
  bitmap: ImageBitmap | undefined
  rotation: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const target = canvas.current
    if (!target || !bitmap) return
    target.width = bitmap.width
    target.height = bitmap.height
    target.getContext("2d")?.drawImage(bitmap, 0, 0)
  }, [bitmap])
  return (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {bitmap && (
        <canvas
          ref={canvas}
          aria-hidden="true"
          data-testid="file-thumbnail"
          className="max-h-full max-w-full bg-background shadow-sm transition-transform duration-200 motion-reduce:transition-none"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      )}
    </span>
  )
}

function PasswordRow({
  file,
  onUnlock,
}: {
  file: PdfFile
  onUnlock: (password: string) => void
}) {
  const id = useId()
  const [password, setPassword] = useState("")
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        onUnlock(password)
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium">
        Password<span className="sr-only"> for {file.name}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={file.wrongPassword || undefined}
          aria-describedby={`${id}-hint`}
          className="w-56 max-w-full"
        />
        <Button type="submit" variant="outline">
          Unlock
        </Button>
      </div>
      <p
        id={`${id}-hint`}
        role={file.wrongPassword ? "alert" : undefined}
        className={cn(
          "text-xs",
          file.wrongPassword ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {file.wrongPassword
          ? "That password did not open this file. Check it and try again."
          : "This file is locked. The password is used on your device and is not kept."}
      </p>
    </form>
  )
}

/** The files to merge, in order: reorder, choose pages, turn, add again or remove. */
export function FileList({
  files,
  thumbnails,
  onMove,
  onRange,
  onRotate,
  onAgain,
  onRemove,
  onUnlock,
}: {
  files: PdfFile[]
  thumbnails: Record<string, ImageBitmap>
  onMove: (id: string, to: number) => void
  onRange: (id: string, text: string) => void
  onRotate: (id: string) => void
  onAgain: (id: string) => void
  onRemove: (id: string) => void
  onUnlock: (id: string, password: string) => void
}) {
  const ids = useId()
  const [dragged, setDragged] = useState<string | null>(null)
  return (
    <ol
      aria-label="Files in order"
      className="space-y-2"
      data-testid="file-list"
    >
      {files.map((file, index) => {
        const chosen = chosenPages(file)
        const problem = chosen && "problem" in chosen ? chosen.problem : null
        const used = chosen && "pages" in chosen ? chosen.pages.length : 0
        const notes = notesFor(file)
        return (
          <li
            key={file.id}
            data-testid="file-row"
            data-status={file.status}
            draggable
            onDragStart={(event) => {
              setDragged(file.id)
              event.dataTransfer.effectAllowed = "move"
            }}
            onDragEnd={() => setDragged(null)}
            onDragOver={(event) => {
              if (dragged) event.preventDefault()
            }}
            onDrop={(event) => {
              if (!dragged) return
              event.preventDefault()
              onMove(dragged, index)
              setDragged(null)
            }}
            className={cn(
              "flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3",
              dragged === file.id && "opacity-50",
              file.status === "error" && "border-destructive/40"
            )}
          >
            <span className="w-5 pt-1 text-center font-mono text-xs text-muted-foreground">
              {index + 1}
            </span>
            <Thumbnail bitmap={thumbnails[file.id]} rotation={file.rotation} />
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {file.status === "reading" && "Reading…"}
                {file.status === "ready" &&
                  file.facts &&
                  `${file.facts.pages.toLocaleString("en")} ${file.facts.pages === 1 ? "page" : "pages"} · ${sizeLabel(file.size)}`}
                {file.status === "locked" && (
                  <span className="inline-flex items-center gap-1">
                    <IconLock className="size-3.5" aria-hidden="true" />
                    Locked · {sizeLabel(file.size)}
                  </span>
                )}
              </p>
              {file.status === "error" && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                  <IconAlertCircle
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {file.error} It is left out of the merge.
                </p>
              )}
              {file.status === "locked" && (
                <PasswordRow
                  file={file}
                  onUnlock={(password) => onUnlock(file.id, password)}
                />
              )}
              {file.status === "ready" && file.facts && (
                <div className="mt-2">
                  <label
                    htmlFor={`${ids}-range-${file.id}`}
                    className="mb-1 block text-xs font-medium"
                  >
                    Pages<span className="sr-only"> from {file.name}</span>
                  </label>
                  <Input
                    id={`${ids}-range-${file.id}`}
                    value={file.range}
                    onChange={(event) => onRange(file.id, event.target.value)}
                    placeholder={
                      file.facts.pages === 1
                        ? "The one page"
                        : `All ${file.facts.pages.toLocaleString("en")} pages`
                    }
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={`${ids}-range-hint-${file.id}`}
                    className="w-56 max-w-full font-mono"
                  />
                  <p
                    id={`${ids}-range-hint-${file.id}`}
                    role={problem ? "alert" : undefined}
                    className={cn(
                      "mt-1 text-xs",
                      problem ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {problem ??
                      (file.range.trim()
                        ? `Using ${used.toLocaleString("en")} ${used === 1 ? "page" : "pages"}${file.rotation ? `, turned ${file.rotation}°` : ""}.`
                        : `For example 1-3, 7 or odd${file.rotation ? `. Turned ${file.rotation}°` : ""}.`)}
                  </p>
                </div>
              )}
              {notes.map((note) => (
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
            <div
              className="flex shrink-0 flex-wrap items-center gap-1"
              role="group"
              aria-label={`Actions for ${file.name}`}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${file.name} earlier`}
                disabled={index === 0}
                onClick={() => onMove(file.id, index - 1)}
              >
                <IconArrowUp aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${file.name} later`}
                disabled={index === files.length - 1}
                onClick={() => onMove(file.id, index + 1)}
              >
                <IconArrowDown aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Turn the pages of ${file.name}`}
                disabled={file.status !== "ready"}
                onClick={() => onRotate(file.id)}
              >
                <IconRotateClockwise2 aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Add ${file.name} again`}
                disabled={file.status === "error"}
                onClick={() => onAgain(file.id)}
              >
                <IconCopy aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${file.name}`}
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
}
