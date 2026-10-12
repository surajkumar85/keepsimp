"use client"

import { useEffect, useState } from "react"
import { screenFamily } from "@/lib/pdf-editor/fonts"
import { cssColour } from "@/lib/pdf-editor/styles"
import { standIns, type PageLine } from "@/lib/pdf-editor/retext"
import { cn } from "cn"
import type { Editor } from "./use-editor"
import type { Retext } from "./use-retext"

/** The generic family of a stand-in font, for the browser to type in before that font is loaded. */
const generic = (key: string) =>
  key.startsWith("mono")
    ? "monospace"
    : key.startsWith("serif")
      ? "serif"
      : "sans-serif"

/**
 * The lines of a page's own text, each as a place that can be clicked to
 * change its words. The line being changed is a field over it, in a font
 * close to its own; the page shows the real thing once the file has it.
 */
export function LineSpots({
  editor,
  retext,
  page,
  version,
}: {
  editor: Editor
  retext: Retext
  /** Counted from 0. */
  page: number
  /** How often the page has been drawn again: its lines are read anew each time. */
  version: number
}) {
  const [read, setRead] = useState<{ of: string; lines: PageLine[] } | null>(
    null
  )
  const key = `${page}/${version}`
  const { lines: linesOf } = editor
  useEffect(() => {
    let stale = false
    void linesOf(page, version).then(
      (lines) => !stale && setRead({ of: `${page}/${version}`, lines })
    )
    return () => {
      stale = true
    }
  }, [linesOf, page, version])
  // Lines that were read from the page as it was are not offered for the page as it is.
  const lines = read?.of === key ? read.lines : []
  const typing = retext.typing?.page === page ? retext.typing : null

  return (
    <>
      {lines.map((line, at) => {
        if (typing && typing.line === line) return null
        const { box } = line
        return (
          <button
            key={`${at}/${line.text}`}
            type="button"
            data-hold
            data-testid="editor-line"
            data-fixed={line.fixed ? "true" : undefined}
            aria-label={`Change the line: ${line.text}`}
            title={line.fixed ?? "Change these words"}
            className={cn(
              "absolute cursor-text rounded-xs outline-1 outline-primary/40 hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary",
              line.fixed ? "outline-dashed" : "outline"
            )}
            style={{
              left: box.x - 1,
              top: box.y,
              width: box.width + 2,
              height: box.height,
            }}
            // The page under it must not take a press here for one of its own.
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              retext.setTyping({ page, line, text: line.text })
            }}
            onKeyDown={(event) => {
              if (event.key !== "Delete" && event.key !== "Backspace") return
              event.preventDefault()
              event.stopPropagation()
              retext.change(page, line, "")
            }}
          />
        )
      })}
      {typing &&
        (() => {
          const { line, text } = typing
          const [style] = line.styles
          const size = style?.size ?? 12
          // Phones zoom the whole page in on a field with letters under 16
          // pixels; the field is made larger and scaled back down.
          const grow = Math.max(1, 16 / size)
          const lent = standIns(line, text.trim())
          const finish = (words: string | null) => {
            if (words === null) retext.setTyping(null)
            else retext.change(page, line, words)
          }
          return (
            <div
              className="absolute"
              style={{ left: line.box.x - 1, top: line.box.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <input
                autoFocus
                data-testid="editor-retext"
                aria-label="The words of this line"
                aria-describedby={
                  line.fixed || lent.length ? `retext-${page}` : undefined
                }
                value={text}
                readOnly={Boolean(line.fixed)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                onChange={(event) =>
                  retext.setTyping({ page, line, text: event.target.value })
                }
                onBlur={() => finish(line.fixed ? null : text)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    event.preventDefault()
                    finish(null)
                  } else if (event.key === "Enter") {
                    event.preventDefault()
                    finish(line.fixed ? null : text)
                  }
                }}
                className="origin-top-left border-0 bg-white p-0 px-px outline-1 outline-primary select-text"
                style={{
                  width: Math.max(line.box.width + size * 6, size * 12) * grow,
                  height: line.box.height * grow,
                  transform: grow > 1 ? `scale(${1 / grow})` : undefined,
                  fontFamily: style
                    ? `"${screenFamily(style.standIn)}", ${generic(style.standIn)}`
                    : undefined,
                  fontWeight: style?.standIn.includes("bold") ? 700 : 400,
                  fontStyle: style?.standIn.includes("italic")
                    ? "italic"
                    : "normal",
                  fontSize: size * grow,
                  lineHeight: `${line.box.height * grow}px`,
                  color: style ? cssColour(style.colour) : undefined,
                }}
              />
              {(line.fixed || lent.length > 0) && (
                <p
                  id={`retext-${page}`}
                  role="status"
                  className="absolute left-0 w-max max-w-80 rounded-xs bg-foreground px-1 py-0.5 whitespace-normal text-background"
                  style={{
                    top: line.box.height + 2,
                    fontSize: Math.max(7, Math.min(10, size * 0.8)),
                    lineHeight: 1.3,
                  }}
                >
                  {line.fixed ??
                    `This line's font has no ${lent.map((letter) => `“${letter}”`).join(", ")}: the closest font the editor has will be used for ${lent.length === 1 ? "it" : "them"}.`}
                </p>
              )}
            </div>
          )
        })()}
    </>
  )
}
