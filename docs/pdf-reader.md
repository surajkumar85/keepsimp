# PDF reader

A large window for reading a PDF, shared by the PDF merger and the PDF splitter. It reads files that are already open in the PDF worker, so nothing is opened twice and nothing leaves the device.

## What it does

- **Opens** from a file's picture or its "Open in the reader" button, from the Pages view (the pages in the order they will be merged), and from "Read it here" on a merged result.
- **Pages:** one continuous column. Every page has its place from the start, because page sizes are read up front, so the scroll bar is right at once. Only pages within one screen of the view exist, and each is drawn for the size it is shown at.
- **Zoom:** from 25% to 400% in fifteen stops, "fit the width" and "fit the whole page". It opens as wide as the room allows, but no larger than 125%. A zoom or a resize keeps the middle of the screen where it was. While a zoom settles, the old picture is stretched; the sharp one follows after 160 ms.
- **Turn the view:** a quarter turn for every page, for reading only. It does not change the result.
- **Go to a page:** a page field, the strip of small pages, the file's bookmarks, and links inside the file. Links to the web are not followed.
- **Search:** two letters or more. Capitals and accents make no difference. Matches are marked on the pages and counted ("3 of 17"); Enter and Shift+Enter, or the arrow buttons, step through them, going round at the ends. The search starts at the page being read. A file with no text says "No text to search". At most 2,000 matches are counted.
- **Text:** each line is laid over the picture, unseen, at the place and angle the engine reports, stretched to the width of the line on the page. It can be selected and copied, and screen readers read it. A page without text says so to screen readers.
- **Keyboard:** arrows, Page Up and Down, Home and End scroll; with nothing to scroll sideways, ← and → turn pages; `+` and `-` zoom; Ctrl/Cmd+F opens the search; Escape closes the search, then the reader. Focus stays in the window and returns to the control that opened it.

## How it is built

- **Pure logic** (`lib/pdf-reader/`, 100% covered):
  - `layout.ts`: the column of pages, which pages are near the screen, the page being read, zoom stops and fits, keeping a spot through a zoom, where a spot on a page ends up after a turn, and how many pixels to draw.
  - `text.ts`: a line's place, length and angle from the boxes of its first and last letters, and the box around a match.
  - `search.ts`: what counts as something to search for, matches kept in reading order, stepping through them, and the words beside the search field.
- **`mupdf-read.ts`** asks the engine for page sizes (from each page's boxes, without drawing), a page's lines and internal links, and where words are found. It is handed files opened by `lib/pdf-merger/mupdf-engine.ts`.
- **Worker** (`lib/pdf-merger/pdf.worker.ts`): requests `layout`, `text`, `search` and `forget` beside the merger's own. See "Engine" in `docs/pdf-merger.md` for the order work is done in.
- **Components** (`components/pdf-reader/`): `pdf-reader.tsx` (the window, toolbar, search and scrolling), `reader-page.tsx` (one page: picture, text, matches and links), `reader-sidebar.tsx` (small pages and bookmarks) and `types.ts` (`ReaderEntry`, `ReaderSource`).
- **A page on screen** is a box of the turned size holding an inner box of the page's own size, turned with CSS. Everything over the picture is placed in the page's own points and scaled with it, so nothing has to be recalculated for a zoom or a turn.

## Using it from a tool

`usePdfReader` in `components/pdf/use-pdf-reader.ts` does the work for a tool: it gives the `reading`, the `source`, the control to return to, and three ways to open the reader (`readFile` for an open file, `readPages` for pages of open files in a given order, `readResult` for a finished file that is not one of the tool's own). Hand every file event from the worker to its `claims` first, so a result opened only to be read is never taken for one of the tool's files.

Give `PdfReader` a `reading` (null while closed), a `source` and `onClose`, and pass the control that opened it as `returnTo`. An optional `action` gives one thing that can be done to the page being read, such as the splitter's cut.

A tool that does more than read hands the window `extras` (`ReaderExtras`), as the PDF editor does (`docs/pdf-editor.md`):

- `toolbar` is rows under the bar, and `actions` are buttons at the end of the bar.
- `overlay` is laid over each page, inside a box that is the page's own size in points and scaled with it. Text and links are out of reach under it.
- `onKey` is offered every key before the reader has it and says whether it used it. A key it used and called `preventDefault` on does not close the window, so Escape can put a tool down first.
- `onPage` is told which page is being read. `fixed` takes the button that turns the view away, for what is laid over the pages counts on their turn. `name` is what the close button calls the window.
- `panel` is a panel of the tool's own beside the pages, over their lower part on a small screen (the editor's list of comments). `showPage` sends the reader to a page each time its `turn` changes, as when a comment is pressed in that list.
- A page entry may carry a `version`. When it goes up, the page's picture and its small picture in the strip are drawn again at once, which is how the editor shows a change made to the file.

- `reading` is "opening", "failed" with a message, or "ready" with a title, the entries to show, the page to start at and, for one file, its bookmarks.
- An entry is a page of an open file (file id, page, an added turn, its size in points and a label) or a blank page.
- `source` wraps the tool's `PdfClient`: `draw`, `text`, `search` and `forget`.

## Limits

- A page is drawn with at most 4,096 pixels on its longer side, 2,048 on a touch screen, so the largest zooms on a very dense screen are slightly soft.
- Text is selected a line at a time in the order the engine reads it, which on pages with columns may not be the order a person reads them.
- A match is found within one line of text, or across a line break; it is not found across pages.

## Tests

- **Unit:** `layout`, `text` and `search`, with their edge cases.
- **Real engine in Node** (`read.node.test.ts`), checked against pdf.js reading the same file: page sizes for turned, mixed, cropped and inherited pages and for files from Chromium and macOS; where each line of text lies on pages turned every way; links by place, name and action; search with capitals and accents; a scan with no text.
- **Browser** (`e2e/pdf-reader.spec.ts`, five profiles): opening, the scroll bar and which pages exist, sharp pictures, focus coming back; zoom, fits, keys and turning; going to a page by number, small picture, bookmark and link; search across pages; a scan; selected text and where it lies; the arranged pages and the merged file, also when it is locked; the keyboard alone; axe in both themes, 320 px, reduced motion and no external requests.
