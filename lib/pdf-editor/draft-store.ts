/**
 * Where a draft is kept: the browser's own storage on this device, and
 * nowhere else. The file and each picture are kept as their bytes (some
 * browsers keep no files in a private window, and bytes they all keep), and
 * so is a font of one's own that the steps are written in; the
 * steps are kept beside them and written again after every change.
 *
 * One draft is kept at a time, of the file that was last changed with the
 * switch on. Everything here can fail (a private window keeps nothing, a
 * full disk has no room), and whoever calls says so on the page.
 */
import { fontsOf, picturesOf, readDraft, type Draft } from "./draft"
import { isOwn, ownKey, readFont } from "./own-font"

const DATABASE = "keepsimp-drafts"
const STORE = "pdf-editor"
/** Whether drafts are wanted at all is a setting, kept with the other settings. */
const WANTED = "keepsimp.drafts"

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE)
    opening.onsuccess = () => resolve(opening.result)
    opening.onerror = () => reject(opening.error)
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
) {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

/** Whether the switch that keeps drafts is on. It is off until someone turns it on. */
export function draftsWanted() {
  try {
    return localStorage.getItem(WANTED) === "on"
  } catch {
    return false
  }
}

/** Turn the keeping of drafts on or off. Turned off, the draft that is kept is thrown away. */
export async function wantDrafts(on: boolean) {
  try {
    if (on) localStorage.setItem(WANTED, "on")
    else localStorage.removeItem(WANTED)
  } catch {
    // A browser that keeps nothing keeps no draft either; the page says so when one is tried.
  }
  if (!on) await clearDraft()
}

export const clearDraft = () => run("readwrite", (store) => store.clear())

/** A file or a picture as it is kept: its bytes, and what kind of file they are. */
interface Kept {
  bytes: ArrayBuffer
  type: string
}

const kept = async (blob: Blob): Promise<Kept> => ({
  bytes: await blob.arrayBuffer(),
  type: blob.type,
})

/** What was kept as a file again; null when what is there is not one. */
function blobOf(value: unknown) {
  const { bytes, type } = (value ?? {}) as Partial<Kept>
  return bytes instanceof ArrayBuffer && typeof type === "string"
    ? new Blob([bytes], { type })
    : null
}

/** Begin a draft of a file: whatever draft was there makes way for it. */
export async function beginDraft(file: Blob) {
  const value = await kept(file)
  await clearDraft()
  await run("readwrite", (store) => store.put(value, "file"))
}

export async function keepPicture(name: string, picture: Blob) {
  const value = await kept(picture)
  await run("readwrite", (store) => store.put(value, `picture/${name}`))
}

/** Keep a font of one's own that the steps are written in, under the key it goes by. */
export async function keepFont(key: string, font: OwnFile) {
  const value = await kept(font.blob)
  await run("readwrite", (store) => store.put(value, `font/${key}`))
}

export const keepSteps = (draft: Draft) =>
  run("readwrite", (store) => store.put(draft, "steps"))

/** A font of one's own as it is kept: what it is called, the name it is written under in a PDF, and its file. */
export interface OwnFile {
  name: string
  written: string
  blob: Blob
}

/** A draft with its file, the pictures its steps place and the fonts of one's own they are written in. */
export interface KeptDraft {
  draft: Draft
  file: Blob
  pictures: Map<string, Blob>
  fonts: Map<string, OwnFile>
}

/**
 * The draft that is kept, when there is one and all of it is there. What
 * is read is checked as a file would be (`readDraft`).
 */
export async function loadDraft(): Promise<KeptDraft | null> {
  const draft = readDraft(await run("readonly", (store) => store.get("steps")))
  if (!draft) return null
  const file = blobOf(await run("readonly", (store) => store.get("file")))
  if (!file || file.size !== draft.size) return null
  const pictures = new Map<string, Blob>()
  for (const name of picturesOf(draft.steps)) {
    const picture = blobOf(
      await run("readonly", (store) => store.get(`picture/${name}`))
    )
    if (!picture) return null
    pictures.set(name, picture)
  }
  const fonts = new Map<string, OwnFile>()
  for (const key of fontsOf(draft.steps).filter(isOwn)) {
    const value = await run("readonly", (store) => store.get(`font/${key}`))
    const blob = blobOf(value)
    if (!blob) return null
    // What is kept as a font is read as one again, and must be the font the steps name.
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const read = readFont(bytes)
    if (!read?.allowed || ownKey(bytes) !== key) return null
    fonts.set(key, { name: read.name, written: read.written, blob })
  }
  return { draft, file, pictures, fonts }
}
