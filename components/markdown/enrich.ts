/**
 * What the preview fills in after drawing a document, loading each part
 * only when a document needs it: maths as MathML by KaTeX (drawn by the
 * browser itself, no fonts to fetch), diagrams by Mermaid in its strict
 * mode, and code coloured by the same parsers the editor colours it with.
 * Every result is kept by what it was made from, so typing elsewhere in a
 * document draws nothing again. Used for the preview and for exports.
 */
import { clean, cleanSvg } from "@/lib/markdown/clean"
import type { Rendered } from "@/lib/markdown/render"

const MOST_KEPT = 400
const made = new Map<string, string>()

function keep(key: string, value: string) {
  if (made.size >= MOST_KEPT) made.delete(made.keys().next().value!)
  made.set(key, value)
  return value
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function drawMaths(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>(".math[data-tex]")
  if (!nodes.length) return
  const katex = (await import("katex")).default
  for (const node of nodes) {
    const tex = node.dataset.tex!
    const display = node.classList.contains("math-display")
    const key = `math:${display}:${tex}`
    node.innerHTML =
      made.get(key) ??
      keep(
        key,
        (() => {
          try {
            return clean(
              katex.renderToString(tex, {
                output: "mathml",
                displayMode: display,
                throwOnError: true,
                trust: false,
                maxExpand: 1000,
                maxSize: 50,
              })
            ).html
          } catch (error) {
            return `<code class="math-problem" title="${escape((error as Error).message)}">${escape(tex)}</code>`
          }
        })()
      )
  }
}

let diagrams = 0

async function drawDiagrams(root: HTMLElement, dark: boolean) {
  const figures = root.querySelectorAll<HTMLElement>("figure[data-diagram]")
  if (!figures.length) return
  const mermaid = (await import("mermaid")).default
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    // Labels as SVG text, not HTML inside the drawing.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  })
  for (const figure of figures) {
    const code = figure.querySelector("code")?.textContent ?? ""
    const key = `diagram:${dark}:${code}`
    const drawn = made.get(key)
    if (drawn) {
      figure.innerHTML = drawn
      continue
    }
    try {
      const { svg } = await mermaid.render(
        `keepsimp-diagram-${++diagrams}`,
        code
      )
      figure.innerHTML = keep(key, cleanSvg(svg))
    } catch (error) {
      // The text stays, with what is wrong under it.
      figure.insertAdjacentHTML(
        "beforeend",
        `<figcaption class="diagram-problem">This diagram could not be drawn: ${escape((error as Error).message.split("\n")[0])}</figcaption>`
      )
    }
  }
}

async function colourCode(root: HTMLElement) {
  const blocks = root.querySelectorAll<HTMLElement>(
    "pre > code[class*='language-']"
  )
  if (!blocks.length) return
  const [
    { languages },
    { LanguageDescription },
    { highlightCode, classHighlighter },
  ] = await Promise.all([
    import("@codemirror/language-data"),
    import("@codemirror/language"),
    import("@lezer/highlight"),
  ])
  for (const block of blocks) {
    const name = /language-([\w+#.-]+)/.exec(block.className)![1]
    const text = block.textContent ?? ""
    const key = `code:${name}:${text}`
    const kept = made.get(key)
    if (kept) {
      block.innerHTML = kept
      continue
    }
    const description = LanguageDescription.matchLanguageName(
      languages,
      name,
      true
    )
    if (!description) continue
    const support = await description.load()
    const tree = support.language.parser.parse(text)
    let html = ""
    highlightCode(
      text,
      tree,
      classHighlighter,
      (part, classes) => {
        html += classes
          ? `<span class="${classes}">${escape(part)}</span>`
          : escape(part)
      },
      () => {
        html += "\n"
      }
    )
    block.innerHTML = keep(key, html)
  }
}

/**
 * The preview's HTML with its maths, diagrams and code filled in. Only the
 * parts a document has are loaded; a part that fails leaves its text and
 * says why, and never stops the rest.
 */
export async function enrichHtml(
  html: string,
  needs: Rendered["needs"],
  dark: boolean
): Promise<string> {
  if (!needs.math && !needs.diagrams && !needs.code) return html
  const root = document.createElement("div")
  root.innerHTML = html
  await Promise.all([
    needs.math ? drawMaths(root) : null,
    needs.diagrams ? drawDiagrams(root, dark) : null,
    needs.code ? colourCode(root) : null,
  ])
  return root.innerHTML
}
