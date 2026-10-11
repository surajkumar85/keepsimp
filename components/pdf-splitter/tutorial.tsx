import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  video: {
    file: "pdf-splitter-tutorial",
    duration: { iso: "PT1M14S", label: "1 min 14 s" },
    uploadDate: "2026-10-11",
  },
  name: "How to use the KeepSimp PDF splitter",
  description:
    "Split PDFs in your browser: cut them into parts where you can see the pages, at bookmarks or by size, take pages out or remove them, and download parts that are no larger than they need to be.",
  intro:
    "Watch the tour, or follow the same steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your PDFs",
      text: "Drop one PDF or several, choose them from your device or paste them. A locked file asks for its password; a damaged one is repaired where possible.",
    },
    {
      title: "Choose how to split",
      text: "Cut the file into parts, type page ranges, split at bookmarks, by size, at blank pages or by text, part odd pages from even ones, take pages out as one file, or remove pages.",
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
      term: "By bookmarks",
      detail:
        "Each bookmark starts a part, which runs to the page before the next bookmark and is named after its bookmark. Choose the level to split at when bookmarks sit under one another, narrow them down by words in their titles, and untick any you do not want to split at. Pages before the first bookmark become a part of their own or join the first part. Each part keeps the bookmarks of its own pages.",
    },
    {
      term: "By size",
      detail:
        "Makes parts that each stay under a size, such as 10 MB for email. The only way to know what a set of pages weighs is to write it, so the parts are found by writing them and are shown once the file is split. Each part takes as many pages as fit. Pictures are not made smaller, so a single page that is over the size gets a part to itself and its row says so.",
    },
    {
      term: "At blank pages",
      detail:
        "For a stack of scans with a blank sheet between documents. Every page is looked at, and pages with nothing on them are marked. Choose what counts as blank: nothing at all; specks or a lone page number; or also punch holes, a header or a short line. Then choose what happens at a blank page: cut there and leave it out, cut after it and keep it, or only remove it and keep the rest as one file. Press a page to keep one that was found blank, or to call another page blank.",
    },
    {
      term: "By text",
      detail:
        "Starts a new part at every page that holds the words you type, such as Invoice; capitals and accents make no difference. Or it reads one place on every page, such as the corner where an invoice number sits, and starts a new part whenever what it reads there changes; each part is then named after it. Mark the place by dragging over the page, by one of the usual places, or by typing its edges. A page with no text there stays with the part before it. This reads the text a PDF holds, so it does not work on scans, which hold pictures of text.",
    },
    {
      term: "Scans of two pages",
      detail:
        "A book laid open on a scanner gives two pages on every sheet. Turn on Each page is a scan of two pages to cut every sheet in half first. Choose whether the pages sit side by side or one above the other, which is read first, whether every sheet is cut or only those the shape of a double page, and whether the first is a single cover. Move the cut when the fold is not in the middle. Nothing is drawn or compressed again: the two halves show the two sides of the same sheet. The result can then be split in any way, or saved whole with Extract pages and Select all.",
    },
    {
      term: "Several files at once",
      detail:
        "Add as many PDFs as you like. The way of splitting, the rules that place cuts, typed ranges, typed pages, the bookmark level and the size apply to every file. Cuts and pages pressed by hand, ticked bookmarks, typed names and parts left out belong to the file that is shown; press a file's name to show it. A file that cannot be split as things stand says why in its row and is left out, and the others are still split. In the ZIP, each file's parts are in a folder of their own.",
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
        "The pattern names every part. {name} is the file's name, {part} the part's number, {from} and {to} its first and last page, {pages} its pages as you would type them, and {label} a word for the part where there is one, such as its bookmark, or odd or even. Names can be changed after splitting without splitting again. Numbers get zeros in front so that files sort in order. A name typed for one part is used as it is, and no two parts get the same name.",
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
      term: "What each part keeps, and a password",
      detail:
        "Under the parts you can choose to leave out bookmarks, to count every part's pages from 1, or to leave out the title and author for privacy. Files attached to the PDF go into the first part, into every part, or nowhere. A password locks every part with AES-256 encryption; you can also stop printing, copying or changes, which viewers are asked to respect, and a second password lifts those limits. A lost password cannot be recovered.",
    },
    {
      term: "Locked, signed and tagged files",
      detail:
        "A locked file is opened with its password, which is used on your device and not kept; the parts have no password. A digital signature cannot stay valid in a part, so its picture is kept and the file's row tells you. Accessibility tags are not carried over yet.",
    },
    {
      term: "Limits and privacy",
      detail:
        "Up to 100 files, each of up to 5,000 pages. On a computer, files can be 300 MB each and 500 MB together; on a phone, 100 MB each and 200 MB together, because phones close pages that use more memory. Everything runs in your browser: the files, their contents and any passwords stay on your device.",
    },
  ],
  guideHref: "/blog/split-pdfs-without-uploading/",
}

export function PdfSplitterTutorial() {
  return <ToolTutorial content={content} />
}
