# PDF editor

Changes PDFs in the browser. Nothing is uploaded: the file is opened, changed, drawn and written by MuPDF as WebAssembly in the worker the other PDF tools use. Live at `/dashboard/pdf-editor/`, and at `/dashboard/pdf-annotator/`, which is the same editor opened for marking up and commenting.

The editor is built in ten phases, each shipped before the next begins. **Phases 1 and 2 are built:** the workspace and adding things to pages; comments; and stamps, call-outs and measuring lines. The plan for the rest is at the end.

## What it does (phase 1)

- **Open** one PDF: drop, picker, paste or the sample. A locked file asks for its password; a damaged one is repaired where possible, and the file's card says so. What is not a PDF, or cannot be opened for editing, is refused with the reason. One file is edited at a time.
- **The editor's window** is the reader's window (`docs/pdf-reader.md`) with two rows added under its bar: the tools, and the look of what is selected. It has the reader's column of pages, zoom, strip of small pages, bookmarks and search. Each row is one line that scrolls sideways where it does not fit, so the pages under it never jump when the selection changes.
- **Tools:** select (V), text (T), box (B), ellipse (O), line (L), arrow (A), draw (D), cover (C), and a button that adds a picture (PNG, JPEG, WebP, AVIF, GIF, BMP; also by pasting). After a thing is made, the selection tool is in hand again and the thing is selected.
- **Every thing** can be moved, resized by eight handles (text by its two sides, lines by their ends), turned by a round handle (settling on every eighth of a circle when it comes within four degrees), duplicated, copied, cut and pasted, brought forward or sent back, and deleted. Guides show where it lines up with the page or another thing, and it snaps there.
- **Text boxes:** three families that ship with the site (Liberation Sans, Serif and Mono; SIL Open Font License), each with bold and italic, a size from 4 to 288 points, a colour, and alignment. The first line starts at the point that was clicked and has that point at half its height. Enter or a double click opens a box again; an emptied box goes away.
- **Looks:** nine colours, "none" for a shape's edge or inside (never both), four thicknesses, and how see-through a thing is. A look chosen while a tool is in hand is the look of what the tool makes next.
- **Cover** is a filled box, white unless another colour is chosen. The bar, the help and the article all say that it only covers: the words under it stay in the file. Redaction is phase 7.
- **Undo and redo** for everything, back to the file as it was opened. The buttons say what they would undo ("Undo: Move box").
- **Keyboard:** Tab reaches every thing on a page (each is a button with a name: "Text box: Dear Ada", "Arrow"); arrows nudge by one point, ten with Shift; Delete removes; Ctrl or ⌘ with C, X, V, D, A, Z, Shift+Z; `[` and `]` change the order; Enter types in a text box; Escape puts the tool down, then lets go of the selection, and only then closes the window.
- **Touch:** a finger on a thing takes hold of it; on empty paper it scrolls. With a tool other than select, the page does not scroll under the finger, so it can draw. Handles are larger where a finger is the pointer.
- **Download** writes the file, checks it and hands it to the browser. Behind the window, the tool's page has the file's card (with the page that was being read, as the file now has it) and the download card:
  - **Keep what you added editable.** Off, what was added becomes part of the page. On, it stays as separate things that the editor reads back when the file is opened again; other apps show them as stamps.
  - **Password**, with the shared lock fields (`components/pdf/lock-fields.tsx`). A file that came with a password keeps it unless a new one is set.
  - **The check** (below), the size, "Download again" and "Read the result".
- **Leaving:** the browser asks before a tab with changes that were not downloaded is closed, and "Close the file" asks in the page. A download makes the file "saved" at that point in its list of changes; a change, an undo or a redo after it makes it unsaved again.

## Comments (phase 2, first part)

Two families live on a page. **Things** (text boxes, pictures, shapes) become part of the page on download. **Comments** are the PDF's own kinds of note: other programs show them as comments, and the ones a file comes with are read the same way.

- **Marks on words:** highlight (H), underline (U), strike out (S) and squiggle (W). With the tool in hand, a drag across words marks from the word it began on to the word it ended on, through every line between, as text is selected; a press marks one word. A drag over empty paper marks nothing, and the bar says why ("No words there. On a scanned page, mark with the highlighter pen.").
- **Highlighter pen** (P): a wide see-through stroke drawn by hand, in three thicknesses, for scans and for what is not text.
- **Notes** (N): one press places the icon; the list of comments opens with the note ready to be typed. A note is dragged to move it.
- **The list of comments** is a panel beside the pages (over their lower part on a phone), opened by the button that shows how many comments there are. Page by page, each comment has its kind and colour, who wrote it and when as far as the file says, the words a mark lies on, its own words (typed in place, saved when the field is left), its replies, a field to reply, and a button to delete. Pressing a comment takes the pages to it. A field finds comments by their words, their replies, the words they mark or their author.
- **Your name** is typed once in the list and signs what is made from then on. It is kept in `localStorage` on this device only (`keepsimp.comment-author`); empty, comments are not signed.
- **Comments a file comes with** are listed with the new ones and can be read, answered, given other words and deleted. Marks on words, notes and pen strokes can be given another colour. Any other kind (a stamp, a call-out, a shape from another program) is shown and answered, and keeps the look it came with.
- **Picking:** a press on a comment picks it (a dashed frame), and the second row of the bar offers delete, "show in the list" and colours. Delete removes it, Enter opens its words in the list, Escape lets go. One thing is in hand at a time: picking a comment lets go of a selected thing, and the other way round.
- **Download** asks what becomes of comments when the file has any: **kept as comments** (the usual), **part of the page** (drawn in for good; a note keeps its icon and its words are no longer shown), or **left out** (also the ones the file came with).
- **The annotator** (`/dashboard/pdf-annotator/`, `mode="annotate"`) is a door into the editor, not a second tool. It opens with the highlighter in hand and shows the tools for marking up alone (the marks, the pen, notes, select and the list of comments); "All tools" brings the rest for as long as the file is open, and a tool taken in hand by its key shows them too. It has its own title, description, help and article.

### How comments are built

- `lib/pdf-editor/comments.ts` is the pure part: what a comment is, `selectWords` (from two points and a page's letters to a box for each line's run of words), `wordsUnder`, and `readCommentOp`, which checks every change the page asks for before it reaches the file.
- `lib/pdf-editor/mupdf-comments.ts` touches the engine: `lettersOn` (every letter of a page with its box, in the page as it is shown), `commentsOn` (the comments of a page, each with its replies; a reply to a reply is listed under the comment the talk began with) and `applyComments`.
- **A comment is known by the file's own number for it** (`c16`), which stays the same while the file is open, also across undo and redo: the working copy is never tidied, and the same steps made again on a fresh copy give the same numbers.
- **A change to comments is a step in the same list** as everything else (`inStep`), so undo and redo run through comments and things alike.
- **Marks are given their look by the engine** (`update()`), the way the format says, so other programs draw the same thing. **A reply is given an empty look,** set last: it is read in the talk it belongs to and draws nothing on the page. Dates are written by us; the engine writes none.
- **Only the kinds the editor makes are given a new look.** A change to another program's stamp or call-out sets its words and nothing else, and never calls `update()` on it.
- **Annotations are taken off a page one at a time, from a fresh list each time** (`takeAway`). Removing a note takes the window it opens in along, which changes the list the others were found in; a second removal from the old list silently does nothing.
- **Drawing comments into the page** uses the same routine as the editor's things (`flatten(session, doc, "comments")`), not the engine's `bake`, which takes every annotation of a file at once, the editor's kept-editable things included. A comment that is hidden is not drawn. Flattened and unflattened pages differ by at most two parts in 255, from rounding where a mark is blended in.
- **The check** counts comments in the result: all of them when kept, none when drawn in or left out. A page that only got a comment is known from the list of steps and is not compared with the original as if it were untouched.
- On the page, `use-comments.ts` holds the tool in hand, the comment that is picked and the list; `comment-layer.tsx` lays a button over every comment and draws the frame of the picked one and what a drag would take in; `comments-panel.tsx` is the list. Comments are not shown before the file has answered: they are whatever the file says its pages hold.

## Stamps, call-outs and measuring lines (phase 2, second part)

These three are **things**, like text boxes and shapes: they are moved, resized, restyled and undone the same way, become part of the page on download, or stay movable with "Keep what you added editable".

- **Stamp** (K): a word or two in capitals inside a rounded frame. The bar offers six usual ones (Approved, Draft, Final, Confidential, Paid, Void) and a field for words of one's own, which are taken when the field is left, as one step. A click places a stamp of a usual size; a drag makes one of any size. It has eight handles and turns. The frame's thickness and the size of the letters follow the stamp's size (`stampWeight`, `stampLayout`). The words are real text, set in Liberation Sans Bold. A stamp that is a picture is the picture tool.
- **Call-out** (Q): a text box with a white frame and an arrow to a point. The pointer goes from what is pointed at to where the words go, and the box is typed straight away; a click puts the words up and to the right. It is a `TextObject` with a `tip`, so typing, fonts and looks are the text box's. The line leaves the frame at the place nearest the point (`calloutLine`). Moving the box leaves the point where it is; the round handle at the point moves the point and leaves the box. A call-out does not turn. It takes the colour of arrows and lines, for its words, frame and arrow alike.
- **Measuring line** (R): a line with a mark across each end and its length written over its middle, turned with the line and never upside down (an upright one is read from below). Units: mm, cm, m, in, ft, pt. A scale of N measures a drawing made at one to N. The label is worked out from the ends each time the line is drawn (`measured`), so it cannot disagree with the line. It is a line for every purpose of the tools (`isLine`): two ends, no turning handle.
- **Fonts:** a stamp needs the bold sans and a measuring line the regular sans, whether or not any text box uses them. `fontsFor` says which fonts a thing is drawn with; the page loads them before a change is sent, and the download counts such pages among those whose fonts are cut and checked.
- **Handles** are now "grips" (`Grip`): one of the eight handles, or `tip`. `handleSpot` says where each is, for the tools and the screen alike.

## Signing, dates and ticks (phase 3, first part)

A signature made here is **ink on paper**: it shows that a page was signed. It is not a certificate signature, which proves who signed and that nothing changed since (phase 10), and the window, the help and the article all say so.

- **The signature window** (G, or the Sign button; `components/pdf-editor/signature-dialog.tsx`) makes a **signature** or **initials** in one of three ways, in black or blue ink:
  - **Draw** on a pad with a mouse, a pen or a finger. The strokes are fitted into the size a signature is placed at, in proportion (`fitStrokes`), and placed as a drawing.
  - **Type** a name in one of four fonts that look written by hand (Great Vibes, Sacramento, Kalam, La Belle Aurore). It is placed as a text box, so it is real text in the file, in a font cut to its letters. The four have one style each: `fontKey` gives the family alone, and a text box in one of them ignores bold and italic.
  - **Picture:** a photo or scan of a signature on light paper. `inkOnly` takes the paper out: the brightness that 60% of the picture is no brighter than is the paper, the darkest 1% is the ink, and the shades between become see-through in proportion, so the edges stay smooth and the ink keeps its colour. The result is cut to the ink (`seenBox`) and placed as a picture. A picture with no difference between paper and ink is refused, with the reason.
- **Remembered only when asked.** The switch "Remember this signature on this device" is off each time the window opens. Switched on, the signature (or the initials, separately) is kept in the browser's `localStorage` under `keepsimp.signature` and `keepsimp.initials`, offered the next time, and removed by "Forget it". It is never sent anywhere. What is read back goes through `readSignature`, which trusts it no more than a file; a picture larger than `LARGEST_REMEMBERED` is used once and not kept.
- **Today's date** is placed with one press, as a text box in the look that text has, written the way the device writes dates.
- **Tick or cross** (X): a click places a tick, a cross or a dot, and the tool stays in hand for the next box of the form. They are drawings (`checkMark`), so they need no font.
- **Where things land.** A signature, a date and a picture are placed in the middle of the part of the page that can be seen (`seenMiddle`), selected, to be dragged into place. A page is often taller than its window, and the middle of the whole page would be out of sight.
- **The window is a window of the editor's window.** It is rendered inside the reader's own tree (in the toolbar slot). Beside it, the reader's window would hide it from screen readers; the browser tests look for its controls by role for that reason.
- **Sign PDF** (`/dashboard/sign-pdf/`) is a door: the editor opened with the signature window ready and only the tools for filling in a page (select, text, tick or cross, sign, date). The rest are behind "All tools".

## Form fields (phase 3, second part)

A form's fields are **the file's own** and stay fields. Filling one in is a step in the same list of changes as everything else, the page is drawn again from the file, and the engine writes how the filled field looks, so other programs show the same and can fill it in again.

- **Reading** (`fieldsOn` in `lib/pdf-editor/mupdf-forms.ts`): every place a page has to fill in, as a `FormField`: its kind (text, check, radio, choice, list, signature, button), name, a label for people (the file's hint, or its name made readable by `labelOf`), its box as the page is shown, what it holds, its options as kept and as shown, and whether it is required, read-only, multi-line, a password, a comb, limited in length, a list that takes several, a drop-down that takes other words, or a date. Hidden places are left out. A field shown in several places is one `FormField` for each.
- **The controls** (`components/pdf-editor/field-layer.tsx`): a real control lies over each field, seen through until it is in use, so what is shown at rest is the file's own picture of the field. They are in the order `inOrder` gives (along a row, then down), which is the order Tab goes. They take presses only while nothing is being drawn, dragged or typed: with a tool in hand, a press over a field is the tool's.
- **Filling in** (`applyFields`): text and drop-downs through the engine (`setTextValue`, `setChoiceValue`), ticks and round buttons with `toggle`, a list by writing `/V` (one string or several) and dropping `/I`. `accepts` decides what a field takes: no line breaks in a line, no more letters than its limit, only what a list offers. A change that changes nothing is not a step.
- **Every place of the field is given its new look**, on whichever page: a round button that went off, a name repeated on each page. `pagesOf` finds them through the field's `/Kids` and their `/P`.
- **A list is drawn by us** (`drawList`, `listRows`): the engine writes no appearance for a list box and would leave it blank. Options one to a line, the chosen ones on a tinted bar, in the built-in Helvetica; set last with no `update()` after, turned with a turned page. Text, ticks and drop-downs are the engine's.
- **Dates:** a field whose format script is `AFDate_FormatEx("…")` or `AFDate_Format(n)` is offered as a date control, and the day is written in that format (`dateFormat`, `writeDate`, `readDate`). The script is read as text and never run. A format without a day, month and year, or with a time, is typed like any other field.
- **What is missing:** `unfilled` lists the required fields that are empty (round buttons of one name once, a repeated field once), `formLine` says so above the page, and "Go to the next one" sends the reader to the page and puts the keyboard in the field. Nothing stops a download with fields empty.
- **Typing is put into the file** when a field is left or Enter is pressed. Escape gives the field back as it was and does not close the window. Download leaves a field that is still in use first, so that what was typed last is in the file.
- **On download** (`fields` in `ExportOptions`): kept as fields, or drawn into their pages with the engine's `bake(false, true)`, which is all fields at once, as is wanted. The written file is opened again and its fields compared by name with what the working copy held (`formOf`); the check says how many read back, or that none is left.
- **What a file's form is** (`formFacts`): how many places, whether it has an XFA part (said when the file is opened: with ordinary fields too, they are what is filled in; without, the pages can only be typed on), and whether a script works fields out (`/CO`; said too, since nothing is run).
- **Fill PDF form** (`/dashboard/fill-pdf-form/`) is a door with the tools for filling in (select, text, tick or cross, sign, date). Its sample is a form (`public/samples/keepsimp-form.pdf`, made by `npm run samples:pdfs`).

## Rows of boxes (phase 3, fifth part)

A paper form often has a row of boxes for a postcode or a number, one letter to a box. A text box with `comb` set (2 to 60) is one line whose letters are spread over that many boxes of equal width, each in the middle of its own (`combLine`, `combStarts` in `text-layout.ts`). The number is a part of a text box's look ("Boxes" in the bar, 0 for ordinary text), remembered for the next box like the font; the box's two side handles fit it to the row on the page. A call-out takes none. While it is typed, the browser sets the letters a box apart by a figure's width, which is close; the page shows them exactly once the file has them, since it is drawn from the file. `comb.test.ts` (100% with the other unit tests), `comb.node.test.ts` (each letter's place read back with pdf.js) and a journey in `e2e/pdf-form-filler.spec.ts`.

## Signed files (phase 3, third part)

A digital signature covers the bytes of the file as it was signed. A file that is written anew has other bytes, and the signature no longer holds. Written **after** the file, the signed part is still there byte for byte.

- **`exportAfter`** (`lib/pdf-editor/mupdf-signed.ts`): the steps in force are made again on a fresh copy of the file as it came (`madeAgain`), and that copy is saved with the engine's `incremental` option, once, and let go. The engine can write a file this way only once for each time it opens one (a second time, after an undo, it wrote a damaged file), so the working copy is never written so.
- **Nothing else is done to the file:** fields stay fields, comments stay comments, added things stay the stamps they are, fonts are not cut, nothing is tidied, no lock is set. The page hides those choices while "Keep it valid" is chosen.
- **The check** reads the written file: it must begin with the file as it came, byte for byte (`signature.intact`), and its fields must hold what the working copy holds. Before anything is written, the fresh copy must hold what the working copy holds, page for page.
- **What a program that checks signatures will say:** that the signature is valid and that the file was added to after it. Filling in fields and commenting are the changes such programs expect; stamps are annotations too, but a file whose author allowed no changes at all will be reported as changed. The page says so.
- **When it cannot be done** (`canWriteAfter`): a file that had to be repaired cannot be added to. The page then says that a changed copy no longer counts as signed, as before.
- **Tests:** `tests/pdf-signing.ts` makes a truly signed file (pdf-lib writes it, `@signpdf` signs it with a certificate made on the spot) and `readSignature` works out with node-forge, not with the engine, whether the signature still holds and whether it covers the whole file. `signed.node.test.ts` and `e2e/pdf-signed.spec.ts` (five profiles) check both ways of downloading, again and again with undoing in between. Poppler's `pdfsig` agrees when run by hand.

## Drafts (phase 3, fourth part)

Nothing is kept unless a switch is turned on: "Keep a draft on this device", off by default, on the tool's page and beside the open file. On, unfinished work survives a closed tab.

- **A draft is the file as it came and the list of steps** (`EditSession.steps`), with the pictures that were placed. That is all the editor needs: taking a draft up opens the file and makes the steps in force again (`takeUp`, which is `madeAgain` on a fresh session). The undo list comes with it, the undone steps too.
- **Where it is kept** (`lib/pdf-editor/draft-store.ts`): IndexedDB, database `keepsimp-drafts`, in this browser only. The file and each picture are kept as bytes, not as files: WebKit keeps no files there in a private window. The steps are written again a moment after every change (`use-draft.ts`); the file is written once, when the first change is made, so a file that was only opened replaces no draft. One keeping follows another, since two at once could clear what the other had just kept.
- **One draft at a time,** of the file that was last changed with the switch on. Files over 50 MB are not kept (`DRAFT_LIMIT`), and the page says so. When the browser will not keep it (no room, or a window that keeps nothing), the page says that too.
- **What is read back is trusted no more than a file** (`readDraft` in `lib/pdf-editor/draft.ts`): every step goes through the checks a change from the page goes through (`readOp`, `readCommentOp`, `readFieldOp`), in the page and again in the worker. What is not a draft is not offered.
- **The page:** a card "Unfinished on this device" with the file's name, how many changes are in force and when it was kept, and two buttons: Take it up, Throw it away. The line beside the open file says "Keeping a draft…" until the file as it now stands is really kept; only then does the browser stop asking before the page is left.
- **When it goes:** closing the file for good, throwing it away, turning the switch off, or beginning a draft of another file. A download does not remove it.
- **A locked file** is kept locked and asks for its password again when it is taken up. No password is kept.
- **The privacy page** (`app/(marketing)/privacy/page.tsx`) lists everything the editor can keep on the device: the name comments are signed with, a remembered signature, and a draft.

## One editor, several doors

There is one PDF editor. The annotator, Sign PDF and Fill PDF form are **doors**: each is a catalogue entry with `partOf: "pdf-editor"`. A door has an address, a title, a description, written help and an article of its own, is in the sitemap and the offline copy, and is found by the search in the header. It is not a card on the tools page, not counted in the sidebar and not an app shortcut (`listed` in `lib/catalogue.ts` is the tools without their doors), and the article that goes through every tool names it under the editor. Each page says what it is and links to the other.

A door must be **focused**: it shows the tools of its job and puts the others one press away. A door that offered everything the editor does was a second copy of the editor in the list, which is what this replaced. The doors planned for later phases (Redact PDF and the rest) are made the same way.

## How it is built

### The document is the truth

The worker holds a **working copy** of the file. It is opened as it is (`openPdf(..., untouched)`), not through the merger's `prepare`, which rewrites pages. Every change the page asks for is made in that document, and the page is drawn again from it. There is no second model of the document on the page that could drift from the file.

- **One change is one step** (`inStep`): it is made inside one operation of MuPDF's journal (`beginOperation`, `endOperation`), so a change that fails is taken back whole, and it is listed in `EditSession.steps` as what was asked for (`Done`), what it is called and the pages it changed.
- **Undo makes the working copy anew.** `stepBack` opens the file as it came and makes the steps still in force again, in order (`madeAgain`); redo makes the next step again on the working copy as it is. The engine's own `undo()` is never called. The engine remembers where in a file it has put each font and picture, and its undo takes them out without its forgetting: the next text in that font, or the same picture placed again, pointed at an object that was gone, the engine read its own result without noticing, and other programs showed the text without its font. A fresh copy remembers nothing. An undo after 300 steps takes about 70 ms; the cost grows with the number of steps, not with the size of the file. A step that fails is followed by the same remaking, for the same reason.
- **Each module that makes changes says how its kind is made again** (`canDo`), so a step can be made again whichever module made it first. The worker is told when the working copy has become another document (`moved`), since the reader draws from the same one.
- **Things that are added are Stamp annotations while editing.** Each has an appearance the editor writes itself (a display list: text by glyph in our fonts, paths, the picture), and carries what it is as JSON under `/KeepSimpObject`. That key is how the editor finds its own things again; a note from elsewhere that happens to carry something under the key is not taken for one (`readObject` checks every field).
- **The appearance is set last,** with `setAppearanceFromDisplayList`, and `update()` is not called after it. Otherwise MuPDF writes an appearance of its own over it or reshapes the rectangle.
- **A page object is destroyed and loaded again after every change and every undo** (`withPage`). A page that is kept across a change draws what it held before.
- **Pages the file shows turned** (a `/Rotate` of 90, 180 or 270) are edited as they are shown: points are counted from the top left of the page as the reader shows it, and the appearance is turned back with the page's own turn.

### Downloading

`exportEdited` never tidies the working copy: saving with `garbage` renumbers objects, and the comments and fields that later steps name by number would no longer be found. It writes the working copy out as it is, reads that in again, and does everything to the second copy:

1. **Flatten** (unless "Keep editable"): each of our annotations' appearances is drawn into its page's content, and the annotation is removed. MuPDF's `bake` is all or nothing, and would take the file's own notes and form fields with it.
2. **Cut the fonts.** Our fonts go in whole (about 400 KB each) and are cut down to the letters used with `subsetFonts`. The engine calls that step experimental, so the cut is kept only if every page with added text, and a spread of the others, reads and draws the same before and after. Both sides of that comparison are read from the same written file: a picture that was just placed is drawn from what it was made of, and a hair differently once it has been written, which must not be taken for a fault of the cut. A file with form fields is not cut.
3. **The check.** The words of everything that has letters (text boxes, call-outs, stamps, what measuring lines say) are looked for in the result's text (word by word, since boxes that overlap are read mixed together), and pages nothing was added to are drawn from the original and from the result and compared pixel for pixel (`pagesToCheck` chooses up to twelve, spread through the file).
4. **Write,** through `shareDuplicates` and `garbage: 2` like the other tools, with the lock when one is set.

The report (`ExportReport`) becomes the lines in the download card (`lib/pdf-editor/report.ts`). The first line always says what became of what was added (part of the page, or kept movable), so that a download never comes without a word: a one-page file with a single shape has nothing else to check. A line that is not good news is red and says which pages to look at.

### The page

- `components/pdf-editor/use-editor.ts` is the state for one open file. Every change goes to the worker (`edit-apply`) and comes back as news: the pages that changed, with what they now hold, and the list of changes.
- **A change is shown at once.** What the pages hold is "what the file last said" plus the changes asked for since (`applied` in `lib/pdf-editor/tools.ts`), so the frame and hit area of a thing move without waiting, and the next change is worked out from where things are on the screen. The file's answer replaces the guess; a change that fails is taken back and the bar says why.
- **A press with the text tool keeps the keyboard in the new box.** The layer cancels the browser's own mouse-down while the text tool is in hand or a box is being typed: on any press the browser moves the keyboard to the pages, which closed a box that had just been opened, once the font was loaded and the box opened at once. A journey types three boxes in a row for that reason.
- **Arrow keys are gathered:** moves that follow each other within 400 ms go to the file as one change, so a held key is one step of undo. Anything else that is asked for sends what was gathered first.
- `components/pdf-editor/page-layer.tsx` is laid over each page through the reader's `overlay` slot, in the page's own points. It holds a button for every thing, the frame and handles of the selection, guides, what a gesture is about to make, and the box being typed in.
- **Typing** happens in a `<textarea>` in the same font file that is put into the PDF, with kerning and ligatures off, since the file is written letter by letter, each as wide as the font says. Lines are broken by the page (`breakLines`, measured with a canvas) and sent with the box, so the file has the lines that were on the screen. Phones zoom the whole page in on a field with letters under 16 pixels, so the field is made larger and scaled back down.
- **Typing ends once.** Leaving a box can be noticed twice (by the box losing the keyboard and by what was pressed), and Safari does not give a pressed button the keyboard at all; `finishTyping` clears a ref before anything else. A press on the bar does not take the keyboard from the box, so a look can be chosen while typing.
- **The tools are a pure state machine** (`press`, `drag`, `release` in `lib/pdf-editor/tools.ts`): from a pointer's place and the things on a page to a selection, a gesture, or a change. The screen only feeds it and draws what it says.

### Files

| File                                                           | What it holds                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/pdf-editor/objects.ts`                                    | What an added thing is, how it moves, resizes and turns, and `readObject`, which checks one.                                          |
| `lib/pdf-editor/geometry.ts`                                   | Turned boxes, handles, hit tests, snapping, staying on the page.                                                                      |
| `lib/pdf-editor/tools.ts`                                      | The tools: press, drag, release; nudge, paste, order, restyle; `applied`.                                                             |
| `lib/pdf-editor/text-layout.ts`, `ink.ts`                      | Breaking lines by measured widths; thinning and smoothing a stroke.                                                                   |
| `lib/pdf-editor/measure.ts`                                    | Units and scale, what a measuring line says, where its end marks and its label go.                                                    |
| `lib/pdf-editor/signature.ts`                                  | Signatures drawn, typed and from a picture; ticks, crosses and dots; what is remembered.                                              |
| `lib/pdf-editor/styles.ts`, `fonts.ts`                         | The palette and what a look changes; which font file is which.                                                                        |
| `lib/pdf-editor/history.ts`, `report.ts`                       | What the undo list says and what is unsaved; the words of the check.                                                                  |
| `lib/pdf-editor/forms.ts`, `mupdf-forms.ts`                    | What a field is, what it takes, dates, what is missing, how a list is drawn; reading and filling fields in the engine.                |
| `lib/pdf-editor/draft.ts`, `draft-store.ts`, `mupdf-signed.ts` | What a draft is and how it is checked; where it is kept; writing changes after a signed file.                                         |
| `lib/pdf-editor/mupdf-edit.ts`                                 | Sessions, changes, undo, flattening, the export. With `mupdf-comments.ts` and `mupdf-forms.ts`, the only files that touch the engine. |
| `lib/pdf-merger/{protocol,pdf.worker,client}`                  | The `edit-*` requests, beside the other tools' in the one worker.                                                                     |
| `components/pdf-editor/`                                       | The tool's page, the state hook, the toolbar, the layer over a page, the written help.                                                |
| `public/fonts/editor/`                                         | Twelve Liberation font files and four that look written by hand (5.4 MB), with their licences. Part of the offline copy.              |

## Rules

- Only `lib/pdf-editor/mupdf-edit.ts`, `mupdf-comments.ts` and `mupdf-forms.ts` touch the engine, and each is handed the engine, so the same code runs in the worker and in Node.
- Nothing a file brings with it is run. A form's script is read as text at most (to learn how a date is written).
- Never save the working copy with `garbage`, and never keep a page object across a change.
- Never call the engine's `undo()` or `redo()`, and never save the working copy with `incremental`. A change is undone by making the working copy anew, and written after a signed file from a fresh copy.
- A result is checked for references that point at nothing (`danglingRefs` in `tests/pdf-reader.ts`) wherever a test undoes something. The engine does not notice them in its own files.
- Everything that comes from a file or from the page goes through `readObject` before it is drawn. A thing it does not know is left alone.
- An appearance is set last, with no `update()` after it.
- What the editor says a tool does is what it does. "Cover" must never be described as removing anything.
- A check that compares two versions of a file reads both from written bytes.

## Limits

- Words that are already in the file cannot be changed yet (phase 4), nor can form fields be added (phase 8).
- A form's scripts are never run: a field a script would format or work out holds what was typed. XFA forms are not read. Read-only fields, push buttons and places for a certificate signature are left as they are.
- A list's look is ours, in Helvetica: a letter that font lacks is left out of the picture of the list (the choice itself is kept). A drop-down shows the value the file keeps, which a few forms make different from what they show.
- A date field takes three presses of Tab in some browsers, one for each part of the date.
- A signature is a mark on the page, not a certificate: it does not prove who signed, and a file that already carries a digital signature no longer counts as signed once it is changed (the editor says so when such a file is opened).
- Taking the paper out of a picture of a signature needs light, plain paper. Lined or dark paper, or a shadow across the photo, is taken for ink.
- A mark on words cannot be moved or stretched once made; it is deleted and made again. A comment of a kind the editor does not make keeps its place and its look.
- A page that is a picture has no words to mark; the highlighter pen is what works there until OCR arrives (phase 9).
- Drawn into the page, a note is only its icon.
- A call-out has one colour for its words, frame and arrow, a white inside, and does not turn. A measuring line measures the page: it knows a drawing's scale only when told.
- A font has the letters its file has: Latin, Greek and Cyrillic among them. A letter without a shape is left out of the file, and the bar names it. Text that needs shaping (Arabic, Indic scripts) is not supported.
- Text in a box that is kept editable is a stamp to other apps: they show it, and may let a reader move or delete it.
- The fonts are fetched when text is first typed; each is about 400 KB.
- One file at a time, up to the device's limit for one file (300 MB on a computer, 100 MB on a phone).

## Tests

- **Unit** (`lib/pdf-editor/*.test.ts`, 100% of statements and branches): geometry, objects, tools, text layout, ink, history, styles, fonts and the report.
- **Real engine in Node** (`edit.node.test.ts`): results are read back with pdf.js and pdf-lib, never with the engine alone. Added text is found where it was put, in an embedded font cut to its letters; pages the file shows turned every way; every kind of thing, turned and see-through; a PNG with see-through parts and a JPEG, with the pixels they came with; links, bookmarks, fields, notes, tags, page numbers and attachments survive; "Keep editable" reads back; undo to the start gives the original; a locked result; a stop; and a seeded run of many edits that must never lose a page or a word.
- **Browser** (`e2e/pdf-editor.spec.ts`, five profiles): every tool with the mouse, the look row, handles, keys and undo, with the page's own picture sampled to see that the file changed; typing with a look chosen midway; "Keep editable" and opening the result again; a locked file and a new lock; a damaged file and one that is no PDF; leaving with unsaved changes; touch; axe in both themes and in every state of the window, 320 px, control sizes, no outside requests.
- **Stamps, call-outs and measuring lines:** `measure.test.ts` and `marks.test.ts` (100%), `marks.node.test.ts` with the real engine (a stamp's words read by pdf.js inside its frame, turned, and on a turned page; labels in every unit and by a scale, also on a line shorter than its label; a call-out's frame, white inside and arrow, and its point moved and undone; all three read back from a file that kept them), and three journeys in `e2e/pdf-editor.spec.ts`.
- **Comments:** `comments.test.ts` (100%), `comments.node.test.ts` with the real engine (marks on plain and turned pages, read back by pdf.js with author, colour and date; notes and a reply to a reply; a pen; a file's own note; another program's shapes left as they are; undo among the editor's other steps; kept, drawn in and left out, with links and fields surviving), and `e2e/pdf-annotator.spec.ts` on five profiles.
- **Signing:** `signature.test.ts` (100%), the signing part of `marks.node.test.ts` with the real engine (a typed signature read by pdf.js in a hand font cut to its letters; a drawn one, a tick, a cross and a dot in the page's pixels), and `e2e/pdf-signer.spec.ts` on five profiles: drawn, typed and pictured signatures (the picture read back from the download with its paper see-through and its ink still blue), initials, the date, ticks and crosses, remembering and forgetting, things landing where the page is being read, and the window's accessibility in each of its states.
- **Forms:** `forms.test.ts` (100%), `forms.node.test.ts` with the real engine (every kind read with its label, limits and place, also on a turned page; every kind filled in and read back by pdf-lib and pdf.js; round buttons across pages; a field shown on two pages; clearing; undo and redo; what is refused makes no step; a list's tinted bar in the page's pixels, upright on a turned page; fields made part of the page with their words read by pdf.js, in a locked result), and `e2e/pdf-form-filler.spec.ts` on five profiles: every kind by mouse and keyboard, Tab order, Escape, what is missing and the way to it, typing that is still under way at Download, the final copy, files with no form, XFA and scripts, a tool drawn over a field, the sample, axe in every state.
- **After an undo** (`undo.node.test.ts`, and a journey in `e2e/pdf-editor.spec.ts`): text in a font, a picture and a filled field, each made, undone and made again, give results in which no reference points at nothing (`danglingRefs`, read with pdf-lib) and whose words and pictures other software reads. The seeded run of many edits checks the same.
- **Drafts:** `draft.test.ts` (100%), `draft.node.test.ts` with the real engine (steps kept as text and read back make a fresh copy what the session's copy was, undo list and all; a draft whose font was not handed over is not taken up and leaves the file as it came), and `e2e/pdf-draft.spec.ts` on five profiles: nothing kept with the switch off; a field, a text box, a picture and an undone step kept, the page reloaded, the draft taken up, redone and downloaded; thrown away; switched off and on; steps that are not steps offered as nothing.
- **Offline** (`e2e/offline.spec.ts`): text is typed, a signature is typed in a hand font, and both are downloaded with the server stopped, which needs the fonts from the saved copy.

## The phases

1. **The workspace, and adding things.** Built.
2. **Mark up and comment.** Built: marks on words, the highlighter pen, notes and replies, the list of comments, comments a file comes with, the PDF annotator page, stamps, call-outs and measuring lines.
3. **Fill and sign.** Built so far: drawn, typed and pictured signatures, initials, the date, ticks and crosses, and the Sign PDF page. Also built: filling in a form's own fields, with the Fill PDF form page. Also built: saving after a signed file so that its signature stays valid, drafts kept on the device when asked, and text in the rows of boxes of forms without fields. The phase is complete.
4. **Change the text that is there,** in the file's own font where it has the letters, with the old words gone from the file.
5. **Paragraphs, pictures in the page, links, find and replace.**
6. **Pages and the document:** reorder, crop, numbers, watermarks, bookmarks, details. Focused pages: Add page numbers, Watermark PDF, Crop PDF.
7. **Redact and protect:** by area, text and pattern, removed and proved. Focused page: Redact PDF.
8. **Make forms.** Focused page: Create a fillable PDF form.
9. **OCR on the device,** videos, a benchmark beside other editors. Focused page: OCR PDF.
10. **Certificate signatures.**

Not planned: running a file's scripts, XFA forms, turning pages into pictures, uploads, accounts.

### What the plan was based on

- Sejda uploads files and allows three tasks an hour on files of up to 50 MB or 200 pages ([TechRadar](https://techradar.com/reviews/sejda)).
- Firefox's built-in editor adds text, drawings, highlights, comments, images and signatures; it does not change words that are already in the file ([Mozilla](https://www.firefox.com/features/pdf-editor/)).
- "Whiteout" in many tools only covers words; they can still be copied out ([PDF Candy](https://pdfcandy.com/edit-pdf.html)).
- MuPDF 1.28.1, probed during planning: it removes one line of text with `applyRedactions` and leaves the rest, journals changes, and writes text by glyph in an embedded font. It does not sign with certificates, create form fields, run scripts or shape Arabic and Indic text.
