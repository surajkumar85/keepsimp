"use client"

import { useEffect, useState } from "react"
import { IconCircleCheck, IconLoader2, IconTool } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import type { Issue } from "@/lib/markdown/check"
import type { Readability } from "@/lib/markdown/readability"
import { SidePanel } from "./side-panel"

interface Found {
  text: string
  issues: Issue[]
  readability: Readability
  /** Links to files of the open folder that are not in it. */
  missing: { line: number; target: string }[]
}

const LOCAL_LINK = /\]\((?!https?:|mailto:|tel:|#|\/)([^)\s#]+)/g

/**
 * The document check: markdownlint's findings, each with its line and a
 * fix where there is one, links to files missing from the open folder,
 * and a readability estimate for English. Run a moment after each change.
 */
export function CheckPanel({
  text,
  plain,
  folder,
  onGo,
  onReplace,
  onClose,
}: {
  text: string
  /** The words without their marks, for the readability estimate. */
  plain: string
  /** Paths of the open folder's files, relative to the document, when a folder is open. */
  folder: ReadonlySet<string> | null
  onGo: (line: number) => void
  /** The whole text replaced by a fixed one, as one step to undo. */
  onReplace: (text: string, said: string) => void
  onClose: () => void
}) {
  const [found, setFound] = useState<Found | null>(null)
  const fresh = found?.text === text

  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      void Promise.all([
        import("@/lib/markdown/check"),
        import("@/lib/markdown/readability"),
      ]).then(([{ checkDocument }, { readabilityOf }]) => {
        if (!current) return
        const missing: Found["missing"] = []
        if (folder)
          text.split("\n").forEach((line, index) => {
            for (const match of line.matchAll(LOCAL_LINK)) {
              const target = decodeURIComponent(match[1]).replace(/^\.\//, "")
              if (!folder.has(target)) missing.push({ line: index + 1, target })
            }
          })
        setFound({
          text,
          issues: checkDocument(text),
          readability: readabilityOf(plain),
          missing,
        })
      })
    }, 400)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [text, plain, folder])

  const fixable = found?.issues.filter((one) => one.fixable) ?? []
  const count = found ? found.issues.length + found.missing.length : undefined

  return (
    <SidePanel
      title="Document check"
      count={count}
      onClose={onClose}
      testId="markdown-check"
    >
      <p
        className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {!fresh ? (
          <>
            <IconLoader2
              className="size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Checking…
          </>
        ) : count === 0 ? (
          <>
            <IconCircleCheck
              className="size-3.5 text-primary"
              aria-hidden="true"
            />
            Nothing to fix
          </>
        ) : (
          `${count} ${count === 1 ? "thing" : "things"} to look at`
        )}
      </p>
      {found && fixable.length > 0 && (
        <Button
          variant="outline"
          className="mb-3 w-full"
          onClick={() =>
            void import("@/lib/markdown/check").then(({ fixAll }) =>
              onReplace(
                fixAll(text),
                `Fixed ${fixable.length} ${fixable.length === 1 ? "thing" : "things"}`
              )
            )
          }
        >
          <IconTool aria-hidden="true" />
          Fix {fixable.length} {fixable.length === 1 ? "thing" : "things"} that
          can be fixed
        </Button>
      )}
      {found && (
        <ul className="space-y-2" aria-label="Findings">
          {found.missing.map((one) => (
            <li
              key={`missing-${one.line}-${one.target}`}
              className="rounded-lg border p-2.5 text-sm"
            >
              <button
                type="button"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => onGo(one.line - 1)}
              >
                Line {one.line}
              </button>
              <p>A link to a file that is not in the open folder.</p>
              <p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
                {one.target}
              </p>
            </li>
          ))}
          {found.issues.map((issue, index) => (
            <li
              key={`${issue.rule}-${issue.line}-${index}`}
              className="rounded-lg border p-2.5 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => onGo(issue.line - 1)}
                >
                  Line {issue.line}
                </button>
                <span className="font-mono text-xs text-muted-foreground">
                  {issue.rule}
                </span>
              </div>
              <p className="mt-0.5">{issue.said}</p>
              {issue.detail && (
                <p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
                  {issue.detail}
                </p>
              )}
              {issue.fixable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-11 px-2 md:h-7"
                  onClick={() =>
                    void import("@/lib/markdown/check").then(({ fixIssues }) =>
                      onReplace(
                        fixIssues(text, [issue]),
                        `Fixed line ${issue.line}`
                      )
                    )
                  }
                >
                  Fix it
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {found && (
        <section
          aria-labelledby="readability-title"
          className="mt-5 border-t pt-4"
        >
          <h3
            id="readability-title"
            className="font-heading text-sm font-medium"
          >
            How easy it is to read
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            An estimate for English text, made on this device. A guide, not a
            rule.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Reading ease</dt>
              <dd className="font-heading text-lg font-medium tabular-nums">
                {found.readability.ease}
              </dd>
              <dd className="text-xs">{found.readability.said}</dd>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <dt className="text-xs text-muted-foreground">
                Words a sentence
              </dt>
              <dd className="font-heading text-lg font-medium tabular-nums">
                {found.readability.averageSentence}
              </dd>
              <dd className="text-xs">
                {found.readability.sentences} sentences
              </dd>
            </div>
          </dl>
          {found.readability.long.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer py-1">
                {found.readability.long.length} long{" "}
                {found.readability.long.length === 1 ? "sentence" : "sentences"}{" "}
                (over 25 words)
              </summary>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {found.readability.long.slice(0, 20).map((sentence, index) => (
                  <li key={index}>{sentence}</li>
                ))}
              </ul>
            </details>
          )}
          {found.readability.passive.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer py-1">
                {found.readability.passive.length}{" "}
                {found.readability.passive.length === 1
                  ? "phrase that may be"
                  : "phrases that may be"}{" "}
                passive
              </summary>
              <ul className="mt-1 flex flex-wrap gap-1 text-xs">
                {found.readability.passive.slice(0, 40).map((phrase, index) => (
                  <li key={index} className="rounded-sm bg-muted px-1.5 py-0.5">
                    {phrase}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Rules from markdownlint. Links are checked only inside the document
        {folder ? " and the open folder" : ""}: nothing is asked of the
        internet.
      </p>
    </SidePanel>
  )
}
