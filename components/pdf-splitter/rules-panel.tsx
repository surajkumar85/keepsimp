"use client"

import { useId } from "react"
import { IconArrowBackUp, IconArrowForwardUp } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import type { FrontChoice, Heading } from "@/lib/pdf-splitter/bookmarks"
import type { SplitMode } from "@/lib/pdf-splitter/parts"
import type { SizeUnit } from "@/lib/pdf-splitter/size"

/** Bookmarks listed at once; a file with more shows the first of them. */
const MOST_BOOKMARKS = 200

/** The sizes offered as chips, in megabytes. */
export const SIZE_CHOICES = ["5", "10", "20", "25"] as const
export type SizeChoice = (typeof SIZE_CHOICES)[number] | "custom"

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

/**
 * The controls of the way of splitting that is chosen: rules that place
 * cuts, the ranges field, the pages field, the bookmarks to split at, or the
 * size a part may have.
 */
export function RulesPanel({
  mode,
  count,
  several,
  every,
  onEvery,
  everyCount,
  onPlaceEvery,
  equal,
  onEqual,
  equalCount,
  onPlaceEqual,
  onEachPage,
  onClearCuts,
  hasCuts,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  ranges,
  onRanges,
  rangesWrong,
  pagesField,
  onPagesField,
  onPagesBlur,
  pagesProblem,
  selectedCount,
  onSelectAll,
  onSelectNone,
  headings,
  levels,
  level,
  onLevel,
  filter,
  onFilter,
  unticked,
  onTick,
  front,
  onFront,
  hasFront,
  size,
  onSize,
  sizeText,
  onSizeText,
  sizeUnit,
  onSizeUnit,
  sizeWrong,
}: {
  mode: SplitMode
  /** Pages of the file that is shown. */
  count: number
  /** Several files are being split, so rules apply to all of them. */
  several: boolean
  every: string
  onEvery: (text: string) => void
  /** What was typed, as a count; null when it is not one. */
  everyCount: number | null
  onPlaceEvery: () => void
  equal: string
  onEqual: (text: string) => void
  equalCount: number | null
  onPlaceEqual: () => void
  onEachPage: () => void
  onClearCuts: () => void
  hasCuts: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  ranges: string
  onRanges: (text: string) => void
  rangesWrong: boolean
  pagesField: string
  onPagesField: (text: string) => void
  onPagesBlur: () => void
  pagesProblem: string | null
  selectedCount: number
  onSelectAll: () => void
  onSelectNone: () => void
  /** The bookmarks of the shown file at the chosen level that match the words typed. */
  headings: readonly Heading[]
  /** How deep the shown file's bookmarks go. */
  levels: number
  level: number
  onLevel: (level: number) => void
  filter: string
  onFilter: (text: string) => void
  unticked: ReadonlySet<number>
  onTick: (pages: readonly number[], ticked: boolean) => void
  front: FrontChoice
  onFront: (front: FrontChoice) => void
  /** There are pages before the first bookmark that is ticked. */
  hasFront: boolean
  size: SizeChoice
  onSize: (size: SizeChoice) => void
  sizeText: string
  onSizeText: (text: string) => void
  sizeUnit: SizeUnit
  onSizeUnit: (unit: SizeUnit) => void
  sizeWrong: boolean
}) {
  const ids = useId()
  const toAll = several ? " in every file" : ""
  return (
    <div
      className="space-y-3 rounded-lg border bg-card p-3"
      data-testid="split-rules"
    >
      {mode === "cuts" && (
        <>
          <form
            className="flex flex-wrap items-center gap-2 text-sm"
            onSubmit={(event) => {
              event.preventDefault()
              if (everyCount) onPlaceEvery()
            }}
          >
            <label htmlFor={`${ids}-every`}>Cut after every</label>
            <Input
              id={`${ids}-every`}
              inputMode="numeric"
              autoComplete="off"
              value={every}
              onChange={(event) => onEvery(event.target.value)}
              aria-invalid={everyCount === null || undefined}
              className="w-16 text-center font-mono"
            />
            <span>pages</span>
            <Button
              type="submit"
              variant="outline"
              disabled={everyCount === null}
            >
              Place the cuts
            </Button>
          </form>
          <form
            className="flex flex-wrap items-center gap-2 text-sm"
            onSubmit={(event) => {
              event.preventDefault()
              if (equalCount) onPlaceEqual()
            }}
          >
            <label htmlFor={`${ids}-equal`}>Cut into</label>
            <Input
              id={`${ids}-equal`}
              inputMode="numeric"
              autoComplete="off"
              value={equal}
              onChange={(event) => onEqual(event.target.value)}
              aria-invalid={equalCount === null || undefined}
              className="w-16 text-center font-mono"
            />
            <span>equal parts</span>
            <Button
              type="submit"
              variant="outline"
              disabled={equalCount === null}
            >
              Place the cuts
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onEachPage}>
              Every page on its own
            </Button>
            <Button variant="ghost" disabled={!hasCuts} onClick={onClearCuts}>
              Remove all cuts
            </Button>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Undo"
              title="Undo"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <IconArrowBackUp aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Redo"
              title="Redo"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <IconArrowForwardUp aria-hidden="true" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {several &&
              "The rules above place cuts in every file; cuts pressed by hand, and undo, are for the file shown. "}
            On the keyboard: move between pages with the arrow keys, press S to
            cut after a page and Enter to read from it.
          </p>
        </>
      )}

      {mode === "ranges" && (
        <div>
          <label
            htmlFor={`${ids}-ranges`}
            className="mb-1 block text-sm font-medium"
          >
            Pages of each part
          </label>
          <Input
            id={`${ids}-ranges`}
            value={ranges}
            onChange={(event) => onRanges(event.target.value)}
            placeholder="1-3, 4-10, 11-"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={rangesWrong || undefined}
            aria-describedby={`${ids}-ranges-hint`}
            className="font-mono"
          />
          <p
            id={`${ids}-ranges-hint`}
            className="mt-1 text-xs text-muted-foreground"
          >
            A comma starts a new part. An open range such as 11- runs to the
            last page. Join ranges into one part with a plus sign: 1-3 + 7.
            {several && " The same ranges are taken from every file."}
          </p>
        </div>
      )}

      {mode === "oddeven" && (
        <p className="text-sm">
          Pages 1, 3, 5 and so on become one file, and pages 2, 4, 6 and so on
          another. Use it to part the fronts from the backs of a double-sided
          scan.
        </p>
      )}

      {(mode === "extract" || mode === "remove") && (
        <div>
          <label
            htmlFor={`${ids}-pages`}
            className="mb-1 block text-sm font-medium"
          >
            {mode === "extract" ? "Pages to take out" : "Pages to remove"}
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${ids}-pages`}
              value={pagesField}
              onChange={(event) => onPagesField(event.target.value)}
              onBlur={onPagesBlur}
              placeholder="1-3, 7"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={pagesProblem ? true : undefined}
              aria-describedby={`${ids}-pages-hint`}
              className="min-w-0 flex-1 basis-40 font-mono"
            />
            <Button
              variant="outline"
              disabled={selectedCount === count}
              onClick={onSelectAll}
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              disabled={!selectedCount}
              onClick={onSelectNone}
            >
              Clear
            </Button>
          </div>
          <p
            id={`${ids}-pages-hint`}
            role={pagesProblem ? "alert" : undefined}
            className={cn(
              "mt-1 text-xs",
              pagesProblem ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {pagesProblem ??
              `Type pages, or press them below. Shift-click selects everything between two pages. ${plural(selectedCount, "page")} selected.${several ? " Typed pages are selected in every file; pressed pages only in the file shown." : ""}`}
          </p>
        </div>
      )}

      {mode === "bookmarks" && (
        <>
          {levels > 1 && (
            <ChoiceChips
              label="Split at"
              value={String(Math.min(level, levels))}
              onValueChange={(value) => onLevel(Number(value))}
              options={Array.from({ length: Math.min(levels, 6) }, (_, at) => ({
                value: String(at + 1),
                label: at === 0 ? "Top bookmarks" : `Level ${at + 1}`,
              }))}
              hint="Bookmarks can sit under one another. Each bookmark of the level you choose starts a part."
            />
          )}
          <div>
            <label
              htmlFor={`${ids}-filter`}
              className="mb-1 block text-sm font-medium"
            >
              Only bookmarks that contain
            </label>
            <Input
              id={`${ids}-filter`}
              value={filter}
              onChange={(event) => onFilter(event.target.value)}
              placeholder="Any words, such as Chapter"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {headings.length > 0 && (
            <fieldset>
              <legend className="mb-1 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-medium">
                <span>
                  Bookmarks to split at{toAll && " (file shown)"} ·{" "}
                  {
                    headings.filter((heading) => !unticked.has(heading.page))
                      .length
                  }{" "}
                  of {headings.length}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onTick(
                        headings.map((heading) => heading.page),
                        true
                      )
                    }
                  >
                    Tick all
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onTick(
                        headings.map((heading) => heading.page),
                        false
                      )
                    }
                  >
                    Untick all
                  </Button>
                </span>
              </legend>
              <ul
                className="max-h-72 overflow-y-auto rounded-lg border"
                data-testid="bookmark-list"
              >
                {headings.slice(0, MOST_BOOKMARKS).map((heading) => (
                  <li key={heading.page} className="border-b last:border-b-0">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-accent md:min-h-9">
                      <input
                        type="checkbox"
                        checked={!unticked.has(heading.page)}
                        onChange={(event) =>
                          onTick([heading.page], event.target.checked)
                        }
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 flex-1 break-words">
                        {heading.title || "Untitled"}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {heading.page + 1}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {headings.length > MOST_BOOKMARKS && (
                <p className="mt-1 text-xs text-muted-foreground">
                  The first {MOST_BOOKMARKS} are listed. The rest are split at
                  too, unless you narrow them down above.
                </p>
              )}
            </fieldset>
          )}
          {hasFront && (
            <ChoiceChips
              label="Pages before the first bookmark"
              value={front}
              onValueChange={onFront}
              options={[
                { value: "own", label: "A part of their own" },
                { value: "join", label: "Join the first part" },
              ]}
            />
          )}
        </>
      )}

      {mode === "size" && (
        <>
          <ChoiceChips
            label="Largest size of a part"
            value={size}
            onValueChange={onSize}
            options={[
              ...SIZE_CHOICES.map((value) => ({
                value,
                label: `${value} MB`,
              })),
              { value: "custom" as const, label: "Another size" },
            ]}
          />
          {size === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor={`${ids}-size`}
                  className="mb-1 block text-sm font-medium"
                >
                  Size
                </label>
                <Input
                  id={`${ids}-size`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={sizeText}
                  onChange={(event) => onSizeText(event.target.value)}
                  aria-invalid={sizeWrong || undefined}
                  className="w-24 font-mono"
                />
              </div>
              <ChoiceChips
                label="Unit"
                hideLabel
                value={sizeUnit}
                onValueChange={onSizeUnit}
                options={[
                  { value: "MB", label: "MB" },
                  { value: "KB", label: "KB" },
                ]}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Each part takes as many pages as fit. The parts are found by writing
            them, so they are only known once the file is split, and a large
            file takes a while. Pictures are not made smaller: a single page
            that is over the size gets a part to itself, and its row says so.
          </p>
        </>
      )}
    </div>
  )
}
