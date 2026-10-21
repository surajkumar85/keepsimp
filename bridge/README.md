# keepsimp-mcp

[KeepSimp](https://keepsimp.vercel.app)'s tools for Claude Code, Codex and any other agent that speaks the Model Context Protocol. The tools run on your own computer, in a browser the bridge opens and hides: the same engines as KeepSimp's pages, with your files read from your disk and the results saved next to them. Nothing goes to a server.

## Use it

Claude Code:

```bash
claude mcp add keepsimp -- npx -y keepsimp-mcp
```

Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.keepsimp]
command = "npx"
args = ["-y", "keepsimp-mcp"]
```

Any other client: run `npx -y keepsimp-mcp` as a stdio server.

Then ask in plain words: "format data.json with sorted keys", "check the contrast of #777 on white", "find the main colours of logo.png".

## The tools

The bridge asks the KeepSimp page which tools there are, so the list is always the site's own. Today:

- **JSON:** `format_json`, `repair_json`, `transform_json`, `query_json` (JSONPath and JSON Pointer), `validate_json` (JSON Schema), `compare_json`, `patch_json`, `convert_json` (YAML, CSV, JSON Lines, TypeScript, JSON Schema). Numbers keep their exact digits.
- **Colour:** `convert_color`, `check_contrast` (WCAG 2), `make_palette`, `colors_from_image`.

PDF, image, animation and audio tools follow.

## What it may touch

- **Files:** only inside the folders the agent works in. That means the roots the client names, or the folder the bridge was started in, plus any folder given with `--allow <folder>`. Paths are followed through links before they are judged.
- **Results:** saved beside the first file given, or in `outputFolder`. An existing file is never overwritten: a second copy is called `name (2).ext`.
- **The browser:** it opens the KeepSimp site and refuses every other address. It uses Google Chrome when it is installed; otherwise it installs Playwright's Chromium once (about 150 MB).

## Options

```
--allow <folder>   Also let KeepSimp read and write in this folder (repeatable).
--browser <which>  chrome, chromium or auto (the default).
--headed           Show the browser window.
--site <url>       The KeepSimp site to open (https://keepsimp.vercel.app).
```

## Licence

AGPL-3.0-only, as KeepSimp.
