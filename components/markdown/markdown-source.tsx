"use client"

import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react"
import { Annotation, EditorSelection, EditorState } from "@codemirror/state"
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  keymap,
  placeholder,
  rectangularSelection,
} from "@codemirror/view"
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands"
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import {
  markdown,
  markdownLanguage,
  pasteURLAsLink,
} from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { yamlFrontmatter } from "@codemirror/lang-yaml"
import { tags } from "@lezer/highlight"
import type { Edit } from "@/lib/markdown/edits"
import { SHORTCUTS, type MarkdownCommand } from "@/lib/markdown/shortcuts"

export interface SourceHandle {
  focus: () => void
  /** The document and the main selection. */
  read: () => { doc: string; from: number; to: number }
  /** One change, as one step to undo, with the selection where the change says. */
  apply: (edit: Edit) => void
  find: () => void
}

/** A change made from outside (a file opened): not handed back as typing. */
const external = Annotation.define<boolean>()

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-geist-mono)",
    lineHeight: "1.75",
  },
  ".cm-content": {
    padding: "16px 0",
    caretColor: "var(--foreground)",
    maxWidth: "48rem",
  },
  ".cm-line": { padding: "0 20px" },
  ".cm-gutters": {
    backgroundColor: "var(--card)",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklch, var(--primary) 22%, transparent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklch, var(--primary) 18%, transparent)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklch, var(--primary) 40%, transparent)",
  },
  ".cm-panels": {
    backgroundColor: "var(--muted)",
    color: "var(--foreground)",
    borderColor: "var(--border)",
  },
  ".cm-textfield": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    minHeight: "36px",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    minHeight: "36px",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  "@media (max-width: 767px)": {
    ".cm-button, .cm-textfield": { minHeight: "44px" },
    ".cm-line": { padding: "0 12px" },
  },
})

/** Markdown drawn in the editor: headings larger and bold, marks quiet, links and code in the brand colour. */
const highlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading1, fontWeight: "700", fontSize: "1.3em" },
    { tag: tags.heading2, fontWeight: "700", fontSize: "1.15em" },
    {
      tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6],
      fontWeight: "700",
    },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: [tags.link, tags.url], color: "var(--primary)" },
    { tag: tags.monospace, color: "var(--primary)" },
    { tag: tags.quote, color: "var(--muted-foreground)" },
    {
      tag: [tags.processingInstruction, tags.contentSeparator, tags.meta],
      color: "var(--muted-foreground)",
    },
    {
      tag: [tags.keyword, tags.tagName],
      color: "var(--primary)",
      fontWeight: "600",
    },
    { tag: [tags.string, tags.attributeValue], color: "var(--foreground)" },
    {
      tag: tags.comment,
      color: "var(--muted-foreground)",
      fontStyle: "italic",
    },
    { tag: [tags.number, tags.bool], color: "var(--primary)" },
  ])
)

/** The source of a Markdown document, edited as text. */
export function MarkdownSource({
  value,
  onChange,
  onCommand,
  label = "Markdown",
  ref,
}: {
  value: string
  onChange: (value: string) => void
  /** A key from the editor's list was pressed. */
  onCommand: (command: MarkdownCommand) => void
  label?: string
  ref?: Ref<SourceHandle>
}) {
  const container = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const change = useRef(onChange)
  const command = useRef(onCommand)
  const first = useRef(value)
  useLayoutEffect(() => {
    change.current = onChange
    command.current = onCommand
  }, [onChange, onCommand])

  useImperativeHandle(
    ref,
    () => ({
      focus: () => view.current?.focus(),
      read: () => {
        const state = view.current!.state
        const { from, to } = state.selection.main
        return { doc: state.doc.toString(), from, to }
      },
      apply: (edit) => {
        const editor = view.current
        if (!editor) return
        editor.dispatch({
          changes: { from: edit.from, to: edit.to, insert: edit.insert },
          selection: EditorSelection.single(edit.anchor, edit.head),
          scrollIntoView: true,
          userEvent: "input",
        })
        editor.focus()
      },
      find: () => {
        if (view.current) openSearchPanel(view.current)
      },
    }),
    []
  )

  useLayoutEffect(() => {
    if (!container.current) return
    const editor = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: first.current,
        extensions: [
          // The editor's own keys come before CodeMirror's, so Mod-k makes a link here.
          keymap.of(
            SHORTCUTS.map((shortcut) => ({
              key: shortcut.key,
              preventDefault: true,
              run: () => {
                command.current(shortcut.command)
                return true
              },
            }))
          ),
          // Writing, not code: no line numbers, no brackets closed for you, no suggestions.
          history(),
          drawSelection(),
          dropCursor(),
          highlightSpecialChars(),
          rectangularSelection(),
          highlightSelectionMatches(),
          search({ top: true }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          // Front matter is read as YAML, not as a heading made of its last line.
          yamlFrontmatter({
            content: markdown({
              base: markdownLanguage,
              codeLanguages: languages,
            }),
          }),
          pasteURLAsLink,
          theme,
          highlighting,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": label,
            "aria-multiline": "true",
            // Already focusable; said so, so the scrolling area around it counts as reachable.
            tabindex: "0",
            // Words are checked by the browser's own dictionary, on the device.
            spellcheck: "true",
            autocorrect: "on",
            autocapitalize: "sentences",
            "data-markdown-source": "",
          }),
          placeholder("Start writing, or open a Markdown file…"),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((one) => one.annotation(external))
            )
              change.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [label])

  // A document opened or made elsewhere replaces what is here, as a step that can be undone.
  useLayoutEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: external.of(true),
      })
  }, [value])

  return (
    <div
      ref={container}
      className="h-full min-h-0 overflow-hidden"
      data-testid="markdown-source"
    />
  )
}
