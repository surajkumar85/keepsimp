/**
 * What KeepSimp keeps in this browser, how big each part is, and how to
 * take each away. Every part is one of the stores the tools write to; the
 * names below are theirs, so a new store must be added here as well (the
 * test holds the list to them). Measuring never creates a store, and
 * nothing measured leaves the device.
 *
 * The browser's own objects are handed in (`StorageEnv`), so the same code
 * runs on the page and in tests.
 */

import { SCRATCH_FOLDER } from "@/lib/video/scratch"

export interface StorageEnv {
  caches?: CacheStorage
  indexedDB?: IDBFactory
  localStorage?: Storage
  storage?: StorageManager
  serviceWorker?: ServiceWorkerContainer
}

export type PartGroup = "offline" | "work" | "remembered"

interface Where {
  /** Saved responses: a cache by its name (or the start of it), and the paths in it. */
  cache?: { name: string; prefix?: boolean; paths?: string }
  /** A store of an IndexedDB database. */
  database?: { name: string; store: string }
  /** Keys in this browser's local storage. */
  keys?: readonly string[]
  /** A folder of the origin private file system. */
  folder?: string
}

export interface PartInfo {
  id: string
  group: PartGroup
  name: string
  /** What it is and when it is kept, in a sentence or two. */
  detail: string
  where: Where
}

/** The site's offline copy: one cache per release (service-worker/sw.js). */
export const OFFLINE_CACHE = "keepsimp-offline-"
/** Files saved the first time they are used, across releases. */
export const KEPT_CACHE = "keepsimp-kept-on-use"

export const PARTS: readonly PartInfo[] = [
  {
    id: "offline",
    group: "offline",
    name: "Offline copy of KeepSimp",
    detail:
      "The pages, scripts and engines that let the tools open without a connection. Removing it saves space; it is saved again the next time a tool opens online.",
    where: { cache: { name: OFFLINE_CACHE, prefix: true } },
  },
  {
    id: "ocr",
    group: "offline",
    name: "Text recognition languages",
    detail:
      "Saved the first time you make a scan searchable, one file for each language.",
    where: { cache: { name: KEPT_CACHE, paths: "/ocr/" } },
  },
  {
    id: "whisper",
    group: "offline",
    name: "Speech recognition models",
    detail: "Saved the first time you write down what a recording says.",
    where: { cache: { name: KEPT_CACHE, paths: "/whisper/" } },
  },
  {
    id: "rnnoise",
    group: "offline",
    name: "Noise removal model",
    detail: "Saved the first time you take noise out of a recording.",
    where: { cache: { name: KEPT_CACHE, paths: "/rnnoise/" } },
  },
  {
    id: "pdf-draft",
    group: "work",
    name: "PDF editor draft",
    detail:
      "The PDF you were editing and your changes, kept while “Keep a draft on this device” is on.",
    where: { database: { name: "keepsimp-drafts", store: "pdf-editor" } },
  },
  {
    id: "markdown-draft",
    group: "work",
    name: "Markdown documents",
    detail:
      "Your open documents, their pictures and versions, kept while “Keep a draft on this device” is on.",
    where: { database: { name: "keepsimp-markdown", store: "drafts" } },
  },
  {
    id: "recording-draft",
    group: "work",
    name: "Recording in progress",
    detail:
      "A take kept while “Keep a draft while recording” is on, until it is finished.",
    where: { database: { name: "keepsimp-recordings", store: "take" } },
  },
  {
    id: "video-files",
    group: "work",
    name: "Video editor work files",
    detail:
      "Videos written here while they are made, so long ones do not fill the memory. They go when their page closes; files still in use are left.",
    where: { folder: SCRATCH_FOLDER },
  },
  {
    id: "signature",
    group: "remembered",
    name: "Your signature and initials",
    detail:
      "Kept when “Remember this signature on this device” is on in the PDF editor.",
    where: { keys: ["keepsimp.signature", "keepsimp.initials"] },
  },
  {
    id: "trusted",
    group: "remembered",
    name: "Trusted certificates",
    detail:
      "The certificates you added to check signatures against, kept while “Remember them on this device” is on.",
    where: { keys: ["keepsimp.trusted"] },
  },
  {
    id: "comment-name",
    group: "remembered",
    name: "Name on your comments",
    detail: "The name you sign PDF comments with.",
    where: { keys: ["keepsimp.comment-author"] },
  },
]

export const GROUPS: readonly { id: PartGroup; name: string }[] = [
  { id: "offline", name: "Saved for offline use" },
  { id: "work", name: "Your work" },
  { id: "remembered", name: "Remembered for you" },
]

/** A size in bytes, in the units people read: 0 B, 912 B, 4.2 KB, 37 MB, 1.4 GB. */
export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1024)
    return `${Math.max(0, Math.round(bytes) || 0)} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** About how many bytes a stored value takes: files by their size, text by its UTF-8 length. */
export function valueBytes(value: unknown, seen = new Set<object>()): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "string") return new TextEncoder().encode(value).length
  if (typeof value === "number" || typeof value === "bigint") return 8
  if (typeof value === "boolean") return 1
  if (typeof value !== "object") return 0
  if (seen.has(value)) return 0
  seen.add(value)
  if (value instanceof Blob) return value.size
  if (value instanceof ArrayBuffer) return value.byteLength
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (value instanceof Date) return 8
  if (value instanceof Map)
    return [...value].reduce(
      (sum, [key, item]) =>
        sum + valueBytes(key, seen) + valueBytes(item, seen),
      0
    )
  if (value instanceof Set)
    return [...value].reduce((sum, item) => sum + valueBytes(item, seen), 0)
  return Object.entries(value).reduce(
    (sum, [key, item]) => sum + valueBytes(key, seen) + valueBytes(item, seen),
    0
  )
}

const pathOf = (request: Request) => new URL(request.url).pathname

const named = (where: NonNullable<Where["cache"]>, name: string) =>
  where.prefix ? name.startsWith(where.name) : name === where.name

async function cachesFor(env: StorageEnv, where: NonNullable<Where["cache"]>) {
  if (!env.caches) return []
  const names = (await env.caches.keys()).filter((name) => named(where, name))
  return Promise.all(names.map((name) => env.caches!.open(name)))
}

async function cacheBytes(env: StorageEnv, where: NonNullable<Where["cache"]>) {
  let total = 0
  for (const cache of await cachesFor(env, where))
    for (const request of await cache.keys()) {
      if (where.paths && !pathOf(request).startsWith(where.paths)) continue
      const response = await cache.match(request)
      if (!response) continue
      const length = Number(response.headers.get("content-length"))
      total += length > 0 ? length : (await response.blob()).size
    }
  return total
}

async function clearCache(env: StorageEnv, where: NonNullable<Where["cache"]>) {
  if (!env.caches) return
  if (!where.paths) {
    for (const name of await env.caches.keys())
      if (named(where, name)) await env.caches.delete(name)
    return
  }
  for (const cache of await cachesFor(env, where))
    for (const request of await cache.keys())
      if (pathOf(request).startsWith(where.paths)) await cache.delete(request)
}

/** A database as it is, or null when it is not there: never makes one. */
function openExisting(env: StorageEnv, name: string) {
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    if (!env.indexedDB) return resolve(null)
    const request = env.indexedDB.open(name)
    let made = false
    request.onupgradeneeded = () => {
      // It did not exist: stop, so that measuring leaves nothing behind.
      made = true
      request.transaction!.abort()
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => (made ? resolve(null) : reject(request.error))
  })
}

function inStore<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  work: (objects: IDBObjectStore, done: (value: T) => void) => void
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    let result: T
    work(transaction.objectStore(store), (value) => (result = value))
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function databaseBytes(
  env: StorageEnv,
  where: NonNullable<Where["database"]>
) {
  const db = await openExisting(env, where.name)
  if (!db) return 0
  try {
    if (!db.objectStoreNames.contains(where.store)) return 0
    return await inStore<number>(
      db,
      where.store,
      "readonly",
      (objects, done) => {
        let total = 0
        done(0)
        const cursor = objects.openCursor()
        cursor.onsuccess = () => {
          const at = cursor.result
          if (!at) return
          total += valueBytes(at.key) + valueBytes(at.value)
          done(total)
          at.continue()
        }
      }
    )
  } finally {
    db.close()
  }
}

async function clearDatabase(
  env: StorageEnv,
  where: NonNullable<Where["database"]>
) {
  const db = await openExisting(env, where.name)
  if (!db) return
  try {
    if (db.objectStoreNames.contains(where.store))
      await inStore<void>(db, where.store, "readwrite", (objects, done) => {
        objects.clear()
        done(undefined)
      })
  } finally {
    db.close()
  }
}

/** Local storage holds text in UTF-16: two bytes a character, key and value. */
function keysBytes(env: StorageEnv, keys: readonly string[]) {
  let total = 0
  for (const key of keys) {
    const value = env.localStorage?.getItem(key)
    if (value !== null && value !== undefined)
      total += (key.length + value.length) * 2
  }
  return total
}

type Entries = AsyncIterable<[string, FileSystemHandle]>
const entriesOf = (folder: FileSystemDirectoryHandle) =>
  (folder as unknown as { entries(): Entries }).entries()

async function folderOf(env: StorageEnv, name: string) {
  if (!env.storage?.getDirectory) return null
  try {
    const root = await env.storage.getDirectory()
    return await root.getDirectoryHandle(name)
  } catch {
    return null
  }
}

async function handleBytes(handle: FileSystemHandle): Promise<number> {
  if (handle.kind === "file")
    return (await (handle as FileSystemFileHandle).getFile()).size
  let total = 0
  for await (const [, inner] of entriesOf(handle as FileSystemDirectoryHandle))
    total += await handleBytes(inner)
  return total
}

async function folderBytes(env: StorageEnv, name: string) {
  const folder = await folderOf(env, name)
  return folder ? handleBytes(folder) : 0
}

async function clearFolder(env: StorageEnv, name: string) {
  const folder = await folderOf(env, name)
  if (!folder) return
  const names: string[] = []
  for await (const [entry] of entriesOf(folder)) names.push(entry)
  for (const entry of names)
    try {
      await folder.removeEntry(entry, { recursive: true })
    } catch {
      // Still being written by an open video editor: it goes with its page.
    }
}

/** How many bytes a part takes now: 0 when nothing of it is kept. */
export async function measurePart(env: StorageEnv, part: PartInfo) {
  const { where } = part
  if (where.cache) return cacheBytes(env, where.cache)
  if (where.database) return databaseBytes(env, where.database)
  if (where.keys) return keysBytes(env, where.keys)
  return folderBytes(env, where.folder!)
}

/**
 * Takes a part away. The offline copy also lets go of the service worker,
 * so that the next tool page opened online saves a whole new copy rather
 * than a worker going on with an empty one.
 */
export async function clearPart(env: StorageEnv, part: PartInfo) {
  const { where } = part
  if (where.cache) {
    await clearCache(env, where.cache)
    if (part.id === "offline" && env.serviceWorker)
      for (const registration of await env.serviceWorker.getRegistrations())
        await registration.unregister()
  } else if (where.database) await clearDatabase(env, where.database)
  else if (where.keys)
    for (const key of where.keys) env.localStorage?.removeItem(key)
  else await clearFolder(env, where.folder!)
}

export interface Overall {
  /** What the browser counts for this site, all stores together, and what it allows; null where it does not say. */
  usage: number | null
  quota: number | null
  /** Whether the browser has promised not to clear this site's storage when space runs low; null where it cannot say. */
  persisted: boolean | null
}

export async function overall(env: StorageEnv): Promise<Overall> {
  const estimate = await env.storage?.estimate?.().catch(() => null)
  const persisted = env.storage?.persisted
    ? await env.storage.persisted().catch(() => null)
    : null
  return {
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    persisted,
  }
}

/** Asks the browser to keep this site's storage when space runs low; true when it agrees. */
export async function askToPersist(env: StorageEnv) {
  if (!env.storage?.persist) return false
  return env.storage.persist().catch(() => false)
}
