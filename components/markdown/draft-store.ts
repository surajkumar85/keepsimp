/**
 * The Markdown editor's draft in the browser's own storage (IndexedDB), on
 * this device: kept only while "Keep a draft on this device" is on, and
 * deleted when it is turned off. Read back through `readDraft`, which
 * checks it as if it came from anywhere.
 */
import { readDraft, type Draft } from "@/lib/markdown/draft"

const DATABASE = "keepsimp-markdown"
const STORE = "drafts"
const KEY = "current"

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Every read and write waits for the one before it: a draft saved just
 * before the switch is turned off must not land after it is deleted.
 */
let queue: Promise<unknown> = Promise.resolve()

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const next = queue.then(() => runNow<T>(mode, work))
  queue = next.catch(() => {})
  return next
}

async function runNow<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      // Done once the transaction is, so the next one sees what this one wrote.
      transaction.oncomplete = () => resolve(request.result as T)
      transaction.onerror = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

export async function loadDraft(): Promise<Draft | null> {
  if (typeof indexedDB === "undefined") return null
  try {
    return readDraft(await run<unknown>("readonly", (store) => store.get(KEY)))
  } catch {
    return null
  }
}

export const saveDraft = (draft: Draft) =>
  run<void>("readwrite", (store) => store.put(draft, KEY))

export async function deleteDraft() {
  if (typeof indexedDB === "undefined") return
  await run<void>("readwrite", (store) => store.delete(KEY)).catch(() => {})
}
