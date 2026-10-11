# PDF splitter

Splits PDFs in the browser. Nothing is uploaded: files are opened, drawn and written by MuPDF as WebAssembly in the same worker the PDF merger uses. Live at `/dashboard/pdf-splitter/`.

All four planned phases are built.

## What it does

- **Add** one PDF or several: drop, picker, paste or the sample, and more at any time. A locked file asks for its password in its row; a damaged one is repaired where possible, and the row says so. What is not a PDF is refused with the reason.
- **Nine ways to split,** chosen with chips:
  - **Cut into parts.** A place to cut sits between every two pages. Rules place cuts for you: after every N pages, into N equal parts (none more than a page longer than another), or every page on its own. Cuts can be changed by hand afterwards, and undone and redone.
  - **Page ranges.** One part for each range typed: `1-3, 4-10, 11-`. Ranges may overlap and repeat, `5-1` counts down, `odd` and `even` work, and a plus sign joins ranges into one part (`1-3 + 7`).
  - **By bookmarks.** Each bookmark of a level starts a part that runs to the page before the next one, and gives the part its name (`{label}`). The level is chosen when bookmarks sit under one another; a field keeps only bookmarks whose titles hold the words typed; each can be unticked. Of several bookmarks that open one page, the first stands. Pages before the first bookmark become a part of their own ("Front") or join the first part.
  - **By size.** Parts that each stay under 5, 10, 20 or 25 MB, or a size that is typed, in MB or KB (counted in steps of 1,024, as sizes are shown everywhere on the site). See "Splitting by size" below.
  - **At blank pages.** For a stack of scans with a blank sheet between documents. See "Blank pages" below.
  - **By text.** A new part at every page that holds the words typed, or wherever the text in one marked place changes. See "Text rules" below.
  - **Odd and even.** Two files, for the fronts and backs of a double-sided scan.
  - **Extract pages.** The selected pages as one file, in the order of the file.
  - **Remove pages.** Everything except the selected pages as one file.
- **Scans of two pages** are cut in half first, by a switch above the ways to split. See "Double pages" below.
- **The page board** shows every page with its number and where it goes ("Part 2", "Parts 1, 4", "Left out", "Taken out", "Removed"). Neighbouring parts take turns with a tint. In the two ways that select pages, a tile is a toggle, Shift-click selects everything between two pages, and a pages field mirrors the selection both ways.
- **Keyboard:** arrows, Home and End move between pages; S cuts after the page; Space selects; Shift+Space selects on from the last page pressed; Enter opens the reader at the page. Every cut is put into a polite live region in words.
- **The reader** (`docs/pdf-reader.md`) opens from the file's picture, its button, a double click or Enter on a page. While cutting into parts it has a button that cuts after the page being read. After splitting, each part can be read before it is downloaded.
- **Parts list:** one row a part, with its pages, a name field and a switch that leaves the part out. Parts keep their numbers when one is left out. A name typed for a part stays with it when cuts change before it. The first 100 rows are shown; the rest are named by the pattern and are all in the ZIP.
- **Several files:** every file has a row; with more than one, pressing a file's name shows its pages on the board, and its row takes the `primary` border. What is chosen once applies to every file: the way of splitting, rules that place cuts, typed ranges, typed pages, the bookmark level and filter, and the size. What is done by hand belongs to the file shown: pressed cuts and pages, undo, ticked bookmarks, typed names and parts left out. Each row says what will be made of its file ("3 parts") or why it is left out, and the other files are still split. Only files whose plan changed are split again. In the ZIP each file's parts are in a folder named after it.
- **Names:** a pattern with `{name}`, `{part}`, `{from}`, `{to}`, `{pages}` and `{label}`. Numbers are padded with zeros to the length of the largest, so files sort in order. No two parts get the same name. The usual pattern is `{name}-{part}`; bookmarks use `{name}-{part}-{label}`, odd and even `{name}-{label}`, extract `{name}-pages-{pages}` and remove `{name}-edited`. Names are not part of what makes a result out of date: a part can be renamed after it is made, and the download and the ZIP use the name it has then.
- **Split** is one button, with progress by part (and by file, with several) and a cancel. Cancelling keeps nothing of the file being split; files already finished keep their parts. Any change to the plan afterwards puts the button back with a sentence saying why.
- **What each part keeps** is chosen in a card under the parts: bookmarks, the file's own page numbers, and the title and other details can each be left out; attached files go into the first part, every part or none. A change makes the result out of date.
- **Password:** every part can be locked with AES-256, with limits on printing, copying and changes and an optional second password that lifts them, exactly as in the merger (`components/pdf/lock-fields.tsx`). Without a second password, limits get a random one that nobody keeps. A locked part can still be read in the reader before it is downloaded, since the password is in the options.
- **Result:** each part's real size with "Read" and "Download", and "Download all (.zip)" for several parts. The ZIP is made on the device (`lib/image-resizer/zip.ts`) and stores the parts as they are.

### What a part keeps

A part is a merge of some pages of one file, so the merger's engine does the work and its table applies (`docs/pdf-merger.md`, "What a merge keeps"). In short:

| Part of a PDF                          | What happens                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Page content, sizes and turns          | Copied as they are. Nothing is re-compressed.                                                               |
| Fonts and pictures                     | Only those the part's own pages use (see below).                                                            |
| Links                                  | Those to pages in the same part keep working; those to pages that went elsewhere are removed.               |
| Bookmarks                              | Follow their pages. A heading whose own page went elsewhere stays when something beneath it is in the part. |
| Notes, fillable fields, layers         | Stay with their pages.                                                                                      |
| The file's own page numbers            | Kept when the file numbers its own pages; otherwise each part counts from 1.                                |
| Title, author, subject, keywords       | Carried into every part.                                                                                    |
| Attached files                         | In the first part only, so they are not stored many times over.                                             |
| Passwords                              | Removed. The parts have no password.                                                                        |
| Digital signatures, accessibility tags | As in the merger: the signature's picture is kept, tags are not carried over, and the file's row says so.   |

### Small parts

Many programs give every page of a file one shared list of all its fonts and pictures. A splitter that copies that list makes every part nearly as large as the whole, which is the commonest complaint about splitting ([PDFsam's explanation](https://blog.pdfsam.org/pdf-format/i-split-my-pdf-but-the-resulting-files-are-so-big/1910/)). Here each copied page's list is cut down to the names its own content uses; see "Pages taken out of a larger file" in `docs/pdf-merger.md`. A six-page test file with one shared list of six pictures gives six parts of one picture each, which together are about the size of the original.

Fonts are not cut down to the letters a part uses: a font that two parts share is carried by both, so parts of a text-heavy file together can be somewhat larger than the original.

### Blank pages

Each page is drawn 240 pixels on its longer side and the share of it that holds marks is measured (`inkShare` in `blank.ts`):

- The paper's brightness is taken to be the commonest one, counted with its near neighbours, so cream paper and the grain of a scan are not marks. A spot counts as a mark when it differs from the paper by more than 48 of 255, lighter or darker.
- The outer 4% of the page is left out, where scans have shadows and dark borders.
- Measured on A4 pages: a speck is 0.003%, a page number 0.01%, a punch hole 0.07%, "This page is intentionally left blank" 0.13%, and one full line of text 0.22%.

Three settings turn the share into a verdict: under 0.002% ("nothing at all"), under 0.03% ("specks or a page number") and under 0.18% ("holes or a short line"). No setting takes a full line of text for blank. Any page can be turned round by pressing it: a page found blank is kept, or another page is called blank.

At a blank page the file is cut and the page left out, or cut after it with the page kept at the end of its part, or the blank pages are only removed and the rest stays one file. Blank pages side by side count as one place. Pages are looked at in the worker a slice at a time, so the page stays usable, and the row says how far the looking has got.

### Text rules

- **Pages with certain words** uses the reader's search (capitals and accents make no difference) on every page; each page with a match starts a part. Pages before the first become a part of their own or join the first part.
- **Where the text in one place changes** reads the lines whose middle lies in a marked area of each page (`textInArea`), and starts a part whenever that text differs from the page before (`partsFromTexts`). A page with nothing there stays with the part before it; pages before any text take the first text found. Each part is labelled with its text, and the usual pattern becomes `{name}-{part}-{label}`.
- The area is marked by dragging over a picture of a page, by one of four usual places, or by typing its four edges in percent, which are applied together when the fields are left. The picture can show any page, and says what is read there.
- Both read the text a PDF holds. A scan holds pictures of text; the page says so and suggests blank pages or cuts. There is no OCR.

### Double pages

A book laid open on a scanner gives two pages a sheet. With the switch on, every file is replaced, in the worker, by one whose double pages are single: each sheet that is cut appears twice, shown through one half of its box (`halvePdf`).

- Nothing is drawn or compressed again. The two halves share the sheet's content; only the page's `MediaBox` and `CropBox` differ.
- The halves are worked out as a reader sees the page (`areaToBox` in `halves.ts`), so a sheet stored on its side is cut along the line on screen, not along the stored page.
- Side by side or one above the other; the left (or top) page first, or the other, for books read from right to left; every sheet, or only those the shape of a double page; a single cover kept whole; and the cut anywhere from 20% to 80% of the sheet, for folds that are not in the middle.
- Links and notes go with the half their middle lies on. A fillable field stays on the first half only. The file's own page numbers are dropped, since there are twice as many pages.
- Everything chosen for a file (cuts, selected pages, names, ticks) and everything found in it is let go when its pages change, and the file is read again. The original stays open in the worker, so turning the switch off puts it back.

### Splitting by size

What a run of pages weighs as a file of its own cannot be worked out from the original: shared fonts and pictures are counted once per part, and everything is compressed afresh. So the splitter measures by writing (`partsBySize` in `size.ts`, `splitBySize` in the engine).

- For each part it writes the first page, then as many pages as that size suggests would fit, then halves between the longest run known to fit and the shortest known not to. A 1,000-page file of even pages takes about a dozen writes a part, not a thousand.
- The writing that settles a part is the part that is handed over, so nothing is written twice at the end.
- A single page over the size becomes a part by itself, marked, and its row says pictures are not made smaller here.
- The parts are only known once the file has been split, so before that the page says "Parts of at most 10 MB" and the board shows no parts. Parts found by size cannot be left out one by one.
- A change of size makes the result out of date.

## Speed

Measured in Node on the development machine (an 8-core laptop), with the same engine the browser runs:

| File                                 | Split                      | Time   |
| ------------------------------------ | -------------------------- | ------ |
| 2,000 pages of text, 0.8 MB          | every page on its own      | 0.35 s |
| 2,000 pages of text, 0.8 MB          | every 50 pages             | 0.11 s |
| 600 pages with a picture each, 18 MB | every 20 pages             | 1.2 s  |
| 600 pages with a picture each, 18 MB | by size, 2 MB (nine parts) | 3.3 s  |
| 200 pages                            | looked at for blank pages  | 0.11 s |

A browser adds the cost of handing each part to the page. Splitting by size costs about three times a plain split, because parts are written more than once to find where they end.

## Limits

Up to 100 files, each of up to 5,000 pages and 5,000 parts. Files can be 300 MB each and 500 MB together on a computer, and 100 MB each and 200 MB together on a phone (`limitsFor` in `lib/pdf-merger/settings.ts`).

A split into thousands of parts stays quick: board tiles are drawn again only when they change, parts are gathered and shown together, download addresses are made only for the hundred parts that are listed, and the worker pauses by the clock, not after every part. Four thousand one-page parts take about a second.

## How it is built

- **Pure logic** (`lib/pdf-splitter/`, 100% covered):
  - `parts.ts`: cuts and the parts they make, every rule, typed ranges, odd and even, selections, which parts each page is in, and what stands in the way of a plan.
  - `naming.ts`: the pattern, padding, safe and unique names, the ZIP's name.
  - `settings.ts`: the plan a set of choices comes to, typed names and parts left out, what a result was made from, and why a file is refused.
  - `bookmarks.ts`: bookmarks that lead to pages with their levels, those to split at, and the parts they make.
  - `size.ts`: a typed size in bytes, and the search for the longest run of pages under a size, given a way to measure.
  - `files.ts`: the list of files and what is chosen or found for each: cuts with their history, selected pages, typed names, parts left out, unticked bookmarks, each page's share of marks, pages turned round, and what a search or an area came to.
  - `blank.ts`: how much of a picture holds marks, the three settings, and the parts a file falls into at its blank pages.
  - `text-rule.ts`: the text in an area of a page, and parts from pages that hold words or from each page's text.
  - `halves.ts`: the two halves of a page as shown, as boxes in the file's own units whatever its turn, and which pages are cut.
- **`mupdf-split.ts`** writes one part by handing its pages to `mergePages`, with the file's details, its own page numbers and its bookmarks kept, and splits by size by writing runs of pages until they fit.
- **Worker and client** (`lib/pdf-merger/`): a `split` request writes the parts one after another and hands each over as it is done; `split-size` finds the parts as it goes and says which pages each holds; `cancel` stops either between pages or parts. `ink` and `area-text` look through a file a slice at a time, as a search does, and `halve` swaps a file for its halved form or back.
- **Components** (`components/pdf-splitter/`): `pdf-splitter.tsx` (the files, the choices, the results), `file-rows.tsx`, `rules-panel.tsx`, `scan-panel.tsx` (blank pages, text rules, the area picker and double pages), `page-board.tsx`, `parts-list.tsx` and `tutorial.tsx`.
- `options.ts` (pure): what parts keep, the lock, and what makes a result out of date. `options-panel.tsx` shows them.
- **Shared by the PDF tools** (`components/pdf/`): `use-pdf-reader.ts` (opening a file, a list of pages or a finished result in the reader), `use-page-pictures.ts` (small pictures, at most 300 kept), `use-device-limits.ts`, `password-row.tsx` and `lock-fields.tsx`.

## Sample, tutorial video and guide

- `npm run samples:pdfs` also writes `public/samples/keepsimp-handbook.pdf`, the file behind "Try a sample": twelve pages in five chapters, with each section bookmarked under its chapter, so it can be cut by hand, at bookmarks of either level, or by the word "Chapter".
- `public/videos/pdf-splitter-tutorial.mp4` (1 min 14 s, 5.8 MB, with poster and captions) is recorded from the real app by the shared recorder and `scripts/tutorial/pdf-splitter.mjs`:

  ```bash
  npm run build
  npx serve out --listen tcp://127.0.0.1:4180
  KEEPSIMP_PREVIEW_URL=http://127.0.0.1:4180 npm run tutorial:video -- pdf-splitter
  ```

  The page sets `data-settled` on its root when nothing is being read, looked through or split; the recorder waits on it. If the length changes, update `video.duration` in `components/pdf-splitter/tutorial.tsx`.

- The blog article "Just the pages you need, without the upload." (`lib/blog.ts`) is the written guide the help section links to. Its artwork is `public/images/pdf-split-guide.svg` and its social image comes from `scripts/social-images.mjs`.

## Tests

- **Unit:** `parts`, `naming`, `settings`, `bookmarks`, `size`, `files`, `blank`, `text-rule`, `halves` and `options`, with their edge cases. The size search is tested with files whose pages weigh what the test says: even pages, very uneven ones, a page over the size, a file that fits whole, and a thousand pages without a thousand writes.
- **Real engine in Node** (`split.node.test.ts`), with files written by pdf-lib and parts read back by pdf.js and pdf-lib:
  - every rule, typed ranges that overlap, repeat and count down
  - sixty seeded sets of random cuts, each put back together and compared page by page
  - sizes and turns, links kept and dropped, bookmarks per part, fields, notes, page numbers, details, attachments, a locked file
  - every page of every part drawn and compared, pixel for pixel, with the page it came from
  - a shared list of pictures: each part holds only its own, and the parts add up to about the whole
  - files from Chromium and macOS split page by page without a pixel changing
  - blank pages: an empty page, cream paper, a speck, a punch hole and a line of text measured against the three settings, and a scan with writing never taken for blank
  - text in an area read from the same place on every page, and nothing found on a scan
  - double pages: the boxes of both halves read back with pdf-lib; each half drawn pixel for pixel like that half of the sheet, also for a sheet stored on its side; the right page first, a cut off the middle, one above the other; a cover and pages that are not double; a link kept with its half
  - what parts keep: bookmarks, page numbers and details left out; a password with limits and a second password; attached files in the first part, every part or none
  - by size: parts filled as far as the size allows and no further, the measured size being the size of the file handed over, a page over the size, a file that fits whole, progress, stopping, and attachments in the first part only
- **Browser** (`e2e/pdf-splitter.spec.ts`, five profiles), with the ZIP unpacked and every part read by pdf.js:
  - cutting between pages, bookmarks and links in the parts, one part downloaded on its own
  - every rule, undo and redo, and a result going out of date
  - ranges, odd and even, extract and remove, with the pages field and mistakes in it
  - patterns, typed names, parts left out, and what cannot be written
  - the keyboard: moving, cutting, selecting and reading
  - the reader: cutting while reading, and reading a part
  - small parts from a shared list of pictures
  - locked, damaged, unreadable files and files that are not PDFs
  - 400 parts, the shortened list, and cancelling 3,000 parts
  - the sample, a dropped file and files added later
  - bookmarks: levels, the filter, ticks, front pages, names from bookmarks, bookmarks kept in each part, and a file without any
  - size: a typed size, parts under it, the parts shown afterwards, a size no page fits under, and a size that is not one
  - blank pages: the three settings, the three things done at a blank page, and pages turned round by hand
  - words: pages found, the pages before the first, and words that are nowhere
  - text in an area: a usual place, typed edges, a dragged area, another page in the picture, a page with nothing there, and names from the text
  - double pages: halves on the board and in the parts, a cover, a moved cut, and whole pages again
  - several files: a rule for all, a cut for one, a file that cannot be read, folders in the ZIP, only changed files split again, ranges too long for one file, and reading a file that is not shown
  - axe in both themes in every way of splitting, 320 px, control sizes and no external requests
  - what parts keep, attached files, a password with limits, and reading a locked part
  - the tutorial video, its captions, the written steps and options, and the guide
- **Offline:** the splitter and its sample are part of the offline journey in `e2e/offline.spec.ts`.

## Not planned

Putting a scanned booklet's pages back in reading order (sheets that hold pages 8 and 1, 2 and 7, and so on), OCR, recompressing pictures (a future PDF compressor), separator pages read from barcodes or QR codes (no decoder works in every browser), and splitting by AI.
