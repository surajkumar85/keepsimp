"use client"

import { useId } from "react"
import { IconAlertCircle, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ToggleRow } from "@/components/image-batch/controls"
import { cn } from "cn"
import type { Ocr } from "./use-ocr"

const field =
  "h-11 w-full min-w-0 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"

/**
 * The panel for recognising the words of scanned pages: which pages, in
 * which language, reading them on this device with the progress shown,
 * and what was found.
 */
export function OcrPanel({ ocr }: { ocr: Ocr }) {
  const ids = useId()
  const { run } = ocr
  const count = ocr.target.length
  const percent = run
    ? Math.round(((run.done + run.share) / Math.max(1, run.total)) * 100)
    : 0
  return (
    <aside
      aria-labelledby={`${ids}-title`}
      data-testid="editor-ocr"
      className="absolute inset-x-0 bottom-0 z-10 flex h-[70%] flex-col border-t bg-popover shadow-lg md:static md:h-auto md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none"
    >
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <h2
          id={`${ids}-title`}
          className="px-1 font-heading text-sm font-medium"
        >
          Recognise text
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close recognise text"
          title="Close"
          onClick={() => ocr.setOn(false)}
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
      <form
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void ocr.start()
        }}
      >
        <p className="text-sm text-muted-foreground">
          Words on scanned pages are read on this device and laid unseen over
          them, so the pages can be searched, selected, copied and redacted by
          their words. The pages look the same.
        </p>
        <div className="space-y-1">
          <label
            htmlFor={`${ids}-pages`}
            className="block text-xs text-muted-foreground"
          >
            Pages
          </label>
          <input
            id={`${ids}-pages`}
            type="text"
            value={ocr.range}
            onChange={(event) => ocr.setRange(event.target.value)}
            aria-describedby={`${ids}-pages-hint`}
            placeholder="All pages"
            disabled={Boolean(run)}
            className={field}
          />
          <p id={`${ids}-pages-hint`} className="text-xs text-muted-foreground">
            Leave empty for every page, or type pages like 1-3, 7, 10-, odd or
            even.
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Language</p>
          <p className="text-sm" data-testid="ocr-language">
            English
          </p>
        </div>
        <ToggleRow
          label="Pages that have text too"
          hint="Off, a page that already has text is left as it is. On, it is read as well, and its words are there twice."
          checked={ocr.alsoText}
          onCheckedChange={ocr.setAlsoText}
        />
        {ocr.problem && (
          <p role="alert" className="text-xs text-destructive">
            {ocr.problem}
          </p>
        )}
        {run ? (
          <div className="space-y-2" data-testid="ocr-progress">
            <div
              role="progressbar"
              aria-label="Recognising text"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p role="status" className="text-sm text-muted-foreground">
              {run.loading
                ? "Loading what recognises words…"
                : `Reading page ${(run.page + 1).toLocaleString("en")}: ${(run.done + 1).toLocaleString("en")} of ${run.total.toLocaleString("en")}`}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={ocr.stop}
              className="h-11 w-full md:h-9"
            >
              Stop
            </Button>
          </div>
        ) : (
          <Button
            type="submit"
            disabled={Boolean(ocr.problem) || !count}
            className="h-11 w-full md:h-9"
          >
            {count === 1
              ? "Recognise text on 1 page"
              : `Recognise text on ${count.toLocaleString("en")} pages`}
          </Button>
        )}
        {ocr.said && (
          <p
            role="status"
            data-testid="ocr-said"
            className={cn(
              "flex items-start gap-2 text-sm",
              ocr.said.good ? "text-muted-foreground" : "text-destructive"
            )}
          >
            {!ocr.said.good && (
              <IconAlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            )}
            {ocr.said.text}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Reading takes a few seconds a page, longer on a phone. The first time,
          about 4 MB is loaded from this site; it is then kept for working
          offline. Recognition can misread a word, so check names and numbers
          that matter.
        </p>
      </form>
    </aside>
  )
}
