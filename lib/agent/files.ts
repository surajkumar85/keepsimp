/**
 * The files an agent can name: those the person added on the agent page (or
 * the bridge put there) and those the tools made. Held in memory only, and
 * gone when the page closes.
 */
import { ToolError, type FileRef } from "./registry"

export type FileOrigin = "added" | "made"

export interface Held {
  ref: FileRef
  blob: Blob
  origin: FileOrigin
}

/** The types of files by their extension, for files that come without one. */
const TYPES: Record<string, string> = {
  json: "application/json",
  jsonl: "application/x-ndjson",
  ndjson: "application/x-ndjson",
  yaml: "application/yaml",
  yml: "application/yaml",
  csv: "text/csv",
  txt: "text/plain",
  ts: "text/plain",
  css: "text/css",
  scss: "text/x-scss",
  gpl: "text/plain",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
}

export const typeOf = (name: string) =>
  TYPES[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream"

/** A name that is only a name: no folders, no control characters, not too long. */
export function safeName(name: string) {
  const last = name.split(/[\\/]/).pop()!
  const clean = last.replace(/[\u0000-\u001f\u007f]/g, "").trim()
  const kept = clean.replace(/^\.+/, "")
  if (!kept) return "file"
  if (kept.length <= 120) return kept
  const dot = kept.lastIndexOf(".")
  const extension = dot > 0 && kept.length - dot <= 12 ? kept.slice(dot) : ""
  return kept.slice(0, 120 - extension.length) + extension
}

/** A name for what was made of `from`: "data.json" and "-formatted", ".json" give "data-formatted.json". */
export function madeName(
  from: string | null,
  suffix: string,
  extension: string
) {
  const stem = from ? safeName(from).replace(/\.[^.]+$/, "") : ""
  return safeName(
    `${stem ? stem + suffix : suffix.replace(/^-/, "")}.${extension}`
  )
}

export class FileStore {
  private readonly held = new Map<string, Held>()
  private count = 0
  private readonly listeners = new Set<() => void>()
  private cached: ReturnType<FileStore["list"]> | null = null

  add(blob: Blob, name: string, origin: FileOrigin = "added"): FileRef {
    const named = safeName(name)
    const ref: FileRef = {
      id: `file-${++this.count}`,
      name: named,
      type: blob.type || typeOf(named),
      size: blob.size,
    }
    this.held.set(ref.id, { ref, blob, origin })
    this.changed()
    return ref
  }

  /** The file named by `id`; a problem the agent can read when there is none. */
  get(id: string): Held {
    const held = this.held.get(id)
    if (!held)
      throw new ToolError(
        `There is no file "${id}". The files that can be named are: ${
          this.list()
            .map((file) => file.id)
            .join(", ") || "none yet"
        }.`
      )
    return held
  }

  has(id: string) {
    return this.held.has(id)
  }

  list(): (FileRef & { origin: FileOrigin })[] {
    return [...this.held.values()].map((held) => ({
      ...held.ref,
      origin: held.origin,
    }))
  }

  /** The list, the same array until a file is added or removed (for React). */
  snapshot() {
    this.cached ??= this.list()
    return this.cached
  }

  remove(id: string) {
    if (this.held.delete(id)) this.changed()
  }

  /** Told whenever a file is added or removed; returns how to stop being told. */
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private changed() {
    this.cached = null
    for (const listener of this.listeners) listener()
  }
}
