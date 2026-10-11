# PDF merger

Updated 11 October 2026. Applies to `/dashboard/pdf-merger/`. All four planned phases are built: merging files and chosen pages; the page organiser and pictures as pages; bookmark, contents, field, detail and password choices; and print preparation, with the tutorial video and the written guide.

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
  - **Look closely**, or a double click, opens the reader at that page, showing the pages in the order they will be merged, blank pages included.
- **The reader** (`docs/pdf-reader.md`): a large window for reading a whole PDF. It opens from a file's picture or its "Open in the reader" button, from the Pages view, and from "Read it here" on the result, which shows the merged file itself before it is downloaded.
- **Your own page order:** the first change in the Pages view makes the arrangement the person's own. From then on the file list shows where pages come from but no longer sets the result: its move buttons, pages fields and turn buttons are off, and a note says why. Files added later join at the end; a removed file takes its pages with it. "Start again from the files" goes back, after asking.
- **Alternate pages:** with two or more files, deals their pages out in turn (first of each, second of each, and so on), with a switch for a last file that is in reverse order. It is one step in the undo history.
- **Pictures as pages:** JPG, PNG, WebP, AVIF, HEIC, GIF, TIFF, BMP and JPEG XL. SVG is refused with a reason.
  - Page size: like the page before (the default; A4 when nothing comes before), fit the picture at 150 pixels to the inch, A4 or Letter. The sheet is turned to suit the picture. Margin: none, small or normal.
  - A JPEG goes in as it is, byte for byte, and is shown upright by the turn its EXIF data asks for. A mirrored JPEG and every other format are decoded and stored without loss; see-through parts become white.
- **Bookmarks:** under each file (the default), keep all, one per file, or none.
- **Contents page:** none, by file name or by document title. A first page lists every file with the page it starts on; every line is a link. With "the first file is a cover", it comes after the cover and does not list it. It takes the size of the result's first page and runs onto more pages when needed. It gets a bookmark of its own unless bookmarks are off.
  - Western names are written with the standard Helvetica that every PDF reader has, so no font travels with the file. Greek and Cyrillic names use the engine's own Helvetica, which is then carried in the file (about 30 KB). A name with other letters is drawn by the browser as a picture and placed on the line, so any script the device can show appears correctly.
- **Fillable fields** (offered when a file has any): keep, join same names, flatten or remove.
- **Page numbers shown by a viewer:** count from 1, or each file's own.
- **Attachments** (offered when a file has any): carried over unless turned off.
- **Details:** title, author, subject and keywords, empty unless filled in; one press takes them from the first file that has any.
- **Password:** AES-256, with switches for printing, copying and changes, and an optional second password that lifts those limits. Without one, limits get a random second password that is thrown away. "Clear all" also clears the password.
- **Printing:**
  - Double-sided: a blank page after every file but the last that gives an odd number of pages, and after an odd number of contents pages, so each file starts on a new sheet. In the person's own page order the switch gives way to a note: blank pages are added by hand there.
  - Page size: as they are, A4, Letter, like the first page or like the largest. Pages are scaled and centred, and a wide page gets the sheet on its side. "Enlarge smaller pages" can be turned off, which only centres them.
- **Footer:** the file name, a page number ("3" or "3 of 12"), or both, at the foot of every page. The number goes left, centre or right and starts where asked; the name takes the other side. It is written the right way up for the reader on turned pages, and over whatever is at the bottom edge.
- **Other documents:** a Word, Excel, PowerPoint, EPUB, text or HTML file is refused with the advice to save it as a PDF first.
- **Merge** is an explicit button, with progress and a cancel. Any later change marks the result as out of date.
- **Result:** pages, size, how the size compares with the files together (only when every file went in whole), bookmarks, a file name field, "Download PDF" and "Open in a new tab".
- **Privacy:** everything runs in a Web Worker in the browser. Files, their contents and passwords are not uploaded or stored.

### What a merge keeps

| Part of a PDF                             | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page content, fonts, pictures, page sizes | Copied as they are. Nothing is re-compressed. With one page size chosen, a page's content, links, notes and fields are scaled and moved together.                                                                                                                                                                                                                                                                                                   |
| A page's own turn                         | Kept; the turn chosen for the file is added to it.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Links inside a file                       | Follow their page to its new place, whether written as a place, a name or an action. A link to a page that was left out is removed.                                                                                                                                                                                                                                                                                                                 |
| Links to addresses outside                | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Notes, highlights and other annotations   | Kept. A page used twice gets its own copies.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Bookmarks                                 | By the choice made: under each file, all in a row, one per file, or none. They point at the new pages; one for a page that was left out is dropped, unless something beneath it is kept.                                                                                                                                                                                                                                                            |
| Blank pages                               | Take the size of the first page of the file beside them, or A4.                                                                                                                                                                                                                                                                                                                                                                                     |
| Fillable fields                           | By the choice made. Keep: still fillable, and a field whose name an earlier file already uses gets the file's number added (`name_2`). Join: fields of one name and kind become one field with several places; the first file's entry stands. Flatten: entries become page content and the fields go. Remove: fields and entries go. Fields on pages that were left out are dropped, and a page used twice keeps its fields on the first copy only. |
| Layers                                    | Kept, each shown or hidden as its own file had it. With several files, each file's layers are listed under its name.                                                                                                                                                                                                                                                                                                                                |
| Digital signatures                        | Cannot stay valid. The signature's picture is kept as a stamp; the field behind it is removed, so no viewer reports a broken signature. The row says so.                                                                                                                                                                                                                                                                                            |
| Accessibility tags                        | Not carried over. The row says so.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Title, author and other details           | Not carried over unless typed into Details or taken from the first file with one press. The result is stamped with "KeepSimp" as its producer and the time of the merge.                                                                                                                                                                                                                                                                            |
| Attachments, page labels                  | Attachments are carried over unless turned off; a name that is taken gets a number. Page labels are dropped by default, or kept per file when asked: a file without labels counts from 1, blank pages and pictures have none, and contents pages count in small Roman numerals.                                                                                                                                                                     |
| Passwords and restrictions                | Those of the files are removed. The result gets a password only when one is set.                                                                                                                                                                                                                                                                                                                                                                    |

Shared parts are stored once: identical fonts and pictures in different files, or in one file used twice, become one object. Streams that were not compressed are compressed. This is why the result is often smaller than the files together.

**Pages taken out of a larger file bring only what they use.** Many programs give every page of a file one shared list of all its fonts and pictures. A page copied from such a file would bring every picture of the file with it, which is why split or extracted pages are often nearly as large as the whole. When only some pages of a file are taken, each copied page's list is cut down to the names its own content uses (`resources.ts`, `trimResources` in the engine):

- Every "/" in the page's drawing commands is read as the start of a name, wherever it stands. That can find a name too many, never miss one.
- A stamp, note or field drawn without a list of its own is read as well, since it may fall back on the page's.
- A page is left exactly as it is when something it draws (a form, a tiling pattern or a Type 3 font) names no resources of its own and so leans on the page's.
- Names outside ASCII are always kept, and pages that used the same things still share one list.
- A file that goes in whole is not touched.

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

- **Pure logic** (`lib/pdf-merger/`, 100% covered): `ranges.ts` (the pages field), `files.ts` (the list, its order and what a merge would do), `outline.ts` (bookmarks of the result), `settings.ts` (limits, names, the PDF sniffer), `resources.ts` (the names a page's content uses).
- **`mupdf-engine.ts`** is the code that merges with MuPDF; `lib/pdf-reader/mupdf-read.ts` reads sizes, text and search matches for the reader. No other file touches the engine. The engine module is handed in, so the same code runs in the worker and in Node, where the real-engine tests live.
- More pure logic since phase 2: `pages.ts` (the page list and everything done to it, with undo and redo) and `picture.ts` (a JPEG's orientation, and where a picture sits on its page).
- The engine merges page by page (`mergePages`): each page names its file, its page there and a turn, or is a blank page of a size. Pages of one file share one copy map wherever they end up, so a file's links find its pages even when another file's pages sit between them. `mergePdfs` remains for callers that think in whole files.
- A picture is opened as a one-page file (`openPicture`) for its thumbnail; when merging, its page is laid out afresh for the chosen page size, and the picture itself is stored once however many pages show it.
- `contents.ts` (pure) lays out contents pages and writes their drawing commands; the engine supplies the widths of letters and turns text into glyph numbers.
- `print.ts` (pure) works out the sheet every page should become, the matrix that fits a page onto it, where a footer's texts go, and the matrix that lets a footer be drawn the way the reader sees the page, whatever its turn.
- One writer puts text on pages for both contents and footers. To fit or stamp a page, its own content is wrapped, never changed: a new first part sets the matrix and saves the state, a new last part restores it. Pages that share content are therefore not affected by each other.
- **`pdf.worker.ts`**, `protocol.ts` and `client.ts`: one worker holds every opened file and does everything, one request at a time. The plan had a second worker for thumbnails; with one, a file is held in memory once, not twice. A merge pauses every 16 ms to let a cancel through. Work waits in one list: what a reader is looking at (a page's picture and text) is done before thumbnails, a search works in slices of 24 ms and goes to the back of the list between them, and `forget` drops requests for pages that have scrolled away.

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
- **Save options as an object.** As a string, options are split at commas, so a password with a comma was rejected ("Unused pdf arguments found"). Passed as an object they are sent as JSON, and a password may hold any character.
- **Links on contents pages are made last.** `createLink` resolves "#page=N" to the page that has that number at that moment, so every contents page is inserted before any link is made.
- **pdf.js gives attachments as a Map** since version 6; the test reader accepts both shapes.
- **`TextDecoder("latin1")` is Windows-1252.** It changes bytes 0x80 to 0x9F, so a test that edits a PDF as text must use Node's `Buffer` with `latin1`.

## Samples

`npm run samples:pdfs` writes the two files behind "Try a sample" into `public/samples/`: a three-page report and a two-page appendix, each with bookmarks and a link.

## Tests

- **Unit:** `ranges`, `files`, `outline`, `settings`, `pages`, `picture`, `contents` and `print`, each with its edge cases.
- **Real engine in Node** (`pdf.node.test.ts`). Files are written by pdf-lib (`tests/pdf-fixtures.ts`) and results are read back by pdf.js, with form fields read by pdf-lib (`tests/pdf-reader.ts`), so the engine is never only checked against itself. Covers:
  - what a file is found to hold; passwords (missing, wrong, user, owner, restrictions only); damage of three kinds; files that are not PDFs
  - page order with chosen, repeated and reordered pages; sizes and turns; settings inherited from the page tree
  - links by place, name and action; links to pages left out; notes on repeated pages
  - every bookmark choice, with titles in several scripts
  - form fields kept, renamed and dropped; signatures; layers
  - shared parts stored once; the result's own details; progress, pauses and stopping
  - a hundred seeded random page plans, each checked page by page
  - pages taken out of a file with one shared list: only their own pictures and fonts come along, the parts add up to about the whole, escaped names are found, and pages that lean on the shared list are left alone
  - every merged page drawn and compared, pixel for pixel, with the page it came from
  - single pages woven together from two files, with links and bookmarks; each page turned by itself; blank pages
  - pictures: a JPEG kept byte for byte, one stored on its side, pixels with see-through parts, every page-size choice, and a picture used twice stored once
  - contents pages: lines, links and page numbers, document titles, a cover, several contents pages, and names drawn as pictures
  - form choices: joining two and three fields of a name, kinds that cannot be joined, flattening and removing
  - details read and written; each file's own page numbers; attachments with a shared name; a password with commas, quotes and accents, either password opening the file, and the permission flags
  - print preparation: every page-size choice with turned and wide pages; a fitted page drawn and compared with its source at twice the size; links, notes and fields after fitting; footers with names and numbers, drawn at the reader's bottom edge for all four turns; contents pages kept to a whole sheet
  - files from two other producers, committed in `e2e/fixtures/pdf/` and made by `scripts/pdf-test-files.mjs`: a tagged document printed by Chromium (Skia) and a picture page written by macOS (Quartz)
- **Browser** (`e2e/pdf-merger.spec.ts`), 20 journeys on all five profiles, reading downloaded bytes with pdf.js:
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
  - opening the reader from a file, from the Pages view and from the result (in `e2e/pdf-reader.spec.ts`)
  - alternating two files, one in reverse
  - pictures as pages: a turned JPEG, a PNG, an HEIC and a refused SVG, with each page size
  - every bookmark choice, and contents pages by name and by title, with a cover and a name in Chinese drawn by the browser
  - keeping, joining, flattening and removing fields
  - details, each file's own page numbers and attachments
  - a password with awkward characters, limits, the second password, and "Clear all" clearing it
  - one page size, footers with names and numbers, and blank backs for double-sided printing
  - the tutorial video, its captions, the written steps and options, the guide link and structured data
  - keyboard use, axe in both themes, 320 px and no external requests
  - the written help and structured data
- **Offline:** the merger, its samples and the engine are part of the offline journey in `e2e/offline.spec.ts`.

## Licences

- `mupdf` 1.28.1 is AGPL-3.0-or-later; KeepSimp is AGPL-3.0-only, so the licences are compatible. It is listed, with its source, in `public/licenses/pdf-engine.txt`.
- `@cantoo/pdf-lib` (MIT) is a development dependency that writes test files and the samples. `pdfjs-dist` (Apache-2.0) was already one.

## Tutorial video

`public/videos/pdf-merger-tutorial.mp4` (1 min 11 s, 5.3 MB, with poster and captions) is recorded from the real app by the shared recorder and `scripts/tutorial/pdf-merger.mjs`:

```bash
npm run build
npx serve out --listen tcp://127.0.0.1:4180
KEEPSIMP_PREVIEW_URL=http://127.0.0.1:4180 npm run tutorial:video -- pdf-merger
```

The page sets `data-settled` on its root when nothing is being read or merged; the recorder waits on it. If the length changes, update `video.duration` in `components/pdf-merger/tutorial.tsx` and the tutorial test. The journal article "One PDF from many, without the upload." (`lib/blog.ts`) is the written guide the help section links to; its artwork is `public/images/pdf-merge-guide.svg`.

## Other documents as pages

Tried in October 2026 and left out. The engine can open EPUB, FictionBook, HTML and plain text and write them as PDF pages, and it pages through comic archives (CBZ). Text came through, including Chinese. But what it writes for a book is a new layout on a small default page, not a copy of anything, and a short EPUB with Chinese text grew to 3.7 MB because a whole font was embedded. Doing that well needs its own choices (page size, type size, margins) and belongs in a converter. XPS could not be tested for want of a file made by other software. The engine has no reader for SVG. Office documents cannot be read at all.

So the merger takes PDFs and pictures, and says how to bring anything else: save it as a PDF first.

## Not planned

Lossy recompression of pictures (a future PDF compressor), OCR, text editing, signing and splitting (the PDF splitter is its own tool, still marked as coming soon).
