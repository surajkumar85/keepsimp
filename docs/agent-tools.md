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
  - no request outside the site.
- **A real agent:** Codex (`codex exec` with the bridge as its MCP server) formatted a JSON file with sorted keys and checked a contrast. It kept every digit and saved the result beside the file.

## Phases

1. **JSON and colour**, with the registry, the agent page, WebMCP and the bridge. Built.
2. **PDF files:** information, merge, split, compress.
3. **PDF editor jobs:** pages, crop, page numbers, watermarks, details, forms, redaction, find and replace, text and pictures, OCR, signature checks.
4. **Images and animation.**
5. **Audio:** every job of the audio workspace, after its job-building moves into `lib/audio/`.
