# Animation converter

Updated 10 October 2026. Applies to `/dashboard/animation-converter/`. Phases 1 to 3 of four are built; the plan for the last is at the end. It shares codecs with the image tools (`docs/image-compressor.md`) and the batch code with the resizer and converter.

## What it does

- **Batch:** up to 20 animations, each up to 100 MB.
  - Add files by drop, picker, paste or the samples.
  - A queue shows each animation's format, size, frames, length and result.
  - Downloads are per file, or everything as one ZIP.
  - A still image, a damaged file or another kind of file gets its own message and does not block the rest.
- **Inputs,** identified by their bytes:
  - animated GIF, APNG and WebP
  - video: MP4, MOV and WebM or Matroska, where the browser can decode the codec
  - still images: two or more added together become the frames of one animation
- **Outputs:**
  - GIF, animated WebP and APNG
  - MP4 (H.264) and WebM (VP9, or VP8 where VP9 is missing), offered only when the browser can write them
  - Frames: every frame as PNG, WebP or JPEG in a ZIP
  - Sprite sheet: all frames on one image, with CSS and JSON
  - one frame as a PNG, from "Save this frame" under the paused preview
- **GIF encoder:**
  - Fast (default) is our own: one palette for the whole animation, and only what changes between frames is stored.
  - Best is [gifski](https://gif.ski/): per-frame palettes and temporal dithering. It takes about 0.3 s per frame at 480 × 320 without threads, so it is opt-in.
- **Quality:** Balanced, High, Small file, Lossless (WebP and APNG) and Custom.
- **Timing:**
  - Trim with two handles over a strip of frames, or exact start and end fields. Each animation has its own trim.
  - Speed from 0.25× to 4×, or a custom value.
  - A frame rate limit, which drops frames and keeps the length. It never adds frames.
  - Reverse, and boomerang (forwards then backwards without repeating either end).
  - Loop forever, once, or a set number of plays.
- **Picture:** resize by width, height, longest side or percent (up to 1,920 px); rotate and flip; keep transparency or fill it with a colour.
- **Preview:**
  - Playing shows the file itself, as the browser plays it, with a switch between result and original.
  - Pausing draws one frame of the original and the result under the before/after slider. Step buttons and the position bar move through the result's frames.
  - With reduced motion the preview starts paused.
- **Facts line:** format, size, frames, length, frame rate, loop count and file size, before and after.
- **Animations from images:** a frame list to reorder (buttons or drag), set each frame's time, duplicate and remove. The first image sets the size; the others are fitted inside it and centred. One more image added while such an animation is selected joins it.
- **Video defaults:** a clip faster than 16 frames a second or larger than 640 px starts at 15 frames a second and 640 px on its longest side, if nothing was chosen yet. The page says so, and nothing is ever enlarged by this.
- **File size limit:** 128 KB to 10 MB chips, or a custom figure. The tool converts with the chosen settings first; if the file is too big it lowers quality, then frame rate, then size, and says what it changed.
- **Destinations:** one-tap presets that set format, size, length and file size limit (see the table below), each with its source and the date it was checked.
- **Crop:** a rectangle per animation, with shape presets, on the same overlay as the image compressor. It turns and flips with the picture.
- **Exact size:** a width and height the picture is fitted inside and centred in, and a switch for whether smaller animations are enlarged.
- **Length limit:** cuts every animation to a number of seconds, counted from the start of its trim.
- **Compare formats:** converts the selected animation to every format the browser can write, at the current settings, and lists the real sizes, smallest first, with a "Use" action.
- **Privacy:** everything runs in Web Workers in the browser. Nothing is uploaded.

## Quality settings

| Choice     | GIF (Fast)               | GIF (Best)    | WebP                               | APNG               |
| ---------- | ------------------------ | ------------- | ---------------------------------- | ------------------ |
| High       | 256 colours, dithering   | gifski 100    | quality 90, or lossless if smaller | every pixel exact  |
| Balanced   | 128 colours, dithering   | gifski 85     | quality 75, or lossless if smaller | 256-colour palette |
| Small file | 64 colours, no dithering | gifski 60     | quality 50                         | 64-colour palette  |
| Lossless   | same as High             | same as High  | lossless                           | every pixel exact  |
| Custom     | 2–256 colours            | quality 1–100 | quality 1–100                      | 2–256 colours      |

Video uses a bitrate from the picture size and frame rate: 0.05, 0.1 or 0.2 bits per pixel for Small file, Balanced and High, and 0.01 to 0.4 for Custom, with a floor of 150 kbit/s. Frames and sprite sheets are exact as PNG, exact as WebP at High or Lossless, and use quality 60, 80 or 92 otherwise.

These numbers are KeepSimp's own choices. GIF holds at most 256 colours, so it cannot be lossless, and the page says so.

For WebP at High and Balanced, the first two patches are written both lossy and lossless, and the smaller way is used for the rest. Flat artwork is usually smaller lossless; photographs are not.

## Fitting a file size

`target-size.ts` holds a ladder of twelve rungs. Each rung says how far three levers are pulled: quality (four steps), a frame rate cap (20, 15, 12, 10, 8) and a scale (down to 20%). The rungs interleave the levers, so quality is not driven to its worst before the frame rate is touched.

1. The chosen settings are tried first. If the file fits, nothing changes and nothing is said.
2. Otherwise the ladder is searched by halving, which finds the gentlest rung that fits in at most five tries. Every try is a real conversion, measured in bytes.
3. The note under the preview lists what the rung changed, for example "To fit under 128 KB: 64 colours, at most 15 frames a second, 85% of the size."
4. If even the last rung is too big, that result is returned with a note saying so.

Details:

- Quality steps per format: WebP and JPEG or WebP frames 60, 45, 30; gifski 70, 50, 30; GIF 128, 64, 32 colours; APNG 256, 128, 64 colours. Dithering stops once the palette is small.
- Video is sized by bitrate: the limit, less 10% for overhead, divided by the length. Its rungs differ only in frame rate and scale.
- An exact size is never scaled, because the canvas is the point of it.
- A lower setting already chosen by hand is never raised.

These numbers are KeepSimp's own choices.

## Destinations

Checked October 2026. Presets with "reported" figures say so in the interface, because the service does not publish them.

| Destination            | Format | Size                 | Limit               | Source                                                                                                                   |
| ---------------------- | ------ | -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Discord emoji          | GIF    | within 128 px        | 256 KB              | [Discord developer docs](https://docs.discord.com/developers/resources/emoji) (256 KiB; the preset uses 256,000 bytes)   |
| Discord sticker        | APNG   | exactly 320 × 320 px | 512 KB              | [Discord support](https://support.discord.com/hc/articles/4402687377815)                                                 |
| Slack emoji            | GIF    | within 128 px        | 128 KB              | reported: [Compresto guide](https://compresto.app/blog/compress-gif-for-slack-emoji-custom-workspace)                    |
| Telegram video sticker | WebM   | within 512 px        | 256 KB, 3 s, 30 fps | [Telegram](https://core.telegram.org/stickers/webm-vp9-encoding)                                                         |
| WhatsApp sticker       | WebP   | exactly 512 × 512 px | 500 KB              | reported: [Moda guide](https://moda.app/resources/sizes/whatsapp-sticker)                                                |
| GitHub                 | GIF    | any                  | 10 MB               | [GitHub docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files) |
| X (Twitter) GIF        | GIF    | within 1280 px       | 15 MB               | [X developer docs](https://docs.x.com/x-api/media/quickstart/best-practices)                                             |

Limits of the presets:

- "Within" never enlarges. Telegram asks for one side of exactly 512 px, so a smaller clip needs its size set by hand, and the preset's note says so.
- Telegram asks for VP9. A browser that can only write VP8 produces a WebM that Telegram may refuse.
- X also asks for at most 350 frames and 1080 px of height, which the preset does not enforce.
- Twitch is left out: its published figures disagree with each other.

A preset is shown as selected only while every setting it applies still holds. "Anywhere" lifts the limits and the size.

## Engine

- **Pure logic** lives in `lib/animation/` and has 100% unit coverage:
  - `timeline.ts`: trim, speed, frame-rate limit, reverse and boomerang as a list of "show original frame N for D ms"; rounding of durations to each format's unit with the error carried forward.
  - `compose.ts`: rebuilds whole frames from the patches a file stores, following its disposal and blend rules.
  - `delta.ts`: the changed rectangle between frames, and which pixels inside it are unchanged.
  - `decoders/`: GIF (including LZW and interlacing), APNG and WebP container readers. APNG and WebP frames come out as small still files, which the existing PNG and WebP decoders read.
  - `encoders/`: GIF, APNG (`acTL`, `fcTL`, `fdAT`, with our own row filtering) and WebP (`ANIM`, `ANMF`) writers.
  - `sprite.ts`: sheet layout, and the CSS and JSON that describe it.
  - `target-size.ts`, `presets.ts` and `compare.ts`: the ladder, the destinations and the ranking of compared sizes.
  - `build.ts`, `pipeline.ts`, `settings.ts`, `source.ts` (including stills as a source and telling dropped files apart).
- **Browser-only:** `animation.worker.ts`, `client.ts`, `protocol.ts`, `deps.ts`, `video.ts` and `capability.ts`.
- **Codecs:** libimagequant for palettes, libwebp for WebP frames, the platform's `CompressionStream` for PNG data, the WASM resampler, and gifski. gifski is used through its single-thread module.

### Video

- Reading and writing go through the browser's own decoders and encoders (WebCodecs), with [Mediabunny](https://mediabunny.dev/) handling the files. There is no ffmpeg build.
- A video's frame times come from its index, without decoding. Only the frames a result needs are decoded.
- `capability.ts` asks the browser which formats it can write, and the page disables the others with a sentence saying why.
- Every video written is opened again before it is handed back. Firefox and Safari can write WebM at thumbnail sizes (64 × 48) that they cannot then read; the page reports that instead of offering a broken file.
- An encoder may drop frames. The result's frame count is what the encoder kept, and a note says so when that is fewer than asked.
- Video output is silent, has no transparency (see-through areas are filled with white or the chosen colour) and has even sides.

### How a result is made

1. The file is opened and its frames are rebuilt in order on one canvas.
2. Only the frames the result needs are kept, each turned, filled and resized to the output size.
3. The writer for the chosen format stores the first frame whole. For each later frame it finds the rectangle that changed and stores only that. A frame identical to the one before is not stored; the earlier frame is shown for longer.
4. GIF and palette APNG mark unchanged pixels inside the rectangle as "show what is already there". A pixel is compared with what it was when last written, so slow fades cannot drift.

See-through GIFs are the exception: GIF cannot erase single pixels, so every frame is stored whole and the canvas is cleared between frames.

### Limits

- Results hold all their frames in memory at the output size, up to 96 megapixels in total (for example 300 frames at 640 × 480). Beyond that the page asks for a trim, a lower frame rate or a smaller size.
- gifski copies every frame, so it takes up to 32 megapixels. Larger results use the fast encoder and the page says so.
- Animated images can have up to 3,000 frames and 50 megapixels per frame, and files up to 100 MB. Video can be up to 500 MB and 18,000 frames (ten minutes at 30 frames a second).
- A sprite sheet can be up to 8,192 px on a side.
- The pool runs one worker, or two on devices with eight or more cores.

### Loop counts

Settings and results count plays: 0 is forever, 1 is once. WebP and APNG store that number. GIF stores the repeats after the first play, one fewer, and no loop block at all for a single play. A few GIF players read the stored number as plays, so they show one fewer; the page mentions this next to the field.

### Things found while building

- **ImageData and spread.** In a browser an `ImageData`'s `width`, `height` and `data` are getters on the prototype, so `{ ...imageData }` copies nothing. The Node test shim in `tests/node-codecs.ts` now behaves the same way, so unit tests catch code that relies on a spread.
- **Workers starting together.** When several workers start at the same moment, Safari and sometimes Firefox load some of their scripts past the service worker, which fails offline. `WorkerPool` now starts workers one after another and restarts one that fails to load. This applies to the resizer and converter too.
- **APNG downloads.** Blobs use the plain `image/png` type. With `image/apng`, Firefox renames the download to `.apng`.

## Tutorial video

`public/videos/animation-converter-tutorial.mp4` (1 min 14 s, 9.5 MB, with poster and captions) is recorded from the real app by the shared recorder and `scripts/tutorial/animation-converter.mjs`:

```bash
npm run build
npx serve out --listen tcp://127.0.0.1:4180
KEEPSIMP_PREVIEW_URL=http://127.0.0.1:4180 npm run tutorial:video -- animation-converter
```

The recorder asks for reduced motion, so the preview stays on single frames and nothing moves on its own between screenshots. If the length changes, update `video.duration` in `components/animation-converter/tutorial.tsx` and the tutorial test. A frame-by-frame scan of this render found no pulses in static text.

The journal article "GIF, WebP, APNG or video?" (`lib/blog.ts`) is the written guide the help section links to.

## Samples

`npm run samples:animations` writes the two files behind "Try a sample" into `public/images/samples/`: a pan across the coastline photograph (GIF) and the KeepSimp mark pulsing on a see-through background (WebP).

## Tests

- **Unit:** one file per area (`timeline`, `compose` with bytes and frame differences, `containers` for the three formats, `settings`, `pipeline` with stand-in codecs).
- **Real codecs** (`animation.node.test.ts`). Sources are written by other software and results are read back by it: sharp for GIF and WebP, UPNG for APNG. Covers every reader and writer, exact frames, see-through pixels, trim, speed, frame rate, reverse, boomerang, loop counts, resize, rotation, background and gifski.
- **Browser** (`e2e/animation-converter.spec.ts`), 15 journeys on all five profiles, checking downloaded bytes:
  - every format, with each frame's content compared with the original
  - trim, speed, reverse, boomerang, frame rate and loop count
  - resize, rotation and background; see-through GIF
  - quality and file size; gifski
  - a batch with a still image, a damaged file and a text file; names, ZIP and per-file trim
  - the player: playing, pausing, stepping, and the frames drawn before and after
  - keyboard use, reduced motion, axe in both themes, 320 px layout and no external requests
  - MP4 and WebM written and then played by the browser's own video element, and a clip turned back into exact frames
  - video defaults for a fast clip
  - frames as PNG and JPEG, and a sprite sheet whose CSS and JSON match its pixels
  - an animation built from stills: order, times, duplicate, remove, add, save a frame; axe and 320 px with the frame list open
  - a size limit met with real bytes, a custom limit, and no limit
  - destination presets: exact canvas, no enlarging, sources shown, leaving a preset by hand
  - length limit, crop (shape, keyboard, rotation, reset) and the comparison table
  - the tutorial section
- **Offline:** the tool, its samples and gifski are part of the offline journey in `e2e/offline.spec.ts`.

## Licences

- `gifski-wasm` 2.2.0 (AGPL-3.0-or-later) and `mediabunny` (MPL-2.0, previously used only to record the tutorials) are the runtime dependencies this tool adds. KeepSimp is AGPL-3.0-only, so the licences are compatible. It is listed in `public/licenses/image-codecs.txt`.
- `upng-js` (MIT) is a development dependency used only to check APNG output in tests.
- gifsicle is not used: it is GPL version 2 only.

## Later phases

**Phase 4 — text and effects:** captions, filters, an overlay image, and animated AVIF. Animated AVIF input was planned for phase 2 and moved here: no tool at hand writes an animated AVIF to test against, so it will be built together with AVIF output, which can then serve as the fixture.
