"use client"

import { useEffect, useId, useState } from "react"
import { IconMinus, IconPlus, IconTable } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { keyLabel, SHORTCUTS } from "@/lib/markdown/shortcuts"
import { tableFromCells } from "@/lib/markdown/tables"
import { DiffView } from "./diff-view"
import { useMac } from "./toolbar"

const SYNTAX: [string, string][] = [
  ["# Heading", "A heading; ## to ###### for smaller ones"],
  ["**bold** and _italic_", "Bold and italic"],
  ["~~struck~~", "Struck through"],
  ["`code`", "Code in a line"],
  ["[words](https://…)", "A link"],
  [
    "![words](picture.png)",
    "A picture, its words for people who cannot see it",
  ],
  ["- item", "A bulleted list; indent two spaces to nest"],
  ["1. item", "A numbered list"],
  ["- [ ] task", "A task; [x] ticks it"],
  ["> quoted", "A quote"],
  ["> [!NOTE]", "An alert: NOTE, TIP, IMPORTANT, WARNING or CAUTION"],
  ["```js", "A block of code, in a language; close it with ```"],
  ["| a | b |\n| - | - |", "A table: a header, a line of dashes, then rows"],
  ["---", "A line across (and, in slides, the next slide)"],
  ["text[^1] … [^1]: note", "A footnote"],
  ["$E = mc^2$", "Maths in a line; $$ on lines of their own for a block"],
  ["```mermaid", "A diagram, drawn by Mermaid"],
]

/** Every bit of Markdown the editor reads, and every key. */
export function CheatSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mac = useMac()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>Markdown at a glance</DialogTitle>
        <DialogDescription>
          What to type, and the keys that type it for you. Press F1 to open this
          again.
        </DialogDescription>
        <div className="grid min-h-0 gap-6 overflow-y-auto md:grid-cols-2">
          <table className="w-full text-sm">
            <caption className="pb-2 text-left font-heading font-medium">
              Writing
            </caption>
            <tbody>
              {SYNTAX.map(([code, said]) => (
                <tr key={code} className="border-t align-top">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    <code className="font-mono text-xs whitespace-pre-wrap text-primary">
                      {code}
                    </code>
                  </th>
                  <td className="py-1.5 text-muted-foreground">{said}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full text-sm">
            <caption className="pb-2 text-left font-heading font-medium">
              Keys
            </caption>
            <tbody>
              {SHORTCUTS.map((shortcut) => (
                <tr key={shortcut.key} className="border-t">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {shortcut.label}
                  </th>
                  <td className="py-1.5 text-right">
                    <kbd className="rounded-sm border px-1.5 py-0.5 font-mono text-xs">
                      {keyLabel(shortcut.key, mac)}
                    </kbd>
                  </td>
                </tr>
              ))}
              <tr className="border-t">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  This sheet
                </th>
                <td className="py-1.5 text-right">
                  <kbd className="rounded-sm border px-1.5 py-0.5 font-mono text-xs">
                    F1
                  </kbd>
                </td>
              </tr>
              <tr className="border-t">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  Leave the editor
                </th>
                <td className="py-1.5 text-right text-xs text-muted-foreground">
                  Escape, then Tab
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const MOST = 20

/** A table made in a grid of fields, then written into the document as Markdown. */
export function TableMaker({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (markdown: string) => void
}) {
  const id = useId()
  const [cells, setCells] = useState<string[][]>(() => blankCells(3, 3))
  const columns = cells[0].length
  const set = (row: number, column: number, value: string) =>
    setCells((current) =>
      current.map((cellsOfRow, at) =>
        at === row
          ? cellsOfRow.map((cell, index) => (index === column ? value : cell))
          : cellsOfRow
      )
    )
  const markdown = tableFromCells(cells)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>Make a table</DialogTitle>
        <DialogDescription>
          Type into the cells; the first row is the header. Cells can hold bold,
          links and code, as in the text.
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Rows</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="One row fewer"
            disabled={cells.length <= 2}
            onClick={() => setCells((current) => current.slice(0, -1))}
          >
            <IconMinus aria-hidden="true" />
          </Button>
          <span className="w-6 text-center tabular-nums" aria-live="polite">
            {cells.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="One row more"
            disabled={cells.length >= MOST}
            onClick={() =>
              setCells((current) => [...current, Array(columns).fill("")])
            }
          >
            <IconPlus aria-hidden="true" />
          </Button>
          <span className="ml-3 text-muted-foreground">Columns</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="One column fewer"
            disabled={columns <= 1}
            onClick={() =>
              setCells((current) => current.map((row) => row.slice(0, -1)))
            }
          >
            <IconMinus aria-hidden="true" />
          </Button>
          <span className="w-6 text-center tabular-nums" aria-live="polite">
            {columns}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="One column more"
            disabled={columns >= MOST}
            onClick={() =>
              setCells((current) => current.map((row) => [...row, ""]))
            }
          >
            <IconPlus aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 overflow-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {cells.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, column) => (
                    <td key={column} className="min-w-28 border p-1">
                      <Input
                        value={cell}
                        aria-label={
                          rowIndex === 0
                            ? `Header of column ${column + 1}`
                            : `Row ${rowIndex}, column ${column + 1}`
                        }
                        className={rowIndex === 0 ? "font-medium" : undefined}
                        onChange={(event) =>
                          set(rowIndex, column, event.target.value)
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary className="cursor-pointer py-1 text-sm">
            The Markdown it writes
          </summary>
          <pre
            id={`${id}-markdown`}
            className="mt-1 max-h-40 overflow-auto rounded-lg bg-muted p-2 font-mono text-xs"
            tabIndex={0}
          >
            {markdown}
          </pre>
        </details>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCells(blankCells(3, 3))}>
            Start again
          </Button>
          <Button
            onClick={() => {
              onInsert(markdown)
              onOpenChange(false)
            }}
          >
            <IconTable aria-hidden="true" />
            Put the table in the document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function blankCells(rows: number, columns: number) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) =>
      row === 0 ? `Column ${column + 1}` : ""
    )
  )
}

/**
 * The document as Prettier would tidy it, shown as a change before it is
 * taken: tidying rewrites marks, so nothing changes until you say so.
 */
export function TidyDialog({
  open,
  text,
  onOpenChange,
  onApply,
}: {
  open: boolean
  text: string
  onOpenChange: (open: boolean) => void
  onApply: (tidy: string) => void
}) {
  const [tidy, setTidy] = useState<
    { from: string; to: string } | { from: string; problem: string } | null
  >(null)
  useEffect(() => {
    if (!open) return
    let current = true
    void import("@/lib/markdown/tidy")
      .then(({ tidyMarkdown }) => tidyMarkdown(text))
      .then(
        (to) => current && setTidy({ from: text, to }),
        (error: Error) =>
          current && setTidy({ from: text, problem: error.message })
      )
    return () => {
      current = false
    }
  }, [open, text])
  const ready = tidy && tidy.from === text ? tidy : null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>Tidy the document</DialogTitle>
        <DialogDescription>
          Prettier writes lists, emphasis, tables and spacing one way. Look at
          what would change before you take it.
        </DialogDescription>
        {!ready ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Tidying…
          </p>
        ) : "problem" in ready ? (
          <p role="alert" className="text-sm text-destructive">
            The document could not be tidied: {ready.problem}
          </p>
        ) : ready.to === text ? (
          <p className="text-sm" aria-live="polite">
            It is tidy already: nothing would change.
          </p>
        ) : (
          <DiffView
            before={text}
            after={ready.to}
            label="What tidying would change"
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!ready || "problem" in ready || ready.to === text}
            onClick={() => {
              if (ready && "to" in ready) onApply(ready.to)
              onOpenChange(false)
            }}
          >
            Take the changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
