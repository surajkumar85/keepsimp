/**
 * Maths written as GitHub writes it: `$…$` in a line and `$$…$$` on lines
 * of its own (and ```math fences, in `render.ts`). Kept as TeX in the HTML
 * (`data-tex`); the page turns it into MathML with KaTeX only once a
 * document has some, so the editor does not carry KaTeX until then.
 *
 * A `$` opens maths only when the next character is not a space, and
 * closes it only when the one before is not a space and the next is not a
 * digit, so "$5 and $10" stays money.
 */
import type { MarkdownIt } from "markdown-it"

type Md = MarkdownIt
type InlineState = Parameters<Md["inline"]["ruler"]["push"]>[1] extends (
  state: infer S,
  silent: boolean
) => boolean
  ? S
  : never
type BlockState = Parameters<Md["block"]["ruler"]["push"]>[1] extends (
  state: infer S,
  start: number,
  end: number,
  silent: boolean
) => boolean
  ? S
  : never

const DOLLAR = 0x24
const isSpace = (code: number) =>
  code === 0x20 || code === 0x09 || code === 0x0a

/** Where the `$` that closes maths opened at `start` is, or -1. */
export function closingDollar(text: string, start: number, double: boolean) {
  const width = double ? 2 : 1
  let at = start + width
  while (at < text.length) {
    const found = text.indexOf(double ? "$$" : "$", at)
    if (found === -1) return -1
    // An escaped dollar is a dollar, not the end.
    let slashes = 0
    for (let back = found - 1; back >= 0 && text[back] === "\\"; back--)
      slashes++
    if (slashes % 2 === 0) {
      if (double) return found
      const before = text.charCodeAt(found - 1)
      const after = text.charCodeAt(found + 1)
      if (!isSpace(before) && !(after >= 0x30 && after <= 0x39)) return found
    }
    at = found + 1
  }
  return -1
}

function mathInline(state: InlineState, silent: boolean) {
  const { src, pos } = state
  if (src.charCodeAt(pos) !== DOLLAR) return false
  const double = src.charCodeAt(pos + 1) === DOLLAR
  const width = double ? 2 : 1
  const next = src.charCodeAt(pos + width)
  if (Number.isNaN(next) || (!double && isSpace(next))) return false
  const end = closingDollar(src, pos, double)
  if (end === -1 || end === pos + width) return false
  if (!silent) {
    const token = state.push("math_inline", "math", 0)
    token.content = src.slice(pos + width, end)
    token.markup = double ? "$$" : "$"
  }
  state.pos = end + width
  return true
}

function mathBlock(
  state: BlockState,
  startLine: number,
  endLine: number,
  silent: boolean
) {
  let start = state.bMarks[startLine] + state.tShift[startLine]
  let max = state.eMarks[startLine]
  // (Lines indented as code never get here: the code rule takes them first.)
  if (state.src.slice(start, start + 2) !== "$$") return false
  if (silent) return true
  const first = state.src.slice(start + 2, max)
  let content: string
  let line = startLine
  if (first.trim().endsWith("$$") && first.trim().length >= 2) {
    // $$ … $$ on one line.
    content = first.trim().slice(0, -2)
  } else {
    const lines = [first]
    let closed = false
    while (++line < endLine) {
      start = state.bMarks[line] + state.tShift[line]
      max = state.eMarks[line]
      const text = state.src.slice(start, max)
      if (text.trim().endsWith("$$")) {
        lines.push(text.trim().slice(0, -2))
        closed = true
        break
      }
      lines.push(state.src.slice(state.bMarks[line], max))
    }
    // Without a closing $$ it is not maths.
    if (!closed) return false
    content = lines.join("\n")
  }
  state.line = line + 1
  const token = state.push("math_block", "math", 0)
  token.block = true
  token.content = content.trim()
  token.map = [startLine, state.line]
  token.markup = "$$"
  return true
}

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** The rules, and how each is drawn before KaTeX has seen it. */
export function mathRules(md: Md) {
  md.inline.ruler.after("escape", "math_inline", mathInline)
  md.block.ruler.before("fence", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  })
  md.renderer.rules.math_inline = (tokens, index) => {
    const tex = tokens[index].content
    const display = tokens[index].markup === "$$"
    return `<span class="math${display ? " math-display" : ""}" data-tex="${escape(tex)}">${escape(tex)}</span>`
  }
  md.renderer.rules.math_block = (tokens, index, _options, _env, self) =>
    `<div class="math math-display" data-tex="${escape(tokens[index].content)}"${self.renderAttrs(tokens[index])}>${escape(tokens[index].content)}</div>\n`
}
