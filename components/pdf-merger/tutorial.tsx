import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  name: "How to use the KeepSimp PDF merger",
  description:
    "Merge PDF files in your browser: put them in order, choose pages, unlock password-protected files and download one PDF with links, bookmarks and form fields kept.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your PDFs",
      text: "Drop PDF files, choose them from your device or paste them. You can add more at any time, or try the samples.",
    },
    {
      title: "Put them in order",
      text: "Drag a file, use its arrow buttons, or sort the list by name or date.",
    },
    {
      title: "Choose pages",
      text: "Leave the pages field empty to take the whole file, or type the pages you want, such as 1-3, 7. Turn a file's pages with the turn button.",
    },
    {
      title: "Unlock locked files",
      text: "A password-protected file asks for its password on its own row. It is used on your device and is not kept.",
    },
    {
      title: "Merge and check",
      text: "Press Merge PDF. Open the result in a new tab to look through it, then download it under the name you choose.",
    },
  ],
  options: [
    {
      term: "Pages",
      detail:
        "Write single pages and ranges separated by commas: 1-3, 7. An open range such as 10- runs to the last page, and -3 starts at the first. A backwards range such as 5-1 takes the pages in reverse. The words odd and even take every other page. A page may be listed more than once.",
    },
    {
      term: "Sorting",
      detail:
        "Sort by name, by the date each file was last changed, or back to the order you added them. Numbers inside names sort by value, so chapter 2 comes before chapter 10. Moving a file by hand keeps your own order, and new files then go to the end.",
    },
    {
      term: "Turning pages",
      detail:
        "The turn button rotates every page taken from that file a quarter turn clockwise each time you press it. Pages that were already turned inside the file keep that turn as well.",
    },
    {
      term: "The same file twice",
      detail:
        "Add again puts a second copy of a file straight after the first, with its own pages field. Use it to place different parts of one file in different places.",
    },
    {
      term: "Locked files",
      detail:
        "A file that needs a password to open is merged once you enter it. The merged PDF has no password. A file whose author only restricted changes opens without a password; the page reminds you to make sure you may change it.",
    },
    {
      term: "Damaged files",
      detail:
        "Files cut short by a failed download or with a broken index are repaired where possible, and the row says so. A file that cannot be read is left out, with the reason, and the rest are still merged.",
    },
    {
      term: "What is kept",
      detail:
        "Pages are copied as they are, without re-compressing pictures. Links inside each file keep working, as do notes, fillable fields and layers. A link to a page you left out is removed. When two files have a field with the same name, the later one is renamed so both keep their own values.",
    },
    {
      term: "Bookmarks",
      detail:
        "Each file's bookmarks are kept. With several files they are grouped under an entry named after each file, which opens that file's first page.",
    },
    {
      term: "Signatures and accessibility tags",
      detail:
        "A digital signature covers the exact file it was made for, so it cannot stay valid in a merged PDF. The signature's picture is kept and the row tells you. Accessibility tags are not carried over yet.",
    },
    {
      term: "File size",
      detail:
        "Fonts and pictures that several files share are stored once, so the result is often smaller than the files together. Nothing is re-compressed, so quality does not change.",
    },
    {
      term: "Limits and privacy",
      detail:
        "Up to 100 files and 5,000 pages in the result. On a computer, files can be 300 MB each and 500 MB together; on a phone, 100 MB each and 200 MB together, because phones close pages that use more memory. Everything runs in your browser: the files, their contents and any passwords stay on your device.",
    },
  ],
}

export function PdfMergerTutorial() {
  return <ToolTutorial content={content} />
}
