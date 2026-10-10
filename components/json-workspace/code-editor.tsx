"use client"

import { useLayoutEffect, useImperativeHandle, useRef, type Ref } from "react"
import { EditorState, Annotation, Compartment } from "@codemirror/state"
import { EditorView, placeholder, keymap } from "@codemirror/view"
import { basicSetup } from "codemirror"
import { json } from "@codemirror/lang-json"
import { undo, redo, indentWithTab } from "@codemirror/commands"
import { openSearchPanel } from "@codemirror/search"
import {
  foldAll,
  unfoldAll,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language"
import { tags } from "@lezer/highlight"

export type EditorHandle = {
  focus: () => void
  locate: (offset: number) => void
  undo: () => void
  redo: () => void
  find: () => void
  fold: () => void
  unfold: () => void
}
const external = Annotation.define<boolean>()
const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-geist-mono)",
    lineHeight: "1.7",
  },
  ".cm-content": { padding: "12px 0", caretColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--accent)" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-searchMatch":
    { backgroundColor: "var(--accent)" },
  ".cm-panels": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
  ".cm-textfield": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
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
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--muted)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
  },
})
const highlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: "var(--foreground)", fontWeight: "600" },
    { tag: tags.string, color: "var(--primary)" },
    { tag: [tags.number, tags.bool, tags.null], color: "var(--foreground)" },
    { tag: tags.punctuation, color: "var(--muted-foreground)" },
  ])
)

export function CodeEditor({
  id,
  label,
  value,
  onChange,
  readOnly = false,
  jsonLanguage = true,
  hint,
  ref,
}: {
  id: string
  label: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  jsonLanguage?: boolean
  hint?: string
  ref?: Ref<EditorHandle>
}) {
  const container = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const change = useRef(onChange)
  const currentValue = useRef(value)
  const initialLanguage = useRef(jsonLanguage)
  const language = useRef(new Compartment())
  useLayoutEffect(() => {
    change.current = onChange
    currentValue.current = value
    initialLanguage.current = jsonLanguage
  }, [onChange, value, jsonLanguage])
  useImperativeHandle(
    ref,
    () => ({
      focus: () => view.current?.focus(),
      locate: (offset) => {
        const editor = view.current
        if (editor) {
          const at = Math.min(offset, editor.state.doc.length)
          editor.dispatch({ selection: { anchor: at }, scrollIntoView: true })
          editor.focus()
        }
      },
      undo: () => {
        if (view.current) undo(view.current)
      },
      redo: () => {
        if (view.current) redo(view.current)
      },
      find: () => {
        if (view.current) openSearchPanel(view.current)
      },
      fold: () => {
        if (view.current) foldAll(view.current)
      },
      unfold: () => {
        if (view.current) unfoldAll(view.current)
      },
    }),
    []
  )
  useLayoutEffect(() => {
    if (!container.current) return
    const editor = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: currentValue.current,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          theme,
          highlighting,
          language.current.of(initialLanguage.current ? json() : []),
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.contentAttributes.of({
            id,
            "aria-label": label,
            "aria-multiline": "true",
            "aria-readonly": String(readOnly),
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
            autocomplete: "off",
            "data-json-editor": id,
          }),
          placeholder(
            hint ??
              (readOnly ? "Your result appears here." : '{"hello": "world"}')
          ),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(external)
              )
            )
              change.current?.(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [id, label, readOnly, hint])
  useLayoutEffect(() => {
    view.current?.dispatch({
      effects: language.current.reconfigure(jsonLanguage ? json() : []),
    })
  }, [jsonLanguage])
  useLayoutEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: external.of(true),
      })
  }, [value])
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <div
        ref={container}
        className={`json-code-editor ${readOnly && !value ? "h-32" : "h-64"} overflow-hidden rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring md:h-80`}
      />
    </div>
  )
}
