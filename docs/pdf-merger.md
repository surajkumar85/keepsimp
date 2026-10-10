# PDF merger

Updated 11 October 2026. Applies to `/dashboard/pdf-merger/`. Phases 1 and 2 of four are built: merging files and chosen pages, the page organiser, and pictures as pages. The plan for the rest is at the end.

## What it does

- **Add files** by drop, picker, paste or the samples. A file is taken for a PDF by its first bytes, not its name.
- **Files view:** a list in merge order, each row with a picture of the first page, the name, page count and size.
  - Reorder by dragging, or with "move earlier" and "move later" buttons on every row.
  - Sort: as added, name A–Z or Z–A, oldest or newest first. Numbers in names sort by value (2 before 10). Moving a file by hand makes the order the person's own; new files then go to the end.
  - Per file: a pages field, a turn button (a quarter turn clockwise per press), "add again" and remove.
- **Pages field:** `1-3, 7`, open ends (`10-`, `-3`), backwards ranges (`5-1`), `odd`, `even`, repeats. Empty means the whole file. A mistake is explained under the field and stops the merge.
- **Locked files:** a row asks for the password. A wrong one is said to be wrong; the right one opens the file. The merged PDF has no password. A file that only restricts changes opens by itself, with a reminder to have the right to change it.
- **Damaged files:** a broken index or a missing end is repaired, and the row says so. A file that cannot be read is listed with the reason and left out; the rest still merge.
- **Pages view:** every page of the result as a tile with its picture, its position and where it came from.
  - Click to select, Shift-click for everything between, "Select all" and "Clear".
  - Drag one page or the whole selection to a new place. On a touch screen, where there is nothing to drag with, the toolbar does the same.
  - Toolbar: turn either way, copy, remove, move earlier or later or to either end, reverse the order, add a blank page, look closely, undo and redo.
  - Keyboard: arrows, Home and End move; Space selects; Shift with an arrow selects on; Alt with ← or → moves; R and Shift+R turn; Delete removes; Ctrl/Cmd+A, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z; Escape lets go of the selection. Every change is announced to screen readers.
  - Pictures are drawn only for tiles near the screen, and at most 300 are kept, so a 5,000-page list stays light.
  - **Look closely** opens one page large in a side sheet, with Previous and Next.
- **Your own page order:** the first change in the Pages view makes the arrangement the person's own. From then on the file list shows where pages come from but no longer sets the result: its move buttons, pages fields and turn buttons are off, and a note says why. Files added later join at the end; a removed file takes its pages with it. "Start again from the files" goes back, after asking.
- **Alternate pages:** with two or more files, deals their pages out in turn (first of each, second of each, and so on), with a switch for a last file that is in reverse order. It is one step in the undo history.
- **Pictures as pages:** JPG, PNG, WebP, AVIF, HEIC, GIF, TIFF, BMP and JPEG XL. SVG is refused with a reason.
  - Page size: like the page before (the default; A4 when nothing comes before), fit the picture at 150 pixels to the inch, A4 or Letter. The sheet is turned to suit the picture. Margin: none, small or normal.
  - A JPEG goes in as it is, byte for byte, and is shown upright by the turn its EXIF data asks for. A mirrored JPEG and every other format are decoded and stored without loss; see-through parts become white.
- **Merge** is an explicit button, with progress and a cancel. Any later change marks the result as out of date.
- **Result:** pages, size, how the size compares with the files together (only when every file went in whole), bookmarks, a file name field, "Download PDF" and "Open in a new tab".
- **Privacy:** everything runs in a Web Worker in the browser. Files, their contents and passwords are not uploaded or stored.

### What a merge keeps

| Part of a PDF                             | What happens                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page content, fonts, pictures, page sizes | Copied as they are. Nothing is re-compressed.                                                                                                                                                                                |
| A page's own turn                         | Kept; the turn chosen for the file is added to it.                                                                                                                                                                           |
| Links inside a file                       | Follow their page to its new place, whether written as a place, a name or an action. A link to a page that was left out is removed.                                                                                          |
| Links to addresses outside                | Unchanged.                                                                                                                                                                                                                   |
| Notes, highlights and other annotations   | Kept. A page used twice gets its own copies.                                                                                                                                                                                 |
| Bookmarks                                 | Kept and pointed at the new pages. With several files they sit under an entry named after each file. One for a page that was left out is dropped, unless something beneath it is kept.                                       |
| Blank pages                               | Take the size of the first page of the file beside them, or A4.                                                                                                                                                              |
| Fillable fields                           | Kept and still fillable. A field whose name an earlier file already uses gets the file's number added (`name_2`). Fields on pages that were left out are dropped. A page used twice keeps its fields on the first copy only. |
| Layers                                    | Kept, each shown or hidden as its own file had it. With several files, each file's layers are listed under its name.                                                                                                         |
| Digital signatures                        | Cannot stay valid. The signature's picture is kept as a stamp; the field behind it is removed, so no viewer reports a broken signature. The row says so.                                                                     |
| Accessibility tags                        | Not carried over. The row says so.                                                                                                                                                                                           |
| Title, author and other details           | Not carried over. The result is stamped with "KeepSimp" as its producer and the time of the merge.                                                                                                                           |
| Attachments, page labels                  | Not carried over yet (phase 3).                                                                                                                                                                                              |
| Passwords and restrictions                | Removed.                                                                                                                                                                                                                     |

Shared parts are stored once: identical fonts and pictures in different files, or in one file used twice, become one object. Streams that were not compressed are compressed. This is why the result is often smaller than the files together.

## Limits

Set from measurements with the real engine (Node, Apple silicon):

| Input                               | Opening | Merging | Memory used |
| ----------------------------------- | ------- | ------- | ----------- |
| 100 files of 20 text pages          | 0.05 s  | 0.6 s   | 33 MB       |
| One file of 5,000 text pages        | 0.06 s  | 3.9 s   | 16 MB       |
| 20 files, 98 MB together (pictures) | 0.07 s  | 0.14 s  | 415 MB      |
| 6 files, 293 MB together (pictures) | 0.3 s   | 0.7 s   | 525 MB      |

- The engine has 2 GB of memory at most, and a merge needs about twice the size of the files, plus the result. So: 100 files, 300 MB each, 500 MB together and 5,000 pages on a computer.
- Phones close a page that uses much less, so a device whose main pointer is a finger, or that reports under 4 GB of memory, gets 100 MB each and 200 MB together (`limitsFor` in `lib/pdf-merger/settings.ts`).
- If the engine still runs out of memory, the page says the files are more than the device can handle at once.
- A pages field takes at most 20,000 pages, repeats included.

## Engine

`mupdf` 1.28.1, MuPDF's own WebAssembly build. One engine reads, repairs, unlocks, draws and writes. Its file is 10.4 MB (3.6 MB with Brotli) and is loaded only when this tool is opened.

- **Pure logic** (`lib/pdf-merger/`, 100% covered): `ranges.ts` (the pages field), `files.ts` (the list, its order and what a merge would do), `outline.ts` (bookmarks of the result), `settings.ts` (limits, names, the PDF sniffer).
- **`mupdf-engine.ts`** is the only code that touches MuPDF. The engine module is handed in, so the same code runs in the worker and in Node, where the real-engine tests live.
- More pure logic since phase 2: `pages.ts` (the page list and everything done to it, with undo and redo) and `picture.ts` (a JPEG's orientation, and where a picture sits on its page).
- The engine merges page by page (`mergePages`): each page names its file, its page there and a turn, or is a blank page of a size. Pages of one file share one copy map wherever they end up, so a file's links find its pages even when another file's pages sit between them. `mergePdfs` remains for callers that think in whole files.
- A picture is opened as a one-page file (`openPicture`) for its thumbnail; when merging, its page is laid out afresh for the chosen page size, and the picture itself is stored once however many pages show it.
- **`pdf.worker.ts`**, `protocol.ts` and `client.ts`: one worker holds every opened file and does everything, one request at a time. The plan had a second worker for thumbnails; with one, a file is held in memory once, not twice. A merge pauses every 16 ms to let a cancel through.

### How pages are copied

MuPDF's own page copy (`graftPage`) takes a page's content and nothing else: links, notes and form fields are lost. The merger copies the whole page object instead, which brings everything on the page with it. Two things make that safe:

1. **Each page is made to stand alone when its file is opened.** Settings a page leaves to the page tree (size, turn, fonts) are written onto the page; links by name are given the place the name stands for; and the page forgets its parent, its article threads and its tag numbers. Without this, copying one page would drag the whole file along through the parent.
2. **After copying, loose ends are cut.** Links to pages that are not in the result are removed, and each file's form fields are cut back to the ones on its copied pages. What is then unreferenced is dropped when the file is written (`garbage=4`, which also merges identical streams).

A page that appears twice is not copied twice: the second is a new page that shares the first one's content.

### Things found while building

- **Reading a missing value.** Asking MuPDF's "nothing" object for a key throws, so nested values are read by path in one call (`root.get("AcroForm", "Fields")`), and `loadNameTree` is only called when the tree exists.
- **A worker that awaits its imports loses messages.** `mupdf` waits for its WebAssembly file as it is imported. With a plain import at the top of the worker, the worker has no message handler until that finishes, and what it was sent in the meantime is gone. The worker therefore sets its handler first and loads the engine with `import()`.
- **Node-only imports.** MuPDF imports `module` and `node:fs` when it finds itself in Node. `next.config.ts` points both at an empty stand-in for the browser build.
- **`garbage=deduplicate` is not enough.** It merges identical objects but not identical streams; level 4 does both, which is what stores a shared picture once.
- **`TextDecoder("latin1")` is Windows-1252.** It changes bytes 0x80 to 0x9F, so a test that edits a PDF as text must use Node's `Buffer` with `latin1`.

## Samples

`npm run samples:pdfs` writes the two files behind "Try a sample" into `public/samples/`: a three-page report and a two-page appendix, each with bookmarks and a link.

## Tests

- **Unit:** `ranges`, `files`, `outline`, `settings`, `pages` and `picture`, each with its edge cases.
- **Real engine in Node** (`pdf.node.test.ts`). Files are written by pdf-lib (`tests/pdf-fixtures.ts`) and results are read back by pdf.js, with form fields read by pdf-lib (`tests/pdf-reader.ts`), so the engine is never only checked against itself. Covers:
  - what a file is found to hold; passwords (missing, wrong, user, owner, restrictions only); damage of three kinds; files that are not PDFs
  - page order with chosen, repeated and reordered pages; sizes and turns; settings inherited from the page tree
  - links by place, name and action; links to pages left out; notes on repeated pages
  - every bookmark choice, with titles in several scripts
  - form fields kept, renamed and dropped; signatures; layers
  - shared parts stored once; the result's own details; progress, pauses and stopping
  - a hundred seeded random page plans, each checked page by page
  - every merged page drawn and compared, pixel for pixel, with the page it came from
  - single pages woven together from two files, with links and bookmarks; each page turned by itself; blank pages
  - pictures: a JPEG kept byte for byte, one stored on its side, pixels with see-through parts, every page-size choice, and a picture used twice stored once
  - files from two other producers, committed in `e2e/fixtures/pdf/` and made by `scripts/pdf-test-files.mjs`: a tagged document printed by Chromium (Skia) and a picture page written by macOS (Quartz)
- **Browser** (`e2e/pdf-merger.spec.ts`), 15 journeys on all five profiles, reading downloaded bytes with pdf.js:
  - merging in order with links, notes, bookmarks, the file name and the result line
  - reordering with buttons, dragging and sorting
  - pages fields, mistakes in them, turning and using a file twice
  - a locked file: wrong and right passwords, and a restrictions-only file
  - a damaged file, an unreadable one, and files that are not PDFs
  - form fields, layers and a signature
  - progress and cancelling a 1,500-page merge
  - dropped files and the samples
  - the Pages view: selecting, turning, moving, copying, removing, blank pages, undo and redo, then the file list beside an arrangement and going back to it
  - the Pages view from the keyboard, and dragging one page and several
  - the large preview
  - alternating two files, one in reverse
  - pictures as pages: a turned JPEG, a PNG, an HEIC and a refused SVG, with each page size
  - keyboard use, axe in both themes, 320 px and no external requests
  - the written help and structured data
- **Offline:** the merger, its samples and the engine are part of the offline journey in `e2e/offline.spec.ts`.

## Licences

- `mupdf` 1.28.1 is AGPL-3.0-or-later; KeepSimp is AGPL-3.0-only, so the licences are compatible. It is listed, with its source, in `public/licenses/pdf-engine.txt`.
- `@cantoo/pdf-lib` (MIT) is a development dependency that writes test files and the samples. `pdfjs-dist` (Apache-2.0) was already one.

## Later phases

- **Phase 3 — bookmarks, contents, forms and protection:** the four bookmark choices (`mergeBookmarks` already has them), a table of contents page, form choices (keep, join, flatten, remove), document details, page labels, attachments and a password on the result.
- **Phase 4 — print preparation and polish:** blank pages for double-sided printing, one page size, file names and page numbers in the footer, other documents as pages where the engine converts them faithfully, the tutorial video and the written guide.

Not planned: lossy recompression of pictures, OCR, text editing, signing and splitting (the PDF splitter is its own tool, still marked as coming soon).
