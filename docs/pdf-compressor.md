# PDF compressor

Makes PDFs smaller in the browser. Nothing is uploaded: the file is read, changed and written by MuPDF as WebAssembly in the worker the PDF merger and splitter use, and pictures are saved again by the image tools' codecs. Live at `/dashboard/pdf-compressor/`.

Phases 1 to 3 of four are built. Full control, a benchmark and the tutorial video (phase 4) follow.

## What it does

- **Add** one PDF or several: drop, picker, paste or the sample, and more at any time. A locked file asks for its password in its row; a damaged one is repaired where possible, and the row says so. What is not a PDF is refused with the reason.
- **What makes it big.** As soon as the file is read, a card shows what its bytes are spent on: pictures, fonts, text and drawings, private data of the app that made it, attached files, page thumbnails, document details, colour profiles and the rest. One bar is cut into those parts, each is listed with its size and share, and the five heaviest pictures are listed with their page and pixel size.
- **Three levels and a size,** chosen with chips:
  - **Lossless.** Nothing visible changes.
  - **Balanced.** Pictures are brought down to 150 dpi and saved again so that they look the same.
  - **Strong.** 96 dpi and a lower quality, for screens and email.
  - **To a size.** The file comes out under 100 KB, 200 KB, 500 KB, 1, 2, 5, 10 or 25 MB, or a size that is typed. See "Reaching a size" below.
- **Scanned pages** (at every level but Lossless): as they are, text and paper, greyscale, or black and white. See "Scans" below.
- **Several files:** every file has a row that says what it came to ("493.1 KB → 59.8 KB · 88% smaller", "Already small: left as it is"). What is chosen applies to all. With more than one, pressing a file's name shows its breakdown and its pages below, and its row takes the `primary` border. One button compresses every file that has no result yet; a file that fails says why in its row and the rest go on. The results card adds the files up and offers "Download all (.zip)", made on the device (`lib/image-resizer/zip.ts`); a file that could not be made smaller is in the ZIP as it was.
- **Compress** is one button, with progress through four parts of the work (looking at pages, pictures, writing, checking) and a cancel.
- **Result:** the saving as a percentage, before and after sizes, what the check found, "Download PDF", "Read the result" in the reader (`docs/pdf-reader.md`), and a short list of what was done. A second card shows what the result's bytes are spent on.
- **Before and after:** one page under a divider that can be dragged or moved with the arrow keys, with page stepping, and 100% and 200% zoom. Pages that changed more than the level allows are offered as chips.
- **A result per setting.** Trying another level or size keeps the earlier results, so they can be compared by going back and forth. Removing a file lets its results go.
- **Already small:** when the result is not at least 1% smaller, no file is made and the page says so, with the next level to try.
- **Notes before compressing:** a repaired file, a locked file ("The result keeps its password"), a signed file (the signature stops being valid) and a PDF/A file (it may no longer pass an archive check).

### What is done at every level

The file is changed in place, in memory, and written out again, so everything that is not touched stays exactly as it was: text, links, bookmarks, form fields, notes, layers, tags, attachments and page numbers. Pages are never turned into pictures.

- Objects nothing points at are dropped, identical ones are stored once, and the rest is packed into compressed object streams (`garbage: 4`, `compress`, `objstms`). A locked file stays locked: the engine keeps its encryption and both passwords.
- **Fonts stored whole are cut down to the letters in use** (`subsetFonts`). The engine calls this experimental, so it is fenced in: only when whole fonts add up to 32 KB or more, never in a file with form fields (a field someone types into needs every letter), and only kept when up to 24 pages spread through the file still give the same text and the same picture, pixel for pixel. Otherwise the file is opened afresh and its fonts are left whole.
- **Page thumbnails and private app data are taken out** (`Thumb` and `PieceInfo`). Neither is shown by any viewer. Private data is what design apps store to reopen their own files, and can be most of a file.
- **Pictures stored without loss are packed tighter.** The pixels go through oxipng; a PDF stores lossless pictures the way a PNG does, so the PNG's data goes into the file as it is, with a palette or fewer bits where that loses nothing. Soft masks and CMYK pictures are deflated with and without the PNG "up" filter and the smaller is kept.

### Pictures at Balanced and Strong

1. **How large each picture is drawn** is found by going through every page the way a viewer would, with a device that only listens for pictures. That gives the matrix each one is drawn with, also inside forms, patterns and notes. A picture drawn in several places is sized for the largest. A soft mask counts as drawn wherever its picture is.
2. **A picture with more pixels than it needs is made smaller,** with Lanczos resampling in linear light. "More than it needs" is over 1.25 times the level's dpi: a small step down costs sharpness and saves little.
3. **Photographs become JPEG** through mozjpeg, progressive, with the standard's own quantisation tables. The quality is the lowest that still measures as looking the same (mean SSIM against the resized pixels; the image compressor's `searchQuality`), between a floor and 92. The search runs on a sample of tiles from a large picture and the whole picture is then saved once.
4. **Drawings stay lossless.** A picture that is mostly flat colour (`contentKind`) is held to the strictest similarity mark, becomes a JPEG only when that takes at most 60% of its lossless size, and is kept with every pixel when that packs tightest: fewer pixels mean soft edges, which pack worse than flat colour.
5. **A JPEG is not saved twice.** One at or below the level's quality, with no need to resize, is left alone. JPEGs the compressor writes carry a comment (`KeepSimp`), and are never saved again at the same size: the second saving would be measured against the first, not against the picture as it once was.
6. **Only a smaller picture is swapped in:** at least 3% smaller, or 15% for a JPEG saved again at its own size.
7. **Every candidate is read back out of the file** before it replaces the original. It is added as an object of its own, loaded by the engine and compared: the right size and channels, and for a lossless one the very same pixels.

| Level    | dpi | JPEG quality | Similarity mark for photographs | JPEGs left alone at or below |
| -------- | --- | ------------ | ------------------------------- | ---------------------------- |
| Lossless | –   | –            | –                               | all                          |
| Balanced | 150 | 80 to 92     | 0.96                            | 80                           |
| Strong   | 96  | 65 to 92     | 0.94                            | 65                           |

These numbers are KeepSimp's own. The floors come from looking at results: with mozjpeg's preferred table and measured similarity alone, a sky came out at quality 63 with clear bands, because mean SSIM barely notices banding in smooth areas. The standard table at quality 80 showed none (10 flat rows in 239 against 7 in the original and 78 before) at 20 KB for a picture that was 277 KB.

**Left exactly as they are:** pictures with more than 8 bits a channel, colour spaces other than grey, RGB and CMYK (Lab, spot colours), pictures whose see-through parts depend on exact colours (a colour key, or a mask blended in ahead of time), pictures under 64 by 64 pixels or 2 KB, and pictures with more pixels than the device can hold (40 million; 16 million on a phone). CMYK pictures stay CMYK and are encoded by the engine. A palette picture that is re-encoded with loss is written in the colour space its palette was in.

### Black-and-white pictures

Pictures with one bit a pixel (and stencils) are packed with JBIG2 at every level. `lib/pdf-compressor/jbig2.ts` is our own writer: a generic region with template 0 and the row check (T.88 6.2), coded with the MQ arithmetic coder, wrapped as a page segment and one region segment, as a PDF holds it.

- **Only the lossless kind is written.** Every pixel is coded as it is. The other kind of JBIG2 stores one shape for letters that look alike and has put wrong digits on real documents; it is not implemented.
- **The stored bits are coded as they are,** read from the stream after its own filters. What they stand for does not come into it, so grey, a two-colour palette, a stencil and a picture stored upside down in brightness all work the same way, and the description keeps its colour space and `Decode`.
- Pictures already in JBIG2 are left: they may share shapes between letters and be smaller than ours. Fax packing (CCITT) is replaced when JBIG2 is at least 3% smaller.
- As with every picture, the result is read back out of the file and compared pixel for pixel before it replaces the original.

A page of marks of 1,240 by 1,754 pixels is 274 KB raw and 14.8 KB as JBIG2. The engine's own decoder, pdf.js and Poppler all read it back exactly.

### Scans

A picture that covers three quarters of a page or more is a scan of that page (`SCAN_COVERS`). What is done with scans is a choice of its own, at every level but Lossless:

- **As they are:** a scan is a picture like any other.
- **Text and paper** (`lib/pdf-compressor/layers.ts`) takes the scan apart into three layers, known as mixed raster content (ITU-T T.44):
  - **A mask** of where the ink is, one bit a pixel at the scan's own resolution (up to twice the level's, at most 300 dpi), packed with JBIG2. Each neighbourhood of the page sets its own line between ink and paper from its brightness and how much it varies (Sauvola's rule), so shaded paper does not turn into ink. A neighbourhood where the rest is not even paper, or where most would be ink, is a photograph or a filled shape and is left to the paper layer whole.
  - **The paper** without its ink, at two thirds of the level's resolution, as a JPEG. The rim of each letter is kept out of it, so no ghost of the print is left behind.
  - **The ink's colour,** a third as fine again, stored without loss. A square that caught only the pale rim of a letter takes the colour of the letter's body beside it; coloured ink keeps its colour beside black print.
  - The picture's object becomes a drawing (a form) that paints the paper and then the ink through the mask. It keeps its number, so the page's own instructions are untouched and words hidden over the scan stay in place.
  - A scan with almost no ink (a photograph), or too much, or whose layers put back together are less than 0.9 like it, goes the usual way instead.
- **Greyscale:** the scan is saved as a grey JPEG.
- **Black and white:** every pixel is decided as ink or paper and the page is one JBIG2 picture.

On a simulated colour scan of 1,240 by 1,754 pixels (424 KB as a JPEG, which Balanced alone leaves as it is): text and paper 21.7 KB at Balanced and 10.7 KB at Strong, black and white 5 KB. Rebuilt pages are held to marks of their own in the check (0.85 for layers, 0.35 for black and white, which differs by design).

### Reaching a size

The only way to know what a file weighs at some setting is to write it. So the settings are laid out as steps from gentle to harsh (`lib/pdf-compressor/target.ts`): step 0 loses nothing, and each step after it has a resolution and one fixed JPEG quality, from 220 dpi at quality 88 down to 72 dpi at quality 42. Four more steps, down to 36 dpi at quality 26, are only used with "Go further if it takes it".

- The file is written at step 0 first. If that fits, nothing is lost.
- Otherwise it is written at the last step. If that does not fit either, it is handed over as the smallest that can be made, and the page says how far over it is and what would help: going further, or splitting the file. When the text, fonts and structure alone are over the size, the page says that no picture setting can reach it.
- Otherwise the steps between are halved until the gentlest one that fits is found: at most six writings for the eleven readable steps.
- At a fixed quality there is no measuring, so every writing is quick, and a JPEG the compressor wrote on an earlier run is saved again (`again`): the size decides here, not the likeness.
- Only the result that is kept is checked page by page, with a mark of 0.88.

On the sample, "100 KB" takes about 5 seconds and gives 93.7 KB.

### The check

After writing, the result is opened again and pages are drawn from the original and from the result at 900 pixels and compared (mean SSIM). Every page that shows a changed picture is compared, up to 24; beyond that a spread of them, and the page says how many. With no changed picture, three pages are spot-checked. Marks: 0.9999 for Lossless, 0.97 for Balanced, 0.93 for Strong. A lossless result with any page under its mark is not handed over.

## Speed

On an M-series laptop, the sample (three pictures, 493 KB) takes about 2 seconds at Balanced and comes out at 61 KB; at Strong, 26 KB. The 25 real-engine tests, which compress some thirty files, take 17 seconds.

## Limits

Up to 100 files, each of up to 300 MB and 500 MB together on a computer; 100 MB and 200 MB on a phone (`limitsFor`). Files are compressed one after another. A file is held three times while it is compressed: as it was, as it is being changed, and as the result.

## How it is built

- `lib/pdf-compressor/` holds the logic, pure and covered at 100%:
  - `settings.ts`: the levels, the check's marks, the result's name and what counts as smaller.
  - `plan.ts`: what to do with one picture, from facts alone.
  - `usage.ts`: the size a picture is drawn at, and the size it should be brought down to.
  - `jpeg.ts`: a JPEG's size, channels and estimated quality from its headers, and the compressor's mark.
  - `png.ts`: a PNG taken apart so its data can go into a PDF.
  - `pixels.ts`: pixels between the engine's channels and the codecs' RGBA, and the sample for the quality search.
  - `audit.ts`: a file's streams added up by kind.
  - `check.ts`: which pages to compare, and what the comparison says.
  - `report.ts`: progress and results in plain sentences.
  - `target.ts`: the steps for reaching a size, and the search for the gentlest that fits.
  - `jbig2.ts`: the lossless JBIG2 writer.
  - `layers.ts`: a scan taken apart into mask, paper and ink.
  - `files.ts`: the files being compressed, which of them is shown, and which may be added.
- `mupdf-compress.ts` and `mupdf-audit.ts` are the only files that touch the engine. They are handed the engine and the codecs (`codecs.ts`), so the same code runs in the worker and in Node.
- The worker (`lib/pdf-merger/pdf.worker.ts`) has two more requests: `audit`, and `compress`, which is sent the file once more. The copy that is open must stay untouched, because "before" is drawn from it.
- `components/pdf-compressor/`: the screen, the breakdown card, and the before and after view, which reuses the image compressor's `CompareSlider` on pages drawn by the worker.

## Sample

`public/samples/keepsimp-brochure.pdf` (493 KB, three pages) is written by `npm run samples:pdfs`: two painted photographs with far more pixels than the pages show, and a chart stored without loss.

## Tests

- **Unit** (`lib/pdf-compressor/*.test.ts`): every pure module at 100%.
- **Real engine in Node** (`compress.node.test.ts`): files are written by pdf-lib with pictures from mozjpeg and oxipng, and results are read back by pdf.js and pdf-lib. Photographs are sized for where they are drawn largest; drawings and palette pictures come back pixel for pixel; soft masks are kept exactly; inverted, 1-bit, 16-bit and colour-keyed pictures are untouched; CMYK stays CMYK with its colours in place; links, bookmarks, fields, notes, tags, page numbers and attachments survive; a locked file stays locked; thumbnails and private data go; a whole font is cut and the text still reads; a second run finds nothing more; one-bit pictures, palettes of two colours, fax-packed pictures and stencils either way up come back exactly from JBIG2; scans are rebuilt as layers, in black and white and in grey with their hidden words in place, and a scan with no print is left to the usual way; a size is met without losing more than it takes, missed honestly, and reached on the compressor's own earlier result; six seeded files of random pictures never grow, lose a page, a word or a picture.
- **Browser** (`e2e/pdf-compressor.spec.ts`, five profiles): the breakdown, each level, downloads read back with pdf.js, a size that is met with most of its room used, a size that is missed and then got closer to by going further, a scan rebuilt as text and paper and in black and white, several files with one unreadable among them and the ZIP unpacked, a locked file, an already small file, refused and damaged files, cancel, the reader, the sample, the divider on the keyboard, axe in both themes, 320 px, reduced motion and no outside requests. The compressor also runs with the network off in `e2e/offline.spec.ts`.

## Not planned

OCR, turning pages into pictures, straightening or cleaning scans, lossy JBIG2 (it can swap one character for another), JPEG 2000 (the engine build cannot write it) and taking embedded fonts out.
