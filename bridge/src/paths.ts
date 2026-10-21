/**
 * Which files the bridge may read and where it may write: only inside the
 * folders the agent works in (its MCP roots, or the folder the bridge was
 * started in and any given with --allow). Paths are resolved through
 * symbolic links before they are judged, and nothing is ever overwritten.
 */
import { mkdir, realpath, stat } from "node:fs/promises"
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
  sep,
} from "node:path"
import { fileURLToPath } from "node:url"

/** A problem with what the agent asked, told to it in words. */
export class BridgeProblem extends Error {}

const within = (path: string, folder: string) =>
  path === folder ||
  path.startsWith(folder.endsWith(sep) ? folder : folder + sep)

/** A root as MCP gives it (a file: address) or as a path. */
export function rootPath(root: string) {
  return root.startsWith("file:") ? fileURLToPath(root) : resolve(root)
}

export class Folders {
  private folders: string[] = []

  /** The folders, each resolved through links; those that do not exist are left out. */
  async set(paths: readonly string[]) {
    const found: string[] = []
    for (const path of paths)
      try {
        const real = await realpath(rootPath(path))
        if ((await stat(real)).isDirectory() && !found.includes(real))
          found.push(real)
      } catch {
        // A root that is not there allows nothing.
      }
    this.folders = found
  }

  list(): readonly string[] {
    return this.folders
  }

  private refuse(path: string): never {
    throw new BridgeProblem(
      this.folders.length
        ? `${path} is outside the folders KeepSimp may use: ${this.folders.join(", ")}. Start the bridge with --allow <folder> to add one.`
        : `KeepSimp may not use any folder yet. Start the bridge in your project, or with --allow <folder>.`
    )
  }

  /** An existing file to read, as its real path, when it lies inside the folders. */
  async file(given: string) {
    const path = isAbsolute(given)
      ? given
      : resolve(this.folders[0] ?? ".", given)
    let real: string
    try {
      real = await realpath(path)
    } catch {
      throw new BridgeProblem(`There is no file at ${path}.`)
    }
    if (!this.folders.some((folder) => within(real, folder))) this.refuse(path)
    if (!(await stat(real)).isFile())
      throw new BridgeProblem(`${path} is a folder, not a file.`)
    return real
  }

  /**
   * A folder to write in, made when it is not there yet: judged by the
   * nearest part of it that exists, so a link cannot lead outside.
   */
  async folder(given: string) {
    const path = isAbsolute(given)
      ? given
      : resolve(this.folders[0] ?? ".", given)
    let existing = path
    const missing: string[] = []
    for (;;) {
      try {
        existing = await realpath(existing)
        break
      } catch {
        missing.unshift(basename(existing))
        const up = dirname(existing)
        // The top of a disk always exists, so this never happens.
        /* node:coverage ignore next */
        if (up === existing) this.refuse(path)
        existing = up
      }
    }
    const real = join(existing, ...missing)
    if (!this.folders.some((folder) => within(real, folder))) this.refuse(path)
    if (missing.length) await mkdir(real, { recursive: true })
    else if (!(await stat(real)).isDirectory())
      throw new BridgeProblem(`${path} is a file, not a folder.`)
    return real
  }
}

/** A path in `folder` for a file called `name` that does not exist yet: "a.json", then "a (2).json". */
export async function freePath(
  folder: string,
  name: string,
  count = 1
): Promise<string> {
  const extension = extname(name)
  const stem = name.slice(0, name.length - extension.length)
  const path = join(
    folder,
    count === 1 ? name : `${stem} (${count})${extension}`
  )
  try {
    await stat(path)
  } catch {
    return path
  }
  return freePath(folder, name, count + 1)
}
