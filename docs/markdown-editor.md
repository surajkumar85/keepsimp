# Markdown editor

One tool, the Markdown editor, for writing and converting Markdown on the device. Nothing is uploaded; files are opened, saved and exported locally. Later pages for one job (Markdown to HTML, Markdown to PDF, Markdown to Word, HTML to Markdown, Word to Markdown, a table maker) are doors into it (`partOf`), never cards of their own.

## Research

Sources were read on 24 October 2026; the numbers are measurements made for KeepSimp unless a link says otherwise.

- What people keep asking of Markdown editors: raw Markdown as the base, a split view whose two sides stay in step, clicking the preview to land in the source, help with tables, GitHub's shortcuts and buttons that insert Markdown ([DEVONthink](https://discourse.devontechnologies.com/t/dtp4-markdown-split-view/84203), [Joplin](https://discourse.joplinapp.org/t/3-editor-options-instead-of-2-markdown-split-wysiwyg/49971), [Stacker News](https://stacker.news/items/118003), [GitHub's writing guide](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax)).
- Editors that hide the markup (Obsidian's live preview, Bear) are liked for reading but jump as markers appear and stumble in tables and on iOS ([Obsidian forum](https://forum.obsidian.md/t/markdown-formatting-characters-in-live-preview/50439), [Bear forum](https://community.bear.app/t/will-hiding-markdown-symbols-be-optional-in-bear-2/9832)); editors built on a rich-text model change the file on a round trip ([Tiptap](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap)). So the text is the truth here: the file is kept byte for byte unless a change is asked for, source and preview are the default, and a preview inside the source is a later, optional mode.
- Parsers: markdown-it and micromark pass the same CommonMark 0.31.2 examples; marked misses more and does not sanitise ([markdown-it](https://github.com/markdown-it/markdown-it), [micromark](https://github.com/micromark/micromark), [marked](https://github.com/markedjs/marked)). A 1 MB document renders in 74 ms with markdown-it and about a second with micromark or unified on a laptop, so markdown-it draws the preview. Its HTML always goes through DOMPurify.

## Rules

- The text in the editor is the document. The preview, exports and copies are made from it; nothing is written back unless the person asks (a toolbar button, a table tidy, a format).
- Every way HTML leaves the renderer (preview, HTML export, clipboard, anything imported) goes through DOMPurify; links are kept only for `http`, `https`, `mailto`, `tel` and `#`. Raw HTML in a document is allowed but cleaned. Nothing in a document runs.
- Remote images in a document would be fetched by the preview; a switch stops that, and the privacy page says so.
- Nothing of a document is kept on the device unless the "Keep a draft on this device" switch is on. Leaving the page with unsaved changes asks first.
- Ctrl/Cmd+K inserts a link while the editor has focus, as in every Markdown editor; the site's search keeps it everywhere else. The editor's keys are listed once, in `lib/markdown/shortcuts.ts`, which the help is made from.
- Heavy parts load only when used (maths, diagrams, Word) and are kept by the service worker once used.

## Phases

Part 1 of phase 1 shipped on its own. At the user's request (24 October 2026) the rest was built together and tested once, then shipped.

1. **The core.** Part 1: the editor (CodeMirror 6 with GFM highlighting, list and quote continuation, GitHub's keys, pasting a link over a selection, find and replace), a toolbar that inserts Markdown, three views (write, split, preview), the preview (GFM tables, task lists, strikethrough, autolinks, footnotes, GitHub alerts, heading anchors by GitHub's rules, front matter shown as a table, optional smart typography), opening and saving files (in place where the browser allows, a download elsewhere), and export to `.md`, self-contained `.html` and print to PDF. Part 2: the two sides kept in step while scrolling and clicking the preview to find its source, an outline, counts (words by `Intl.Segmenter`, characters, reading time), copying as rich text for email and documents, pasting rich text and tables as Markdown, a table tidier, drafts behind their switch, the blog article, and agent tools to turn Markdown into HTML.
2. **Rich content.** Maths (KaTeX), diagrams (Mermaid, strict), code highlighted in the preview with the editor's own parsers, pictures pasted or dropped kept with the document and carried by exports.
3. **Conversions and doors.** Word export and import, HTML import, and the doors: Markdown to HTML, to PDF, to Word, HTML to Markdown, Word to Markdown, Markdown table maker; agent tools for each.
4. **Writing help.** A document check (markdownlint with fixes, links to missing headings, pictures without words), a table of contents kept between markers, focus and typewriter modes, a preview inside the source (optional), a readability estimate for English, templates and a cheat sheet.
5. **Many documents.** Tabs, versions with a diff, tidying with Prettier shown as a diff first, slides from `---`, a folder opened in place with relative links checked, opening `.md` files from the installed app.

## Shipped

- Phase 1, part 1 (24 October 2026): the editor, toolbar, keys, three views, the preview with GitHub's additions and front matter, files opened and saved on the device, export to Markdown and HTML, print to PDF, copying as rich text, counts, the blog article and the browser tests. Pressing Enter on Android is read by CodeMirror from what a real keyboard changes, which Chrome's phone emulation does not send, so the keyboard test is skipped in that profile only.
- Phases 1 (part 2) to 5 (24 October 2026), as below.

## How it is built

- **The page** (`components/markdown/`): `markdown-editor.tsx` lays out the tabs, the bar (name and state, the view, Open, Save, Export and More), the toolbar, the source and preview, one side panel at a time and the counts. `use-documents.ts` holds the open documents (text, name, saved text, file handle, pictures, versions) and the draft. `markdown-source.tsx` is CodeMirror: one `EditorState` per document, so each tab has its own undo history and place; Markdown with front matter as YAML (`yamlFrontmatter`); the editor's keys; pasting and dropping (pictures kept, formatted text made Markdown when it carries formatting, spreadsheet cells made a table); typewriter scrolling and the optional quiet marks (`hide-marks.ts`).
- **The preview** (`preview.tsx`) is drawn at once from `renderMarkdown`, then filled in by `enrich.ts`: maths by KaTeX as MathML (`output: "mathml"`, `trust: false`, a bounded `maxExpand`), diagrams by Mermaid in `securityLevel: "strict"` with SVG labels, cleaned by `cleanSvg` (SVG only, its own styles kept, no `foreignObject`, links, images or scripts), and code coloured with CodeMirror's own parsers (`highlightCode`, `classHighlighter`). KaTeX, Mermaid and the language parsers load only when a document needs them. Results are kept by what they were made from, so typing elsewhere draws nothing again.
- **Scrolling together** (`lib/markdown/scroll.ts`): every block of the preview says its source line; a place between two blocks is the same share of the way on both sides. Each side ignores the scroll it was just given. A double click in the preview goes to its line; a task's box ticked there is ticked in the text (`toggleTask`), the only change the preview makes, and as one step to undo.
- **Files**: Markdown is opened as it is; Word (`from-word.ts`, mammoth) and HTML (`from-html.ts`, Turndown with KeepSimp's rules) are made into Markdown in a new tab that is not saved yet. Save writes in place where the File System Access API allows (and to a folder's own file), and downloads elsewhere. A version is kept on each save.
- **Exports** (`export.ts`): a web page with its pictures as `data:` addresses and its maths and diagrams drawn, in the light theme; a Word file (`to-word.ts`) with pictures measured on the page and WebP, AVIF and SVG drawn into PNG, and diagrams drawn into PNG at twice their size; a ZIP of the Markdown with its `pictures/` beside it; printing from a frame of its own; rich text copied during the press, as Safari asks.
- **Writing help**: the outline and `insertToc` (markers `<!-- toc -->` and `<!-- tocstop -->`); the check (`check.ts`, markdownlint with long lines, HTML, bare addresses and a front-matter title as a heading left out, its fixes applied until none is left) and the readability estimate (`readability.ts`, Flesch reading ease, English only); Prettier's tidying (`tidy.ts`) shown as a diff first; templates; the cheat sheet (F1) made from `SHORTCUTS`.
- **Many documents**: tabs; versions (`VersionsPanel`, a unified diff by `@codemirror/merge`); slides (`slides.ts`, `Presenter`, which grows in and never fades in); a folder (`showDirectoryPicker`, its Markdown files listed, pictures a document names read from beside it, links to files missing from it found by the check); the installed app opening `.md` files (`file_handlers` in the manifest, `launchQueue`).
- **Drafts** (`draft.ts`, `draft-store.ts`): only while "Keep a draft on this device" is on, in IndexedDB; read back through `readDraft`, which takes nothing it does not recognise; at most 20 documents, 50 versions each and 200 MB, and the page says when a draft grows past that. Turning the switch off deletes it.
- **Doors** (`doors.tsx`): Markdown to HTML, to PDF, to Word, HTML to Markdown, Word to Markdown and the table generator, each a catalogue entry with `partOf: "markdown-editor"`, its own title, help, article and one button above the editor.
- **Agents** (`lib/agent/markdown.ts`): `markdown_to_html`, `markdown_to_word`, `html_to_markdown`, `word_to_markdown`, `markdown_table`, `check_markdown` and `tidy_markdown`, made by the same code, with the page's drawing and Word file handed in.

## Limits, said where they apply

- Maths stays as its TeX in Word files; diagrams are pictures there.
- PDF page breaks follow the browser's support for `break-after` and `break-inside`; page numbers and margins are the print dialog's.
- The readability estimate is for English and is a guide.
- Links are checked only within the document and an open folder; nothing is asked of the network.
- Folders, saving in place and opening from the installed app need Chrome or Edge on a computer; other browsers open files and download copies.
