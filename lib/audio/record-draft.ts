/**
 * A recording's draft: kept in the browser's own storage on this device,
 * and nowhere else, only while its switch is on (it starts off every time),
 * so a take survives a closed tab or a crash. One take is kept at a time:
 * what it is (when it started, its rate and channels, how long), and its
 * sound a second at a time as bytes (some browsers keep no blobs in a
 * private window, and bytes they all keep). Finishing or discarding the
 * take deletes it. Everything here can fail (a private window keeps
 * nothing, a full disk has no room), and whoever calls says so.
 */

const DATABASE = "keepsimp-recordings"
const STORE = "take"
const INFO = "info"

export interface DraftInfo {
  /** When it started, in milliseconds since 1970. */
  started: number
  sampleRate: number
  channels: number
  /** Frames kept so far. */
  frames: number
  /** Seconds of sound kept so far, a part at a time. */
  parts: number
}

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
  work: (store: IDBObjectStore) => IDBRequest<T> | void
) {
  const db = await database()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      transaction.oncomplete = () =>
        resolve(request ? request.result : undefined)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

/** Start a draft, in place of any kept. */
export const startDraft = (info: DraftInfo) =>
  run("readwrite", (store) => {
    store.clear()
    store.put(info, INFO)
  })

/** Keep the next second of sound, and how much there is now. */
export const addToDraft = (index: number, bytes: Uint8Array, info: DraftInfo) =>
  run("readwrite", (store) => {
    store.put(bytes, `part-${index}`)
    store.put(info, INFO)
  })

/** The draft kept, with its sound; null when there is none. */
export async function readDraft(): Promise<{
  info: DraftInfo
  parts: Uint8Array[]
} | null> {
  const info = await run<DraftInfo>("readonly", (store) => store.get(INFO))
  if (!info) return null
  const parts: Uint8Array[] = []
  for (let index = 0; index < info.parts; index++) {
    const part = await run<Uint8Array>("readonly", (store) =>
      store.get(`part-${index}`)
    )
    if (!part) break
    parts.push(part)
  }
  return { info, parts }
}

/** Forget the draft. */
export const clearDraft = () => run("readwrite", (store) => void store.clear())
