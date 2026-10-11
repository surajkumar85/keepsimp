# PDF splitter

Splits one PDF in the browser. Nothing is uploaded: the file is opened, drawn and written by MuPDF as WebAssembly in the same worker the PDF merger uses. Live at `/dashboard/pdf-splitter/`.

This is phase 1 of four. Splitting by bookmarks and by size and several files at once (phase 2), the ways for scans (phase 3) and a password on the parts, more choices, the tutorial video and the guide (phase 4) are not built yet, and the page does not offer them.

## What it does

- **Add** one PDF: drop, picker, paste or the sample. A second file replaces the first. A locked file asks for its password in its row; a damaged one is repaired where possible, and the row says so. What is not a PDF is refused with the reason.
- **Five ways to split,** chosen with chips:
  - **Cut into parts.** A place to cut sits between every two pages. Rules place cuts for you: after every N pages, into N equal parts (none more than a page longer than another), or every page on its own. Cuts can be changed by hand afterwards, and undone and redone.
  - **Page ranges.** One part for each range typed: `1-3, 4-10, 11-`. Ranges may overlap and repeat, `5-1` counts down, `odd` and `even` work, and a plus sign joins ranges into one part (`1-3 + 7`).
  - **Odd and even.** Two files, for the fronts and backs of a double-sided scan.
  - **Extract pages.** The selected pages as one file, in the order of the file.
  - **Remove pages.** Everything except the selected pages as one file.
- **The page board** shows every page with its number and where it goes ("Part 2", "Parts 1, 4", "Left out", "Taken out", "Removed"). Neighbouring parts take turns with a tint. In the two ways that select pages, a tile is a toggle, Shift-click selects everything between two pages, and a pages field mirrors the selection both ways.
- **Keyboard:** arrows, Home and End move between pages; S cuts after the page; Space selects; Shift+Space selects on from the last page pressed; Enter opens the reader at the page. Every cut is put into a polite live region in words.
- **The reader** (`docs/pdf-reader.md`) opens from the file's picture, its button, a double click or Enter on a page. While cutting into parts it has a button that cuts after the page being read. After splitting, each part can be read before it is downloaded.
- **Parts list:** one row a part, with its pages, a name field and a switch that leaves the part out. Parts keep their numbers when one is left out. A name typed for a part stays with it when cuts change before it. The first 100 rows are shown; the rest are named by the pattern and are all in the ZIP.
- **Names:** a pattern with `{name}`, `{part}`, `{from}`, `{to}`, `{pages}` and `{label}`. Numbers are padded with zeros to the length of the largest, so files sort in order. No two parts get the same name. The usual pattern is `{name}-{part}`; odd and even use `{name}-{label}`, extract `{name}-pages-{pages}` and remove `{name}-edited`.
- **Split** is one button, with progress by part and a cancel that keeps nothing. Any change to the plan or the names afterwards puts the button back with a sentence saying why.
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

## Limits

One file at a time, up to 5,000 pages and 5,000 parts. The file can be 300 MB on a computer and 100 MB on a phone (`limitsFor` in `lib/pdf-merger/settings.ts`).

## How it is built

- **Pure logic** (`lib/pdf-splitter/`, 100% covered):
  - `parts.ts`: cuts and the parts they make, every rule, typed ranges, odd and even, selections, which parts each page is in, and what stands in the way of a plan.
  - `naming.ts`: the pattern, padding, safe and unique names, the ZIP's name.
  - `settings.ts`: the plan a set of choices comes to, typed names and parts left out, what a result was made from, and why a file is refused.
- **`mupdf-split.ts`** writes one part by handing its pages to `mergePages`, with the file's details, its own page numbers and its bookmarks kept.
- **Worker and client** (`lib/pdf-merger/`): a `split` request writes the parts one after another and hands each over as it is done; `cancel` stops it between pages or parts.
- **Components** (`components/pdf-splitter/`): `pdf-splitter.tsx` (the file, the choices, the result), `page-board.tsx`, `parts-list.tsx` and `tutorial.tsx`.
- **Shared by the PDF tools** (`components/pdf/`): `use-pdf-reader.ts` (opening a file, a list of pages or a finished result in the reader), `use-page-pictures.ts` (small pictures, at most 300 kept), `use-device-limits.ts` and `password-row.tsx`.

## Tests

- **Unit:** `parts`, `naming` and `settings`, with their edge cases.
- **Real engine in Node** (`split.node.test.ts`), with files written by pdf-lib and parts read back by pdf.js and pdf-lib:
  - every rule, typed ranges that overlap, repeat and count down
  - sixty seeded sets of random cuts, each put back together and compared page by page
  - sizes and turns, links kept and dropped, bookmarks per part, fields, notes, page numbers, details, attachments, a locked file
  - every page of every part drawn and compared, pixel for pixel, with the page it came from
  - a shared list of pictures: each part holds only its own, and the parts add up to about the whole
  - files from Chromium and macOS split page by page without a pixel changing
- **Browser** (`e2e/pdf-splitter.spec.ts`, five profiles), with the ZIP unpacked and every part read by pdf.js:
  - cutting between pages, bookmarks and links in the parts, one part downloaded on its own
  - every rule, undo and redo, and a result going out of date
  - ranges, odd and even, extract and remove, with the pages field and mistakes in it
  - patterns, typed names, parts left out, and what cannot be written
  - the keyboard: moving, cutting, selecting and reading
  - the reader: cutting while reading, and reading a part
  - small parts from a shared list of pictures
  - locked, damaged, unreadable files and files that are not PDFs
  - 400 parts, the shortened list, and cancelling
  - the sample, a dropped file and a replacement
  - axe in both themes in every way of splitting, 320 px, control sizes and no external requests
  - the written help
- **Offline:** the splitter and its sample are part of the offline journey in `e2e/offline.spec.ts`.

## Not planned

OCR, recompressing pictures (a future PDF compressor), separator pages read from barcodes or QR codes (no decoder works in every browser), and splitting by AI.
