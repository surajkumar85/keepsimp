import type { BlogPost } from "./blog"

export const markdownPosts: readonly BlogPost[] = [
  {
    published: "2026-10-24",
    slug: "markdown-editor-online",
    title: "Write in plain text. Read it as a page.",
    searchTitle: "Free online Markdown editor with live preview, no sign-up",
    description:
      "Write Markdown with a live preview in your browser: GitHub's tables, task lists, footnotes and alerts, front matter, files saved in place, HTML and PDF export. No uploads.",
    keywords: [
      "markdown editor",
      "online markdown editor",
      "markdown preview",
      "markdown editor with live preview",
      "github flavored markdown",
      "markdown to html",
      "markdown to pdf",
      "readme editor",
    ],
    category: "A little know-how",
    readingTime: "5 min read",
    image: "/images/markdown-guide.svg",
    imageAlt:
      "Markdown text with a heading, a task list and a table becoming a formatted page",
    tool: "markdown-editor",
    intro:
      "Markdown is plain text with a few marks: a # for a heading, a - for a list, ** around bold. It is how READMEs, notes, documentation and many blogs are written, because the file stays readable in any editor and works with any tool. KeepSimp's Markdown editor shows what you type beside the page it makes, and keeps your files on your own device.",
    sections: [
      {
        id: "what",
        title: "The Markdown GitHub writes.",
        paragraphs: [
          "The editor reads CommonMark, the shared definition of Markdown, with GitHub's additions: tables, task lists with boxes to tick, strikethrough, addresses that become links by themselves, footnotes, and the five kinds of alert that GitHub draws as coloured boxes (note, tip, important, warning, caution). Headings get the same anchors as on GitHub, so a link to #getting-started works in both places.",
          "A block of YAML between two lines of --- at the very top is front matter: the title, date and tags that site builders such as Jekyll and Hugo read. The preview shows it as a table of names and values rather than as text, and says plainly when it cannot be read.",
        ],
        links: [
          {
            label: "Open the Markdown editor",
            href: "/dashboard/markdown-editor/",
          },
        ],
      },
      {
        id: "keys",
        title: "The keys you already know.",
        paragraphs: [
          "Select words and press Ctrl+B for bold, Ctrl+I for italic, Ctrl+E for code and Ctrl+K for a link (⌘ on a Mac), the same keys as GitHub's own editor. Paste an address over selected words and they become a link. Press Enter at the end of a list item, a task or a quote and the next line carries on the list; press it on an empty item to end the list.",
          "The toolbar writes the same Markdown for you: headings of every level, quotes, bulleted, numbered and task lists, blocks of code, tables and lines across. Every button names its key, and Find and replace searches the whole document.",
        ],
      },
      {
        id: "files",
        title: "Your files stay yours.",
        paragraphs: [
          "Open a .md file or drop it onto the editor. In Chrome and Edge, Save writes back to the very file you opened, as a desktop editor would; in other browsers it downloads a copy. Nothing is uploaded, and the page asks before you leave with changes not saved.",
          "HTML inside a document is allowed, as Markdown allows it, but the preview cleans it first: scripts, frames, forms and links that would run code are taken out, in the preview and in everything you export or copy. Pictures linked from other sites are fetched by your browser to be shown; one switch leaves them out, and the counts under the editor say how many.",
        ],
      },
      {
        id: "export",
        title: "A web page, a PDF, or an email.",
        paragraphs: [
          "Export a web page that stands alone, with its look written into it and nothing to fetch, light or dark as the reader's device prefers. Print it, or choose Save as PDF in the print dialog: headings stay with the text that follows them, and code, tables and pictures are not cut in half where the browser allows.",
          "Copy as rich text puts the formatted document on the clipboard, so it pastes into an email or a document with its headings, lists and links, while plain-text fields get the Markdown.",
        ],
      },
    ],
    sources: [
      {
        title: "CommonMark specification",
        url: "https://spec.commonmark.org/",
      },
      {
        title: "GitHub Flavored Markdown specification",
        url: "https://github.github.com/gfm/",
      },
      {
        title: "GitHub Docs: basic writing and formatting syntax",
        url: "https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax",
      },
      {
        title: "markdown-it",
        url: "https://github.com/markdown-it/markdown-it",
      },
    ],
  },
]
