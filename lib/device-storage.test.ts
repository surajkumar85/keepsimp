import { existsSync, readFileSync } from "node:fs"
import { IDBFactory } from "fake-indexeddb"
import { describe, expect, it, vi } from "vitest"
import {
  askToPersist,
  clearPart,
  formatBytes,
  GROUPS,
  KEPT_CACHE,
  measurePart,
  OFFLINE_CACHE,
  overall,
  PARTS,
  valueBytes,
} from "./device-storage"

const part = (id: string) => PARTS.find((one) => one.id === id)!

/** The Cache Storage of a page, with responses kept in memory. */
function fakeCaches(content: Record<string, Record<string, Response>>) {
  const stores = new Map(
    Object.entries(content).map(([name, entries]) => [
      name,
      new Map(Object.entries(entries)),
    ])
  )
  const cacheOf = (entries: Map<string, Response>) =>
    ({
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
      match: async (request: Request) => entries.get(request.url)?.clone(),
      delete: async (request: Request) => entries.delete(request.url),
    }) as unknown as Cache
  return {
    stores,
    caches: {
      keys: async () => [...stores.keys()],
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map())
        return cacheOf(stores.get(name)!)
      },
      delete: async (name: string) => stores.delete(name),
    } as unknown as CacheStorage,
  }
}

/** A folder of the origin private file system: names to files or folders. */
type Tree = { [name: string]: Blob | Tree }
function fakeFolder(tree: Tree, locked = new Set<string>()) {
  const handle = (name: string, value: Blob | Tree): FileSystemHandle =>
    value instanceof Blob
      ? ({
          kind: "file",
          name,
          getFile: async () => value,
        } as unknown as FileSystemHandle)
      : (fakeFolder(value, locked) as unknown as FileSystemHandle)
  return {
    kind: "directory",
    async *entries() {
      for (const [name, value] of Object.entries(tree))
        yield [name, handle(name, value)] as [string, FileSystemHandle]
    },
    async getDirectoryHandle(name: string) {
      const value = tree[name]
      if (!value || value instanceof Blob)
        throw new DOMException("", "NotFoundError")
      return fakeFolder(value, locked)
    },
    async removeEntry(name: string) {
      if (locked.has(name))
        throw new DOMException("", "NoModificationAllowedError")
      delete tree[name]
    },
  } as unknown as FileSystemDirectoryHandle
}

function fakeLocal(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    has: (key: string) => map.has(key),
  } as unknown as Storage & { has(key: string): boolean }
}

async function putInDatabase(
  factory: IDBFactory,
  name: string,
  store: string,
  values: Record<string, unknown>
) {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const request = factory.open(name, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(store)
    request.onsuccess = () => resolve(request.result)
  })
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(store, "readwrite")
    for (const [key, value] of Object.entries(values))
      transaction.objectStore(store).put(value, key)
    transaction.oncomplete = () => resolve()
  })
  db.close()
}

const databases = async (factory: IDBFactory) =>
  (await factory.databases()).map((one) => one.name)

describe("the parts of what is kept", () => {
  it("name each store the tools write to, as those files spell it", () => {
    const owners: Record<string, string> = {
      offline: "service-worker/sw.js",
      ocr: "service-worker/sw.js",
      whisper: "service-worker/sw.js",
      rnnoise: "service-worker/sw.js",
      "pdf-draft": "lib/pdf-editor/draft-store.ts",
      "markdown-draft": "components/markdown/draft-store.ts",
      "recording-draft": "lib/audio/record-draft.ts",
      "video-files": "lib/video/scratch.ts",
      signature: "components/pdf-editor/signature-dialog.tsx",
      trusted: "components/pdf-editor/use-trusted.ts",
      "comment-name": "components/pdf-editor/use-comments.ts",
    }
    expect(PARTS.map((one) => one.id).sort()).toEqual(
      Object.keys(owners).sort()
    )
    for (const one of PARTS) {
      const source = readFileSync(owners[one.id], "utf8")
      const names = [
        one.where.cache?.name,
        one.where.database?.name,
        one.where.database?.store,
        one.where.folder,
        ...(one.where.keys ?? []),
      ].filter(Boolean) as string[]
      for (const name of names) expect(source, one.id).toContain(`"${name}"`)
      expect(one.detail).toMatch(/\.$/)
      expect(GROUPS.map((group) => group.id)).toContain(one.group)
    }
    // The engines kept on use are served from these folders.
    for (const folder of ["ocr", "whisper", "rnnoise"])
      expect(
        existsSync(`app/${folder}/[version]/[file]/route.ts`) ||
          existsSync(`public/${folder}`),
        folder
      ).toBe(true)
  })
})

describe("sizes", () => {
  it("reads in the units people use", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(-5)).toBe("0 B")
    expect(formatBytes(Number.NaN)).toBe("0 B")
    expect(formatBytes(912)).toBe("912 B")
    expect(formatBytes(4300)).toBe("4.2 KB")
    expect(formatBytes(37 * 1024 * 1024)).toBe("37 MB")
    expect(formatBytes(1.4 * 1024 ** 3)).toBe("1.4 GB")
    expect(formatBytes(3 * 1024 ** 5)).toBe("3072 TB")
  })

  it("counts files by their size and text by its bytes, each thing once", () => {
    const blob = new Blob(["12345"])
    const shared = { blob }
    expect(valueBytes(null)).toBe(0)
    expect(valueBytes(undefined)).toBe(0)
    expect(valueBytes("é")).toBe(2)
    expect(valueBytes(3)).toBe(8)
    expect(valueBytes(BigInt(3))).toBe(8)
    expect(valueBytes(true)).toBe(1)
    expect(valueBytes(Symbol("x"))).toBe(0)
    expect(valueBytes(new ArrayBuffer(16))).toBe(16)
    expect(valueBytes(new Uint8Array(4))).toBe(4)
    expect(valueBytes(new Date())).toBe(8)
    expect(valueBytes(new Map([["a", blob]]))).toBe(6)
    expect(valueBytes(new Set([blob, "ab"]))).toBe(7)
    expect(valueBytes({ a: shared, b: shared })).toBe(2 + 4 + 5)
  })
})

describe("saved responses", () => {
  const response = (body: string, length?: number) =>
    new Response(body, {
      headers: length ? { "content-length": String(length) } : {},
    })

  it("measures the offline copy of every release and the engines by folder", async () => {
    const { caches } = fakeCaches({
      [`${OFFLINE_CACHE}a1`]: {
        "https://www.keepsimp.com/": response("<html>", 1000),
        "https://www.keepsimp.com/app.js": response("x".repeat(50)),
      },
      [`${OFFLINE_CACHE}b2`]: {
        "https://www.keepsimp.com/": response("", 500),
      },
      [KEPT_CACHE]: {
        "https://www.keepsimp.com/ocr/6/eng.traineddata": response(
          "o".repeat(30)
        ),
        "https://www.keepsimp.com/whisper/4/model.onnx": response("w", 2000),
      },
      other: { "https://www.keepsimp.com/x": response("y", 9) },
    })
    const env = { caches }
    expect(await measurePart(env, part("offline"))).toBe(1550)
    expect(await measurePart(env, part("ocr"))).toBe(30)
    expect(await measurePart(env, part("whisper"))).toBe(2000)
    expect(await measurePart(env, part("rnnoise"))).toBe(0)
    expect(await measurePart({}, part("offline"))).toBe(0)
  })

  it("passes over an entry that went while it was measured", async () => {
    const { caches } = fakeCaches({
      [KEPT_CACHE]: { "https://www.keepsimp.com/ocr/6/a": response("a") },
    })
    const open = caches.open.bind(caches)
    caches.open = async (name: string) => {
      const cache = await open(name)
      cache.match = async () => undefined
      return cache
    }
    expect(await measurePart({ caches }, part("ocr"))).toBe(0)
  })

  it("removes the offline copy and lets go of the worker that would refill it", async () => {
    const { caches, stores } = fakeCaches({
      [`${OFFLINE_CACHE}a1`]: { "https://www.keepsimp.com/": response("a") },
      [`${OFFLINE_CACHE}b2`]: { "https://www.keepsimp.com/": response("b") },
      [KEPT_CACHE]: { "https://www.keepsimp.com/ocr/6/a": response("a") },
    })
    const unregister = vi.fn(async () => true)
    const serviceWorker = {
      getRegistrations: async () => [{ unregister }],
    } as unknown as ServiceWorkerContainer
    await clearPart({ caches, serviceWorker }, part("offline"))
    expect([...stores.keys()]).toEqual([KEPT_CACHE])
    expect(unregister).toHaveBeenCalledOnce()
    // Without a worker, or a cache store, there is nothing more to do.
    await clearPart({ caches }, part("offline"))
    await clearPart({}, part("offline"))
  })

  it("removes one engine's files and leaves the others", async () => {
    const { caches, stores } = fakeCaches({
      [KEPT_CACHE]: {
        "https://www.keepsimp.com/ocr/6/a": response("a"),
        "https://www.keepsimp.com/whisper/4/b": response("b"),
      },
    })
    const unregister = vi.fn()
    await clearPart(
      {
        caches,
        serviceWorker: {
          getRegistrations: async () => [{ unregister }],
        } as unknown as ServiceWorkerContainer,
      },
      part("ocr")
    )
    expect([...stores.get(KEPT_CACHE)!.keys()]).toEqual([
      "https://www.keepsimp.com/whisper/4/b",
    ])
    expect(unregister).not.toHaveBeenCalled()
  })
})

describe("drafts in IndexedDB", () => {
  it("measures a draft's files and steps", async () => {
    const factory = new IDBFactory()
    await putInDatabase(factory, "keepsimp-drafts", "pdf-editor", {
      // A browser keeps a file as a Blob; this stand-in keeps bytes.
      file: new Uint8Array(15),
      steps: { list: ["move", "type"] },
    })
    const bytes = await measurePart({ indexedDB: factory }, part("pdf-draft"))
    // Keys and values: "file" and its bytes, "steps", "list", "0", "move", "1", "type".
    expect(bytes).toBe(4 + 15 + 5 + 4 + 1 + 4 + 1 + 4)
  })

  it("never makes a database by measuring or removing one that is not there", async () => {
    const factory = new IDBFactory()
    expect(
      await measurePart({ indexedDB: factory }, part("markdown-draft"))
    ).toBe(0)
    await clearPart({ indexedDB: factory }, part("markdown-draft"))
    expect(await databases(factory)).toEqual([])
    expect(await measurePart({}, part("markdown-draft"))).toBe(0)
    await clearPart({}, part("markdown-draft"))
  })

  it("finds nothing in a database without the store", async () => {
    const factory = new IDBFactory()
    await putInDatabase(factory, "keepsimp-recordings", "other", { a: "b" })
    expect(
      await measurePart({ indexedDB: factory }, part("recording-draft"))
    ).toBe(0)
    await clearPart({ indexedDB: factory }, part("recording-draft"))
  })

  it("empties a draft's store and keeps the database for the tool", async () => {
    const factory = new IDBFactory()
    await putInDatabase(factory, "keepsimp-markdown", "drafts", {
      current: { documents: [{ text: "# Hello" }] },
    })
    const env = { indexedDB: factory }
    expect(await measurePart(env, part("markdown-draft"))).toBeGreaterThan(0)
    await clearPart(env, part("markdown-draft"))
    expect(await measurePart(env, part("markdown-draft"))).toBe(0)
    expect(await databases(factory)).toEqual(["keepsimp-markdown"])
  })

  it("says why when the browser will not open the database", async () => {
    const failing = {
      open: () => {
        const request = {
          error: new DOMException("no", "UnknownError"),
        } as unknown as IDBOpenDBRequest
        queueMicrotask(() => request.onerror?.(new Event("error")))
        return request
      },
    } as unknown as IDBFactory
    await expect(
      measurePart({ indexedDB: failing }, part("pdf-draft"))
    ).rejects.toThrow("no")
  })

  it("says why when a transaction fails", async () => {
    const factory = new IDBFactory()
    await putInDatabase(factory, "keepsimp-drafts", "pdf-editor", { a: "b" })
    const open = factory.open.bind(factory)
    const broken = {
      open: (name: string) => {
        const request = open(name)
        const success = () => {
          const db = request.result
          db.transaction = (() => {
            const transaction = {
              objectStore: () => ({ clear: () => undefined }),
              error: new DOMException("full", "QuotaExceededError"),
            } as unknown as IDBTransaction
            queueMicrotask(() => transaction.onerror?.(new Event("error")))
            return transaction
          }) as IDBDatabase["transaction"]
          onsuccess?.call(request, new Event("success"))
        }
        let onsuccess: ((event: Event) => void) | null = null
        Object.defineProperty(request, "onsuccess", {
          set: (handler) => {
            onsuccess = handler
            request.addEventListener("success", success, { once: true })
          },
        })
        return request
      },
    } as unknown as IDBFactory
    await expect(
      clearPart({ indexedDB: broken }, part("pdf-draft"))
    ).rejects.toThrow("full")
    const aborting = {
      open: (name: string) => {
        const request = open(name)
        request.addEventListener("success", () => {
          request.result.transaction = (() => {
            const transaction = {
              objectStore: () => ({ clear: () => undefined }),
              error: new DOMException("stopped", "AbortError"),
            } as unknown as IDBTransaction
            queueMicrotask(() => transaction.onabort?.(new Event("abort")))
            return transaction
          }) as IDBDatabase["transaction"]
        })
        return request
      },
    } as unknown as IDBFactory
    await expect(
      clearPart({ indexedDB: aborting }, part("pdf-draft"))
    ).rejects.toThrow("stopped")
  })
})

describe("remembered things", () => {
  it("counts their keys in two bytes a character and forgets them", async () => {
    const localStorage = fakeLocal({
      "keepsimp.signature": "abcd",
      "keepsimp.trusted": "[]",
      theme: "dark",
    })
    const env = { localStorage }
    expect(await measurePart(env, part("signature"))).toBe(
      ("keepsimp.signature".length + 4) * 2
    )
    expect(await measurePart(env, part("comment-name"))).toBe(0)
    await clearPart(env, part("signature"))
    expect(localStorage.has("keepsimp.signature")).toBe(false)
    // Only what was asked goes.
    expect(localStorage.has("keepsimp.trusted")).toBe(true)
    expect(localStorage.has("theme")).toBe(true)
    expect(await measurePart({}, part("trusted"))).toBe(0)
    await clearPart({}, part("trusted"))
  })
})

describe("video work files", () => {
  it("measures every file under the folder, folders inside it too", async () => {
    const root = fakeFolder({
      "keepsimp-video": {
        "page-a": { "result.mp4": new Blob(["x".repeat(100)]) },
        "page-b": {
          "part.webm": new Blob(["y".repeat(20)]),
          deeper: { a: new Blob(["z"]) },
        },
      },
    })
    const env = {
      storage: { getDirectory: async () => root } as unknown as StorageManager,
    }
    expect(await measurePart(env, part("video-files"))).toBe(121)
  })

  it("finds nothing without the folder or the storage", async () => {
    const root = fakeFolder({})
    expect(
      await measurePart(
        {
          storage: {
            getDirectory: async () => root,
          } as unknown as StorageManager,
        },
        part("video-files")
      )
    ).toBe(0)
    expect(
      await measurePart({ storage: {} as StorageManager }, part("video-files"))
    ).toBe(0)
    expect(await measurePart({}, part("video-files"))).toBe(0)
    await clearPart({}, part("video-files"))
  })

  it("removes each page's files and leaves those still being written", async () => {
    const tree: Tree = {
      "keepsimp-video": {
        "page-a": { "result.mp4": new Blob(["x"]) },
        "page-b": { "part.webm": new Blob(["y"]) },
      },
    }
    const root = fakeFolder(tree, new Set(["page-b"]))
    const env = {
      storage: { getDirectory: async () => root } as unknown as StorageManager,
    }
    await clearPart(env, part("video-files"))
    expect(Object.keys(tree["keepsimp-video"] as Tree)).toEqual(["page-b"])
  })
})

describe("the whole", () => {
  it("gives the browser's count, its allowance and whether it is kept", async () => {
    const storage = {
      estimate: async () => ({ usage: 5_000, quota: 1_000_000 }),
      persisted: async () => false,
      persist: async () => true,
    } as unknown as StorageManager
    expect(await overall({ storage })).toEqual({
      usage: 5_000,
      quota: 1_000_000,
      persisted: false,
    })
    expect(await askToPersist({ storage })).toBe(true)
  })

  it("says nothing it does not know", async () => {
    expect(await overall({})).toEqual({
      usage: null,
      quota: null,
      persisted: null,
    })
    const failing = {
      estimate: async () => Promise.reject(new Error("no")),
      persisted: async () => Promise.reject(new Error("no")),
      persist: async () => Promise.reject(new Error("no")),
    } as unknown as StorageManager
    expect(await overall({ storage: failing })).toEqual({
      usage: null,
      quota: null,
      persisted: null,
    })
    expect(
      await overall({
        storage: { estimate: async () => ({}) } as unknown as StorageManager,
      })
    ).toEqual({
      usage: null,
      quota: null,
      persisted: null,
    })
    expect(await askToPersist({ storage: failing })).toBe(false)
    expect(await askToPersist({})).toBe(false)
  })
})
