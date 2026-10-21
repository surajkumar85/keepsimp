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

Then ask in plain words: "merge a.pdf and b.pdf", "split book.pdf at its bookmarks", "format data.json with sorted keys", "check the contrast of #777 on white", "find the main colours of logo.png".

## The tools

The bridge asks the KeepSimp page which tools there are, so the list is always the site's own. Today:

- **JSON:** `format_json`, `repair_json`, `transform_json`, `query_json` (JSONPath and JSON Pointer), `validate_json` (JSON Schema), `compare_json`, `patch_json`, `convert_json` (YAML, CSV, JSON Lines, TypeScript, JSON Schema). Numbers keep their exact digits.
- **Colour:** `convert_color`, `check_contrast` (WCAG 2), `make_palette`, `colors_from_image`.

- **PDF:** `pdf_info` (facts, bookmarks and text), `merge_pdfs` (with page ranges, turns, pictures as pages, contents, page numbers and a lock), `split_pdf` (every N pages, equal parts, ranges, odd and even, extract or remove, bookmarks, blank pages, words, size) and `compress_pdf` (levels, a size, or your own resolution and quality). Every page is compared with the original before a compressed file is handed over.

- **PDF editor:** `organize_pdf_pages` (turn, delete, move, copy, resize, blank pages, other PDFs), `crop_pdf` (hides, never removes), `add_page_numbers` (and Bates numbers), `add_header_footer`, `watermark_pdf` (words or a picture; it marks a file, it does not protect it), `edit_pdf_details` (details, bookmarks, page labels), `list_pdf_form_fields`, `fill_pdf_form` and `verify_pdf_signatures`. Each runs as the editor's own steps, and the file is checked as the editor checks it.

Also `redact_pdf` (words, e-mail addresses, phone and card numbers or shapes taken out for good, checked so no letter stays readable), `find_replace_pdf_text` (in the line's own font), `add_text_to_pdf`, `add_image_to_pdf` and `ocr_pdf` (Tesseract on your computer, from KeepSimp's own files).

Image, animation and audio tools follow.

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
