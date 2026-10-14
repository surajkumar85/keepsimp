# PDF editor: what is left, and how to build it

This is a working brief for whoever builds phases 8 to 10 of the PDF editor. Phases 1 to 8 and phase 9, parts 1 and 2 are live. `AGENTS.md` holds the rules, `docs/pdf-editor.md` says what is built and how, and this file says what is left and the way of working that got the first seven phases shipped without regressions. Follow it step by step. Do not skip the proving steps: every one of them caught a real fault.

## The way of working (do this for every part)

1. **Read first.** `AGENTS.md` (all of the PDF editor bullet), `docs/pdf-editor.md`, and the files named for the part you are building. Read `node_modules/next/dist/docs/` before touching routing.
2. **Start clean.** `git fetch origin && git checkout main && git merge --ff-only origin/main`, then a branch (`editor-forms`). Another session pushes other tools to `main`: fetch again before you put anything on `main`.
3. **Prove the engine before building on it.** Write a throwaway `lib/pdf-editor/zz-probe.node.test.ts`, run it with `npx vitest run <file> --reporter=verbose`, read the output, delete the file. Ask the engine one question at a time. Results must be read back with pdf-lib and pdf.js (`tests/pdf-reader.ts`), never with MuPDF alone.
4. **Pure logic first**, in `lib/pdf-editor/<name>.ts`, with `<name>.test.ts` at 100% of statements and branches. Add the file to the coverage list in `vitest.config.ts`. Everything that arrives from the page or a draft goes through a `read…` function that returns null for anything it does not know.
5. **Engine code** in `lib/pdf-editor/mupdf-<name>.ts`, handed the engine. A change is one step: `inStep(session, label, work, done)` and `canDo("<kind>", fn)` so that undo (which replays steps from the original file) can make it again. Add the kind to the step kinds in `mupdf-edit.ts`, a reader to `draft.ts`, and lines to `report.ts` (with tests).
6. **Engine tests** in `<name>.node.test.ts`: do the change, export with `exportEdited`, check `danglingRefs(bytes)` is empty, read back with pdf-lib/pdf.js, undo and redo, keep a draft and take it up, and try a signed file.
7. **Worker wiring**: request and answer types in `lib/pdf-merger/protocol.ts`, the handler in `pdf.worker.ts`, the call in `client.ts`, then `components/pdf-editor/use-editor.ts`.
8. **UI**: a hook `use-<name>.ts` (other tools put it down, and it puts them down), a layer over the page if needed, a toggle and a row in `toolbar.tsx`. Everything must work from the keyboard and at 320 px. No letter keys are free for shortcuts.
9. **The door**: a catalogue entry with `partOf: "pdf-editor"`, an icon in `tool-icon.tsx`, metadata and components in `app/(workspace)/dashboard/[tool]/page.tsx`, a mode in `pdf-editor.tsx` (`EditorMode`, `DOORS`, `FOCUSED`, abilities), help in `tutorial.tsx`, an article in `lib/tool-blog.ts` + `lib/blog.ts`, an SVG in `public/images/`, a card in `scripts/social-images.mjs` (run it), and `e2e/pdf-page-doors.spec.ts`. Update counts in `lib/catalogue.test.ts` and `e2e/foundation.spec.ts` (search options are 24 now, "pdf" gives 12; each door adds one to both, and the arrow-key loop counts in that test change with them).
10. **Browser tests** in `e2e/pdf-<name>.spec.ts`: real journeys, the download read back with pdf.js, axe in both themes, 320 px, no outside requests. Model it on `e2e/pdf-redact.spec.ts`.
11. **Verify, in this order.** `npm run check` (must end with 100% coverage). `rm -f .next/lock; npm run build`. `npx playwright test e2e/<your spec> --workers=2` on all five profiles. After any toolbar change also run `e2e/pdf-editor.spec.ts`, `pdf-retext`, `pdf-paragraphs`, `pdf-crop`, `pdf-annotator`, `pdf-signer`, `pdf-form-filler`. A test that times out under load is rerun alone before it is believed.
12. **Look at it.** Screenshots at desktop, phone and dark. Then run it on real files (`node scripts/pdf-benchmark-files.mjs <folder>` fetches nine): `qpdf --check`, `pdftotext`, pages you did not touch pixel for pixel what they were.
13. **Ship.** Fetch and merge `main` into the branch, rerun step 11 for what the merge touched, then `git checkout main && git merge --ff-only origin/main && git merge --squash <branch>` and one commit. Push. Wait for the deploy (`gh api repos/surajkumar85/keepsimp/deployments?sha=<sha>`), then check the live page with a real file in Chromium, Firefox and WebKit. Read CI (`gh run list`): the mobile-safari job often fails on unrelated specs; anything else red is yours.
14. **Write it down**: a section in `docs/pdf-editor.md` (what it does, how it is built, tests, limits), the phase list there, a clause in the `AGENTS.md` bullet, and update this file.

Traps that cost time: `get()` on a missing engine object throws (ask with one path, `obj.get("A", "B")`, or check `isDictionary()`); never keep a trailer or a page object across a change; never save the working copy with `garbage`; `page.applyRedactions` applies every Redact mark of a page. Files named `* 2.ts` are iCloud copies: ignore them. If `next build` fails with `ENOTEMPTY`, delete `.next/diagnostics` and build again. Never wait with `pgrep` on your own command. A fault only a phone shows is reproduced in the iOS simulator (`xcrun simctl boot "iPhone 17"`), not guessed at.

Say only what a tool does. If something cannot be done well, leave it out and say so in the limits; never ship a control that pretends.

## Phase 8: make forms (built)

Goal: a person turns any PDF into a form others can fill in, in this editor and in Acrobat, Preview, Chrome and Firefox. Door: **Create a fillable PDF form** at `/dashboard/create-pdf-form/`.

What the probe already showed (MuPDF 1.28.1): the engine has no call that makes a field, but a field written by hand is taken up at once. Make a dictionary with `Type /Annot`, `Subtype /Widget`, `FT` (`/Tx`, `/Btn`, `/Ch`, `/Sig`), `T` (the name), `Rect`, `F 4`, `P` (the page), `DA` (`/Helv 11 Tf 0 g`) and `MK`; push it to the page's `Annots` and to `Root/AcroForm/Fields`; give `AcroForm` a `DR` with a Helvetica font (`doc.addSimpleFont(new mupdf.Font("Helvetica"), "Latin")`) and a `DA`. Then `page.getWidgets()` lists it as text, checkbox, combobox or signature; `setTextValue`, `setChoiceValue` and `update()` work and write the look; pdf-lib and pdf.js read the fields and their values; `qpdf --check` is clean. **Check boxes and round buttons got no look and did not toggle**: write their appearance streams yourself (`AP /N` with `/Yes` and `/Off`, `AS`, and `MK /CA`), and for round buttons one parent field with `Kids`. Prove each of these in a probe first, and read back with pdf-lib (`getCheckBox(...).isChecked()`, `getRadioGroup`).

Build, as parts shipped one at a time:

1. **Built: add, move, resize, rename, delete** text fields (one line, several lines), check boxes, round-button groups, drop-downs and lists, date fields and a place for a signature. Each has a name (unique; offer one), a tooltip (`TU`), required (`Ff` bit 2), a limit of letters (`MaxLen`), and for lists its choices. Fields are the file's own, read by the existing `lib/pdf-editor/forms.ts` and `mupdf-forms.ts`, so the Fill PDF form door must fill what this makes: test that journey end to end.
2. **Order and layout**: tab order (the order in `Annots`, and `Tabs /S` or `/R` on the page: prove which viewers follow which), align, distribute, same size, copy to other pages (a copy needs a new name).
3. **Built: suggest fields**: from the lines and boxes a page draws (a long thin rule or a run of underscores is a text field, a small square is a check box). It is judged by look and will be wrong sometimes: show suggestions to accept or dismiss, never add them unasked.

A date field in other programs is a text field with a format script (`AFDate_FormatEx`). This editor never runs scripts, and its own filling reads that script as text. Decide with a probe whether to write the script so that other programs format the date, and say in the docs what was decided and why. A place for a signature is only a place: nothing here proves who signed.

Limits to state plainly: no calculated fields, no scripts of our own beyond what the decision above allows, no XFA, a list's look is ours.

## Phase 8, part 1: proof and handoff

Built: the Create a fillable PDF form door, eight kinds of ordinary AcroForm field, pointer and keyboard movement/resizing, unique names, tooltips, required flags, text length limits, creation-time choices and multiple-selection lists, logical-field deletion, undo/redo and opt-in drafts. The existing Fill PDF form page fills the downloaded fields. Part 2 (order/layout) and part 3 (suggestions) have not started.

Files: `lib/pdf-editor/form-fields.ts`, `mupdf-form-fields.ts`, their pure and engine tests; `components/pdf-editor/use-make-form.ts`, `form-design-layer.tsx`, `form-design-panel.tsx`, integrated through the editor hook, page layer and toolbar; worker/client/protocol, draft, report and signed export; catalogue, route, icon, help, blog, SVG and social card. A removed radio widget takes its matching `Opt` entry with it in `mupdf-pages.ts`.

The throwaway engine probes were run, independently read and removed before product code. Checkboxes without their own on/off appearances did not read as checked in pdf-lib; own states make both readers agree. A radio parent with `Kids`, matching `Opt` labels and per-choice appearances stays exclusive, including across pages. The fixed ISO date action is recognised as text by the existing date reader and is never executed. Text on a rotated page needs `MK/R` and a fresh appearance; pdf.js reads the flattened letters upright. A later browser check caught immediate Undo removing the field instead of undoing its pending move: gathered moves now register with `editor.onFlush` and finish before undo, another change or download.

Local proof:

- `npm run check`: 134 test files, 2,294 tests, 100% statements/branches/functions/lines for all 134 pure files. Design, format, lint, production build and TypeScript pass.
- Engine form/page/redaction regression run: 47 passes (the new form engine file has eight tests), every exported result read with pdf-lib and pdf.js and `danglingRefs` empty.
- A second production build, then `pdf-create-form.spec.ts --workers=2`: eight journeys, 40 passes across all five profiles, including all kinds through create → download → Fill PDF form → filled download, pending moves on tool switch/undo/download, drafts, axe in both themes, 320 px and no outside requests.
- Older specs: `pdf-editor`, `pdf-retext`, `pdf-paragraphs`, `pdf-crop`, `pdf-annotator`, `pdf-signer`, `pdf-form-filler`, plus `pdf-pages`, `pdf-redact`, `pdf-page-doors` and `foundation`: 422 passes and eight pre-existing device-specific skips, two workers, all five profiles. Screenshots inspected at desktop, phone, 320 px, light and dark.
- Nine real-file cases: eight processed, one XFA refusal, all pass. Each accepted file received all field kinds, a move/resize and a rename, then three different field values through the existing filler. Both readers agree, the 16 written outputs pass qpdf, and dangling references are empty. All untouched pages match in Poppler PNGs at 72 dpi and pdftotext. New appearance labels legitimately add text on the edited page; its original page content is retained.

| File                  | Pages | Untouched pages compared pixel for pixel | Result                                                |
| --------------------- | ----: | ---------------------------------------: | ----------------------------------------------------- |
| `paper-arxiv.pdf`     |    15 |                                       14 | Created, changed, filled; both readers and qpdf agree |
| `form-irs-1040.pdf`   |     2 |                                        0 | XFA refused; zero changes                             |
| `guide-irs-p17.pdf`   |   142 |                                      141 | Created, changed, filled; both readers and qpdf agree |
| `booklet-udhr.pdf`    |    72 |                                       71 | Created, changed, filled; both readers and qpdf agree |
| `report-ipcc-spm.pdf` |    42 |                                       41 | Created, changed, filled; both readers and qpdf agree |
| `scan-archive.pdf`    |   168 |                                      167 | Created, changed, filled; both readers and qpdf agree |
| `album-photos.pdf`    |     6 |                                        5 | Created, changed, filled; both readers and qpdf agree |
| `scan-phone.pdf`      |     4 |                                        3 | Created, changed, filled; both readers and qpdf agree |
| `slides-chromium.pdf` |     4 |                                        3 | Created, changed, filled; both readers and qpdf agree |

Total: 445 untouched pages. The corpus was made with `node scripts/pdf-benchmark-files.mjs /tmp/keepsimp-form-corpus`, using the cached public documents and photographs and freshly generated album, phone scan and slides. The temporary corpus check was removed afterwards; real PDFs, PNGs and reports stay out of Git.

Shipping proof belongs in the completion report: the single commit on main, the matching successful deployment, live journeys in Chromium/Firefox/WebKit on the arXiv paper and UN booklet (plus the IRS XFA refusal), and the matching CI run. Do not claim an unfinished deployment or CI run is green.

Limits: no tab order, alignment, distribution, field copying, suggestions, XFA, calculations, custom scripts, font/style controls or certificate signing. Choice lists and kinds are fixed at creation in this part. A signature field is an empty place, not proof of who signed. New appearances use Helvetica; a list's appearance is ours. Settings list the first 200 visible widgets. Scripts referring to a renamed field are not rewritten. Acrobat and macOS Preview have not been manually checked.

## Phase 9: scans (OCR) and polish

Words are recognised on the device and laid unseen under the picture, so a scan can be searched, selected, marked and redacted by its words. English first; other languages fetched from the site only when chosen and kept out of the offline copy until then (`service-worker/rules.js`). Start with a small proof: which engine (tesseract.js is the obvious candidate; check its licence and size), how long a page takes on a phone, how well the invisible text lines up (measure with `pdftotext -bbox`). Nothing may be uploaded. Then tutorial videos recorded from the real app, a shortcut sheet, and a benchmark on real files in the docs. Door: **OCR PDF**.

### Part 1: built

English OCR with the OCR PDF door: see "Recognising words on scans" in `docs/pdf-editor.md`. What the proof found: our MuPDF build has no OCR ("No OCR support in this build"), so Tesseract runs through tesseract.js 7 (Apache 2.0) in its own worker. Words written as Tesseract writes them (one empty shape for every letter, each word stretched with `Tz`) line up with Tesseract's line boxes within 0.02 pt for nine words in ten (`pdftotext -bbox`), and the page renders pixel for pixel as before. In Node on an M-series Mac a dense letter-size page takes 7 to 8 s at 300 dots to the inch; a phone takes longer. On the benchmark: the phone scan (IRS letter pages, 4 pages) gave 5,364 words at 86 to 89% confidence, all read back from the result, `qpdf` clean, every page the same in Poppler. The archive scan is Alice in Wonderland in Gregg shorthand: most of its pages already carry the archive's own OCR text and are skipped, and the others read at 23 to 33% confidence, which the panel now calls not to be relied on. In Firefox and WebKit, Tesseract let go of in the middle of a page never answers: Stop is raced against the page, never waited for.

### Part 2: built

31 languages: see "Recognising words in other languages" in `docs/pdf-editor.md`. Probe any script you add with a fixture in `tests/fixtures/ocr/` and read it back with pdf.js, `pdftotext` and MuPDF: right-to-left words and scripts written without spaces each needed a change before readers found them.

Next: part 3, tutorial videos recorded from the real app, a shortcut sheet, and the benchmark beside other editors. Earlier notes on part 2 follow.

Earlier: part 2, other languages. Each language is an npm package of `@tesseract.js-data/<code>` (or the tessdata `best_int` files), served by the same route under the versioned folder, loaded only when chosen, and kept by the service worker once used. The font that draws nothing already serves every script; check right-to-left (Arabic, Hebrew) and vertical CJK with pdf.js and `pdftotext` before offering them.

## Phase 10: certificate signatures

Sign with a `.p12`/`.pfx` on the device, with a visible signature or none, and show whether a file's signatures are intact and what changed since. The engine does not sign: prove a way first (a CMS made in the browser, written into a `/Sig` field with a `ByteRange`) and check every result with Poppler's `pdfsig` and `qpdf`. The certificate and its password never leave the device and are never kept. This is the only signature that may be called a certificate signature; the drawn one from phase 3 stays "a mark on the page".

## When a part is done, report

What was built, which files, the test counts, what was checked on the live site and with which real files, what CI says, and what is not done or not checked. If something failed, say so with the output.

## Phase 8, part 2: built

Picking several fields, lining up, spacing evenly, one size, tab order (with "By rows") and copying to other pages: see "Laying out form fields" in `docs/pdf-editor.md`. Part 1's empty text fields, dates and drop-downs had no look of their own and were invisible in Preview and in print; that is mended. When you check a form, render it with `qlmanage -t -s 700 -o . file.pdf` (macOS's own engine) as well as Poppler: Poppler draws missing looks itself and hides that fault.

## Phase 8, part 3: built

Suggested fields from rules, boxes, squares and underscores: see "Suggesting form fields" in `docs/pdf-editor.md`. The engine's structured text with the `vectors` option gives every path's box, whether it is stroked, whether it is a rectangle and its colour; a `Device` of our own made the WASM engine fail ("memory access out of bounds") when it was collected, so do not write one. Judge a page as it was written (the inverse of `page.getTransform()`), or a turned page gives nothing.

Next is phase 9, OCR.
