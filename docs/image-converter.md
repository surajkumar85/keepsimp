# Image converter

Updated 10 October 2026. Applies to `/dashboard/image-converter/`. It shares the WebAssembly engine described in `docs/image-compressor.md` and the batch code used by the resizer (`docs/image-resizer.md`). Only the landing demonstration still uses the canvas engine in `lib/image-tools.ts`.

## What it does

- **Batch:** up to 50 images, each up to 50 MB and 50 megapixels.
  - Add images by drop, picker, paste or the samples.
  - A queue shows each image's source format, status and results.
  - Downloads are per file, or everything as one ZIP.
  - A file that cannot be read shows its own error and does not block the rest.
- **Inputs:** JPEG, PNG, WebP, AVIF, HEIC/HEIF, GIF, BMP, TIFF, ICO, SVG and JPEG XL, identified by their leading bytes.
- **Outputs,** as chips:

  | Format  | Transparency | Lossless | Encoder and notes                                                    |
  | ------- | ------------ | -------- | -------------------------------------------------------------------- |
  | JPEG    | No           | No       | MozJPEG                                                              |
  | PNG     | Yes          | Yes      | libimagequant palette or lossless, then OxiPNG                       |
  | WebP    | Yes          | Yes      | libwebp                                                              |
  | AVIF    | Yes          | No       | libavif                                                              |
  | JPEG XL | Yes          | Yes      | libjxl. The page explains current browser support.                   |
  | GIF     | On or off    | Palette  | Our writer. Still image, 2–256 colours, optional dithering.          |
  | BMP     | Yes (32-bit) | Yes      | Our writer. Uncompressed.                                            |
  | TIFF    | Yes          | Yes      | Our writer. Uncompressed baseline; the page says files are large.    |
  | ICO     | Yes          | Yes      | Our writer. Several PNG icon sizes (16–256 px) in one file.          |
  | PDF     | No           | Optional | Our writer. One page per image, or every image in a single document. |

- **Several formats at once:** tick several formats to save every image in each of them. For web formats the page writes a `<picture>` snippet for the selected image, ordered AVIF, JPEG XL, WebP, then a JPEG or PNG fallback.
- **Compare formats:** on request, the selected image is encoded as JPEG, PNG, WebP, AVIF and JPEG XL with the current quality. A table lists the real size and measured detail kept for each, smallest first, with a "Use" action. Nothing is estimated.
- **Quality:** Balanced, High, Small file, Lossless and Custom.
  - JPEG, WebP, AVIF and JPEG XL use the SSIM-guided search.
  - Lossless applies to PNG, WebP, JPEG XL and PDF. Formats that cannot be lossless use High instead, and the page says so.
  - BMP, TIFF and ICO are always exact.
- **Per-format options,** shown only when that format is selected:
  - ICO: sizes 16, 24, 32, 48, 64, 128 and 256 px. Pictures that are not square are centred on a transparent square.
  - PDF: page size (Fit image, A4, US Letter), resolution (72, 96, 150 or 300 DPI), margins, and "Combine into one PDF".
  - GIF: colour count and dithering.
- **Transparency:** kept where the format supports it. JPEG and PDF take a background (white, black or a custom colour). GIF keeps it as fully on or off.
- **Light edits:**
  - Limit the longest side (Original, 4096, 2560, 1920, 1280 or custom). Smaller images are never enlarged.
  - Convert to greyscale.
  - Embed a print resolution in JPEG, PNG, BMP and TIFF.
- **File names:** patterns with `{name}`, `{format}`, `{width}`, `{height}` and `{index}`.
- **Preview:** the before/after slider when the browser can display the output. Otherwise a note says the file is ready but this browser cannot preview that format.
- **Privacy:** everything runs in Web Workers in the browser. Metadata is removed, and pixels are converted to sRGB.

### Deliberately not included

- **Animation.** Animated GIF, WebP, AVIF and PNG files convert their first frame, and the row says so. A separate "Animation converter" is on the roadmap as a coming-soon catalogue card with no route.
- **Vector output.** SVG is an input only. Tracing a raster image into paths is a different job and gives poor results for photographs.

## Choosing a format

The page gives this guidance in its help section. It is KeepSimp's own summary, not a guarantee for any single image; Compare formats measures the real result.

| Need                                 | Format                                   |
| ------------------------------------ | ---------------------------------------- |
| Photos on the web                    | AVIF or WebP, with a JPEG fallback       |
| Graphics, logos, screenshots         | PNG or lossless WebP                     |
| Opens everywhere                     | JPEG                                     |
| Print and archiving                  | TIFF or PNG                              |
| Favicons                             | ICO                                      |
| Documents                            | PDF                                      |
| Smallest file, limited support today | JPEG XL, with a fallback on the web page |

JPEG XL support was checked in October 2026: Safari displays it, Chrome has it behind a flag, and Firefox has announced plans to enable it ([Phoronix](https://www.phoronix.com/news/Firefox-JPEG-XL-2026-Plans)). The page's hint says to keep a fallback.

## Engine

- **Pure logic** lives in `lib/image-converter/` and has 100% unit coverage: `targets`, `settings`, `pipeline`, `picture`, `compare`, `greyscale`, and the writers in `encoders/` (`bmp`, `tiff`, `gif`, `ico`, `pdf`).
- **Browser-only modules:** `convert.worker.ts`, `client.ts`, `deps.ts` and `protocol.ts`.
- **Shared:**
  - Decoding, the resampler, encoders and the quality search come from `lib/image-compressor/`.
  - Sizing, file names, ZIP and print-resolution metadata come from `lib/image-resizer/`.
  - The queue reducer and worker pool live in `lib/image-batch/`. The queue list, summary bar and control rows live in `components/image-batch/`. The resizer uses the same code.

Each image is decoded once, limited in size, optionally made greyscale, and then encoded once per selected format:

| Format                | Path                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| JPEG, PNG, WebP, AVIF | The compressor's `runPipeline`, then `applyDensity` for JPEG and PNG.                                                                   |
| JPEG XL               | The quality search runs at effort 3 for speed. The final encode uses the default effort (7) at the quality found, and is re-measured.   |
| GIF                   | libimagequant builds the palette and indices; `encodeGif` writes GIF89a with LZW and one transparent index when needed.                 |
| BMP                   | 24-bit with a 40-byte header, or 32-bit with a 124-byte `BITMAPV5HEADER`, channel masks and sRGB when the image has transparency.       |
| TIFF                  | Baseline, uncompressed, one strip, RGB or RGB with unassociated alpha, with resolution tags.                                            |
| ICO                   | Each size is drawn with the WASM resampler, stored as a lossless PNG entry and listed in the directory (256 px is stored as size 0).    |
| PDF                   | PDF 1.4. Each page holds one image: the JPEG stream as is (DCT), or deflated RGB when Lossless is chosen. Transparency is filled first. |

Two implementation notes:

- The JPEG XL, AVIF and OxiPNG encoders are imported from their single-thread modules. Turbopack hangs on the packages' multithread loaders.
- The 32-bit BMP uses the V5 header because macOS and WebKit reject a V4 header that carries the sRGB colour-space flag.

### Results and re-encoding

Results are keyed by everything that changes bytes. Changing a file-name pattern never re-encodes. "Combine into one PDF" reuses the page images already made for each file, so combining does not encode again.

The page sets `data-settled` when every readable image has a result for the current settings.

## Tutorial video

`public/videos/image-converter-tutorial.mp4` (1 min 20 s, 8.4 MB, with poster and captions) is recorded from the real app by the shared recorder and `scripts/tutorial/image-converter.mjs`:

```bash
npm run build
npx serve out --listen tcp://127.0.0.1:4180
KEEPSIMP_PREVIEW_URL=http://127.0.0.1:4180 npm run tutorial:video -- image-converter
```

If the length changes, update `duration` in `components/image-converter/tutorial.tsx` and the tutorial test.

## Tests

- **Unit:** the writers (`encoders.test.ts`), settings and capability rules, the pipeline with injected codecs, `<picture>` ordering and comparison ranking. Edge cases include BMP row padding and bottom-up order, TIFF tags and strip offsets, GIF code-size growth and table resets, ICO directory offsets, and PDF cross-reference offsets and page boxes.
- **Real codecs** (`convert.node.test.ts`), checked with independent readers:
  - sharp decodes JPEG, PNG, WebP, AVIF, GIF and TIFF output (dimensions, pixels, alpha, density).
  - `pdfjs-dist` checks page count and page sizes.
  - ICO entries are extracted and decoded as PNG.
  - JPEG XL round-trips through the decoder.
- **Browser** (`e2e/image-converter.spec.ts`), 9 journeys on all five profiles, checking downloaded bytes:
  - every output format from one image, with transparency kept or filled
  - several formats at once and the `<picture>` HTML
  - the comparison table and its "Use" action
  - favicons and PDFs (single, combined, page size)
  - quality, size limit, greyscale and print resolution
  - a batch with a damaged file, file names and ZIP contents
  - many input formats and the animation notice
  - keyboard use, axe in both themes, 320 px layout and no external requests
  - the tutorial section
- **Second reader:** BMP, TIFF, ICO and PDF output was also opened with macOS `sips` during development.

## Licences

No new runtime dependencies. The JPEG XL encoder ships in `@jsquash/jxl`, which already provided the decoder, and the codecs are those listed in `public/licenses/image-codecs.txt`. The GIF, BMP, TIFF, ICO and PDF writers are our own code. `pdfjs-dist` (Apache-2.0) is a development dependency used only to verify PDF output in tests.
