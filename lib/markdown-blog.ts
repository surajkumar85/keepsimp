import type { BlogPost } from "./blog"

const sources = {
  commonmark: {
    title: "CommonMark specification",
    url: "https://spec.commonmark.org/",
  },
  gfm: {
    title: "GitHub Flavored Markdown specification",
    url: "https://github.github.com/gfm/",
  },
  github: {
    title: "GitHub Docs: basic writing and formatting syntax",
    url: "https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax",
  },
  markdownIt: {
    title: "markdown-it",
    url: "https://github.com/markdown-it/markdown-it",
  },
  dompurify: { title: "DOMPurify", url: "https://github.com/cure53/DOMPurify" },
  mdnPrint: {
    title: "MDN: break-after and printing",
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS/break-after",
  },
  docx: {
    title: "docx: generate Word files in JavaScript",
    url: "https://docx.js.org/",
  },
  mammoth: {
    title: "mammoth.js: .docx to HTML",
    url: "https://github.com/mwilliamson/mammoth.js",
  },
  turndown: {
    title: "Turndown: HTML to Markdown",
    url: "https://github.com/mixmark-io/turndown",
  },
  markdownlint: {
    title: "markdownlint",
    url: "https://github.com/DavidAnson/markdownlint",
  },
  katex: { title: "KaTeX", url: "https://katex.org/" },
  mermaid: { title: "Mermaid", url: "https://mermaid.js.org/" },
}

export const markdownPosts: readonly BlogPost[] = [
  {
    published: "2026-10-24",
    slug: "markdown-editor-online",
    title: "Write in plain text. Read it as a page.",
    searchTitle: "Free online Markdown editor with live preview, no sign-up",
    description:
      "Write Markdown with a live preview in your browser: GitHub's tables, task lists, footnotes and alerts, maths, diagrams, tabs, a document check and exports to HTML, Word and PDF. No uploads.",
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
    readingTime: "6 min read",
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
          "The editor reads CommonMark, the shared definition of Markdown, with GitHub's additions: tables, task lists with boxes to tick, strikethrough, addresses that become links by themselves, footnotes, and the five kinds of alert that GitHub draws as coloured boxes. Headings get the same anchors as on GitHub, so a link to #getting-started works in both places.",
          "Maths between dollar signs is drawn by KaTeX, and ```mermaid blocks become diagrams, both only when a document has some. A block of YAML between two lines of --- at the very top is front matter, shown as a table of names and values.",
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
          "Select words and press Ctrl+B for bold, Ctrl+I for italic, Ctrl+E for code and Ctrl+K for a link (⌘ on a Mac), the same keys as GitHub's own editor. Lists, tasks and quotes carry on when you press Enter. F1 shows every key and every bit of Markdown on one sheet.",
          "Paste from a web page, Google Docs or Word and it arrives as Markdown; paste cells from a spreadsheet and they arrive as a table; paste or drop a picture and it is kept with the document. Text copied from a code editor pastes as it is.",
        ],
      },
      {
        id: "together",
        title: "Two sides that stay together.",
        paragraphs: [
          "In Split, the text and the preview scroll together. Double-click the preview to find the line it came from; tick a task's box in the preview and it is ticked in the text. The outline lists the headings and writes a table of contents that is written again in its place when they change.",
          "Check the document runs markdownlint's rules, the ones editors and CI use, in plain words: headings that skip a level, links to headings that are not there, pictures without words for people who cannot see them. Most can be fixed with one press.",
        ],
      },
      {
        id: "files",
        title: "Your files stay yours.",
        paragraphs: [
          "Open several documents in tabs. In Chrome and Edge, Save writes back to the very file you opened, and you can open a whole folder and save each file where it is. In other browsers Save downloads a copy. A version is kept each time you save, to compare and put back.",
          "Nothing is uploaded. A draft is kept in your browser's own storage only if you turn that on. HTML inside a document is cleaned, in the preview and in everything exported or copied, so nothing in it can run.",
        ],
      },
      {
        id: "export",
        title: "A web page, a Word file, a PDF, or slides.",
        paragraphs: [
          "Export a web page that stands alone, a Word file with Word's own headings and tables, a PDF from the print dialog, or the Markdown with its pictures as a ZIP. Copy as rich text pastes into an email with its formatting. Present as slides shows the document a part at a time, split at lines of ---.",
        ],
        links: [
          { label: "Guide: Markdown to Word", href: "/blog/markdown-to-word/" },
          { label: "Guide: Markdown to PDF", href: "/blog/markdown-to-pdf/" },
        ],
      },
    ],
    sources: [
      sources.commonmark,
      sources.gfm,
      sources.github,
      sources.markdownIt,
      sources.markdownlint,
    ],
  },
  {
    published: "2026-10-24",
    slug: "markdown-to-html",
    title: "From Markdown to a page anyone can open.",
    searchTitle:
      "How to convert Markdown to HTML online, free and without uploading",
    description:
      "Convert Markdown to HTML in your browser: one web page with its look inside it, or the HTML alone, with GitHub's tables, code, maths and diagrams. Cleaned so nothing in it runs.",
    keywords: [
      "markdown to html",
      "convert markdown to html",
      "md to html",
      "markdown converter",
      "markdown html online",
    ],
    category: "A little know-how",
    readingTime: "3 min read",
    image: "/images/markdown-html-guide.svg",
    imageAlt: "Markdown text becoming HTML",
    tool: "markdown-to-html",
    intro:
      "Markdown is written to be turned into HTML. KeepSimp does it in your browser with markdown-it, which follows the CommonMark rules exactly, and gives you either a web page that opens anywhere or the HTML to paste into a site.",
    sections: [
      {
        id: "page",
        title: "One file that opens anywhere.",
        paragraphs: [
          "Download the web page and you get one .html file with its look written into it: readable type, tables, code and alerts, light or dark as the reader's device prefers, and pictures you pasted inside it. Nothing is fetched when it opens, so it works from a USB stick or an email attachment.",
          "Maths is written as MathML, which every current browser draws itself, and diagrams as drawings inside the page. Code is coloured.",
        ],
        links: [
          {
            label: "Open Markdown to HTML",
            href: "/dashboard/markdown-to-html/",
          },
        ],
      },
      {
        id: "snippet",
        title: "Or the HTML alone.",
        paragraphs: [
          "Export, Copy HTML puts only the body's HTML on the clipboard, for a CMS or a site of your own. Headings carry GitHub's anchors as their ids, so links to them keep working.",
          "Every piece of HTML is cleaned by DOMPurify first: scripts, frames, forms and links that would run code are taken out, even when the Markdown had them.",
        ],
      },
      {
        id: "privacy",
        title: "Made on your device.",
        paragraphs: [
          "The Markdown is read and the page is made in your browser; nothing is uploaded, and the page works offline once it has been opened. Agents can do the same through KeepSimp's agent tools (markdown_to_html), with the same code.",
        ],
        links: [
          {
            label: "Guide: the Markdown editor",
            href: "/blog/markdown-editor-online/",
          },
        ],
      },
    ],
    sources: [sources.commonmark, sources.markdownIt, sources.dompurify],
  },
  {
    published: "2026-10-24",
    slug: "markdown-to-pdf",
    title: "Markdown, set for paper.",
    searchTitle: "How to convert Markdown to PDF for free, in your browser",
    description:
      "Turn Markdown into a PDF from your browser's print dialog, laid out for paper: headings kept with their text, tables and code not cut in half. No uploads, no account.",
    keywords: [
      "markdown to pdf",
      "convert markdown to pdf",
      "md to pdf",
      "readme to pdf",
      "print markdown",
    ],
    category: "A little know-how",
    readingTime: "3 min read",
    image: "/images/markdown-pdf-guide.svg",
    imageAlt: "Markdown text becoming pages of a PDF",
    tool: "markdown-to-pdf",
    intro:
      "Most Markdown-to-PDF converters upload your file to a server. Your browser can make a good PDF itself: KeepSimp lays the document out for paper and hands it to the print dialog, where Save as PDF writes the file.",
    sections: [
      {
        id: "how",
        title: "Print, then Save as PDF.",
        paragraphs: [
          "Press Print or save as PDF. The document alone goes to the dialog, with its own look for paper. Choose Save as PDF (or Microsoft Print to PDF on Windows) as the printer, and set the paper size, margins and whether page numbers are printed there.",
        ],
        links: [
          {
            label: "Open Markdown to PDF",
            href: "/dashboard/markdown-to-pdf/",
          },
        ],
      },
      {
        id: "paper",
        title: "Laid out for pages.",
        paragraphs: [
          "Headings are kept with the text that follows them, and tables, blocks of code, quotes and pictures are not split across two pages where the browser allows. A table's header row is printed again at the top of each page it runs onto.",
          "Browsers differ in how far they follow these rules, and page numbers and headers are the print dialog's to set, so look at the preview in the dialog before you save.",
        ],
      },
      {
        id: "before",
        title: "Before you print.",
        paragraphs: [
          "Look at the preview first: it is what will be printed. Turn on curly quotes and dashes in the preview options for a printed look, and check the document for headings that skip a level, which make a PDF's outline harder to follow.",
        ],
        links: [
          {
            label: "Guide: the Markdown editor",
            href: "/blog/markdown-editor-online/",
          },
        ],
      },
    ],
    sources: [sources.mdnPrint, sources.commonmark],
  },
  {
    published: "2026-10-24",
    slug: "markdown-to-word",
    title: "Markdown into Word, headings and all.",
    searchTitle:
      "How to convert Markdown to Word (.docx) for free, without uploading",
    description:
      "Turn Markdown into a Word file with Word's own heading styles, numbered lists, tables, links, pictures and footnotes, in your browser. Nothing is uploaded.",
    keywords: [
      "markdown to word",
      "markdown to docx",
      "convert markdown to word",
      "md to docx",
      "markdown to word online",
    ],
    category: "A little know-how",
    readingTime: "4 min read",
    image: "/images/markdown-word-guide.svg",
    imageAlt: "Markdown becoming a Word document with headings and a table",
    tool: "markdown-to-word",
    intro:
      "Sooner or later a Markdown document has to go to someone who works in Word. Copying it across loses the structure; KeepSimp writes a real .docx instead, made in your browser with the docx library.",
    sections: [
      {
        id: "word",
        title: "Word's own parts, not lookalikes.",
        paragraphs: [
          "Headings become Word's Heading 1 to 6 styles, so Word's navigation pane and table of contents work at once. Numbered and bulleted lists are Word's own lists and number themselves, nested lists included. Tables, links and footnotes are Word's own too, and task boxes are ☑ and ☐.",
          "Pictures you pasted go into the file at their size, no wider than the page. Front matter's title and author become the file's details.",
        ],
        links: [
          {
            label: "Open Markdown to Word",
            href: "/dashboard/markdown-to-word/",
          },
        ],
      },
      {
        id: "limits",
        title: "What Word has no place for.",
        paragraphs: [
          "Maths stays as its TeX, in a fixed-width font, because Word's own equations are not made here. Diagrams become pictures. Pictures linked from other sites are not fetched, so they stay as their words.",
        ],
      },
      {
        id: "private",
        title: "Written on your device.",
        paragraphs: [
          "The Word file is written in your browser and downloaded from it: nothing is uploaded, and it works offline. To go the other way, open a .docx in the editor and it becomes Markdown.",
        ],
        links: [
          { label: "Guide: Word to Markdown", href: "/blog/word-to-markdown/" },
        ],
      },
    ],
    sources: [sources.docx, sources.commonmark],
  },
  {
    published: "2026-10-24",
    slug: "html-to-markdown",
    title: "Any web page, as clean Markdown.",
    searchTitle: "How to convert HTML to Markdown online, free and private",
    description:
      "Turn HTML files, web pages and copied text into clean Markdown in your browser: headings, lists, links, tables and code blocks, written as GitHub writes them.",
    keywords: [
      "html to markdown",
      "convert html to markdown",
      "web page to markdown",
      "html to md",
      "paste as markdown",
    ],
    category: "A little know-how",
    readingTime: "3 min read",
    image: "/images/html-markdown-guide.svg",
    imageAlt: "HTML becoming clean Markdown",
    tool: "html-to-markdown",
    intro:
      "Moving a page into a wiki, a README or notes means rewriting its formatting by hand, unless something turns the HTML into Markdown for you. KeepSimp does it with Turndown and its own rules, in your browser.",
    sections: [
      {
        id: "two-ways",
        title: "A file, or what you copy.",
        paragraphs: [
          "Open an .html file and it becomes a Markdown document in a tab of its own. Or select part of any page, copy it and paste it into the editor: headings, lists, links, bold and italic, tables and code blocks with their language arrive as Markdown.",
          "Text copied from a code editor stays as it is, so Markdown copied from VS Code is not turned into something else.",
        ],
        links: [
          {
            label: "Open HTML to Markdown",
            href: "/dashboard/html-to-markdown/",
          },
        ],
      },
      {
        id: "clean",
        title: "Written the way people write Markdown.",
        paragraphs: [
          "Lists use - and 1., not Turndown's wider padding; strikethrough is ~~; every table becomes a GitHub table with its first row as the header, even ones without header cells. Google Docs' copies, which wrap everything in bold that is not bold, come across right.",
        ],
      },
      {
        id: "safe",
        title: "Nothing in it runs.",
        paragraphs: [
          "Scripts and styles in the HTML are dropped, and when the Markdown is shown or exported it is cleaned again. Pictures stay as links to where they were; their addresses are not fetched until the preview shows them, and a switch stops that too.",
        ],
        links: [
          {
            label: "Guide: the Markdown editor",
            href: "/blog/markdown-editor-online/",
          },
        ],
      },
    ],
    sources: [sources.turndown, sources.gfm],
  },
  {
    published: "2026-10-24",
    slug: "word-to-markdown",
    title: "Word files, written as Markdown.",
    searchTitle:
      "How to convert Word (.docx) to Markdown for free, without uploading",
    description:
      "Turn .docx files into Markdown in your browser: headings, lists, tables, links, bold and italic, with their pictures kept. Nothing is uploaded.",
    keywords: [
      "word to markdown",
      "docx to markdown",
      "convert word to markdown",
      "docx to md",
      "word to md",
    ],
    category: "A little know-how",
    readingTime: "3 min read",
    image: "/images/word-markdown-guide.svg",
    imageAlt: "A Word document becoming Markdown",
    tool: "word-to-markdown",
    intro:
      "Documentation often starts life in Word. KeepSimp reads a .docx with mammoth, which turns Word's styles into meaning rather than looks, and writes that as Markdown, all in your browser.",
    sections: [
      {
        id: "what",
        title: "Meaning comes across; looks do not.",
        paragraphs: [
          "Word's heading styles become # headings, its lists become Markdown lists, and tables, links, bold and italic come across. Colours, fonts and page layout are left behind, since Markdown has no place for them, and the page says when something in the file was not read.",
        ],
        links: [
          {
            label: "Open Word to Markdown",
            href: "/dashboard/word-to-markdown/",
          },
        ],
      },
      {
        id: "pictures",
        title: "Pictures, kept beside it.",
        paragraphs: [
          "Pictures in the file are kept with the new document under pictures/, and the Markdown names them there. Export Markdown and pictures (.zip) to save the .md file with a pictures folder beside it, ready for a repository or a site.",
        ],
      },
      {
        id: "back",
        title: "And back again.",
        paragraphs: [
          "When the Markdown is ready, Export, Word writes it as a .docx again, with Word's own headings and tables. Nothing is uploaded either way.",
        ],
        links: [
          { label: "Guide: Markdown to Word", href: "/blog/markdown-to-word/" },
        ],
      },
    ],
    sources: [sources.mammoth, sources.turndown],
  },
  {
    published: "2026-10-24",
    slug: "markdown-table-generator",
    title: "Tables without counting pipes.",
    searchTitle:
      "Markdown table generator: make tables from a grid or a spreadsheet",
    description:
      "Make Markdown tables in a grid of cells or by pasting from Excel or Google Sheets, then line up their pipes and add rows and columns in place. Free, in your browser.",
    keywords: [
      "markdown table generator",
      "markdown table",
      "excel to markdown table",
      "csv to markdown table",
      "markdown table formatter",
    ],
    category: "A little know-how",
    readingTime: "3 min read",
    image: "/images/markdown-table-guide.svg",
    imageAlt:
      "A grid of cells becoming a Markdown table with its pipes lined up",
    tool: "markdown-table-generator",
    intro:
      "Markdown tables are easy to read and tiring to write: every row needs its pipes, and lining them up by hand takes longer than the table's contents. KeepSimp writes them for you.",
    sections: [
      {
        id: "make",
        title: "Three ways to a table.",
        paragraphs: [
          "Press Make a table and type into a grid; the first row is the header. Or copy cells in Excel, Numbers or Google Sheets and paste them into the editor: they arrive as a table. Or paste a table from a web page.",
        ],
        links: [
          {
            label: "Open the table generator",
            href: "/dashboard/markdown-table-generator/",
          },
        ],
      },
      {
        id: "change",
        title: "Change it where it is.",
        paragraphs: [
          "With the cursor in a table, the table menu lines up its pipes (wide letters such as Chinese count as two columns), adds a row below or a column to the right, and deletes the row or column the cursor is in. A table needs its header, so the header row stays.",
        ],
      },
      {
        id: "where",
        title: "Where the tables work.",
        paragraphs: [
          "These are GitHub's tables, which GitHub, GitLab, most site builders and many note apps read. Alignment set with colons in the line of dashes (:--, :-:, --:) is kept when the pipes are lined up.",
        ],
        links: [
          {
            label: "Guide: the Markdown editor",
            href: "/blog/markdown-editor-online/",
          },
        ],
      },
    ],
    sources: [sources.gfm, sources.github],
  },
]
