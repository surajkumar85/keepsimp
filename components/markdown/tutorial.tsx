import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  name: "How to use the KeepSimp Markdown editor",
  description:
    "Write Markdown with GitHub's tables, task lists, footnotes and alerts, see it as it will be read, and save it, export it as a web page or print it to PDF, all in your browser.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Write or open a file",
      text: "Start typing, press Open, drop a .md file onto the editor, or try the sample. Files are read on your device; nothing is uploaded.",
    },
    {
      title: "Format with the toolbar or keys",
      text: "Select words and press Bold, Link or a list button, or use the same keys as GitHub: Ctrl+B, Ctrl+I, Ctrl+K and Ctrl+E (⌘ on a Mac). Lists and quotes carry on when you press Enter.",
    },
    {
      title: "See it as it will be read",
      text: "Split shows the text beside its preview; Write and Preview show one at a time. Links to headings move the preview there.",
    },
    {
      title: "Save it",
      text: "In Chrome and Edge, Save writes the file you opened in place. In other browsers it downloads a copy. The page asks before you leave with changes not saved.",
    },
    {
      title: "Export or copy",
      text: "Export a web page that stands alone, print it or save it as a PDF, or copy it as rich text to paste into an email or a document.",
    },
  ],
  options: [
    {
      term: "Markdown it understands",
      detail:
        "CommonMark with GitHub's additions: tables, task lists, strikethrough, links made from addresses, footnotes, the five kinds of alert (note, tip, important, warning, caution) and headings with the same anchors GitHub gives them.",
    },
    {
      term: "Front matter",
      detail:
        "A block of YAML between --- lines at the top is read as the document's details and shown as a table, never as text. If it cannot be read, the preview says why.",
    },
    {
      term: "Safe preview",
      detail:
        "HTML inside a document is allowed but cleaned: scripts, frames, forms, styles and links that would run code are taken out, in the preview and in everything exported or copied.",
    },
    {
      term: "Curly quotes and dashes",
      detail:
        "Off at first. On, straight quotes, -- and ... are shown and exported as “ ”, – and …. Your text keeps what you typed.",
    },
    {
      term: "Show pictures from other sites",
      detail:
        "On at first. Pictures linked from other sites are fetched by your browser to be shown. Turn it off and they are left out, and the counts below the editor say how many.",
    },
    {
      term: "Counts",
      detail:
        "Words are counted as your browser breaks them, so languages written without spaces count right. Reading time assumes 238 words a minute.",
    },
    {
      term: "Print or save as PDF",
      detail:
        "Opens your browser's print dialog with the document alone. Headings stay with what follows them and tables, code and pictures are not split where the browser allows; page numbers and margins are set in the dialog.",
    },
  ],
}

export function MarkdownTutorial() {
  return <ToolTutorial content={content} />
}
