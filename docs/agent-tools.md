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
  - `json.ts`: the JSON workspace's worker jobs, through `JsonClient` (`lib/json-workspace/client.ts`), which the workspace's hook also uses.
  - `color.ts`: the colour utility's functions, and the image sampling rules in `lib/color/sample.ts`, which the workspace's image panel also uses.
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

### The agent page (`/dashboard/agents/`)

- **What it is:** a workspace page, not a catalogue entry, linked from the sidebar footer, in the sitemap and in the offline copy.
- **Starting the tools:** `lib/agent/browser.ts` (`startAgent`) does three things:
  - starts the engines;
  - offers `window.keepsimp` (`bridge-api.ts`);
  - registers every tool with WebMCP where `document.modelContext` exists (`webmcp.ts`).

  They stop when the page goes. The origin-trial token is set in `lib/agent/setup.ts` (`ORIGIN_TRIAL_TOKEN`) and written as a `<meta http-equiv="origin-trial">` on this page only, since a static export cannot send headers.

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
- **A real agent:** Codex (`codex exec` with the bridge as its MCP server) formatted a JSON file with sorted keys and checked a contrast. It kept every digit and saved the result beside the file. Then Codex merged two PDFs into `combined.pdf` and compressed the brochure through the bridge. Poppler (`pdfinfo`, `pdftotext`) read 5 pages (3 + 2) and the same text in the compressed brochure, 90% smaller.

## Phases

1. **JSON and colour**, with the registry, the agent page, WebMCP and the bridge. Built.
2. **PDF files:** information, merge, split, compress. Built.
3. **PDF editor jobs:** pages, crop, page numbers, watermarks, details, forms, signature checks, redaction, find and replace, text and pictures, OCR. Built.
4. **Images and animation.**
5. **Audio:** every job of the audio workspace, after its job-building moves into `lib/audio/`.
