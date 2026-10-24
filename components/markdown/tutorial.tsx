import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"
import type { MarkdownMode } from "./doors"

/** Every option, explained once: the editor and each door share them. */
const options: TutorialContent["options"] = [
  {
    term: "Markdown it understands",
    detail:
      "CommonMark with GitHub's additions: tables, task lists, strikethrough, links made from addresses, footnotes, the five kinds of alert (note, tip, important, warning, caution), headings with the same anchors GitHub gives them, maths in $…$ and $$…$$ and diagrams in ```mermaid blocks.",
  },
  {
    term: "Front matter",
    detail:
      "A block of YAML between --- lines at the top is read as the document's details and shown as a table, never as text. If it cannot be read, the preview says why. Its title and author go into Word files.",
  },
  {
    term: "Maths and diagrams",
    detail:
      "Maths is drawn by KaTeX as MathML, which every current browser draws itself. Diagrams are drawn by Mermaid in its strict mode. Both load only when a document has some, and work offline once used. In a Word file, maths stays as its TeX and diagrams are pictures.",
  },
  {
    term: "Pictures",
    detail:
      "Paste or drop pictures into the text, or press Picture. They are kept with the document under pictures/ and named in the text; the preview shows them, a web page or Word file carries them, and Markdown and pictures (.zip) saves them beside the file.",
  },
  {
    term: "Pasting",
    detail:
      "Text copied from a web page, Google Docs or Word becomes Markdown: headings, lists, links, bold, tables and code. Cells copied from a spreadsheet become a table. Text from a code editor pastes as it is. Turn it off under More, or press Ctrl+Shift+V (⌘⇧V) to paste plain text.",
  },
  {
    term: "Safe preview",
    detail:
      "HTML inside a document is allowed but cleaned: scripts, frames, forms, styles and links that would run code are taken out, in the preview and in everything exported or copied.",
  },
  {
    term: "Files and folders",
    detail:
      "In Chrome and Edge, Save writes the file you opened in place, and Open a folder lists its Markdown files and saves each where it is; links from a document to the folder's files are checked. Other browsers download a copy. Several documents open in tabs.",
  },
  {
    term: "Keep a draft on this device",
    detail:
      "Off at first. On, your open documents, their pictures and versions are kept in this browser's own storage, so a closed tab does not lose them; off again deletes them. Nothing is sent anywhere.",
  },
  {
    term: "Versions",
    detail:
      "A version is kept each time you save, and whenever you press Keep a version now. Compare any with the text as it is, and put it back as one step you can undo.",
  },
  {
    term: "Check the document",
    detail:
      "markdownlint's rules, said in plain words, each with its line and a fix where there is one: headings that skip a level, links to headings that are not there, pictures without words, uneven lists and more. It also estimates how easy English text is to read. Nothing is checked over the internet.",
  },
  {
    term: "Tidy with Prettier",
    detail:
      "Writes lists, emphasis, tables and spacing one way. What would change is shown first; nothing changes until you take it.",
  },
  {
    term: "Slides",
    detail:
      "Present as slides shows the document one part at a time, split at lines of ---, filling the screen. Arrow keys, a press on either side or a swipe move on; Escape ends it.",
  },
  {
    term: "Focus and typewriter",
    detail:
      "Focus on writing hides everything but the text; Escape brings it all back. Keep the line being written in the middle scrolls as you type. Hide marks away from the cursor shows the text almost as it reads, with its marks back on the lines you write.",
  },
  {
    term: "Curly quotes and dashes",
    detail:
      "Off at first. On, straight quotes, -- and ... are shown and exported as “ ”, – and …. Your text keeps what you typed.",
  },
  {
    term: "Show pictures from other sites",
    detail:
      "On at first. Pictures linked from other sites are fetched by your browser to be shown. Turn it off and they are left out, and the counts under the editor say how many.",
  },
  {
    term: "Print or save as PDF",
    detail:
      "Opens your browser's print dialog with the document alone. Headings stay with what follows them and tables, code and pictures are not split where the browser allows; page numbers and margins are set in the dialog.",
  },
]

const editor: TutorialContent = {
  name: "How to use the KeepSimp Markdown editor",
  description:
    "Write Markdown with GitHub's tables, task lists, footnotes, alerts, maths and diagrams, see it as it will be read, and save it, or export it as a web page, a Word file or a PDF, all in your browser.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Write or open a file",
      text: "Start typing, press Open, drop a Markdown, Word or HTML file onto the editor, start from a template, or try the sample. Files are read on your device; nothing is uploaded.",
    },
    {
      title: "Format with the toolbar or keys",
      text: "Select words and press Bold, Link or a list button, or use the same keys as GitHub: Ctrl+B, Ctrl+I, Ctrl+K and Ctrl+E (⌘ on a Mac). Lists and quotes carry on when you press Enter. F1 shows every key.",
    },
    {
      title: "See it as it will be read",
      text: "Split shows the text beside its preview, scrolling together; double-click the preview to find a line in the text, and tick a task's box there to tick it in the text.",
    },
    {
      title: "Check and tidy it",
      text: "The outline lists the headings and writes a table of contents. Check the document finds what to fix, and fixes much of it for you.",
    },
    {
      title: "Save, export or present",
      text: "Save writes the file you opened where the browser allows. Export makes a web page, a Word file, a PDF or a ZIP with its pictures, or copies it as rich text. Present as slides shows it a part at a time.",
    },
  ],
  options,
  guideHref: "/blog/markdown-editor-online/",
}

const doors: Record<Exclude<MarkdownMode, "editor">, TutorialContent> = {
  "to-html": {
    name: "How to turn Markdown into HTML with KeepSimp",
    description:
      "Turn Markdown into a web page that stands alone, or copy its HTML, in your browser.",
    intro: "Three steps. Every option is explained underneath.",
    steps: [
      {
        title: "Write or open the Markdown",
        text: "Type or paste it, drop a .md file onto the editor, or press Open.",
      },
      {
        title: "Look at the preview",
        text: "It is the page as it will be: tables, task lists, code, maths and diagrams drawn.",
      },
      {
        title: "Download or copy it",
        text: "Press Download the web page for one HTML file with its look and pictures inside it, or Export, Copy HTML for the HTML alone.",
      },
    ],
    options,
    guideHref: "/blog/markdown-to-html/",
  },
  "to-pdf": {
    name: "How to turn Markdown into a PDF with KeepSimp",
    description:
      "Print Markdown to a PDF from your browser, laid out for paper.",
    intro: "Three steps. Every option is explained underneath.",
    steps: [
      {
        title: "Write or open the Markdown",
        text: "Type or paste it, drop a .md file onto the editor, or press Open.",
      },
      {
        title: "Print it",
        text: "Press Print or save as PDF. The document alone goes to your browser's print dialog.",
      },
      {
        title: "Save as PDF",
        text: "Choose Save as PDF (or Microsoft Print to PDF) as the printer, and set the paper size and margins there.",
      },
    ],
    options,
    guideHref: "/blog/markdown-to-pdf/",
  },
  "to-word": {
    name: "How to turn Markdown into a Word file with KeepSimp",
    description:
      "Turn Markdown into a .docx file with Word's own headings, lists and tables, in your browser.",
    intro: "Three steps. Every option is explained underneath.",
    steps: [
      {
        title: "Write or open the Markdown",
        text: "Type or paste it, drop a .md file onto the editor, or press Open.",
      },
      {
        title: "Download the Word file",
        text: "Headings become Word's heading styles, so its navigation and contents work; lists number themselves; tables, links, pictures and footnotes are Word's own.",
      },
      {
        title: "Open it in Word or Google Docs",
        text: "Maths stays as its TeX, and diagrams are pictures: Word has no place for either.",
      },
    ],
    options,
    guideHref: "/blog/markdown-to-word/",
  },
  "from-html": {
    name: "How to turn HTML into Markdown with KeepSimp",
    description:
      "Turn HTML files and copied web pages into clean Markdown, in your browser.",
    intro: "Two ways. Every option is explained underneath.",
    steps: [
      {
        title: "Open an HTML file",
        text: "Press Open an HTML file, or drop one onto the editor: it opens as Markdown in a tab of its own.",
      },
      {
        title: "Or paste from a web page",
        text: "Select part of a page, copy it and paste it into the editor: headings, lists, links, tables and code come as Markdown.",
      },
      {
        title: "Save it",
        text: "Save writes a .md file. The HTML is cleaned first: nothing in it runs.",
      },
    ],
    options,
    guideHref: "/blog/html-to-markdown/",
  },
  "from-word": {
    name: "How to turn a Word file into Markdown with KeepSimp",
    description:
      "Turn .docx files into Markdown with their headings, lists, tables and pictures, in your browser.",
    intro: "Three steps. Every option is explained underneath.",
    steps: [
      {
        title: "Open the Word file",
        text: "Press Open a Word file, or drop a .docx onto the editor. Or copy from Word and paste.",
      },
      {
        title: "Look it over",
        text: "Headings, lists, tables, links, bold and italic come across; colours, fonts and layout do not, and the page says what had no place in Markdown.",
      },
      {
        title: "Save it",
        text: "Its pictures are kept with it: Export, Markdown and pictures (.zip) saves them beside the .md file.",
      },
    ],
    options,
    guideHref: "/blog/word-to-markdown/",
  },
  table: {
    name: "How to make a Markdown table with KeepSimp",
    description:
      "Make Markdown tables in a grid of cells or from a spreadsheet, in your browser.",
    intro: "Three ways. Every option is explained underneath.",
    steps: [
      {
        title: "Make it in a grid",
        text: "Press Make a table, type into the cells (the first row is the header) and put it in the document.",
      },
      {
        title: "Or paste from a spreadsheet",
        text: "Copy cells in Excel, Numbers or Google Sheets and paste them into the editor: they become a table.",
      },
      {
        title: "Change it in place",
        text: "With the cursor in a table, the table menu lines up its pipes, adds or deletes a row or a column.",
      },
    ],
    options,
    guideHref: "/blog/markdown-table-generator/",
  },
}

export function MarkdownTutorial({ mode = "editor" }: { mode?: MarkdownMode }) {
  return <ToolTutorial content={mode === "editor" ? editor : doors[mode]} />
}
