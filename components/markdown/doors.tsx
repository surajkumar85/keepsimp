"use client"

import Link from "next/link"
import {
  IconBrandWindows,
  IconFileTypeDocx,
  IconFileTypeHtml,
  IconPrinter,
  IconTable,
  IconWorld,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

/** The page the editor is opened as: the editor itself, or a door into it for one job. */
export type MarkdownMode =
  | "editor"
  | "to-html"
  | "to-pdf"
  | "to-word"
  | "from-html"
  | "from-word"
  | "table"

/** What each door does, and its one button. */
export const DOORS: Record<
  Exclude<MarkdownMode, "editor">,
  { job: string; said: string; action: string; icon: typeof IconWorld }
> = {
  "to-html": {
    job: "turning Markdown into HTML",
    said: "Write or open Markdown, then download a web page that stands alone, or copy its HTML.",
    action: "Download the web page",
    icon: IconFileTypeHtml,
  },
  "to-pdf": {
    job: "turning Markdown into a PDF",
    said: "Write or open Markdown, then print it and choose Save as PDF in the dialog.",
    action: "Print or save as PDF",
    icon: IconPrinter,
  },
  "to-word": {
    job: "turning Markdown into a Word file",
    said: "Write or open Markdown, then download it as a .docx file with Word's own headings, lists and tables.",
    action: "Download the Word file",
    icon: IconFileTypeDocx,
  },
  "from-html": {
    job: "turning HTML into Markdown",
    said: "Open an HTML file, or copy part of a web page and paste it into the editor: it becomes Markdown.",
    action: "Open an HTML file",
    icon: IconWorld,
  },
  "from-word": {
    job: "turning Word files into Markdown",
    said: "Open a .docx file: its headings, lists, tables, links and pictures become Markdown. Or paste from Word.",
    action: "Open a Word file",
    icon: IconBrandWindows,
  },
  table: {
    job: "making Markdown tables",
    said: "Type a table into a grid of cells, or paste cells from a spreadsheet into the editor: it becomes a Markdown table.",
    action: "Make a table",
    icon: IconTable,
  },
}

/** The line above the editor on a door: what this page is for, and its one button. */
export function DoorBanner({
  mode,
  onAction,
  busy,
}: {
  mode: Exclude<MarkdownMode, "editor">
  onAction: () => void
  busy: boolean
}) {
  const door = DOORS[mode]
  const Icon = door.icon
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3"
      data-testid="markdown-door"
    >
      <p className="min-w-0 flex-1 text-sm">
        {door.said}{" "}
        <span className="text-muted-foreground">
          This page is the{" "}
          <Link
            href="/dashboard/markdown-editor/"
            prefetch={false}
            className="underline"
          >
            Markdown editor
          </Link>
          , opened for {door.job}.
        </span>
      </p>
      <Button onClick={onAction} disabled={busy}>
        <Icon aria-hidden="true" />
        {door.action}
      </Button>
    </div>
  )
}
