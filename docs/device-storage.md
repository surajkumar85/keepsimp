# Kept on this device

The workspace header has one button, Kept on this device, beside the theme switch. It replaced a memory reading (15–24 October 2026) that only Chrome and Edge could give and that missed the workers and WebAssembly engines where the tools do their work. This panel answers a question every browser can: what KeepSimp keeps here, how big each part is, and how to take each away.

## What it lists

`lib/device-storage.ts` (`PARTS`) names every store the tools write to, in three groups. Its test reads each owning file and fails when a name there and here differ, so a new store must be added to both.

- **Saved for offline use:** the offline copy (Cache Storage, `keepsimp-offline-<release>`, `service-worker/sw.js`), and from `keepsimp-kept-on-use` the text recognition languages (`/ocr/`), the speech recognition models (`/whisper/`) and the noise removal model (`/rnnoise/`).
- **Your work:** the PDF editor's draft (IndexedDB `keepsimp-drafts`), the Markdown editor's documents (`keepsimp-markdown`), a recording in progress (`keepsimp-recordings`) and the video editor's work files (the origin private file system's `keepsimp-video`).
- **Remembered for you:** the signature and initials, the trusted certificates and the name on comments (local storage).

The theme choice is mentioned under the list; it holds nothing of anyone's files.

## How it measures

Only while the panel is open, in the browser, never on the server.

- **Saved responses:** each entry's `Content-Length`, or its body's size when there is none.
- **IndexedDB:** every key and value of the store, files by their size and text by its UTF-8 length (`valueBytes`). A database that is not there is never made: the opening's upgrade is aborted.
- **Local storage:** two bytes a character of each key and value, as browsers count it.
- **Files:** the size of every file under the folder.

The total is the sum of the parts. Beside it, where the browser says, is its own count for the whole site (`navigator.storage.estimate()`, which includes what the browser adds of its own) and how much it allows. A part that cannot be read says so instead of showing zero.

## How it removes

Each Remove asks once more and cannot be undone.

- The offline copy's caches are deleted and the service worker unregistered, so the next tool page opened online registers it again and saves a whole new copy; a worker left with an empty cache would answer from the network until the next release.
- An engine's files are deleted from the kept cache by their folder, leaving the others.
- A draft's object store is emptied; the database stays for the tool. A tool still open keeps what it has on screen.
- Video work files are removed folder by folder; a file an open video editor is still writing cannot be removed, and goes with its page.
- Remembered things are taken out of local storage, key by key.

When the browser offers it, the panel says whether the site's storage is persistent and can ask for it (`navigator.storage.persist()`), so that the offline copy and drafts are not cleared when the device runs low on space. The browser decides; installed apps are more likely to be granted it.

Nothing measured is stored or sent. `e2e/device-storage.spec.ts` fills each store with real data in every browser profile, checks the sizes and the removals, and the panel's keyboard, phone and accessibility behaviour.
