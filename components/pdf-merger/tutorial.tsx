import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  name: "How to use the KeepSimp PDF merger",
  description:
    "Merge PDF files and pictures in your browser: put them in order, arrange single pages, unlock password-protected files and download one PDF with links, bookmarks and form fields kept.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your PDFs",
      text: "Drop PDF files and pictures, choose them from your device or paste them. You can add more at any time, or try the samples.",
    },
    {
      title: "Put them in order",
      text: "Drag a file, use its arrow buttons, or sort the list by name or date.",
    },
    {
      title: "Choose and arrange pages",
      text: "Type the pages you want from a file, such as 1-3, 7, or open the Pages view to drag, turn, copy and remove single pages.",
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
      term: "Pages view",
      detail:
        "Shows every page of the result as a small picture. Click pages to select them, and Shift-click to select everything between two. Drag them to a new place, or use the toolbar to turn, copy, remove or move them, to reverse their order, or to add a blank page. Undo and redo cover every change. Look closely opens one page large, with the pages beside it a press away.",
    },
    {
      term: "Keyboard in the Pages view",
      detail:
        "Arrow keys move between pages, with Home and End for the first and last. Space selects, and Shift with an arrow selects on from there. Alt with the left or right arrow moves the selected pages, R turns them, and Delete removes them. Ctrl or Cmd with A selects all, with Z undoes and with Shift and Z does again. Escape lets go of the selection.",
    },
    {
      term: "Your own page order",
      detail:
        "After the first change in the Pages view, the result follows your arrangement, not the file list. Files you add then join at the end, and removing a file takes its pages away. Start again from the files puts every file's pages back together and asks before it does.",
    },
    {
      term: "Alternate pages",
      detail:
        "Takes the first page of each file, then the second of each, and so on. This joins a document that was scanned as two files, fronts and backs. Turn on the switch when the backs were scanned with the stack turned over, so that the last file is read from its end.",
    },
    {
      term: "Pictures as pages",
      detail:
        "JPG, PNG, WebP, AVIF, HEIC, GIF, TIFF, BMP and JPEG XL pictures become pages. A picture takes the size of the page before it, or fits its own size, or goes on an A4 or Letter sheet, with a margin you choose. JPEG photographs go in as they are, without being compressed again, and are shown the right way up. See-through parts of other pictures become white. SVG is not accepted.",
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
