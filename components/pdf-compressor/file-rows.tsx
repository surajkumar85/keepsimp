"use client"

import { memo, useEffect, useRef } from "react"
import {
  IconAlertCircle,
  IconBook2,
  IconDownload,
  IconInfoCircle,
  IconLock,
  IconX,
} from "@tabler/icons-react"
import { PasswordRow } from "@/components/pdf/password-row"
import { Button, buttonVariants } from "@/components/ui/button"
import { sizeLabel } from "@/lib/image-compressor/formats"
import type { CompressFile } from "@/lib/pdf-compressor/files"
import { fileNotes } from "@/lib/pdf-compressor/report"
import { cn } from "cn"

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

/** What became of a file, in a few words, and where its result can be had. */
export interface RowResult {
  text: string
  /** Something went wrong, or a size was missed. */
  problem: boolean
  /** The result to download; left out when the file was left as it is. */
  download?: { url: string; name: string }
}

/**
 * The files to compress, one row each. With several, one of them is shown
 * in detail below; pressing a row's name shows that file.
 */
export const FileRows = memo(function FileRows({
  files,
  active,
  pictures,
  results,
  onShow,
  onRead,
  onRemove,
  onUnlock,
  disabled,
}: {
  files: readonly CompressFile[]
  /** The file shown in detail. */
  active: string | null
  /** Pictures of pages, by "file/page". */
  pictures: Record<string, ImageBitmap>
  results: Readonly<Record<string, RowResult>>
  onShow: (id: string) => void
  onRead: (id: string, from: HTMLElement) => void
  onRemove: (id: string) => void
  onUnlock: (id: string, password: string) => void
  /** While files are being compressed, none can be removed. */
  disabled: boolean
}) {
  const several = files.length > 1
  return (
    <ol
      aria-label="Files to compress"
      className="space-y-2"
      data-testid="files"
    >
      {files.map((file) => {
        const shown = several && file.id === active
        const result = results[file.id]
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
                  aria-label={`Show the details of ${file.name}`}
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
              {file.status === "ready" && result && (
                <p
                  data-testid="file-result"
                  className={cn(
                    "mt-1 text-xs font-medium",
                    result.problem && "text-destructive"
                  )}
                >
                  {result.text}
                </p>
              )}
              {file.status === "locked" && (
                <PasswordRow
                  name={file.name}
                  wrong={Boolean(file.wrongPassword)}
                  onUnlock={(password) => onUnlock(file.id, password)}
                />
              )}
              {file.facts &&
                fileNotes(file.facts, Boolean(file.audit?.archive)).map(
                  (note) => (
                    <p
                      key={note}
                      data-testid="file-note"
                      className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground"
                    >
                      <IconInfoCircle
                        className="mt-0.5 size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {note}
                    </p>
                  )
                )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {several && result?.download && (
                <a
                  href={result.download.url}
                  download={result.download.name}
                  aria-label={`Download ${result.download.name}`}
                  title="Download"
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                >
                  <IconDownload aria-hidden="true" />
                </a>
              )}
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
