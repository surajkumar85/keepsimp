/**
 * Where results are written while they are made: the browser's own private
 * storage for this site (the origin private file system), so a video of
 * any length is written to disk rather than held in memory. Each open page
 * has a folder of its own; it is emptied when the page goes, and folders a
 * closed page left behind are emptied the next time the workspace opens.
 * Nothing here leaves the device or is kept once its page is gone.
 */

export const SCRATCH_FOLDER = "keepsimp-video"

/** A folder left by a page this long ago is taken to be closed. */
export const STALE_AFTER = 6 * 60 * 60 * 1000

interface SyncAccess {
  write(data: Uint8Array, options: { at: number }): number
  flush(): void
  close(): void
}

async function folder(name: string, create: boolean) {
  const root = await navigator.storage.getDirectory()
  const all = await root.getDirectoryHandle(SCRATCH_FOLDER, { create })
  return { all, own: await all.getDirectoryHandle(name, { create }) }
}

/**
 * A file to write into at any place, from a worker. Null where the browser
 * offers no such storage (a private window, say): the result is then held
 * in memory.
 */
export async function scratchFile(page: string, name: string) {
  let handle: FileSystemFileHandle
  let access: SyncAccess
  try {
    const { own } = await folder(page, true)
    handle = await own.getFileHandle(name, { create: true })
    access = await (
      handle as unknown as { createSyncAccessHandle(): Promise<SyncAccess> }
    ).createSyncAccessHandle()
  } catch {
    return null
  }
  let open = true
  const close = () => {
    if (!open) return
    open = false
    access.flush()
    access.close()
  }
  return {
    writable: new WritableStream<{ data: Uint8Array; position: number }>({
      write(chunk) {
        access.write(chunk.data, { at: chunk.position })
      },
      close,
      abort: close,
    }),
    /** The file as written, once the writing has ended. */
    async file() {
      close()
      return handle.getFile()
    },
    close,
  }
}

/** Remove one result's file. */
export async function removeScratch(page: string, name: string) {
  try {
    const { own } = await folder(page, false)
    await own.removeEntry(name)
  } catch {
    // Already gone.
  }
}

/** Empty this page's folder, and those closed pages left behind. */
export async function clearScratch(page: string | null, now = Date.now()) {
  let all: FileSystemDirectoryHandle
  try {
    const root = await navigator.storage.getDirectory()
    all = await root.getDirectoryHandle(SCRATCH_FOLDER)
  } catch {
    return
  }
  const entries = (
    all as unknown as {
      entries(): AsyncIterable<[string, FileSystemHandle]>
    }
  ).entries()
  for await (const [name, entry] of entries) {
    if (entry.kind !== "directory") continue
    let stale = name === page
    if (!stale) {
      let newest = 0
      const files = (
        entry as unknown as {
          values(): AsyncIterable<FileSystemHandle>
        }
      ).values()
      for await (const file of files)
        if (file.kind === "file")
          newest = Math.max(
            newest,
            (await (file as FileSystemFileHandle).getFile()).lastModified
          )
      stale = now - newest > STALE_AFTER
    }
    if (stale)
      try {
        await all.removeEntry(name, { recursive: true })
      } catch {
        // In use by another page, or gone.
      }
  }
}
