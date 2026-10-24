# Installing KeepSimp and using it offline

Updated 10 October 2026. KeepSimp can be added to a phone's home screen and opened in its own window, without browser controls. After one visit to the tools it also works offline.

## What is configured

- **Manifest:** `app/manifest.ts` exports `/manifest.webmanifest`, built by `webManifest()` in `lib/pwa.ts`. Next.js links it from every page.
  - The installed app opens on `/dashboard/`, with the whole site in scope so blog and privacy links stay inside the window.
  - `display` is `standalone`.
  - `file_handlers` lets the installed app open Markdown files (`.md`, `.markdown`) from the computer's "Open with" (Chromium on a computer); the Markdown editor takes them from `launchQueue`.
  - Shortcuts (long-press the icon on Android) are the tools marked available in `lib/catalogue.ts`. Planned tools never appear.
- **Icons,** in `public/icons/`:

  | File                               | Use                                                        |
  | ---------------------------------- | ---------------------------------------------------------- |
  | `icon-192.png`, `icon-512.png`     | The mark as drawn, with transparent corners.               |
  | `icon-maskable-192.png`, `-512`    | The mark on a full square, for launchers that cut a shape. |
  | `apple-touch-icon.png` (180 × 180) | The full-square version for iOS, which rounds it itself.   |

  They are exported from `public/brand/keepsimp-mark.svg` by `npm run pwa:icons`. Rerun it if the mark changes; do not edit the PNG files by hand.

- **Colours:** `themeColors` in `lib/pwa.ts` holds the sRGB values of the light and dark `background` tokens. They colour the phone's status bar and the Android launch screen.
  - Two `theme-color` tags follow the system setting.
  - `components/theme-color.tsx` points both at the chosen theme when someone switches by hand.
- **iOS:** `appleWebApp` in `app/layout.tsx` sets the home-screen title and a standard status bar.

## Offline use

After one visit to the tools, the whole site works without a connection: every tool, the blog and the privacy page.

### What is saved

`next build` writes the worker itself. `app/sw.js/route.ts` is a static route that produces `/sw.js` from three parts:

1. the list of files to save, from `offlineFiles()` in `lib/offline.ts`
2. the routing rules in `service-worker/rules.js`
3. the worker body in `service-worker/sw.js`

Both files in `service-worker/` are plain JavaScript with JSDoc types, because their text is copied into the worker as it is. There is no bundler and no step after the build, so any host that serves the export serves the worker. An earlier version wrote `out/sw.js` after `next build`; Vercel did not publish that file.

- **Saved:** every page, the build files in `.next/static` (scripts, styles, fonts, WebAssembly codecs), and the files in `public/` (images, icons, tutorial posters and captions). This is about 37 MB in 213 files on disk and about 13 MB to download with Brotli compression; the PDF engine, which the merger, the splitter, the compressor and the editor share, is 10.4 MB of that on disk and 3.6 MB of the download. The PDF editor's sixteen font files (`public/fonts/editor/`: twelve for text and four that look written by hand, for typed signatures) are 5.4 MB on disk and 2.3 MB of the download: they are what text is typed in and what goes into the file, so the editor cannot type or sign by typing offline without them. The animation converter's caption font is a second copy of the Outfit file (32 KB), because the worker loads it by its own address. The audio workspace's encoders (LAME for MP3, libFLAC, and an AAC encoder for browsers without one; about 1.6 MB together) are build files like any other, so sound can be written offline in every format. The Markdown editor's parts that load only when a document needs them (KaTeX for maths, Mermaid for diagrams, the language parsers that colour code, the Word writer and reader, markdownlint and Prettier) are build files too, so they work offline without having been used first.
- **Not saved:**
  - tutorial videos (about 70 MB, ten of them), which stream on demand
  - link-preview images, which only other sites read
  - copies a file-syncing program leaves beside a file in `public/` ("guide 2.svg"), which Git ignores and which exist on one machine only
  - the data Next.js fetches for page transitions, whose file names only exist after the build
  - what recognises words (OCR): Tesseract's worker and cores (about 4 MB kept, 1.1 MB downloaded) and the data of each language read (0.4 to 3.7 MB each, 31 languages), which only some visitors need, each language only when it is chosen. They are served from `/ocr/<version>/` and kept in a cache of their own, `keepsimp-kept-on-use`, the first time they are used, so OCR works offline from then on. That cache is not one release's: a new release does not delete it, since the files' address names their version, and saving a file of a new version deletes the older version's files in the same folder.
  - what transcribes speech: Whisper's engine (27.5 MB) and the model chosen (base about 80 MB, small about 252 MB), served from `/whisper/<version>/` (put there before each build by `scripts/whisper-files.mjs`) and kept the same way the first time a transcription starts, only the files of the model used.
  - what takes background noise away in the audio workspace: RNNoise (`@shiguredo/rnnoise-wasm`, one script with its WebAssembly and model inside; 4.8 MB kept, 3.1 MB downloaded), served from `/rnnoise/<version>/rnnoise.js` by `app/rnnoise/[version]/[file]/route.ts` and kept the same way the first time noise is taken away.

Because page data is not saved, following a link offline loads the page in full from the saved copy instead of swapping it in place. When a video cannot load, the player says so and points at the written steps.

### When the download starts

`components/offline-support.tsx` registers the worker from the workspace layout only, after the page has loaded. Marketing pages never start the download, in line with the rule that they do not fetch tool bundles before intent. Once registered, the worker covers the whole site.

### How requests are answered

| Request                                          | Answer                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Hashed build files (`/_next/static/`)            | The saved copy; the network if this release never saved it.                              |
| Pages, page data and other saved files           | The network first. The saved copy when the network fails or takes longer than 4 seconds. |
| Page-transition data of a saved page             | The network. After 4 seconds without an answer it fails, and the page loads in full.     |
| What recognises words (`/ocr/<version>/`)        | The copy kept on first use; the network the first time, when the answer is kept.         |
| What takes noise away (`/rnnoise/<version>/`)    | The same.                                                                                |
| What transcribes speech (`/whisper/<version>/…`) | The same.                                                                                |
| Videos, range requests, anything not saved       | Left to the browser, as if there were no worker.                                         |

Online visitors therefore always get the latest pages. The saved copy is a fallback, and nothing is written to it after install, so it stays one complete release.

Batch tools start their workers one after another (`lib/image-batch/pool.ts`), and so does the PDF compressor with the helpers that encode its pictures (`PdfClient.startHelpers`): the first only once the PDF worker has answered, each next one once the one before is ready. Started at the same moment, Safari and sometimes Firefox load some worker scripts past the service worker, and those loads fail offline. A worker that fails to load is started again.

A worker script served from the saved copy is rebuilt as a new `Response`. Otherwise the worker takes the saved response's address and loses the `#params` that Turbopack passes to its worker loader, and the image engines fail to start.

### Releases

- Each build has a version: a hash of the list of saved files, which changes with every build because build file names do. The cache is named `keepsimp-offline-<version>`.
- A new release downloads beside the old one. Hashed files are copied from the earlier cache, so only pages and other small files are fetched again.
- The worker does not call `skipWaiting`. The new release takes over once every KeepSimp window is closed, so an open page keeps the files it was built with. The old cache is then deleted.
- A file the host answers with 404 is skipped. Any other failure fails the install, and the browser retries on a later visit.

### Limits

- The first visit to the tools needs a connection, and so does the tutorial video.
- Browsers may clear saved data for sites that are not installed and not used for a while. Opening the tools online saves the copy again.
- The worker is registered in production builds only. Use `npm run build` and `npm run start` to try it.

## Tests

- **Unit** (`lib/pwa.test.ts`): manifest fields, icon sizes and purposes, and shortcuts limited to working tools.
- **Unit** (`service-worker/rules.test.ts`, `lib/offline.test.ts`): which files are saved, how each kind of request is routed, and that the composed worker parses and registers its three events.
- **Browser** (`e2e/marketing-and-tools.spec.ts`), on all five profiles:
  - the manifest and Apple tags are linked from marketing and dashboard pages
  - the manifest is served as `application/manifest+json`
  - every icon is a PNG of the size it claims; maskable icons are opaque to the corners
  - the start page and every shortcut load
  - the status bar colour follows a manual theme switch and survives a reload
- **Offline** (`e2e/offline.spec.ts`), on all five profiles. Each test serves the export on its own port (`e2e/static-server.ts`) and stops that server to go offline, so the network is really gone for both the page and the worker:
  - marketing pages register no worker
  - the saved copy matches what the export holds, and without a server the compressor, converter (AVIF), resizer and JSON formatter produce real output, and the PDF editor types text in a font from the saved copy and downloads a file that is read back
  - a link followed offline, or on a stalled connection, still opens its page
  - online, a newer page wins; a stalled or missing network falls back to the saved one
  - a new release installs beside the old one without re-downloading hashed files, tolerates a file the host no longer serves, and takes over after the windows close
  - videos stream through the worker online, and the player explains itself offline
- The other suites set `serviceWorkers: "block"` in `playwright.config.ts`, because every test starts with an empty profile and would download the offline copy again.
- **Chrome's own check:** `Page.getAppManifest` and `Page.getInstallabilityErrors` reported no errors against the exported site on 10 October 2026.
