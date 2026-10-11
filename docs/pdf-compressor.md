# PDF compressor

Makes PDFs smaller in the browser. Nothing is uploaded: the file is read, changed and written by MuPDF as WebAssembly in the worker the PDF merger and splitter use, and pictures are saved again by the image tools' codecs. Live at `/dashboard/pdf-compressor/`.

All four planned phases are built. Several of the rules below come from running the compressor beside Ghostscript and qpdf on real files; see "Measured beside Ghostscript and qpdf".

## What it does

- **Add** one PDF or several: drop, picker, paste or the sample, and more at any time. A locked file asks for its password in its row; a damaged one is repaired where possible, and the row says so. What is not a PDF is refused with the reason.
- **What makes it big.** As soon as the file is read, a card shows what its bytes are spent on: pictures, fonts, text and drawings, private data of the app that made it, attached files, page thumbnails, document details, colour profiles and the rest. One bar is cut into those parts, each is listed with its size and share, and the five heaviest pictures are listed with their page and pixel size.
- **Three levels and a size,** chosen with chips:
  - **Lossless.** Nothing visible changes.
  - **Balanced.** Pictures are brought down to 150 dpi and saved again so that they look the same.
  - **Strong.** 96 dpi and a lower quality, for screens and email.
  - **To a size.** The file comes out under 100 KB, 200 KB, 500 KB, 1, 2, 5, 10 or 25 MB, or a size that is typed. See "Reaching a size" below.
- **Custom:** a resolution (72 to 300 dpi) and a JPEG quality (20 to 92) that is written as it is, with no measuring; every picture in greyscale; fonts left whole. The page check is lenient here (0.85), since the loss was chosen.
- **Take out** (`lib/pdf-compressor/options.ts`), each by a switch that is off until asked for: document details (the info dictionary and every XMP stream), attached files, bookmarks, notes and highlights (links and fields stay), scripts (open actions, additional actions and JavaScript actions), accessibility tags, and "Flatten form fields" (the engine's `bake`). What is asked for by name is done even when the result is no smaller.
- **Password:** AES-256 with limits on printing, copying and changes and an optional second password, through the fields the merger and splitter use. A file that came locked keeps its password unless a new one is set. The result is opened with its own password to be checked, compared and read.
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

- **Identical parts are stored once** (`shareDuplicates`; see `docs/pdf-merger.md`): pictures, font files, colour profiles and page content that are in the file several times, and the descriptions that point at them. Objects nothing points at are then dropped and the rest is packed into compressed object streams (`garbage: 2`, `compress`, `objstms`). A locked file stays locked: the engine keeps its encryption and both passwords.
- **What is not a picture is packed again** (`repackStreams`): page content, fonts and colour profiles are unpacked, packed with the browser's own deflate and kept when that is at least 2% and 64 bytes smaller; many apps pack in a hurry. Details in XML (XMP) are often not packed at all, and a design app attaches a copy to every placed graphic: in one report that was 430 KB of 5.3 MB. Those are packed too, except the document's own, which software that only looks for them must be able to find, and all of them in an archive file (PDF/A), whose rules ask for that. Every stream is read back and compared before it stays.
- **Fonts stored whole are cut down to the letters in use** (`subsetFonts`). The engine calls this experimental, so it is fenced in: only when whole fonts add up to 32 KB or more, never in a file with form fields (a field someone types into needs every letter), and only kept when up to 24 pages spread through the file still give the same text and the same picture, pixel for pixel. Otherwise the file is opened afresh and its fonts are left whole.
- **Page thumbnails and private app data are taken out** (`Thumb` and `PieceInfo`). Neither is shown by any viewer. Private data is what design apps store to reopen their own files, and can be most of a file.
- **Pictures stored without loss are packed tighter.** The pixels go through oxipng; a PDF stores lossless pictures the way a PNG does, so the PNG's data goes into the file as it is, with a palette or fewer bits where that loses nothing. Soft masks and CMYK pictures are deflated with and without the PNG "up" filter and the smaller is kept.
- **A palette only where it cannot show.** A palette picture has the same pixels, but a viewer built on MuPDF can draw it differently once it is shown at half its size or less: on a research paper, a 500 dpi figure given a palette was identical down to 53% of its size and had rough edges from 47% (differences of up to 126 in 255). At Lossless a picture that had no palette therefore only gets one when it has at most 150 pixels per inch where it is drawn (`paletteSuits`), which keeps it above half its size on any ordinary screen. The other levels take the palette: their pages are held to their own mark.
- **A second go where nothing may be lost.** When a Lossless result has a page that does not draw exactly as before, the file is written once more with the pictures of those pages left as they were (all pictures, when only a sample of the changed pages was looked at). Before, such a file was handed back untouched and the saving from everything else was lost with it.

### Pictures at Balanced and Strong

1. **How large each picture is drawn** is found by going through every page the way a viewer would, with a device that only listens for pictures. That gives the matrix each one is drawn with, also inside forms, patterns and notes. A picture drawn in several places is sized for the largest. A soft mask counts as drawn wherever its picture is.
2. **A picture with more pixels than it needs is made smaller,** with Lanczos resampling in linear light. "More than it needs" is over 1.25 times the level's dpi: a small step down costs sharpness and saves little.
3. **Photographs become JPEG** through mozjpeg, progressive, with the standard's own quantisation tables. The quality is the lowest that still measures as looking the same (mean SSIM against the resized pixels; the image compressor's `searchQuality`), between a floor and 92. The search runs on a sample of tiles from a large picture and the whole picture is then saved once.
4. **Drawings stay lossless.** A picture that is mostly flat colour (`contentKind`) is held to the strictest similarity mark, becomes a JPEG only when that takes at most 60% of its lossless size, and is kept with every pixel when that packs tightest: fewer pixels mean soft edges, which pack worse than flat colour.
5. **JPEG 2000 that is already thin is left alone.** A picture stored at under half a bit a pixel (`THIN_BITS`) has been pressed harder than a JPEG of the same look can be. Scans from the Internet Archive are stored this way, at about a tenth of a bit a pixel for the paper and less for the ink: saving them again took minutes, saved 9% and cost sharpness. A size to come under, and settings of one's own, are followed anyway.
6. **A JPEG is not saved twice.** One at or below the level's quality, with no need to resize, is left alone. JPEGs the compressor writes carry a comment (`KeepSimp`), and are never saved again at the same size: the second saving would be measured against the first, not against the picture as it once was.
7. **Only a smaller picture is swapped in:** at least 3% smaller, or 15% for a JPEG saved again at its own size.
8. **Every candidate is read back out of the file** before it replaces the original. It is added as an object of its own, loaded by the engine and compared: the right size and channels, and for a lossless one the very same pixels.

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
- Otherwise the steps between are halved until the gentlest one that fits is found.
- The steps are far apart, so that result may leave a good part of the size unused. While it fills less than 85% of it, a part of a step back towards the one before is tried: half a step, then a quarter either way (`stepPlan` takes a step with a fraction and lies between the two rungs). On a photo album asked for 1.11 MB, the whole step gave 784 KB and the part steps 1,020 KB. With the level below, a file is written nine times at most for the eleven readable steps.
- **A level is written as well** when one could fit (`levelToTry`): Balanced when the step found is one of the first five, Strong for the next four. A step writes every JPEG at one quality; a level measures each picture and keeps drawings exact, and on slides and charts it comes out both smaller and more like the original than the steps near it. Of the two that fit, the one whose pages look more like the original is kept (mean SSIM over up to four pages, drawn at 900 and at 1,800 pixels: which looks better can depend on how closely it is looked at). On a slide deck asked for 689 KB, the steps alone gave 674 KB with its worst page at 0.925; Balanced weighs 433 KB with its worst page at 0.985, and is what is now handed over.
- At a fixed quality there is no measuring, so every writing is quick, and a JPEG the compressor wrote on an earlier run is saved again (`again`): the size decides here, not the likeness.
- Only the result that is kept is checked page by page, with a mark of 0.88.

On the sample, "100 KB" takes about 5 seconds and gives 94 KB.

### The check

After writing, the result is opened again and pages are drawn from the original and from the result at 900 pixels and compared (mean SSIM). Every page that shows a changed picture is compared, up to 24; beyond that a spread of them, and the page says how many. Three pages where nothing was meant to change are compared as well, while there is room, to catch a fault in the tidying itself. Marks: 0.9999 for Lossless, 0.97 for Balanced, 0.93 for Strong. A lossless result with any page under its mark is not handed over.

## Speed

On an M-series laptop, the sample (three pictures, 589 KB) takes about 2 seconds at Balanced and comes out at 60 KB; at Strong, 26 KB.

**Pictures are encoded on several cores.** The engine lives in one worker, and decoding, measuring and writing stay there. Resizing and encoding, which is most of the time a photograph takes, are handed to helper workers that only run the codecs:

- The page starts the helpers once a file has been read: one fewer than the device's cores, four at most, and none on a device with two cores, where one helper would only move the work (`poolSize`). They start one after another, since workers started at the same moment can load their scripts past the offline copy (see `docs/pwa.md`).
- Each helper gets one end of a `MessageChannel` and the PDF worker the other, so pixels go straight from one worker to the other. `HelperCodecs` (`lib/pdf-compressor/helpers.ts`) gives each helper one task at a time and queues the rest. A helper that fails is not asked again and its task is done in the PDF worker; when the page reports the helpers gone, everything they held is done there. A picture of more than 16 million pixels is never sent, since sending means a second copy of its pixels.
- In the PDF worker, as many pictures are in work at once as there are helpers (`inLanes`, `lib/pdf-compressor/lanes.ts`), and between them they hold no more pixels than the largest picture the device allows. The engine is only ever called from the one thread, between the waits, so the file is changed by one picture at a time.
- When a job is stopped or fails, pictures still in work stop at their next step.

A 5 MB album of six photographs at Balanced takes 19 seconds with no helpers and 12 with four, in Chromium on an 8-core laptop. What stays in the one worker (decoding each picture, measuring each try, the page check) is the rest.

**Long files.** A tagged guide of 142 pages and 71,414 objects took 225 seconds, nearly all of it in the engine's own search for identical objects, and now takes 2.5 (see `shareDuplicates` in `docs/pdf-merger.md`).

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
  - `options.ts`: what is taken out on request, and the password.
  - `lanes.ts`: several pictures in work at once, within a budget of pixels.
  - `helpers.ts`: the codecs handed out to helper workers, and what a helper answers.
- `mupdf-compress.ts` and `mupdf-audit.ts` are the only files that touch the engine. They are handed the engine and the codecs (`codecs.ts`), so the same code runs in the worker and in Node.
- `codec.worker.ts` is a helper: it waits for its port and answers each task with `answer` from `helpers.ts`.
- The worker (`lib/pdf-merger/pdf.worker.ts`) has two more requests: `audit`, and `compress`, which is sent the file once more. The copy that is open must stay untouched, because "before" is drawn from it. Two messages are not requests and are never queued: `helper`, which brings a port, and `helpers-lost`.
- `components/pdf-compressor/`: the screen, the breakdown card, and the before and after view, which reuses the image compressor's `CompareSlider` on pages drawn by the worker.

## Samples, tutorial video and guide

- `public/samples/keepsimp-brochure.pdf` (589 KB, three pages) is behind "Try a sample": two painted photographs with far more pixels than the pages show, a chart stored without loss, and 96 KB of private data such as a design app leaves behind. It comes out at 60 KB at Balanced.
- `public/samples/keepsimp-scan.pdf` (375 KB, one page) is behind "Try a scanned page": a letter drawn at 150 dpi on cream paper with grain, a shadow towards one side and a red stamp, with its words laid over it unseen. Both are written by `npm run samples:pdfs`.
- The tutorial video (66 seconds) is recorded from the real app by `scripts/tutorial/pdf-compressor.mjs`: `npm run build`, serve `out` on port 4180, then `KEEPSIMP_PREVIEW_URL=http://127.0.0.1:4180 npm run tutorial:video -- pdf-compressor`. Keep the duration in `components/pdf-compressor/tutorial.tsx` in step with it.
- The guide is the blog article `compress-pdfs-without-uploading` in `lib/blog.ts`, with `public/images/pdf-compress-guide.svg`.

## Tests

- **Unit** (`lib/pdf-compressor/*.test.ts`): every pure module at 100%, among them the lanes (order, the number at once, the budget, failures) and the helpers (one task each, queueing, a helper that fails, all helpers lost, the largest pictures kept back), with ports answered by hand.
- **Real engine in Node** (`compress.node.test.ts`): files are written by pdf-lib with pictures from mozjpeg and oxipng, and results are read back by pdf.js and pdf-lib. Photographs are sized for where they are drawn largest; drawings and palette pictures come back pixel for pixel; soft masks are kept exactly; inverted, 1-bit, 16-bit and colour-keyed pictures are untouched; CMYK stays CMYK with its colours in place; links, bookmarks, fields, notes, tags, page numbers and attachments survive; a locked file stays locked; thumbnails and private data go; a whole font is cut and the text still reads; a second run finds nothing more; one-bit pictures, palettes of two colours, fax-packed pictures and stencils either way up come back exactly from JBIG2; scans are rebuilt as layers, in black and white and in grey with their hidden words in place, and a scan with no print is left to the usual way; custom settings give the resolution and greyscale that were set; each thing is taken out alone with the rest left in, forms are flattened with what was filled in still on the page, and scripts go; a password locks even a file that cannot shrink, limits a reader and replaces an old password; a size is met without losing more than it takes, missed honestly, and reached on the compressor's own earlier result; six seeded files of random pictures never grow, lose a page, a word or a picture; three pictures in work at once give the same pictures as one at a time, and stop together; a drawing gets a palette at Lossless only when it is drawn near its own size; a page that comes out different leads to a second go without its pictures; page content packed in a hurry is packed again, details of single objects are packed and the document's own are not, nor any in an archive file. `lib/pdf-merger/duplicates.node.test.ts` stores a picture that is in a file three times once, mask and all, and keeps pages and notes apart that read the same.
- **Browser** (`e2e/pdf-compressor.spec.ts`, five profiles): the breakdown, each level, downloads read back with pdf.js, a size that is met with most of its room used, a size that is missed and then got closer to by going further, a scan rebuilt as text and paper and in black and white, custom settings with things taken out and a password, several files with one unreadable among them and the ZIP unpacked, a locked file, an already small file, refused and damaged files, cancel, the reader, the sample, the divider on the keyboard, axe in both themes, 320 px, reduced motion and no outside requests; with eight cores reported, four helpers start, the PDF worker never loads the JPEG encoder and more than one helper does; with two cores there are no helpers and the result is the same. The compressor also runs with the network off in `e2e/offline.spec.ts`.

## Measured beside Ghostscript and qpdf

`npm run pdf:benchmark` (`benchmarks/pdf-compressor.benchmark.ts`) compresses every PDF in a folder with the compressor's own code in Node, with Ghostscript's `pdfwrite` at `/printer`, `/ebook` and `/screen`, and with qpdf (`--object-streams=generate --recompress-flate --compression-level=9`, with and without `--optimize-images`). For every result it gives:

- the size;
- how alike the pages look: up to eight pages spread through the file are drawn by MuPDF from the original and from the result at 900, 1,300 and 1,800 pixels, and compared (mean SSIM, averaged over the three sizes); the tables give the least alike page. One size is not enough: a renderer shrinks a picture in steps, and at the size where the original crosses a step and the result does not, a page scores well below what it does a little larger or smaller (0.925 at 1,000 pixels against 0.989 and 0.984 at 900 and 1,800, on one slide);
- whether the text Poppler reads (`pdftotext`) is still the same, runs of space aside;
- whether accessibility tags survived (`pdfinfo`).

Where Ghostscript made a file smaller, the compressor is also asked for Ghostscript's size ("To a size"), to see which of the two then looks more like the original.

**The files.** `node scripts/pdf-benchmark-files.mjs <folder>` fetches six public documents and builds three more from real material. They are not kept in Git.

| File                | What it is                                                                    | From                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Photo album         | Six photographs of 3,000 by 2,000 pixels, one a page                          | Built: photographs from [picsum.photos](https://picsum.photos) (numbers 1015, 1018, 1025, 1043, 1036, 1040) |
| Illustrated booklet | 72 pages from a design app, many small pictures, "fast web view"              | [un.org](https://www.un.org/en/udhrbook/pdf/udhr_booklet_en_web.pdf)                                        |
| Tax form            | Two pages with fields to fill in (XFA), tagged                                | [irs.gov](https://www.irs.gov/pub/irs-pdf/f1040.pdf)                                                        |
| Tax guide           | 142 pages of text, tagged, 71,414 objects                                     | [irs.gov](https://www.irs.gov/pub/irs-pdf/p17.pdf)                                                          |
| Research paper      | 15 pages from LaTeX with figures placed as PDF                                | [arxiv.org](https://arxiv.org/pdf/1706.03762)                                                               |
| Report              | 42 pages from a design app with one large photograph, tagged                  | [ipcc.ch](https://www.ipcc.ch/report/ar6/syr/downloads/report/IPCC_AR6_SYR_SPM.pdf)                         |
| Library scan        | 168 scanned pages, already stored as text and paper layers (JPEG 2000, JBIG2) | [archive.org](https://archive.org/download/aliceinwonderlan00carriala/aliceinwonderlan00carriala.pdf)       |
| Phone scan          | Four pages of the tax guide drawn at 200 dpi on tinted paper with grain       | Built                                                                                                       |
| Slides              | Four slides printed by Chromium: gradients, a photograph, a screenshot, bars  | Built                                                                                                       |

**Tools:** Ghostscript 10.08.0, qpdf 12.4.1 and Poppler 26.07.0 from Homebrew, on 12 October 2026. † marks a result whose text no longer reads word for word as the original's, ‡ one that lost its accessibility tags. The compressor has neither mark on any file at any level.

**Nothing lost.** Sizes as a share of the original.

| File                | Size    | KeepSimp Lossless |    qpdf | Ghostscript /printer |
| ------------------- | ------- | ----------------: | ------: | -------------------: |
| Photo album         | 5.01 MB |              100% |    100% |                 100% |
| Illustrated booklet | 1.41 MB |               77% |     85% |                80% † |
| Tax form            | 215 KB  |               62% |     90% |              31% † ‡ |
| Tax guide           | 2.95 MB |              100% |    100% |             106% † ‡ |
| Research paper      | 2.11 MB |               67% |     80% |                18% † |
| Report              | 5.29 MB |               87% |     87% |              86% † ‡ |
| Library scan        | 4.33 MB |               96% |     97% |             940% † ‡ |
| Phone scan          | 3.29 MB |              100% |    100% |                 100% |
| Slides              | 1011 KB |               94% |     96% |                 985% |
| **All nine**        | 25.6 MB |           **92%** | **94%** |             **266%** |

Lossless and qpdf leave every page pixel for pixel as it was. Ghostscript's `/printer` is not a lossless setting and is here as its gentlest: it writes every page anew.

**With loss.** Sizes as a share of the original.

| File                | KeepSimp Balanced | Ghostscript /ebook | KeepSimp Strong | Ghostscript /screen | Balanced with scans as text and paper |
| ------------------- | ----------------: | -----------------: | --------------: | ------------------: | ------------------------------------: |
| Photo album         |               37% |                22% |             11% |                  6% |                                   37% |
| Illustrated booklet |               71% |              72% † |             71% |               72% † |                                   64% |
| Tax form            |               62% |            29% † ‡ |             62% |             29% † ‡ |                                   62% |
| Tax guide           |              100% |            99% † ‡ |            100% |             99% † ‡ |                                  100% |
| Research paper      |               62% |              10% † |             60% |                8% † |                                   62% |
| Report              |               39% |            41% † ‡ |             37% |             40% † ‡ |                                   39% |
| Library scan        |               96% |           206% † ‡ |             96% |            183% † ‡ |                                   96% |
| Phone scan          |               49% |               100% |             16% |                 13% |                                   21% |
| Slides              |               43% |                68% |             16% |                 11% |                                   21% |
| **All nine**        |           **61%** |            **80%** |         **50%** |             **59%** |                               **56%** |

**How the least alike page looks** (1 is identical).

| File                | Lossless | Balanced | Strong | Ghostscript /printer | /ebook | /screen |
| ------------------- | -------: | -------: | -----: | -------------------: | -----: | ------: |
| Photo album         |    1.000 |    0.992 |  0.965 |                1.000 |  0.983 |   0.910 |
| Illustrated booklet |    1.000 |    0.993 |  0.993 |                0.990 |  0.965 |   0.965 |
| Tax form            |    1.000 |    1.000 |  1.000 |                1.000 |  1.000 |   1.000 |
| Tax guide           |    1.000 |    1.000 |  1.000 |                0.994 |  0.994 |   0.994 |
| Research paper      |    1.000 |    0.997 |  0.991 |                0.861 |  0.861 |   0.861 |
| Report              |    1.000 |    0.993 |  0.986 |                0.999 |  0.990 |   0.956 |
| Library scan        |    1.000 |    1.000 |  1.000 |                1.000 |  0.588 |   0.000 |
| Phone scan          |    1.000 |    0.987 |  0.950 |                1.000 |  1.000 |   0.813 |
| Slides              |    1.000 |    0.973 |  0.944 |                0.850 |  0.958 |   0.768 |

**At the same size.** Where Ghostscript made a file smaller, "To a size" was asked for Ghostscript's size, with "Go further" on.

| File                | Ghostscript | Its size | Its pages (mean / least alike) | KeepSimp at that size | Its pages     |
| ------------------- | ----------- | -------: | -----------------------------: | --------------------: | ------------- |
| Photo album         | /ebook      |  1.11 MB |                  0.986 / 0.983 |              1,020 KB | 0.986 / 0.983 |
| Photo album         | /screen     |   312 KB |                  0.941 / 0.910 |                284 KB | 0.944 / 0.919 |
| Illustrated booklet | /ebook      |  1.01 MB |                  0.990 / 0.965 |               1.00 MB | 0.999 / 0.993 |
| Report              | /ebook      |  2.20 MB |                  0.999 / 0.990 |               2.06 MB | 0.999 / 0.993 |
| Report              | /screen     |  2.10 MB |                  0.993 / 0.956 |               2.06 MB | 0.999 / 0.993 |
| Phone scan          | /screen     |   443 KB |                  0.816 / 0.813 |                442 KB | 0.941 / 0.940 |
| Slides              | /ebook      |   689 KB |                  0.988 / 0.958 |                674 KB | 0.996 / 0.987 |
| Slides              | /screen     |   113 KB |                  0.934 / 0.768 |                107 KB | 0.977 / 0.921 |
| Tax form            | either      |    62 KB |                  1.000 / 1.000 |       133 KB (missed) | 1.000 / 1.000 |
| Research paper      | /ebook      |   210 KB |                  0.974 / 0.861 |      1.25 MB (missed) | 0.994 / 0.948 |

**What the numbers say, and what they do not.**

- **Where Ghostscript is far smaller, it has left something out.** It turns the tax form into two flat pages: the fields and the tags are gone (`pdfinfo` reports "Form: none"). In the research paper it drops the figures of three pages altogether: pages 13 to 15 come out with their captions and nothing above them, in Poppler as in MuPDF, after warnings about blending colour spaces. Those are the sizes the compressor does not reach, and should not.
- **On an already compressed scan Ghostscript does harm.** The library scan is stored as text and paper layers. Ghostscript writes it at twice to nine times the size. At `/ebook` the cover loses much of its look (0.588), and at `/screen` the front and back covers come out turned on their side, which the measure counts as nothing alike. The compressor sees that the pictures are already thin and leaves them (96%, from tidying alone).
- **On plain photographs the two are level, byte for byte.** At Ghostscript's `/ebook` size the album looks the same from both (0.986), and a little better from the compressor at `/screen`'s. Balanced is larger than `/ebook` there because it keeps more: its least alike page is 0.992 against 0.983. mozjpeg does not show an advantage at the scale of a page.
- **On mixed pages the compressor is ahead at the same size**: the booklet, the report, the slides and above all the phone scan (0.940 against 0.813), because drawings stay exact, small JPEGs are not saved a second time and a scan can be rebuilt as text over paper.
- **Without loss it is ahead of qpdf on five files and level on the rest.** The gain comes from fonts cut to the letters in use, private data and thumbnails taken out, identical parts stored once, details in XML packed and lossless pictures packed through oxipng.
- **The tax guide cannot be made smaller by any of the three** without loss: it is text, already packed well.
- **Likeness is one measure.** Mean SSIM of a drawn page does not see what a magnifying glass sees, and three files of the nine were built for the purpose. The level numbers were set by looking at results as well (see the table of levels above).

**Time,** in seconds, in Node on one core of an M-series laptop while other work ran; a guide to proportions, not a measurement to quote.

| File                | Lossless | Balanced | Strong | Ghostscript /ebook | qpdf |
| ------------------- | -------: | -------: | -----: | -----------------: | ---: |
| Photo album         |      0.1 |     15.6 |    8.6 |                1.5 |  0.0 |
| Illustrated booklet |      1.2 |      2.5 |    2.7 |                2.3 |  0.3 |
| Tax form            |      0.8 |      0.6 |    0.5 |                0.7 |  0.1 |
| Tax guide           |      5.4 |      5.8 |    5.7 |               68.8 |  2.1 |
| Research paper      |      3.7 |      2.0 |    1.5 |                0.6 |  1.2 |
| Report              |      2.1 |      4.0 |    3.6 |                2.8 |  1.4 |
| Library scan        |      3.6 |      3.6 |    3.1 |               51.5 |  0.1 |
| Phone scan          |      0.0 |     15.2 |    5.5 |                0.4 |  0.0 |
| Slides              |      2.9 |      3.5 |    2.3 |                2.8 |  0.4 |

Photographs are where the compressor is slow: each is resized with Lanczos in linear light and saved several times to find its quality, by codecs compiled to WebAssembly. In a browser the helpers share that work between cores.

### What the files found

Each of these was a fault or a gap that the tests on made-up files had not shown:

1. The engine's search for identical objects took three minutes on the tax guide. It was replaced (`shareDuplicates`).
2. Asking the engine for a whole object made it write some streams without their data. Nothing does that now (see `docs/pdf-merger.md`).
3. Lossless handed the research paper back untouched: two figures given a palette drew slightly differently, and one page under the mark withheld the whole result. A palette is now only given where it cannot show, and a page that differs leads to a second go without its pictures. The paper comes out at 67%.
4. Details in XML were 8% of the report and were not packed.
5. Much page content and many fonts pack tighter than the app that made the file packed them.
6. The library scan took minutes, lost sharpness and saved 9%. Thin JPEG 2000 is now left alone.
7. "To a size" left 30% of the size unused on the album, and gave the slides a worse and larger file than Balanced. It now tries parts of a step, and a level beside the steps.
8. One size is not enough to judge how alike two pages look (see the measure above).

## Still to do

- **Figures made of thousands of small parts.** The research paper is 62% at Balanced because each of 2,555 small drawings in its figures is an object of its own with a description of about 170 bytes, which cannot be packed. Merging them into the page would need the page's drawing instructions rewritten.
- **Fonts that are the same but for their name.** The same paper carries five copies of two fonts, one for each figure, that differ only in the name the subset was given. They are not byte for byte the same, so they are not shared.
- **One resolution for all pictures in Custom.** The plan had separate ones for colour, grey and black-and-white pictures; black-and-white pictures are never resized.
- **Measuring on helpers.** Each try of a photograph's quality is measured in the worker that has the engine. With that on the helpers too, an album would gain more from several cores than the 1.6 times it does.

## Not planned

OCR, turning pages into pictures, straightening or cleaning scans, lossy JBIG2 (it can swap one character for another), JPEG 2000 (the engine build cannot write it) and taking embedded fonts out.
