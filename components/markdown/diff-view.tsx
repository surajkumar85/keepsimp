"use client"

import { useLayoutEffect, useRef } from "react"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { unifiedMergeView } from "@codemirror/merge"

const theme = EditorView.theme({
  "&": {
    fontSize: "13px",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-geist-mono)",
    lineHeight: "1.7",
  },
  ".cm-content": { padding: "8px 0" },
  ".cm-changedLine": {
    backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)",
  },
  ".cm-changedText": {
    backgroundColor: "color-mix(in oklch, var(--primary) 30%, transparent)",
  },
  ".cm-deletedChunk": {
    backgroundColor: "color-mix(in oklch, var(--destructive) 10%, transparent)",
  },
  ".cm-deletedChunk .cm-deletedText": {
    backgroundColor: "color-mix(in oklch, var(--destructive) 25%, transparent)",
  },
  ".cm-gutters": { backgroundColor: "var(--card)", border: "none" },
})

/**
 * Two texts in one column: lines taken out on a red wash above the lines
 * put in their place on a teal one. Read only.
 */
export function DiffView({
  before,
  after,
  label,
}: {
  before: string
  after: string
  label: string
}) {
  const container = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!container.current) return
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: after,
        extensions: [
          theme,
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ "aria-label": label }),
          unifiedMergeView({
            original: before,
            mergeControls: false,
            gutter: true,
          }),
        ],
      }),
    })
    return () => view.destroy()
  }, [before, after, label])
  return (
    <div
      ref={container}
      className="max-h-[60dvh] min-h-32 overflow-auto rounded-lg border"
      data-testid="markdown-diff"
    />
  )
}
