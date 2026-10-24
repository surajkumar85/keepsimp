/**
 * A document as it is saved and exported: its name, a page of HTML that
 * stands alone (its look written into it, nothing fetched), and the name
 * each export is given.
 */

/** Kinds of file opened as Markdown. */
export const MARKDOWN_EXTENSIONS = [
  ".md",
  ".markdown",
  ".mdown",
  ".mkd",
  ".mdx",
  ".txt",
] as const

export const MARKDOWN_ACCEPT = [
  ...MARKDOWN_EXTENSIONS,
  "text/markdown",
  "text/plain",
].join(",")

/** The most read from one file: a book is a few MB; more is not Markdown to edit here. */
export const LARGEST_FILE = 20 * 1024 * 1024

/** A name without its last extension. */
export function baseName(name: string) {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}

/** The name a document is saved or exported under: its own, or one made from its first heading. */
export function fileName(
  name: string | null,
  firstHeading: string | undefined,
  extension: string
) {
  const base = name
    ? baseName(name)
    : (firstHeading ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "untitled"
  return `${base}.${extension}`
}

/** Whether a file can be opened as Markdown: by its kind, or by its name when the kind is not said. */
export function isMarkdownFile(file: { name: string; type: string }) {
  const name = file.name.toLowerCase()
  return (
    file.type === "text/markdown" ||
    file.type === "text/x-markdown" ||
    MARKDOWN_EXTENSIONS.some((extension) => name.endsWith(extension))
  )
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The look of an exported page: readable type, tables, code and alerts,
 * light and dark by the reader's own setting, and kept together on paper.
 * These colours belong to the exported document, not to KeepSimp.
 */
export const DOCUMENT_CSS = `
:root{color-scheme:light dark;--fg:#1f2328;--muted:#59636e;--bg:#fff;--line:#d1d9e0;--soft:#f6f8fa;--link:#0969da;--note:#0969da;--tip:#1a7f37;--important:#8250df;--warning:#9a6700;--caution:#d1242f}
@media (prefers-color-scheme:dark){:root{--fg:#f0f6fc;--muted:#9198a1;--bg:#0d1117;--line:#3d444d;--soft:#151b23;--link:#4493f8;--note:#4493f8;--tip:#3fb950;--important:#ab7df8;--warning:#d29922;--caution:#f85149}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:46rem;margin:0 auto;padding:2.5rem 1.25rem}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.5em 0 .6em;font-weight:600}
h1{font-size:2em;padding-bottom:.3em;border-bottom:1px solid var(--line)}
h2{font-size:1.5em;padding-bottom:.3em;border-bottom:1px solid var(--line)}
h3{font-size:1.25em}
p,ul,ol,blockquote,pre,table,.markdown-alert{margin:0 0 1em}
a{color:var(--link)}
img{max-width:100%;height:auto}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.875em}
code{background:var(--soft);padding:.15em .35em;border-radius:6px}
pre{background:var(--soft);padding:1em;border-radius:8px;overflow:auto;white-space:pre-wrap}
pre code{background:none;padding:0}
blockquote{margin-left:0;padding:0 1em;color:var(--muted);border-left:.25em solid var(--line)}
table{border-collapse:collapse;display:block;overflow:auto;max-width:100%}
th,td{border:1px solid var(--line);padding:.4em .8em}
th{background:var(--soft);font-weight:600}
hr{border:0;border-top:1px solid var(--line);margin:2em 0}
ul.contains-task-list{list-style:none;padding-left:1.2em}
.task-list-item input{margin:0 .4em 0 -1.2em}
.markdown-alert{padding:.5em 1em;border-left:.25em solid var(--line)}
.markdown-alert-title{font-weight:600;margin-bottom:.25em}
.markdown-alert-note{border-color:var(--note)}.markdown-alert-note .markdown-alert-title{color:var(--note)}
.markdown-alert-tip{border-color:var(--tip)}.markdown-alert-tip .markdown-alert-title{color:var(--tip)}
.markdown-alert-important{border-color:var(--important)}.markdown-alert-important .markdown-alert-title{color:var(--important)}
.markdown-alert-warning{border-color:var(--warning)}.markdown-alert-warning .markdown-alert-title{color:var(--warning)}
.markdown-alert-caution{border-color:var(--caution)}.markdown-alert-caution .markdown-alert-title{color:var(--caution)}
.footnotes{font-size:.875em;color:var(--muted)}
table.front-matter{font-size:.875em}
table.front-matter caption{text-align:left;color:var(--muted);padding-bottom:.25em}
@media print{
:root{--fg:#000;--bg:#fff;--soft:#f6f8fa;--line:#d0d7de}
main{max-width:none;padding:0}
h1,h2,h3,h4,h5,h6{break-after:avoid-page}
pre,table,blockquote,.markdown-alert,img,figure{break-inside:avoid}
thead{display:table-header-group}
a{color:inherit}
}
`
  .replace(/\n/g, "")
  .trim()

/** The preview's HTML as it is exported: without the marks the editor finds its lines by. */
export function exportedBody(html: string) {
  return html.replace(/ data-source-line="\d+"/g, "")
}

/** A page of HTML that stands alone: the document's body with its look written in. */
export function standaloneHtml(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="KeepSimp Markdown editor">
<title>${escape(title)}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`
}
