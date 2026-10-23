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
# The first start downloads the bridge and a browser; transcribing can take minutes.
startup_timeout_sec = 120
tool_timeout_sec = 300
```

Any other client: run `npx -y keepsimp-mcp` as a stdio server.

Then ask in plain words: "merge a.pdf and b.pdf", "split book.pdf at its bookmarks", "format data.json with sorted keys", "check the contrast of #777 on white", "find the main colours of logo.png".

## The tools

The bridge asks the KeepSimp page which tools there are, so the list is always the site's own. Today:

- **JSON:** `format_json`, `repair_json`, `transform_json`, `query_json` (JSONPath and JSON Pointer), `validate_json` (JSON Schema), `compare_json`, `patch_json`, `convert_json` (YAML, CSV, JSON Lines, TypeScript, JSON Schema), `inspect_json` (counts, search, the tree) and `json_table`. Numbers keep their exact digits.
- **Colour:** `convert_color`, `check_contrast` (WCAG 2, ΔE2000, colour-vision previews), `make_palette` (also as a PNG strip), `mix_colors`, `make_gradient`, `brand_colors`, `colors_from_image` and `pick_image_color`.

- **PDF:** `pdf_info` (facts, bookmarks and text), `merge_pdfs` (with page ranges, turns, pictures as pages, contents, page numbers and a lock), `split_pdf` (every N pages, equal parts, ranges, odd and even, extract or remove, bookmarks, blank pages, words, size) and `compress_pdf` (levels, a size, or your own resolution and quality). Every page is compared with the original before a compressed file is handed over.

- **PDF editor:** `organize_pdf_pages` (turn, delete, move, copy, resize, blank pages, other PDFs), `crop_pdf` (hides, never removes), `add_page_numbers` (and Bates numbers), `add_header_footer`, `watermark_pdf` (words or a picture; it marks a file, it does not protect it), `edit_pdf_details` (details, bookmarks, page labels), `list_pdf_form_fields`, `fill_pdf_form` and `verify_pdf_signatures`. Each runs as the editor's own steps, and the file is checked as the editor checks it.

Also `draw_on_pdf` (boxes, ellipses, lines, arrows, freehand, covers, stamps, call-outs, measuring lines, text, ticks and crosses), `list_pdf_comments` and `comment_on_pdf` (highlights, underlines, strike-outs, notes, pen strokes, replies; comments drawn in or left out), `read_pdf_page_content`, `edit_pdf_text` (the page's own lines and paragraphs, in their own font or one of yours), `edit_pdf_pictures` (move, resize, turn, cut, replace or take out), `edit_pdf_links`, `suggest_pdf_form_fields`, `create_pdf_form_fields` and `edit_pdf_form_fields` (make a fillable form: every kind of field, laid out and put in order), `redact_pdf` (words, e-mail addresses, phone and card numbers or shapes taken out for good, checked so no letter stays readable), `find_replace_pdf_text` (in the line's own font), `add_text_to_pdf`, `add_image_to_pdf` and `ocr_pdf` (Tesseract on your computer, from KeepSimp's own files).

- **Images and animation:** `image_info`, `compress_image` (measured so the difference cannot be seen, or to a size), `resize_image` (sizes, presets, sets of widths), `convert_image` (to JPEG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO or PDF, several images into one PDF) and `convert_animation` (GIF, WebP, APNG and short videos to GIF, WebP, APNG, MP4, WebM, frames or a sprite sheet, or stills into one).

- **Audio:** `audio_info` (facts, tags and loudness), `convert_audio` (MP3, M4A, Opus, FLAC, WAV or M4R, gapless, or a video's sound copied out), `edit_audio` (trim, cut, silence, fade and volume, an equaliser and a compressor), `make_ringtone`, `normalize_audio` (to −14 LUFS or another loudness, a peak, or louder, never clipping), `change_audio_speed` (speed, pitch, channels, reverse, karaoke), `remove_background_noise` (RNNoise, hum, clicks), `edit_audio_tags` (in place, with a cover), `split_audio` (every N minutes, N parts or at pauses), `join_audio` (with a gap or a crossfade, and chapters), `transcribe_audio` (Whisper on your computer: text, SRT and VTT) and `audio_to_video`. Every result is decoded again and checked.

- **Video:** `video_info`, `compress_video` (to a size in MB or a share, never handed over larger) and `convert_video` (MP4, WebM, MOV or MKV; the picture copied as it is wherever nothing has to change, or encoded with your browser's own encoders for a quality, size, frame rate, codec or turn; sound kept in step). Every result is opened again and checked.

Signing a PDF and recording stay for you to do yourself.

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
