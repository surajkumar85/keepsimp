# Tools for AI agents

KeepSimp's tools can be used by agents: Claude Code, Codex and other MCP clients through the KeepSimp bridge, and agents in the browser through WebMCP. The tools run on the person's device, with the same engines as the tools' own pages.

## Research (October 2026)

- **WebMCP** is a proposed web standard. A page registers tools with `document.modelContext.registerTool({ name, description, inputSchema, annotations, execute })`, and an agent in the browser lists and calls them.
  - Chrome has it as an origin trial from 149 to 156, or with the flag `chrome://flags/#enable-webmcp-testing` (`--enable-features=WebMCP`). `navigator.modelContext` was removed in Chrome 152.
  - The input is JSON and the answer is text. The browser does not check the input against the schema, and nothing in the API passes files.
  - The annotations are `readOnlyHint`, `untrustedContentHint` and `consequentialHint`.
  - Sources: [Chrome: imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [Chrome 152 change](https://github.com/WebMCP-org/npm-packages/issues/270).
- **Who can call WebMCP tools today:** Playwright (`page.webmcp`, which the browser tests use), Puppeteer and Chrome DevTools MCP can, behind flags. Claude in Chrome does not discover them yet. Sources: [Puppeteer](https://pptr.dev/guides/webmcp), [DevTools 149](https://developer.chrome.com/blog/new-in-devtools-149).
- **Desktop agents** (Claude Code, Codex) talk to local MCP servers over stdio and cannot reach into a tab. That is why KeepSimp has a bridge.
  - MCP roots tell a server which folders the client works in. They are advice to the server, which must enforce the limit itself. Source: [MCP roots](https://modelcontextprotocol.io/docs/concepts/roots).

## How it is built

### One registry (`lib/agent/`)

- **`registry.ts`** defines a tool: `{ name, title, description, inputSchema, annotations, run(input, context) }`.
  - `context` gives the file store, an abort signal and `progress(fraction, note)`.
  - A result is `{ summary, files?, data? }`: a sentence that says what was done and checked, the files made, and the answer.
- **Files are named by id.** A schema property that takes a file is marked `"x-keepsimp": "file"` (or `"files"`): `fileProperty`, `filesProperty`.
- **`files.ts` (`FileStore`)** holds files in memory only.
  - Names are made plain (`safeName`: no folders, no control characters, at most 120 characters).
  - A made file is named from its source (`madeName`: `data.json` becomes `data-formatted.json`).
- **`schema.ts` (`checker`)** checks every input with Ajv in strict mode before the tool runs, and says what is wrong in words.
- **`agent.ts` (`Agent`)** runs a call:
  - It checks the tool exists, then the input, then that every file named is there.
  - Each call can be stopped. A tool that finishes after Stop still counts as stopped.
  - The last 50 calls are kept for the page, with who asked: the page, an agent in the browser, or the bridge.
- **Tools by family**, each calling the engines its page uses:
  - `json.ts`: the JSON workspace's worker jobs, through `JsonClient` (`lib/json-workspace/client.ts`), which the workspace's hook also uses. `inspect_json` is the Explore tab's tree (the `inspect` job: the document's counts, duplicate keys and numbers JavaScript cannot hold, then its values 100 at a time, searched or opened by pointer), and `json_table` its table (the `table` job, first 100 rows).
  - `color.ts`: the colour utility's functions, and the image sampling rules in `lib/color/sample.ts`, which the workspace's image panel also uses. Every tab is reached: conversion (all spaces, or one batch format with `asFormat`), contrast with a target, ΔE2000 and the four vision previews (`simulate`), palettes, mixing (`mixColors`), gradients with their fallback (`gradient`, `gradientFallback`), the brand references with their sources (`brands`), main colours and one pixel of an image as it is drawn for sampling. A palette's PNG strip is drawn by `drawStrip` (`lib/color/strip.ts`), which the palette page also uses.
- **Words as text or a file** (`text.ts`):
  - A tool takes words either way.
  - Its answer comes back in the result when the source was text and the answer is short (at most 50,000 characters).
  - The answer is a file when the source was a file or the answer is long.

### The PDF tools (phase 2)

- **The way to the worker** is `lib/agent/pdf-engine.ts` (`PdfEngine`): the same `PdfClient` every PDF page uses, with three things added:
  - a file's opening is turned into a promise; a locked file, a wrong password and a damaged file each say so in words;
  - a search and a look for blank pages are turned into lists of pages;
  - a job's Stop is joined to the call's signal (the worker answers a stopped job with null or false, which becomes `AbortError`).

  Compression asks for the file's audit first, as the compressor's page does, which also starts the picture helpers.

- **The tools** (`lib/agent/pdf.ts`) build their requests from the pages' own settings and helpers:
  - `pdf_info`: the facts the worker reads, page sizes, bookmarks (`headingsOf`) and the text of up to 100 pages (200,000 characters).
  - `merge_pdfs`: PDFs and pictures (each a page; SVG refused, as the merger does), with pages chosen by `parseRanges`, turns, passwords to open, the merger's defaults for bookmarks, forms, labels, attachments and details, page numbers, and a lock. The result is opened again and must have every page.
  - `split_pdf`: every N (`cutsEvery`), equal parts (`cutsEqual`), single pages, ranges, odd and even, extract, remove, bookmarks, blank pages (from the worker's `ink`), words (from its `search`), all through the splitter's own `planFor`; or by size (`splitBySize`). Parts are named by `partNames` and come back as one ZIP (`zipName`, `createZip`) beyond 20, or when asked. Each part must have the pages it was planned with.
  - `compress_pdf`: a level, a target size or custom settings, the scan choices, what to take out, and a lock. It says what changed in the compressor's own words (`checkLine`, `alreadySmall`). A file already as small as it gets is not handed back.
  - Locks use the merger's rules (`settingsProblem`, `permissionBits`). Limits without a second password get one nobody keeps.
- **Passwords:** a password given to open a file or lock a result passes through the agent, as the person's own words do. It is sent only to the worker and kept nowhere.

### The PDF editor's jobs (phase 3, part 1)

- **One way in** (`lib/agent/pdf-edit.ts`, `editing`), as the editor's page does it:
  - the file is opened for editing (`PdfEngine.openForEdit`: `open` with `edit: true`, then `editState`);
  - each job is made as the editor's own steps;
  - the file is written with `editExport`, which makes added things part of the pages unless `keepEditable`, reads their words back, and compares untouched pages.
- **Signed files:** only a signed file is written after its signature (`after`), as the editor does, which keeps the signature holding. Any other file is written anew, so its read-back checks run. The answer says which, with the checks' figures in `data.checked`.
- **The jobs:**
  - `organize_pdf_pages`: one `editPages` step per step asked, made as the pages panel makes them (`whyNot`, `planOf`, `labelOf`, `blankSize`, `SHEETS`), with other PDFs handed over once each by `editInsert`.
  - `crop_pdf`: `crop` or `whole`, checked by `cutSize`. It says that what is cut off is hidden.
  - `add_page_numbers` (and Bates numbers) and `add_header_footer`: `repeatedChange` with the repeat panel's formats and `lineProblem`.
  - `watermark_pdf`: `markObject` through `repeatedChange`, with a picture handed over by `editPicture`. It says that a watermark does not protect.
  - `edit_pdf_details`: one `editDocument` step of details (over the file's own), bookmarks (`bookmarkTo`) and label runs.
  - `list_pdf_form_fields` and `fill_pdf_form`: the file's own fields by name. A tick box takes true or false, round buttons the number of their choice, lists the option or its shown words; a date field takes the day as ISO and writes it with `writeDate`. Scripts are never run.
  - `verify_pdf_signatures`: the worker's `signatures`, in the panel's words (`verdictSaid`, `signerSaid`, `changesSaid`). Trust is the reader's to judge.
- **Text** is laid out by `laidOut` (`lib/pdf-editor/laid-out.ts`, moved there from the editor's hook so both use it), after the editor's font has been loaded as a `FontFace` and handed to the worker (`EditText` in `lib/agent/browser.ts`).

### The PDF editor's jobs (phase 3, part 2)

- **`redact_pdf`**, as the redaction panel's Mark all and Apply:
  - every place the words, patterns (`PATTERNS`) or shapes (`shapeSearch`) are found by `redactFind` is marked in one step;
  - the marks are applied in a second step, which removes the letters, pixels and drawings under them and refuses a change that leaves a letter readable;
  - nothing found writes nothing.
  - A signed file is never written after its signature (`anew`): what was taken out would stay in the file beneath. The details, attachments and scripts are left out on request (`clean`).
- **`find_replace_pdf_text`**, as the find panel's Replace all: `editFind`, the stand-in fonts handed over, one `editReplace` step of `opFor` for every place, and a second look to count what changed. Refused places are said, never forced.
- **`add_text_to_pdf`** and **`add_image_to_pdf`**: a text box or a picture added as the editor adds one, laid out by `laidOut`, in points from the top left of the page as shown. A picture is placed at 150 pixels to the inch, at most half the page wide, unless a size is given.
- **`ocr_pdf`**: the OCR panel's loop, moved to `lib/pdf-editor/ocr-run.ts` (`readPages`) and Tesseract's start to `lib/pdf-editor/tesseract.ts`, so the panel and the tool run the same code. The words are laid in one `editOcr` step; the download reads every one back (`report.ocr`). Stop does not wait for Tesseract, which is let go of after every run.

### Drawing and comments (phase 6, part 1)

- **What every editor tool shares** (`lib/agent/pdf-kit.ts`): opening a file for editing, making steps (`apply` lays out text and hands fonts over for things added or changed, and passes other steps on), and writing the file with the editor's checks, with a choice of what becomes of comments. `pdf-edit.ts` and the newer tool files use it.
- **`draw_on_pdf`** makes what the toolbar makes, with the toolbar's own makers and default looks (`makeObject`, `makeText`, `makeCallout`, `checkMark`, `defaultStyles`, `STAMP_SIZE`): boxes, ellipses, lines, arrows, freehand strokes (their box follows their points, through `moved`), covers, stamps, call-outs, measuring lines, text (on a paper form's row of boxes too, `comb`) and ticks, crosses and dots. All in one step; things kept editable earlier are moved or removed by id. A cover says that it only hides.
- **`list_pdf_comments`** reads the comments of every page as the comment panel does, with the words a mark lies on (`wordsUnder` over the page's letters, read only for pages with marks), and the things kept editable, with their ids.
- **`comment_on_pdf`** makes the comment panel's steps (`CommentOp`) in one change: marks on every place some words or a kind of thing are written (the redaction tool's search, `redactFind`), or on the words in an area (`selectWords`, as a drag does); notes, pen strokes, replies, changes and deletions by id. Marks take the panel's colours. What becomes of every comment on download (kept, drawn in, left out) is the download's own choice.

### What a page already has (phase 6, part 2)

- **`read_pdf_page_content`** reads pages as the in-page tools do: the page's own lines (`linesOf`) and paragraphs (`blocksOf`, `asLine`; "paragraphs" off makes every line alone, as the bar's switch does), the pictures it draws (`pagePictures`) and its links (`pageLinks`), at most 200 pages at a time. Each gets an id: `p3-b2` (paragraph), `p3-l5` (line), `p3-i1` (picture), `p3-k1` (link).
- **`edit_pdf_text`** makes Change text's steps: a line is a `retext`, a paragraph a `reflow`, found again by its boxes and words, all in one step. Another size, colour or font (`LineLook`), an alignment for a paragraph, a move, or taking out. The font chosen, or the stand-ins for letters the line's own font lacks (`standIns`), are in the worker first, as the editor makes them ready. A line that cannot be retyped says why, and can still be moved or taken out.
- **`edit_pdf_pictures`** and **`edit_pdf_links`** make the in-page steps one at a time, re-reading the page before each, since a picture or a link is named by its place in the page's list: changes first, then new links (at the end of the list), then removals from the highest place down. Pictures move (`moved`), resize about their top-left corner (`scaledAbout`), turn about their middle (`turnedAbout`), are cut (it hides) or shown whole, replaced, or taken out. Links lead only to pages and to `http`, `https`, `mailto` and `tel` (`targetFrom`); where an address leads is not checked.
- **A font of one's own** (`ownFont` in `pdf-kit.ts`) is taken as the editor takes one: read for its name and its maker's permission (`readFont`), keyed by its bytes (`ownKey`), made ready for measuring on the page (`EditText.own`) and handed to the worker with its written name. `edit_pdf_text`, `draw_on_pdf` and `add_text_to_pdf` take it as `fontFile` with the font `own`.

### Making forms, and trusted certificates (phase 6, part 3)

- **`create_pdf_form_fields`** makes the designer's `add` steps (`MakeFieldOp`): every kind (`MAKE_KINDS`), named by `defaultSpec` and `offeredName` unless named, unique across the form (`nameTaken`), at the place given in points with the designer's usual size, kept on the page (`fitField`). `fromSuggestions` adds what the page's judge suggests (`suggestFields`), names made unique. A form with an XFA part is refused, as the designer refuses it.
- **`suggest_pdf_form_fields`** only lists what is suggested; nothing is added unasked.
- **`edit_pdf_form_fields`** makes `reshape`, `properties`, `delete`, `copy` and `order` steps in one change, by field names (`list_pdf_form_fields` now gives every place of a field). Moves and the layouts (`aligned`, `spread`, `sized`) start from where the last left each field, as on the page, and end as one move for each field that is somewhere else; tab order is the names given (the rest after them) or `readingOrder`. A tooltip that is only the name made readable is not kept as a tooltip. A field holding a certificate signature is not changed.
- **`verify_pdf_signatures`** takes `trusted` certificate files (DER or PEM, read by `readTrusted`), checked against as the panel checks: by signature, dates and right to issue.

### Images and animation (phase 4)

- **The workers** are the pages' own, the agent's own copies with one worker each:
  - the compressor's `CompressorClient`, through `CompressorEngine` (`lib/agent/image-engines.ts`): one image at a time, opened then compressed. Stop disposes of the worker, so a late answer from it cannot be taken for the next image's.
  - the resizer's, converter's and animation converter's `WorkerPool`s, through `PoolJobs` (`lib/agent/pool-jobs.ts`): a job is handed out when the worker asks, and its answer comes back as a promise. Stop takes a waiting job out of the queue, or ends the worker of a running one; the rest carry on in a new worker.
- **The tools** (`lib/agent/image.ts`, `lib/agent/animation.ts`) lay what is asked over the pages' default settings, so a choice left out is the page's:
  - files are read by `inspectFile`, and SVG is drawn on the page by `rasteriseSvg`;
  - `compress_image` builds its request as the compressor's page does (`buildPlan`, `candidateFormats`, `backgroundRgb`), and makes nothing when `originalIsBetter`;
  - `resize_image` and `convert_image` name their files by the pages' own `fileName` and `uniqueNames`; several images become one PDF by `createPdf`;
  - `convert_animation` takes the page's own limits for a video as caps: at most 15 frames a second and 640 pixels on the longest side, never enlarged, unless asked otherwise. Several stills are shown 200 ms each.

### Audio (phase 5)

- **The jobs are the page's own.** The audio workspace's job-building moved into `lib/audio/jobs.ts`, which the page and the tools both use:
  - `writeJob` makes the job that writes one file, or its parts, from the file, the WAV the page decoded (when the worker cannot decode it here), its edit steps and its tag change;
  - `joinJob` and `joinPlan` make a join, titling each chapter by the file's tag or name;
  - `resultProblems` holds a written file to what was asked (length at the speed written, rate, channels, bitrate, loudness, a lossless file's ceiling), as `checkResult` does on the page.
- **The worker** is the workspace's `AudioPool`, the agent's own with one worker, through `PoolJobs`. Sound the worker cannot decode is decoded on the page (`decodeOnPage`), with its waveform and loudness measured there, as the workspace does. Whisper and the video maker run in workers of their own (`startTranscription`, `startVideo`), ended with the page; a video takes the theme's colours (`themeColours`, `lib/audio/theme-colours.ts`, shared with the video panel).
- **The tools** (`lib/agent/audio.ts`) lay what is asked over the workspace's defaults (`settingsOf`), with each door's first format:
  - `audio_info`: the reader's facts, tags and cover, and the loudness measured as BS.1770 says (`loudnessOf`, in the page's words: `loudnessSaid`);
  - `convert_audio` (MP3 by default; `same` copies a video's sound out where its codec allows), `edit_audio` (keep, cut, silence, fade and gain steps, each in the times the steps before left, checked by `stepProblem`; then the silence at the ends trimmed and long pauses shortened as the editor finds them, `trimEnds` and `shortenPauses` over `silentRuns`, as ordinary steps; an equaliser preset or the equaliser's own settings, and a compressor), `make_ringtone` (`ringtonePart`, `ringtoneSteps`), `normalize_audio` (loudness, peak or louder, with the true-peak limiter), `change_audio_speed`, `remove_background_noise` (RNNoise, hum, clicks, harsh s sounds) and `edit_audio_tags` (written in place where the format allows);
  - `split_audio`: every N minutes, N parts, at pauses found as the splitter finds them (`silentRuns` under −50 dBFS, `partsOf`) or at given times (the markers' rule), named by `partNames`;
  - `join_audio`: in order, with a gap or a crossfade, and chapters;
  - `transcribe_audio`: text, SRT and VTT (`toText`, `toSrt`, `toVtt`), from a decoded copy when the worker cannot decode the file;
  - `audio_to_video`: the sound written as the workspace writes it, then drawn, over the sound's cover, a picture or (with `cover: false`) the theme's colour; the video is handed over only when opening it again finds its picture, its sound and its length.
- **Every result says** the plan's sentences, what was done to the level (`levelSaid`) and what the check found.

### Video (phase 7, part 1)

- **The tools** (`lib/agent/video.ts`): `video_info` (the workspace's facts: kind, codecs, size as shown, turn, frame rate, bitrate, HDR, sound, length, what this browser can play) and `convert_video` (every setting of the video editor: format, codec, quality or a bitrate, size, frame rate, turn, mirror, sound, details).
- **The same way as the page:** jobs are built by `lib/video/jobs.ts` (`readJob`, `convertJob`) and run on the workspace's own worker (`VideoPool`, the agent's own pool of one, through `PoolJobs`); each file is planned with the workspace's own `planFor` through `browserPlan`, which asks the browser what it can write (`browserAsker`, `lib/video/probe.ts`) as the plan needs, first choice first. A plan the browser cannot write is refused in the page's own words. Results are written to the agent page's own folder on disk, emptied when the page goes.
- **Handed over only when it holds:** the worker opens every result again (`writtenProblems`); one not as asked is refused with what is wrong.
- **`compress_video`** (part 2) takes a size in MB or a share of the file, with the converter's other settings, and writes through the same path: the plan's limit, up to three passes, never handed over larger than the limit, and how close it looks (`looksSaid`).
- **Shape, speed, fades, crop and loudness** (part 4): `shape`, `speed`, `fadeIn`, `fadeOut`, `crop` (pixels of the picture as shown, refused past it) and `loudness` are settings of every video tool, planned by the workspace's own `planFor` and made by its hooks (`lib/video/effects.ts`).
- **`trim_video`** (part 3) takes the parts to keep and to cut, in seconds of the original, worked out as the trim panel works them out (`kept`, from `lib/video/trim.ts`), copied at keyframes or `exact`, and plans them with `browserPlan`'s cut; each file keeps its own format unless one is given, and the result's length is checked against the parts kept. **`split_video`** splits a file at points or every so many seconds, after `keep` and `cut`, into a file for each piece that keeps something (`splitParts`, the trimmer's own), each written through the same path as `trim_video` and named `-part-N` (`partName`). **`video_frame`** saves the frame at a moment as a PNG through the page's own `frameAt` (the agent page imports Mediabunny for it when asked), handed over only when the PNG's header gives the picture's size as shown.

### Every setting of the image pages (phase 6, part 4)

- **`compress_image`** takes the compressor's sizes (a share, or a width and height in pixels or percent, kept in shape or fitted), a crop box or the largest box of a shape in the middle of the image as it is turned (`initialCrop`, `aspectValue`, as the crop panel makes it), turns and flips, and the encoder's own choices (full-resolution colour, progressive JPEG, PNG colours, dithering, resampling). All go through the page's own `buildPlan`.
- **`resize_image`** takes print sizes in inches, cm and mm at a dpi (and writes the dpi when asked), a focus point or smart focus, turns, flips, the resampling kernel, sharpening and rounding to a multiple.
- **`convert_image`** writes several formats at once (`multi`, `targets`), each file of its own type, and takes the dpi, dithering and the dpi pages of a PDF are placed at.
- **`convert_animation`** takes the GIF encoder (gifski for best), the frames' format, colours and dithering, turns and flips, what fills transparency, a filter with brightness, contrast and saturation, the captions' size, colour, outline, capitals and times, a logo painted on every frame (`overlay`, with its corner, width and opacity), a crop box (in the trim, as the page keeps it) and the name pattern.

### The agent page (`/dashboard/agents/`)

- **What it is:** a workspace page, not a catalogue entry, linked from the sidebar footer, in the sitemap and in the offline copy.
- **Starting the tools:** `lib/agent/browser.ts` (`startAgent`) does three things:
  - starts the engines;
  - offers `window.keepsimp` (`bridge-api.ts`);
  - registers every tool with WebMCP where `document.modelContext` exists (`webmcp.ts`).

  They stop when the page goes. The origin-trial token is set in `lib/agent/setup.ts` (`ORIGIN_TRIAL_TOKEN`) and written as a `<meta http-equiv="origin-trial">` on this page only, since a static export cannot send headers. The token was registered for `https://keepsimp.vercel.app` on 2026-10-22 and expires on 2027-03-30; it works only on that origin, so local builds and previews still need `--enable-features=WebMCP`.

- **What the person sees:**
  - how to connect Claude Code and Codex;
  - whether this browser offers WebMCP;
  - a file area for an agent in this browser (`list_files` is that agent's way to find them);
  - every call, with progress, Stop and its answer;
  - the list of tools.
- **`window.keepsimp`:** `version`, `tools()` (without the page's own `list_files`), `load(url, name, type)`, `run(id, name, input)`, `stop(id)`, `save(id)` (a download of an untyped link) and `forget(ids)`.
  - Every answer is `{ ok, value }` or `{ ok: false, problem }`, never an exception.
  - Progress goes to `window.keepsimpBridgeProgress(id, fraction, note)`.

### The bridge (`bridge/`, npm `keepsimp-mcp`)

Published on npm as `keepsimp-mcp` (0.1.0 on 2026-10-22). Its first start downloads the package, and Playwright's Chromium when Chrome is missing, which takes longer than Codex waits by default (10 s); the setup we give Codex therefore sets `startup_timeout_sec = 120`, and `tool_timeout_sec = 300` for long jobs such as transcription. Codex then read a PDF and converted a FLAC through `npx -y keepsimp-mcp`.

A package of its own, in TypeScript that Node runs as it is (type stripping), built to `dist/` for npm. Dependencies: `@modelcontextprotocol/sdk` and `playwright-core`.

- **`server.ts`:**
  - It lists the page's tools, asked of the page so they are always the site's own.
  - It uses the client's roots when the client has them, plus `--allow` folders, and the folder it started in otherwise. It follows changes to the roots.
  - It passes progress notifications and cancellation through.
- **`tools.ts` (`forAgents`):**
  - A file property becomes a path, and every tool gains `outputFolder`.
  - The annotations say the tool writes new files (`readOnlyHint: false`), never destroys one, and does not reach the outside world.
- **`calls.ts` (`callTool`):**
  - Each path is judged, and its file handed to the page.
  - The tool runs. What it made is saved in the folder asked for, or beside the first file, or in the first folder.
  - Every file handed in or made is let go of afterwards. The page's ids never reach the agent.
- **`paths.ts`:**
  - `Folders.file` and `Folders.folder` resolve a path through links (`realpath`), and refuse anything outside the folders, naming them.
  - A folder to write in is judged by the nearest part of it that exists, then made.
  - `freePath` never overwrites: `a.json`, then `a (2).json`.
- **`browser.ts` (`Session`):**
  - It uses Google Chrome when installed, otherwise Playwright's Chromium, installed on first use.
  - It runs headless, with service workers off, so that every request can be seen.
  - Every request to another origin is refused and logged.
  - Files go in through `/__bridge/in/<token>`, which the bridge answers from disk (one use per token), and come out as downloads, saved one at a time.
  - The page is opened again if it crashes, and `AGENT_VERSION` must match the page's.

## Bounds

| What                   | Limit                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| Tool input             | Its schema, checked (additional properties refused)                             |
| JSON files             | 10 MiB (the workspace's own limits apply: 5M characters, 100k nodes, depth 100) |
| Answers in the result  | 50,000 characters; longer ones come as a file                                   |
| Calls kept on the page | 50                                                                              |
| Files                  | In memory, until the page closes or the bridge lets go of them                  |
| Bridge paths           | Inside the roots, the start folder and `--allow`, after links are followed      |

## Not given to agents

- **Signing with a certificate, or placing a signature:** a signature is the person's own act, and it would put a certificate's password in the agent's hands.
- **Recording:** it needs a microphone and a person.

## Verification

- **Unit, 100%:**
  - `lib/agent/*.test.ts`, with the JSON worker's own jobs (`runJob`) and the colour functions; no mocks of the engines.
  - `lib/json-workspace/client.test.ts` and `jobs.test.ts`.
  - The bridge's `test/unit/*.test.ts` (Node's runner, 100% of lines, branches and functions): paths through `..`, links and roots; options; calls; the server over the SDK's in-memory transport, with roots, progress and cancellation.
- **Browser** (`e2e/agent.spec.ts`, five profiles):
  - The page as the bridge drives it: files in through a routed address, every tool run, results saved as downloads and checked (exact digits, YAML parsed, a patch round trip, a PNG's colours).
  - No request outside the site.
  - The person's file area and the list of calls.
  - In Chromium with `--enable-features=WebMCP`, the tools called through real WebMCP (`page.webmcp`) on a file the person added.
  - axe in both themes, and 320 px.
- **The bridge itself** (`bridge/test/bridge.test.ts`, also in CI): the real bridge over stdio, driven by the MCP SDK's client, against the local build. It checks:
  - tools listed with paths;
  - results saved beside the file and never over another;
  - a folder made for results;
  - an image read from disk;
  - paths outside, links that lead out and bad input refused;
  - no request outside the site;
  - PDFs merged and split on disk, progress told for a compression, and a compression cancelled with nothing saved.
- **PDF** (`lib/agent/pdf.test.ts`, 100%, with a stand-in for the worker in `tests/agent-pdf-fake.ts` to see what each tool asks; `e2e/agent-pdf.spec.ts`, five profiles, the real worker):
  - Facts and text are read back.
  - A merge of PDFs and a picture, with chosen pages, turns, a locked input and a locked result, read by pdf.js: the text in order, the turns, the fields kept, the title, and no opening without the password.
  - A split every N pages, at bookmarks named by their titles, extracted pages, at words, at blank pages, and 25 parts as a ZIP listed by `unzip`.
  - Compression of the brochure, smaller with the same text, and a second pass that says it is already as small.
  - A long compression stopped, and the tools working after it.
- **PDF editor** (`lib/agent/pdf-edit.test.ts`, 100%, against the stand-in worker; `e2e/agent-pdf-edit.spec.ts`, five profiles, the real worker, results read by pdf.js):
  - pages turned, deleted, moved, copied, blank and inserted, in order;
  - a crop of 20 mm;
  - page numbers, Bates numbers and a footer read back (kept editable, they stay stamps);
  - a watermark of words and of a picture;
  - details, nested bookmarks and labels i, ii, 1, 2, 3;
  - a form listed, filled and flattened;
  - the signed sample checked, numbered after its signature, and still holding;
  - e-mail addresses, phone numbers and words redacted, gone from the text pdf.js reads;
  - words replaced in two places;
  - a text box and a picture placed;
  - a scan recognised by Tesseract and its words then redacted.
- **Images and animation** (`lib/agent/image.test.ts`, `pool-jobs.test.ts`, 100%, against stand-ins in `tests/agent-image-fake.ts`; `e2e/agent-image.spec.ts`, five profiles, the real workers, results read by FFprobe and pdf.js):
  - a JPEG read, compressed to WebP at 600 by 400, fitted under 40 KB, resized to a 300 by 300 PNG, to a set of widths and to a preset;
  - converted to AVIF within 200 pixels, and two images made into one PDF;
  - the sample video turned into a GIF of at most 640 pixels and 15 frames a second, the GIF into a WebP at twice the speed, and three stills into an MP4.
- **Drawing and comments** (`lib/agent/pdf-draw.test.ts`, 100%, against the stand-in worker; `e2e/agent-pdf-draw.spec.ts`, five profiles, read back by pdf.js): every kind drawn into a page and its words read back (a stamp, a call-out, a measuring line's length, a row of boxes); kept editable, ten annotations, listed, moved and removed by id; a cover that leaves the words in the file; highlights by words and underlines by area with the words they lie on, a note and a pen stroke signed by the author, a reply, a change and a deletion, and comments drawn in or left out.
- **What a page already has** (`lib/agent/pdf-content.test.ts`, 100%; `e2e/agent-pdf-content.spec.ts`, five profiles, read back by pdf.js and pdf-lib): a heading retyped larger, a paragraph changed and flowed, an address line taken out, the rest of the page as it was; a heading set in Kalam from a font file, embedded; pictures moved, cut, replaced and taken out, where pdf.js paints them; links led to a page, added to the web and to an e-mail address, and taken away.
- **Forms** (`lib/agent/pdf-forms.test.ts`, 100%; `e2e/agent-pdf-forms.spec.ts`, five profiles, read back by pdf-lib): six kinds of field made and read by pdf-lib as text, check box, radio group, dropdown and signature fields, then filled; a field renamed and widened, three lined up and the tab order set by rows; the five fields a paper form asks for suggested and added; the signed sample trusted through its authority's certificate and not through another's.
- **Image settings** (`lib/agent/image.test.ts`, 100%; `e2e/agent-image.spec.ts`, five profiles, read by FFprobe): a photo turned and cut to its middle square (800 by 800), a box of it at half its size (200 by 150), two inches at 150 dpi (300 pixels), three formats at once, and the sample video as a greyscale GIF cut to 200 by 100 with a caption and a logo.
- **Audio** (`lib/agent/audio.test.ts`, `lib/audio/jobs.test.ts`, 100%, against a stand-in pool; `e2e/agent-audio.spec.ts`, five profiles, the real workers, results read by FFmpeg and FFprobe):
  - the sample tune read, its loudness as `ebur128` measures it;
  - converted to an MP3 with exactly as many samples as the source, trimmed and faded to four seconds of WAV exactly, brought to −16 LUFS with true peaks under −1 dBTP, made twice as fast, and made an iPhone ringtone in AAC;
  - tags written in place; split into two parts of four seconds each, joined into an MP3 with a chapter for each, exactly eight seconds;
  - noise taken out of speech, every sample kept, and the speech written down by Whisper;
  - a video of the sound, 1920 by 1080, with its sound, and the sound written on the way not left among the files.
  - This found a fault in Mediabunny's FLAC reader: a last frame shorter than 16 bytes (a silent one is 13) was dropped, so a file ending in silence lost up to a tenth of a second. It is patched (`patches/mediabunny+1.62.1.patch`, read in `lib/audio/audio.node.test.ts`) until Mediabunny fixes it.
- **Colour, JSON and audio, phase 6 part 5** (`lib/agent/color.test.ts`, `json.test.ts`, `audio.test.ts`, 100%; `e2e/agent.spec.ts` and `e2e/agent-audio.spec.ts`, five profiles):
  - JSON searched and browsed with its exact digits, and an array of objects laid out as a table;
  - a contrast aimed at 7:1, with ΔE2000 and the vision previews; black and white mixed in sRGB; a radial gradient the browser accepts as CSS; Microsoft's colours written as CSS;
  - a palette's PNG strip drawn by the page, then read back pixel by pixel through `pick_image_color` (the colour, and half opacity kept);
  - a sound with silence at both ends and a long pause trimmed and shortened (3 to 4.2 s shorter, measured by FFmpeg) and split at 3 s and 12 s into parts of those lengths.
- **A real agent:** Codex (`codex exec` with the bridge as its MCP server) formatted a JSON file with sorted keys and checked a contrast. It kept every digit and saved the result beside the file. Then Codex merged two PDFs into `combined.pdf` and compressed the brochure through the bridge. Poppler (`pdfinfo`, `pdftotext`) read 5 pages (3 + 2) and the same text in the compressed brochure, 90% smaller. Asked in plain words to make the sample tune an MP3 at −16 LUFS and to write down what the voice note says as subtitles, Codex called `normalize_audio` and `transcribe_audio`; FFmpeg's `ebur128` measured −16.0 LUFS, and the SRT had both sentences word for word.

## Phases

1. **JSON and colour**, with the registry, the agent page, WebMCP and the bridge. Built.
2. **PDF files:** information, merge, split, compress. Built.
3. **PDF editor jobs:** pages, crop, page numbers, watermarks, details, forms, signature checks, redaction, find and replace, text and pictures, OCR. Built.
4. **Images and animation.** Built.
5. **Audio:** every job of the audio workspace but recording. Built.
6. **Everything else the pages do**, but recording and signing:
   1. drawing and comments. Built.
   2. the page's own text, pictures and links, and fonts of one's own. Built.
   3. making form fields, and trusted certificates for checking signatures. Built.
   4. every setting of the image and animation pages. Built.
   5. audio's silence trimming, equaliser and split times; colour gradients, brand colours, vision previews and mixing; searching JSON. Built.
7. **Video:** each phase of the video workspace as it ships. Part 1 (reading and converting) and part 2 (compressing to a size) built.
