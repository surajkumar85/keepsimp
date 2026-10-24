"use client"

import { IconFileText, IconFolderOpen } from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { isMarkdownFile } from "@/lib/markdown/document"
import type { FolderFile } from "./files"
import { SidePanel } from "./side-panel"

/**
 * A folder opened in place (Chrome and Edge): its Markdown files, each
 * opened in a tab and saved back where it is. Its other files are counted,
 * so links to them can be checked.
 */
export function FolderPanel({
  name,
  files,
  openPaths,
  onOpen,
  onChange,
  onClose,
}: {
  name: string
  files: FolderFile[]
  /** Paths already open in tabs. */
  openPaths: ReadonlySet<string>
  onOpen: (file: FolderFile) => void
  onChange: () => void
  onClose: () => void
}) {
  const markdown = files.filter((file) =>
    isMarkdownFile({ name: file.path, type: "" })
  )
  return (
    <SidePanel
      title={name}
      count={markdown.length}
      onClose={onClose}
      testId="markdown-folder"
    >
      {markdown.length ? (
        <ul className="space-y-0.5" aria-label="Markdown files in the folder">
          {markdown.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onOpen(file)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                  openPaths.has(file.path) && "font-medium"
                )}
              >
                <IconFileText
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{file.path}</span>
                {openPaths.has(file.path) && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    open
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          This folder has no Markdown files.
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {files.length - markdown.length} other files. Links from a document to
        them are checked in the document check. Saving writes each file where it
        is.
      </p>
      <Button variant="outline" className="mt-3 w-full" onClick={onChange}>
        <IconFolderOpen aria-hidden="true" />
        Open another folder
      </Button>
    </SidePanel>
  )
}
