# Image compressor

Updated 10 October 2026. Applies to `/dashboard/image-compressor/` only. The image resizer, image converter and landing demonstration still use the canvas engine in `lib/image-tools.ts`.

## What it does

- **Inputs:** JPEG, PNG, WebP, AVIF, HEIC/HEIF, GIF, BMP, TIFF, ICO, SVG and JPEG XL, up to 50 MB and 50 megapixels. Files are identified by their leading bytes, not their names or MIME types. Animated GIF, APNG and WebP use only their first frame, and the page says so. SVG is drawn with at least 1024 px on the long edge.
- **Outputs:** Same as original, Auto (smallest), WebP, AVIF, JPEG and PNG. Inputs that cannot be written back become JPEG, or PNG when they contain transparency.
- **Compression presets:**
  - Smart (default), Smallest and High quality search for the lowest quality that meets a measured similarity target.
  - Lossless is available for PNG and WebP.
  - Custom sets the encoder quality directly.
  - Target size finds the best quality within a byte limit. It can optionally shrink dimensions step by step (×0.85) when quality alone is not enough.
- **Size:** original, 75/50/25%, long-edge presets (3840–640 px), or custom width and height in pixels or percent. Proportions can be locked; unlocked boxes use fit inside, fill and crop, or stretch. Outputs can be 1–16,383 px per side (the WebP maximum) and at most 50 megapixels. A notice appears when enlarging.
- **Crop and rotate:** aspect presets (free, original, 1:1, 4:5, 4:3, 3:2, 16:9, 9:16), a draggable crop box with 8 handles, keyboard nudging and exact pixel fields. The image can be rotated left or right and flipped horizontally or vertically. Settings apply rotation, then flips, then crop, then resize.
- **Advanced options:**
  - encoder effort
  - resampling filter (Lanczos3, Mitchell or Catmull-Rom, in linear light with premultiplied alpha)
  - transparency background for JPEG
  - JPEG/AVIF chroma (4:2:0 or 4:4:4)
  - progressive JPEG
  - PNG palette size and dithering
- **Comparison:** the result layer is revealed to the right of a draggable divider. The divider works with pointer or touch, and with keyboard input through a native range control. Zoom offers Fit, 100% and 200% (pixelated). The "before" image is the uncompressed pixels at the output size, so both layers align exactly.
- **Privacy:** everything runs in a Web Worker in the browser. The codecs are same-origin static assets. Metadata, including location, is removed, and pixels are converted to sRGB.

## Engine

The engine is split into a few modules:

- **Pure logic** lives in `lib/image-compressor/`: `formats`, `geometry`, `pixels`, `quality`, `ssim`, `settings` and `pipeline`. It has 100% unit coverage.
- **Browser-only modules:** `codecs.ts`, `client.ts` and `compress.worker.ts`.
- **Shared pipeline:** `pipeline.ts` takes injected codecs, so the worker, the Node benchmark and the tests run the same code.

| Stage    | Implementation                                                                                                                                                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decode   | `createImageBitmap` + `OffscreenCanvas` (applies EXIF orientation and colour profiles). Fallbacks: [jSquash](https://github.com/jamsinclair/jSquash) AVIF and JPEG XL decoders, [libheif](https://github.com/strukturag/libheif) for HEIC outside Safari, and [UTIF.js](https://github.com/photopea/UTIF.js) for TIFF outside Safari. SVG is rasterised on the main thread. |
| Geometry | One pass reads the rotated, flipped and cropped region (`extractOriented`).                                                                                                                                                                                                                                                                                                 |
| Resize   | jSquash resize (Squoosh's Rust resampler), Lanczos3 by default.                                                                                                                                                                                                                                                                                                             |
| JPEG     | [MozJPEG](https://github.com/mozilla/mozjpeg): trellis quantisation, optimised Huffman tables, progressive scans.                                                                                                                                                                                                                                                           |
| WebP     | libwebp, method 4 (6 at maximum effort), sharp YUV conversion.                                                                                                                                                                                                                                                                                                              |
| AVIF     | libavif/libaom, speed 6 (4 at maximum effort, 8 while searching), SSIM tuning, sharp YUV.                                                                                                                                                                                                                                                                                   |
| PNG      | [libimagequant](https://github.com/ImageOptim/libimagequant) (pngquant's engine) palette with Floyd–Steinberg dithering, then [OxiPNG](https://github.com/shssoichiro/oxipng). It falls back to lossless when the palette cannot reach its minimum quality.                                                                                                                 |

AVIF and OxiPNG are imported from their single-thread builds (`@jsquash/avif/codec/enc/avif_enc.js` and `@jsquash/oxipng/codec/pkg/squoosh_oxipng.js`). The packages' default entry points probe for threads and pull in self-spawning workers. Those need cross-origin isolation headers that the static export does not set, and they deadlocked the Turbopack production build.

### How Smart decides

SSIM is computed on luma ([Wang et al., 2004](https://ece.uwaterloo.ca/~z70wang/publications/ssim.pdf)) over 8×8 windows with a stride of 4. Images above 2 megapixels are box-downsampled first, and transparency is composited over white.

Each image is classified by its share of practically flat windows (luma variance below 1):

- **Photos** (under 60% flat) are scored by mean SSIM. Their losses sit in texture, where they are masked.
- **Graphics** (60% flat or more: interfaces, text, logos) are scored by the mean of their worst 1% of windows, using percentile pooling ([Moorthy & Bovik, 2009](https://doi.org/10.1109/JSTSP.2009.2015374)). A mean hid clear ringing around text at JPEG quality 25 during calibration.

| Preset       | Photo (mean SSIM)        | Graphic (worst 1%) |
| ------------ | ------------------------ | ------------------ |
| Smallest     | 0.940                    | 0.75               |
| Smart        | 0.960 (WebP/AVIF: 0.965) | 0.84               |
| High quality | 0.975 (WebP/AVIF: 0.980) | 0.92               |

**These thresholds are KeepSimp decisions**, chosen from the benchmark and side-by-side 2× crops. They are not values from a standard. WebP and AVIF reach a given mean SSIM partly by smoothing, so photos are held to a slightly higher score with those codecs. The "Detail kept" figure shown to visitors is the measured mean SSIM of the delivered file.

The quality search is a bracketed interpolation:

1. Probe a typical starting quality (JPEG 75, WebP 72, AVIF 55).
2. Step 12 points towards the target.
3. Interpolate inside the bracket, halving it once it is narrow.

It stops when the passing and failing qualities are adjacent, which usually takes 4–7 encodes. Plain bisection with the same budget missed the optimum by a few quality points, about 15% in file size on the coastline photo.

## Benchmark

`npm run image:benchmark` runs the production pipeline in Node with the same WebAssembly codecs, against two references:

- **Fixed q80 export:** libjpeg-turbo/libwebp at quality 80 through sharp. This is what a typical canvas tool, including the previous KeepSimp compressor, produces.
- **Same encoder family at equal SSIM:** libjpeg-turbo or libwebp, with quality searched until it matches the SSIM that Smart reached. This isolates the encoder from the quality decision.

Results from 10 October 2026, Smart preset, balanced effort:

| Image                      | Format | KeepSimp Smart | Quality | SSIM   | Worst 1% | Fixed q80 (SSIM)  | Same family at equal SSIM |
| -------------------------- | ------ | -------------- | ------- | ------ | -------- | ----------------- | ------------------------- |
| Coastline photo 1536×1024  | JPEG   | 315.5 KB       | 79      | 0.9612 | 0.800    | 400.4 KB (0.9734) | 315.8 KB                  |
| Coastline photo            | WebP   | 272.3 KB       | 65      | 0.9667 | 0.829    | 358.5 KB (0.9820) | 272.1 KB                  |
| Coastline photo            | AVIF   | 231.2 KB       | 52      | 0.9691 | 0.818    | —                 | —                         |
| Still life photo 1400×933  | JPEG   | 39.7 KB        | 65      | 0.9603 | 0.732    | 84.7 KB (0.9794)  | 42.9 KB                   |
| Still life photo           | AVIF   | 26.3 KB        | 60      | 0.9697 | 0.825    | —                 | —                         |
| Interface graphic 1200×800 | JPEG   | 33.1 KB        | 74      | 0.9949 | 0.848    | 45.1 KB (0.9957)  | 41.0 KB                   |
| Interface graphic          | PNG    | 15.9 KB        | palette | 0.9976 | 0.955    | 38.2 KB lossless  | —                         |
| Text document 1200×800     | WebP   | 21.1 KB        | 26      | 0.9973 | 0.850    | 34.0 KB (0.9995)  | 21.8 KB                   |
| Transparent logo mark      | PNG    | 7.2 KB         | palette | 0.9997 | 0.973    | 23.4 KB lossless  | —                         |

What the measurements support:

- **Against a fixed-quality export,** Smart files were 21–53% smaller on this corpus. The gain comes from choosing quality per image, so these files score slightly lower SSIM than q80. That is deliberate: q80 is often higher than an image needs.
- **At equal SSIM,** MozJPEG and libwebp are close to their standard counterparts: −3% to +43%, mostly near parity. Claims should credit the per-image quality search, AVIF and palette PNG, not the encoders alone.
- **Palette PNG** (libimagequant + OxiPNG) was 58–78% smaller than zlib-level-9 lossless PNG.
- **AVIF** was the smallest lossy format for both photos, the interface graphic and the logo. WebP was smaller on the text document (21.1 KB against 26.3 KB). This is why Auto measures each candidate instead of assuming one format wins.
- **Speed:** Smart takes about 0.5–3 s per format at these sizes on an Apple-silicon laptop. AVIF takes 1–7 s, and Auto runs every candidate, so it takes longest. Visitors see progress and can cancel.

These are local measurements on four images, not a universal ranking. Different content, browsers and devices will vary.

## Tests

- `lib/image-compressor/*.test.ts`: unit tests for the pure modules (100% statements, branches, functions and lines).
- `lib/image-compressor/codecs.node.test.ts`: real codecs in Node, verified with sharp/libvips. It covers:
  - every output format
  - alpha retention
  - lossless round trips
  - palette fallback
  - HEIC and TIFF decoding
  - the Smart target
  - byte targets
- `e2e/image-compressor.spec.ts`: 8 journeys on all five Playwright profiles, checking downloaded bytes with sharp. They cover:
  - formats and transparency
  - exact sizes, crops and rotations
  - target size
  - AVIF/GIF/TIFF/SVG/HEIC inputs
  - errors
  - drop and cancel
  - keyboard chips and slider
  - axe in both themes
  - 320 px layout
  - no external requests
- The page sets `data-settled` when the visible result was produced from the current settings. Tests wait on it rather than on timers.

## Tutorial video

The tool page's help section embeds `public/videos/image-compressor-tutorial.mp4` with:

- a poster (`-poster.webp`)
- an English captions track (`.vtt`)
- the same six steps written out beside the video
- an "Every option explained" reference
- `VideoObject` structured data

The video loads only when played (`preload="none"`); the page fetches just the 0.1 MB poster.

The video is recorded from the real, built app by `scripts/tutorial-video.mjs`:

```bash
npm run build
npx serve out --listen tcp://127.0.0.1:4180
KEEPSIMP_PREVIEW_URL=http://127.0.0.1:4180 npm run tutorial:video
```

- **Recording:** every frame is a 1920×1080 screenshot (a 1280×720 layout at 1.5×) taken with reduced motion. The cursor, captions, highlights and title slates are an overlay animated per frame, so pacing does not depend on machine speed.
- **Sharp text:** text is only faded, never scaled. Scrolling moves in whole device pixels.
- **Encoding:** H.264 High profile at up to 12 Mbps, through WebCodecs in Playwright's Chromium, muxed by [Mediabunny](https://mediabunny.dev) (a dev dependency only). No system ffmpeg is needed.
- **Keyframes:** encoders re-render static text slightly differently on each keyframe, which looks like shimmering. Keyframes are therefore placed during scrolls and slate fades, with a 12-second cap.
- **Verification:** a frame-by-frame scan of the October 2026 render found no visible pulses in static text. The only isolated changes were cursor and hover updates.

The captions file is generated from the same script. If the recording length changes, update `DURATION` in `components/image-compressor/tutorial.tsx`. The current render is 1 min 44 s and 10.0 MB, and it plays in Chromium and WebKit.

## Licences

The codec licences and source links are in `public/licenses/image-codecs.txt`:

- jSquash and its codecs: Apache-2.0 with BSD/MIT upstreams
- libimagequant: GPL-3.0-or-later, which is compatible with this AGPL-3.0 project
- libheif: LGPL-3.0
- UTIF.js and pako: MIT
