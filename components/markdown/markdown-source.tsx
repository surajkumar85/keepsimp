"use client"

import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react"
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
} from "@codemirror/state"
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
import { tableFromTabs } from "@/lib/markdown/tables"
import { hideMarks } from "./hide-marks"
import { SHORTCUTS, type MarkdownCommand } from "@/lib/markdown/shortcuts"

export interface SourceHandle {
  focus: () => void
  /** The document and the main selection. */
  read: () => { doc: string; from: number; to: number }
  /** One change, as one step to undo, with the selection where the change says; the editor takes the focus unless asked not to. */
  apply: (edit: Edit, focus?: boolean) => void
  /** The whole text replaced (a fix, a tidy, a version put back), as one step to undo. */
  replace: (text: string) => void
  /** Text put where the selection is, as typing would. */
  insert: (text: string) => void
  find: () => void
  /** The line (from 0, with the share of it scrolled past) at the top of the view. */
  topLine: () => number
  /** Scrolls so a line (from 0, a share of it allowed) is at the top. */
  scrollToLine: (line: number) => void
  /** Puts the cursor at the start of a line (from 0) and brings it into the middle of the view. */
  goToLine: (line: number) => void
  /** How many lines the document has. */
  lines: () => number
}

/** What the source is asked to do with things pasted or dropped onto it. */
export interface Arrivals {
  /** Pictures pasted or dropped: the page keeps them and gives back the Markdown to write. */
  pictures: (files: File[]) => Promise<string>
  /** Formatted text pasted: made into Markdown when the switch is on, or null to paste it as it is. */
  formatted: (html: string) => Promise<string | null>
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

/** Typewriter scrolling: the line being written stays in the middle of the view. */
const centred = EditorView.updateListener.of((update) => {
  if (!update.selectionSet && !update.docChanged) return
  const head = update.state.selection.main.head
  // After the update has been drawn, never inside it.
  requestAnimationFrame(() =>
    update.view.dispatch({
      effects: EditorView.scrollIntoView(head, { y: "center" }),
    })
  )
})

/** Text put where the selection was (or a place given), as one step. */
function insertAt(
  editor: EditorView,
  text: string,
  at?: { from: number; to: number }
) {
  const range = at ?? editor.state.selection.main
  editor.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: EditorSelection.cursor(range.from + text.length),
    scrollIntoView: true,
    userEvent: "input.paste",
  })
  editor.focus()
}

/** The source of a Markdown document, edited as text. */
export function MarkdownSource({
  docId,
  value,
  onChange,
  onCommand,
  onScroll,
  arrivals,
  typewriter = false,
  quietMarks = false,
  label = "Markdown",
  ref,
}: {
  /** Which document this is: each keeps its own undo history and place. */
  docId: string
  value: string
  onChange: (value: string) => void
  /** A key from the editor's list was pressed. */
  onCommand: (command: MarkdownCommand) => void
  /** The view was scrolled by the person. */
  onScroll?: () => void
  arrivals: Arrivals
  /** The cursor's line is kept in the middle of the view. */
  typewriter?: boolean
  /** Marks are hidden away from the cursor's lines. */
  quietMarks?: boolean
  label?: string
  ref?: Ref<SourceHandle>
}) {
  const container = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const change = useRef(onChange)
  const command = useRef(onCommand)
  const scrolled = useRef(onScroll)
  const arriving = useRef(arrivals)
  const first = useRef({ value, docId })
  /** Each document's own state: its text, selection and history. */
  const states = useRef(new Map<string, EditorState>())
  const shown = useRef(docId)
  const modes = useRef({ typewriter, quietMarks })
  const typewriterPart = useRef(new Compartment())
  const marksPart = useRef(new Compartment())
  useLayoutEffect(() => {
    change.current = onChange
    command.current = onCommand
    scrolled.current = onScroll
    arriving.current = arrivals
    modes.current = { typewriter, quietMarks }
  }, [onChange, onCommand, onScroll, arrivals, typewriter, quietMarks])

  useImperativeHandle(
    ref,
    () => ({
      focus: () => view.current?.focus(),
      read: () => {
        const state = view.current!.state
        const { from, to } = state.selection.main
        return { doc: state.doc.toString(), from, to }
      },
      apply: (edit, focus = true) => {
        const editor = view.current
        if (!editor) return
        editor.dispatch({
          changes: { from: edit.from, to: edit.to, insert: edit.insert },
          selection: EditorSelection.single(edit.anchor, edit.head),
          scrollIntoView: focus,
          userEvent: "input",
        })
        if (focus) editor.focus()
      },
      replace: (text) => {
        const editor = view.current
        if (!editor) return
        const head = Math.min(editor.state.selection.main.head, text.length)
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: text },
          selection: EditorSelection.cursor(head),
          userEvent: "input",
        })
      },
      insert: (text) => {
        const editor = view.current
        if (!editor) return
        editor.dispatch(editor.state.replaceSelection(text), {
          scrollIntoView: true,
          userEvent: "input.paste",
        })
      },
      find: () => {
        if (view.current) openSearchPanel(view.current)
      },
      topLine: () => {
        const editor = view.current!
        const top = editor.scrollDOM.scrollTop
        const block = editor.lineBlockAtHeight(top)
        const line = editor.state.doc.lineAt(block.from).number - 1
        return (
          line +
          Math.min(
            1,
            Math.max(0, (top - block.top) / Math.max(1, block.height))
          )
        )
      },
      scrollToLine: (line) => {
        const editor = view.current!
        const whole = Math.min(Math.floor(line), editor.state.doc.lines - 1)
        const block = editor.lineBlockAt(editor.state.doc.line(whole + 1).from)
        editor.scrollDOM.scrollTop = block.top + (line - whole) * block.height
      },
      goToLine: (line) => {
        const editor = view.current!
        const at = editor.state.doc.line(
          Math.min(line + 1, editor.state.doc.lines)
        ).from
        editor.dispatch({
          selection: EditorSelection.cursor(at),
          effects: EditorView.scrollIntoView(at, { y: "center" }),
        })
        editor.focus()
      },
      lines: () => view.current?.state.doc.lines ?? 1,
    }),
    []
  )

  /** Everything an editor state is made with; the modes from where they stand now. */
  const extensions = (): Extension[] => [
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
      content: markdown({ base: markdownLanguage, codeLanguages: languages }),
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
    typewriterPart.current.of(modes.current.typewriter ? centred : []),
    marksPart.current.of(modes.current.quietMarks ? hideMarks : []),
    EditorView.domEventHandlers({
      paste: (event, editor) => {
        const data = event.clipboardData
        if (!data) return false
        const files = Array.from(data.files).filter((file) =>
          file.type.startsWith("image/")
        )
        if (files.length) {
          event.preventDefault()
          void arriving.current
            .pictures(files)
            .then((text) => insertAt(editor, text))
          return true
        }
        const html = data.getData("text/html")
        const plain = data.getData("text/plain")
        // Cells copied out of a spreadsheet come as tab-separated lines: a table.
        const table = !html ? tableFromTabs(plain) : null
        if (table) {
          event.preventDefault()
          insertAt(editor, table)
          return true
        }
        if (html) {
          event.preventDefault()
          const at = editor.state.selection.main
          void arriving.current
            .formatted(html)
            .then((text) => insertAt(editor, text ?? plain, at))
          return true
        }
        return false
      },
      drop: (event, editor) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(
          (file) => file.type.startsWith("image/")
        )
        if (!files.length) return false
        event.preventDefault()
        const at = editor.posAtCoords({ x: event.clientX, y: event.clientY })
        void arriving.current
          .pictures(files)
          .then((text) =>
            insertAt(
              editor,
              text,
              at === null ? undefined : { from: at, to: at }
            )
          )
        return true
      },
      scroll: () => {
        scrolled.current?.()
        return false
      },
    }),
    EditorView.updateListener.of((update) => {
      if (
        update.docChanged &&
        !update.transactions.some((one) => one.annotation(external))
      )
        change.current(update.state.doc.toString())
    }),
  ]

  useLayoutEffect(() => {
    if (!container.current) return
    const editor = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: first.current.value,
        extensions: extensions(),
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
    // The editor is made once; its modes and documents change through compartments and states.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label])

  // Another document: this one's state is kept, that one's put back (or made).
  useLayoutEffect(() => {
    const editor = view.current
    if (!editor || shown.current === docId) return
    states.current.set(shown.current, editor.state)
    shown.current = docId
    editor.setState(
      states.current.get(docId) ??
        EditorState.create({ doc: value, extensions: extensions() })
    )
    // The modes as they are now, in a state kept from before they changed.
    editor.dispatch({
      effects: [
        typewriterPart.current.reconfigure(typewriter ? centred : []),
        marksPart.current.reconfigure(quietMarks ? hideMarks : []),
      ],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  useLayoutEffect(() => {
    view.current?.dispatch({
      effects: [
        typewriterPart.current.reconfigure(typewriter ? centred : []),
        marksPart.current.reconfigure(quietMarks ? hideMarks : []),
      ],
    })
  }, [typewriter, quietMarks])

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
