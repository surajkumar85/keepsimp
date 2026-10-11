import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  name: "How to use the KeepSimp PDF splitter",
  description:
    "Split a PDF in your browser: cut it into parts where you can see the pages, take pages out or remove them, and download parts that are no larger than they need to be.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your PDF",
      text: "Drop a PDF, choose it from your device or paste it. A locked file asks for its password; a damaged one is repaired where possible.",
    },
    {
      title: "Choose how to split",
      text: "Cut the file into parts, type page ranges, part odd pages from even ones, take pages out as one file, or remove pages.",
    },
    {
      title: "Place the cuts",
      text: "Every page is shown. Press between two pages to cut there, or let a rule cut every few pages or into equal parts. Change any cut afterwards.",
    },
    {
      title: "Read to find the place",
      text: "Open the file in the reader to scroll, search and zoom. While reading, cut after the page you are on.",
    },
    {
      title: "Name the parts",
      text: "Parts are named after the file and numbered. Type a name for any part, change the pattern for all of them, or leave a part out.",
    },
    {
      title: "Split and download",
      text: "Press Split PDF. Read any part to check it, download parts one at a time, or all of them as one ZIP. Nothing is uploaded.",
    },
  ],
  options: [
    {
      term: "Cut into parts",
      detail:
        "The scissors between two pages cut the file there; pressing again takes the cut away. Cut after every N pages, into N equal parts, or every page on its own, then adjust by hand. Undo and redo cover every change. On the keyboard, the arrow keys move between pages, S cuts after the page, and Enter opens the reader there.",
    },
    {
      term: "Page ranges",
      detail:
        "Each range you type becomes a part: 1-3, 4-10, 11- gives three. An open range such as 11- runs to the last page and -3 starts at the first. Ranges may overlap or repeat, 5-1 takes pages in reverse, and odd and even take every other page. A plus sign joins ranges into one part: 1-3 + 7.",
    },
    {
      term: "Odd and even",
      detail:
        "Makes two files, one with pages 1, 3, 5 and so on and one with pages 2, 4, 6 and so on. It parts the fronts from the backs of a double-sided scan.",
    },
    {
      term: "Extract and remove",
      detail:
        "Extract saves the pages you select as one new file. Remove saves everything except them. Press pages to select them, Shift-click to select everything between two, or type them, such as 1-3, 7. The pages stay in the order of the file.",
    },
    {
      term: "The reader",
      detail:
        "Click the file's picture, or double-click a page, to read the file in a large window with zoom, a strip of small pages, bookmarks and search. While cutting into parts, the scissors in the reader cut after the page you are on. After splitting, Read opens a part before you download it.",
    },
    {
      term: "Names",
      detail:
        "The pattern names every part. {name} is the file's name, {part} the part's number, {from} and {to} its first and last page, {pages} its pages as you would type them, and {label} a word for the part where there is one, such as odd or even. Numbers get zeros in front so that files sort in order. A name typed for one part is used as it is, and no two parts get the same name.",
    },
    {
      term: "Leaving a part out",
      detail:
        "Turn off the switch beside a part to leave it out of the result. Its pages are shown faded. The other parts keep their numbers.",
    },
    {
      term: "What a part keeps",
      detail:
        "Pages are copied as they are, without re-compressing anything. Links to pages inside the part still work, and links to pages that went elsewhere are removed. Bookmarks follow their pages. Notes, fillable fields, layers and the file's own page numbers stay with their pages, and each part carries the document's title and author. Attached files go into the first part.",
    },
    {
      term: "File size",
      detail:
        "Many PDFs give every page one shared list of all the fonts and pictures in the file. Tools that copy that list make every part nearly as large as the whole. Here each part gets only what its own pages use, so the parts together are about the size of the original.",
    },
    {
      term: "Locked, signed and tagged files",
      detail:
        "A locked file is opened with its password, which is used on your device and not kept; the parts have no password. A digital signature cannot stay valid in a part, so its picture is kept and the file's row tells you. Accessibility tags are not carried over yet.",
    },
    {
      term: "Limits and privacy",
      detail:
        "One file at a time, up to 5,000 pages. On a computer the file can be 300 MB; on a phone, 100 MB, because phones close pages that use more memory. Everything runs in your browser: the file, its contents and any password stay on your device.",
    },
  ],
}

export function PdfSplitterTutorial() {
  return <ToolTutorial content={content} />
}
