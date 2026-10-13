"use client"

import { useId, useState } from "react"
import {
  IconArrowDown,
  IconArrowUp,
  IconBookmarkPlus,
  IconIndentDecrease,
  IconIndentIncrease,
  IconMapPin,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import {
  added,
  bookmarkAt,
  bookmarkTo,
  indented,
  LABEL_NAMES,
  LABEL_STYLES,
  labelsFor,
  listed,
  movedBy,
  outdented,
  removed,
  renamed,
  retargeted,
  sameDetails,
  type Details,
  type LabelRun,
  type LabelStyle,
} from "@/lib/pdf-editor/document"
import type { Bookmark } from "@/lib/pdf-merger/outline"
import { cn } from "cn"
import type { Described } from "./use-described"
import type { Editor } from "./use-editor"

const PARTS = {
  details: "Details",
  bookmarks: "Bookmarks",
  labels: "Page numbers",
} as const
type Part = keyof typeof PARTS

const DETAIL_NAMES: Record<keyof Details, string> = {
  title: "Title",
  author: "Author",
  subject: "Subject",
  keywords: "Keywords",
}

const field =
  "h-11 w-full min-w-0 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
const act =
  "shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"

/** What the file says of itself: typed, and saved as one step. */
function DetailsPart({ editor }: { editor: Editor }) {
  const ids = useId()
  const { details } = editor.described
  const [draft, setDraft] = useState(details)
  // What the file says wins over what was last typed here, as after an undo.
  const [held, setHeld] = useState(details)
  if (!sameDetails(details, held)) {
    setHeld(details)
    setDraft(details)
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!sameDetails(draft, details))
          void editor.changeDocument("Change the file's details", {
            do: "details",
            details: draft,
          })
      }}
    >
      {(Object.keys(DETAIL_NAMES) as (keyof Details)[]).map((key) => (
        <div key={key} className="space-y-1">
          <label
            htmlFor={`${ids}-${key}`}
            className="block text-xs text-muted-foreground"
          >
            {DETAIL_NAMES[key]}
          </label>
          <input
            id={`${ids}-${key}`}
            type="text"
            value={draft[key]}
            maxLength={2000}
            onChange={(event) =>
              setDraft({ ...draft, [key]: event.target.value })
            }
            className={field}
          />
        </div>
      ))}
      <Button
        type="submit"
        disabled={sameDetails(draft, details)}
        className="h-11 w-full md:h-9"
      >
        Save the details
      </Button>
      <p className="text-xs text-muted-foreground">
        These are what a program shows as the file&apos;s title and author, and
        what a search of files looks through. Empty a field to take that detail
        out of the file.
      </p>
    </form>
  )
}

const keyOf = (path: readonly number[]) => path.join(".")

/** The file's bookmarks: named, added, led to a page, moved, put beneath one another and deleted. */
function BookmarksPart({
  editor,
  reading,
  onGo,
}: {
  editor: Editor
  reading: () => number
  onGo: (page: number) => void
}) {
  const { bookmarks } = editor.described
  const [chosen, setChosen] = useState<number[] | null>(null)
  /** A name as it is typed, for the bookmark at a place, until it is saved. */
  const [typed, setTyped] = useState<{ key: string; title: string } | null>(
    null
  )
  const rows = listed(bookmarks)
  const picked = chosen && bookmarkAt(bookmarks, chosen) ? chosen : null
  const pages = editor.sizes.length
  const save = (label: string, items: Bookmark[], next?: number[] | null) => {
    if (next !== undefined) setChosen(next)
    setTyped(null)
    return editor.changeDocument(label, { do: "bookmarks", items })
  }
  /** Do something to the chosen bookmark that also says where it then is. */
  const shift = (
    label: string,
    how: (
      items: readonly Bookmark[],
      path: number[]
    ) => { items: Bookmark[]; path: number[] } | null
  ) => {
    const done = picked && how(bookmarks, picked)
    if (done) void save(label, done.items, done.path)
  }
  const can = (how: (items: readonly Bookmark[], path: number[]) => unknown) =>
    Boolean(picked && how(bookmarks, picked))
  return (
    <div className="space-y-2">
      <div
        role="toolbar"
        aria-label="Change the chosen bookmark"
        className="flex items-center gap-0.5 overflow-x-auto"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add a bookmark to the page being read"
          title="Add a bookmark to the page being read"
          onClick={() => {
            const page = reading()
            const done = added(
              bookmarks,
              picked,
              bookmarkTo(`Page ${page + 1}`, page)
            )
            void save("Add a bookmark", done.items, done.path)
          }}
          className={act}
        >
          <IconBookmarkPlus aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Move up"
          title="Move up"
          disabled={!can((items, path) => movedBy(items, path, -1))}
          onClick={() =>
            shift("Move a bookmark", (items, path) => movedBy(items, path, -1))
          }
          className={act}
        >
          <IconArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Move down"
          title="Move down"
          disabled={!can((items, path) => movedBy(items, path, 1))}
          onClick={() =>
            shift("Move a bookmark", (items, path) => movedBy(items, path, 1))
          }
          className={act}
        >
          <IconArrowDown aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Put beneath the one above"
          title="Put beneath the one above"
          disabled={!can(indented)}
          onClick={() => shift("Move a bookmark", indented)}
          className={act}
        >
          <IconIndentIncrease aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Take out from beneath"
          title="Take out from beneath"
          disabled={!can(outdented)}
          onClick={() => shift("Move a bookmark", outdented)}
          className={act}
        >
          <IconIndentDecrease aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Lead it to the page being read"
          title="Lead it to the page being read"
          disabled={!picked}
          onClick={() =>
            picked &&
            void save(
              "Lead a bookmark elsewhere",
              retargeted(bookmarks, picked, reading())
            )
          }
          className={act}
        >
          <IconMapPin aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Delete the bookmark"
          title="Delete the bookmark, with those beneath it"
          disabled={!picked}
          onClick={() =>
            picked &&
            void save("Delete a bookmark", removed(bookmarks, picked), null)
          }
          className={act}
        >
          <IconTrash aria-hidden="true" />
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This file has no bookmarks. Go to a page and add one for it.
        </p>
      ) : (
        <ul aria-label="Bookmarks" className="space-y-1">
          {rows.map(({ bookmark, path }) => {
            const key = keyOf(path)
            const mine = picked !== null && keyOf(picked) === key
            const title = typed?.key === key ? typed.title : bookmark.title
            const rename = () => {
              if (typed?.key !== key) return
              if (typed.title.trim() && typed.title !== bookmark.title)
                void save(
                  "Rename a bookmark",
                  renamed(bookmarks, path, typed.title.trim())
                )
              else setTyped(null)
            }
            return (
              <li
                key={key}
                data-testid="bookmark-row"
                data-chosen={mine || undefined}
                className={cn(
                  "flex items-center gap-1 rounded-md",
                  mine && "bg-primary/10 ring-1 ring-primary"
                )}
                style={{ marginLeft: (path.length - 1) * 16 }}
              >
                <input
                  type="text"
                  aria-label={`Name of bookmark ${path.map((at) => at + 1).join(".")}`}
                  value={title}
                  maxLength={500}
                  onFocus={() => setChosen(path)}
                  onChange={(event) =>
                    setTyped({ key, title: event.target.value })
                  }
                  onBlur={rename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      rename()
                    } else if (event.key === "Escape" && typed?.key === key) {
                      // The name is left as it was; the panel stays.
                      event.preventDefault()
                      event.stopPropagation()
                      setTyped(null)
                    }
                  }}
                  className={cn(field, "border-transparent bg-transparent")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={bookmark.page === null || bookmark.page >= pages}
                  aria-label={
                    bookmark.page === null
                      ? `${bookmark.title} leads to no page`
                      : `Go to page ${bookmark.page + 1}, where ${bookmark.title} leads`
                  }
                  title={
                    bookmark.page === null ? "Leads to no page" : "Go there"
                  }
                  onClick={() => bookmark.page !== null && onGo(bookmark.page)}
                  className="h-11 shrink-0 px-2 font-mono text-xs md:h-9"
                >
                  {bookmark.page === null ? "–" : bookmark.page + 1}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Click a name to choose a bookmark and to rename it. The number is the
        page it leads to.
      </p>
    </div>
  )
}

const sameRuns = (one: readonly LabelRun[], two: readonly LabelRun[]) =>
  JSON.stringify(one) === JSON.stringify(two)

/** The numbers the file gives its own pages, in runs: typed, and saved as one step. */
function LabelsPart({ editor }: { editor: Editor }) {
  const ids = useId()
  const { runs } = editor.described
  const pages = editor.sizes.length
  const [draft, setDraft] = useState<LabelRun[]>(runs)
  const [held, setHeld] = useState(runs)
  if (!sameRuns(runs, held)) {
    setHeld(runs)
    setDraft(runs)
  }
  const set = (at: number, change: Partial<LabelRun>) =>
    setDraft(
      draft.map((run, index) => (index === at ? { ...run, ...change } : run))
    )
  const starts = draft.map((run) => run.start)
  const problem = draft.some(
    (run) => !Number.isInteger(run.start) || run.start < 0 || run.start >= pages
  )
    ? `A run begins at a page from 1 to ${pages}.`
    : new Set(starts).size !== starts.length
      ? "Two runs begin at the same page."
      : draft.some((run) => !Number.isInteger(run.first) || run.first < 1)
        ? "A run's first number is 1 or more."
        : ""
  const sorted = [...draft].sort((a, b) => a.start - b.start)
  const shown = problem ? [] : labelsFor(sorted, Math.min(pages, 8))
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!problem && !sameRuns(sorted, runs))
          void editor.changeDocument("Change the page numbers of the file", {
            do: "labels",
            runs: sorted,
          })
      }}
    >
      <p className="text-xs text-muted-foreground">
        A file can number its own pages in runs: i, ii, iii for what comes
        first, then 1, 2, 3. These are the numbers a program shows in its page
        box. Nothing is written on the pages; for that, use Numbers and
        watermarks.
      </p>
      {draft.length === 0 && (
        <p className="text-sm">The pages are simply counted: 1, 2, 3.</p>
      )}
      {draft.map((run, at) => (
        <fieldset
          key={at}
          data-testid="label-run"
          className="grid grid-cols-2 gap-2 rounded-md border p-2"
        >
          <legend className="px-1 text-xs text-muted-foreground">
            Run {at + 1}
          </legend>
          <label className="space-y-1 text-xs text-muted-foreground">
            From page
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={pages}
              value={Number.isFinite(run.start) ? run.start + 1 : ""}
              onChange={(event) =>
                set(at, { start: Math.round(Number(event.target.value)) - 1 })
              }
              className={field}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Written as
            <select
              value={run.style}
              onChange={(event) =>
                set(at, { style: event.target.value as LabelStyle })
              }
              className={field}
            >
              {LABEL_STYLES.map((style) => (
                <option key={style} value={style}>
                  {LABEL_NAMES[style]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Before the number
            <input
              type="text"
              value={run.prefix}
              maxLength={60}
              onChange={(event) => set(at, { prefix: event.target.value })}
              className={field}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            First number
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={Number.isFinite(run.first) ? run.first : ""}
              onChange={(event) =>
                set(at, { first: Math.round(Number(event.target.value)) })
              }
              className={field}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            className="col-span-2 h-11 md:h-9"
            onClick={() => setDraft(draft.filter((_, index) => index !== at))}
          >
            <IconTrash aria-hidden="true" /> Take run {at + 1} away
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full md:h-9"
        onClick={() => {
          // After the last run, at the first page no run begins at yet.
          let start = draft.length
            ? Math.max(...draft.map((run) => run.start)) + 1
            : 0
          if (start >= pages) start = 0
          setDraft([...draft, { start, style: "D", prefix: "", first: 1 }])
        }}
      >
        <IconPlus aria-hidden="true" /> Add a run
      </Button>
      {problem ? (
        <p role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      ) : (
        <p
          id={`${ids}-shown`}
          data-testid="labels-shown"
          className="text-xs text-muted-foreground"
        >
          The first pages will be called: {shown.join(", ") || "nothing"}
          {pages > shown.length ? ", …" : ""}
        </p>
      )}
      <Button
        type="submit"
        disabled={Boolean(problem) || sameRuns(sorted, runs)}
        className="h-11 w-full md:h-9"
      >
        Save the page numbers
      </Button>
    </form>
  )
}

/**
 * The panel for the file as a whole: what it says of itself, its
 * bookmarks, and the numbers it gives its own pages.
 */
export function DocumentPanel({
  editor,
  described,
  reading,
  onGo,
}: {
  editor: Editor
  described: Described
  /** The page that is being read, counted from 0. */
  reading: () => number
  /** Show a page in the reader. */
  onGo: (page: number) => void
}) {
  const ids = useId()
  const [part, setPart] = useState<Part>("details")
  return (
    <aside
      aria-labelledby={`${ids}-title`}
      data-testid="editor-document"
      className="absolute inset-x-0 bottom-0 z-10 flex h-[70%] flex-col border-t bg-popover shadow-lg md:static md:h-auto md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none"
    >
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <h2
          id={`${ids}-title`}
          className="px-1 font-heading text-sm font-medium"
        >
          The file
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close the file's details"
          title="Close"
          onClick={() => described.setOn(false)}
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <ChoiceChips
          label="What to change"
          hideLabel
          value={part}
          onValueChange={setPart}
          options={(Object.keys(PARTS) as Part[]).map((value) => ({
            value,
            label: PARTS[value],
          }))}
        />
        {part === "details" ? (
          <DetailsPart editor={editor} />
        ) : part === "bookmarks" ? (
          <BookmarksPart editor={editor} reading={reading} onGo={onGo} />
        ) : (
          <LabelsPart editor={editor} />
        )}
      </div>
    </aside>
  )
}
