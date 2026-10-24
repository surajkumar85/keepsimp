/**
 * An optional way of reading the source: the marks of headings, bold,
 * italic, code and links are hidden on every line but the ones the cursor
 * is on, so the text reads almost as the page does and the marks come back
 * where you write. Tables and blocks of code keep their marks. Nothing is
 * taken out of the text: the marks are only not drawn, and a screen reader
 * still reads them all.
 */
import { syntaxTree } from "@codemirror/language"
import { RangeSetBuilder, type EditorState } from "@codemirror/state"
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"

const HIDDEN = Decoration.replace({})

/** Marks hidden away from the cursor's lines. */
const MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "LinkMark",
  "URL",
])

function hidden(view: EditorView): DecorationSet {
  const state: EditorState = view.state
  const near = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let line = first; line <= last; line++) near.add(line)
  }
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        // Code and tables are written as they are.
        if (
          node.name === "FencedCode" ||
          node.name === "CodeBlock" ||
          node.name === "Table"
        )
          return false
        if (!MARKS.has(node.name)) return
        // A link's address is hidden only inside a link, not an address on its own.
        if (node.name === "URL" && node.node.parent?.name !== "Link") return
        const line = state.doc.lineAt(node.from).number
        if (near.has(line)) return
        let end = node.to
        // A heading's # takes its space with it.
        if (
          node.name === "HeaderMark" &&
          state.doc.sliceString(end, end + 1) === " "
        )
          end++
        builder.add(node.from, end, HIDDEN)
      },
    })
  }
  return builder.finish()
}

export const hideMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = hidden(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged)
        this.decorations = hidden(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
