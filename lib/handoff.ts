/**
 * Files chosen on the home page, handed to the tool page that opens next.
 * They are held in this tab's memory only, never stored or sent, for the
 * one address they were chosen for, and taken once. If that page is not
 * opened soon after, they are dropped.
 */

export const HANDOFF_TIMEOUT = 60_000

let waiting: { path: string; files: File[]; at: number } | null = null

/** A path without its query, fragment or last slash, so `/a/` and `/a#b` match `/a`. */
export function plainPath(path: string) {
  return path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/"
}

/** Keeps files for the page at `path` (which may carry a fragment). */
export function handOver(path: string, files: File[], now = Date.now()) {
  waiting = files.length ? { path: plainPath(path), files, at: now } : null
}

/** The files kept for the page at `path`, once; none when they were meant for another page or have waited too long. */
export function takeHandedFiles(path: string, now = Date.now()): File[] {
  const found = waiting
  if (!found) return []
  if (now - found.at > HANDOFF_TIMEOUT) {
    waiting = null
    return []
  }
  if (found.path !== plainPath(path)) return []
  waiting = null
  return found.files
}
