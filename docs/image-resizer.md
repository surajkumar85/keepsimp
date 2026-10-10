# Image resizer

Updated 10 October 2026. Applies to `/dashboard/image-resizer/`. It shares the WebAssembly engine described in `docs/image-compressor.md`. The image converter (`docs/image-converter.md`) shares its batch code. Only the landing demonstration still uses the canvas engine in `lib/image-tools.ts`.

## What it does

- **Batch:** up to 50 images, each up to 50 MB and 50 megapixels.
  - Add images by drop, picker, paste or the samples.
  - A queue shows each image's status and result.
  - Downloads are per file, or everything as one ZIP.
  - A file that cannot be read shows its own error and does not block the rest.
- **Inputs:** JPEG, PNG, WebP, AVIF, HEIC/HEIF, GIF, BMP, TIFF, ICO, SVG and JPEG XL, identified by their leading bytes. Animated files use their first frame.
- **Size modes:** Dimensions, Width, Height, Longest side, Shortest side, Percent, Megapixels and Presets.
- **Units:** pixels, percent, inches, centimetres and millimetres. Physical units use a print resolution (72, 96, 150, 300 or custom DPI). 4 × 6 in at 300 DPI is 1200 × 1800 px.
- **Fit modes** when both sides are set, following [sharp's vocabulary](https://sharp.pixelplumbing.com/api-resize):

  | Chip             | sharp name | Result                                                  |
  | ---------------- | ---------- | ------------------------------------------------------- |
  | Crop to fill     | cover      | Exact frame; overflow is trimmed around the focus.      |
  | Fit with padding | contain    | Exact frame; the whole picture plus a background.       |
  | Fit inside       | inside     | As large as possible within the frame; no crop or pad.  |
  | Cover at least   | outside    | As small as possible while covering the frame; no crop. |
  | Stretch          | fill       | Exact frame; proportions may change.                    |

- **Focus:**
  - nine positions in a 3×3 grid
  - dragging the picture inside the output frame, or using arrow keys (Shift for bigger steps)
  - Smart focus

  A position applies to every image; dragging overrides only the selected image.

- **Padding:** white, black, transparent, a custom colour, or a blurred copy of the image.
- **Allow enlarging:** when off, images already smaller than the target are left at their size.
- **Presets:** Social, Web, Screens, Print (at 300 DPI) and Icons.
- **Several sizes:** one file per width (320–2560 px chips plus custom, up to 12) from every image, with ready-to-paste `<img srcset sizes>` HTML for the selected image.
- **Output:**
  - Format: Same as original, WebP, AVIF, JPEG, PNG.
  - Quality: Balanced, High, Small file, Lossless and Custom. Each maps onto the compressor's SSIM-guided presets.
  - File names: patterns with `{name}`, `{width}`, `{height}`, `{format}`, `{index}` and `{preset}`.
  - Print resolution: stored in JPEG (JFIF density) and PNG (`pHYs`). WebP and AVIF have no such field, and the page says so.
- **Advanced:**
  - Resampling: Auto, Lanczos3, Magic Kernel Sharp 2021, Mitchell, Catmull-Rom, Bilinear, or Nearest for pixel art.
  - Sharpening after shrinking: an unsharp mask.
  - Rounding sizes to even numbers or multiples of 8.
- **Rotate and flip,** applied before sizing.
- **Privacy:** everything runs in Web Workers in the browser. Metadata is removed, and pixels are converted to sRGB.

AI upscaling is deliberately not included. Enlarging uses classical resampling, which adds pixels but not detail, and the page says so whenever output exceeds the source.

## Presets and their limits

Social sizes are recommendations collected from public guides. They are not guarantees from the platforms, which change layouts without notice. Where guides disagree, the preset uses the larger commonly cited size. The tool shows the date they were checked (October 2026).

- [Buffer: social media image sizes](https://buffer.com/resources/social-media-image-sizes/)
- [Hootsuite: social media image sizes guide](https://blog.hootsuite.com/social-media-image-sizes-guide/)
- [SocialBu: guide to social media image sizes](https://socialbu.com/blog/social-media-image-sizes)

Story presets draw shaded bands over the top 14% and bottom 20% of the frame. Those are the areas apps usually cover with their own interface, as reported in the SocialBu guide. Treat them as a planning aid, not a specification.

## Engine

- **Pure logic** lives in `lib/image-resizer/` and has 100% unit coverage: `units`, `sizing`, `focus`, `smart-focus`, `canvas`, `sharpen`, `presets`, `naming`, `zip`, `metadata`, `srcset`, `settings`, `queue` and `pipeline`.
- **Browser-only modules:** `resize.worker.ts`, `client.ts` and `protocol.ts`.
- **Shared with the converter:** the queue reducer and worker pool (`lib/image-batch/`), and the queue list, summary bar and control rows (`components/image-batch/`).
- **Shared with the compressor:** decoding (`lib/image-compressor/decode.ts`), the WASM resampler and encoders (`codecs.ts`), and the SSIM-guided quality search (`pipeline.ts`).

Each output goes through these stages:

| Stage    | Implementation                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout   | `resolveLayout` turns a size target into an output canvas, a source region and a draw rectangle. Focus positions a crop or aligns a padded picture.  |
| Read     | `extractOriented` reads the rotated, flipped region in one pass.                                                                                     |
| Resample | jSquash resize in linear light with premultiplied alpha. Auto picks Lanczos3 to shrink and Mitchell to enlarge. Nearest neighbour is a pure-JS path. |
| Sharpen  | Optional unsharp mask (3×3 box blur difference), applied to reductions only.                                                                         |
| Pad      | Solid colour, transparency, or a blurred backdrop: a centre cover crop shrunk to 64 px on its long edge, box-blurred three times and enlarged again. |
| Encode   | The compressor's `runPipeline` with one format, then `applyDensity` for JPEG/PNG when a print resolution applies.                                    |

### Smart focus

`smart-focus.ts` is our own implementation of the approach behind [smartcrop.js](https://github.com/jwagner/smartcrop.js), which BIRME also uses.

1. The image is reduced to 96 px on its long edge.
2. Each pixel is scored by:
   - edge detail (Sobel magnitude)
   - colour saturation
   - closeness to a reference skin tone
3. Transparent, very dark and near-white pixels do not score for colour.
4. A summed-area table makes every candidate crop window O(1) to score.
5. The best window wins, with a small pull towards the centre that also settles flat images.

It is a heuristic. It does not detect faces or understand subjects, so it can prefer busy backgrounds. Dragging the picture overrides it for one image.

### Batch processing

The page keeps a queue (`queue.ts` reducer). A pool of 1–4 workers, based on `hardwareConcurrency`, processes it.

- **Asking for work:** whenever a worker is free, it asks for the next image. The order is the selected image first, then an image that worker already has decoded, then queue order.
- **Settings changes:** a change supersedes running work after a 350 ms debounce.
- **Result keys:** results are keyed by everything that changes pixels. Renaming files is applied afterwards and never re-encodes.
- **Cancel:** terminates the workers.

The page sets `data-settled` when every readable image has a result for the current settings.

### ZIP and print resolution

- `zip.ts` writes a stored (uncompressed) ZIP with CRC-32 and UTF-8 names. Images are already compressed, so deflating them again would cost time for no gain.
- `metadata.ts` inserts or replaces the PNG `pHYs` chunk, and patches or inserts the JPEG JFIF density.

## Tutorial video

`public/videos/image-resizer-tutorial.mp4` (1 min 30 s, 10.5 MB, with poster and captions) is recorded from the real app by the shared recorder and `scripts/tutorial/image-resizer.mjs`:

```bash
npm run build
npx serve out --listen tcp://127.0.0.1:4180
KEEPSIMP_PREVIEW_URL=http://127.0.0.1:4180 npm run tutorial:video -- image-resizer
```

If the length changes, update `duration` in `components/image-resizer/tutorial.tsx`. A frame-by-frame scan of this render found no visible pulses in static text.

## Tests

- **Unit:** one test file per pure module.
- **Real codecs** (`resize.node.test.ts`), checked with sharp and fflate:
  - every resampling kernel
  - corner and centre crops on a four-colour fixture
  - padding colours, transparency and blur
  - inside, outside, stretch, no-enlarge and nearest
  - rotation, flips and print sizes
  - embedded DPI
  - ZIP round trip
  - Smart focus on the sample photograph
- **Browser** (`e2e/image-resizer.spec.ts`), 9 journeys on all five profiles, checking downloaded bytes:
  - every size mode
  - every fit, anchor, drag and padding
  - Smart focus
  - print sizes with embedded DPI, and no-enlarge
  - a batch with a damaged file, ZIP contents and file names
  - responsive sets and the HTML snippet
  - presets, formats and rotation
  - keyboard use, axe in both themes, 320 px layout and no external requests
  - the tutorial section

## Licences

No new runtime dependencies. The codecs are those listed in `public/licenses/image-codecs.txt`. `fflate` (MIT) is a development dependency used only to verify ZIP output in tests.
