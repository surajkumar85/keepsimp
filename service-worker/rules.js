// @ts-check
/**
 * Offline rules: which files are kept on the device, and how the service
 * worker answers a request.
 *
 * This file is plain JavaScript on purpose. app/sw.js/route.ts copies its text
 * into the worker it writes at build time, so it must run in a browser as it
 * is: no imports, and only `export function` at the top level.
 */

/**
 * @typedef {{ kind: "network" }
 *   | { kind: "immutable", key: string }
 *   | { kind: "fresh", key: string }
 *   | { kind: "data" }
 *   | { kind: "kept", key: string }} Route
 * - network: not ours to answer; the browser handles it as if there were no worker.
 * - immutable: a hashed build file; the saved copy first.
 * - fresh: a page or asset that can change; the network first, the saved copy when it fails.
 * - data: the data a page transition asks for; the network, without waiting on a stalled one.
 * - kept: a large file that only some visitors need; saved the first time it is used, then the saved copy first.
 */

/** Left out of the offline copy. */
const SKIPPED = [
  // Tutorial videos (about 70 MB) stream on demand; posters and captions stay.
  /^videos\/.*\.mp4$/,
  // Link-preview images are read by other sites, never by a visitor.
  /^images\/social\//,
  // Dotfiles such as .gitkeep.
  /(^|\/)\.[^/]*$/,
  // Copies a file-syncing program leaves beside a file ("guide 2.svg"). Git
  // ignores them, so they are on one machine only and no part of a release.
  /(^|\/)[^/]* [2-9](\.[^/]*)?$/,
]

/**
 * Whether a file in `public/` belongs in the offline copy.
 * @param {string} file Path relative to `public/`, such as "images/coastline.jpg".
 */
export function shouldPrecache(file) {
  return !SKIPPED.some((pattern) => pattern.test(file))
}

/**
 * Files that are not in the offline copy until they are first used, and are
 * then kept: what recognises words (OCR) and what takes noise out of sound
 * (RNNoise), which only some visitors need. The
 * folder they are in is named for their version, so a saved copy never goes
 * stale either.
 * @param {string} path
 */
export function isKeptOnUse(path) {
  return /^\/(ocr|rnnoise)\/[^/]+\/[^/]+$/.test(path)
}

/**
 * Build files carry a content hash in their name, so a saved copy never goes stale.
 * @param {string} path
 */
export function isImmutable(path) {
  return path.startsWith("/_next/static/")
}

/**
 * The page a data request belongs to, or null for any other path. Next.js
 * names these files itself: "/blog/index.txt", "/blog/__next._tree.txt".
 * @param {string} path
 */
export function pageOfData(path) {
  const match = /^(.*\/)(?:index|__next\.[^/]+)\.txt$/.exec(path)
  return match ? match[1] : null
}

/**
 * Decide how to answer a request, given what the offline copy holds.
 * @param {{ method: string, url: string, range: boolean }} request
 * @param {string} origin
 * @param {(path: string) => boolean} saved
 * @returns {Route}
 */
export function routeFor(request, origin, saved) {
  const url = new URL(request.url)
  // Range requests are video seeks; the worker never slices files.
  if (request.method !== "GET" || url.origin !== origin || request.range)
    return { kind: "network" }
  // The query is ignored: page data is requested with a cache-busting one.
  const path = url.pathname
  if (isKeptOnUse(path)) return { kind: "kept", key: path }
  if (isImmutable(path))
    return saved(path) ? { kind: "immutable", key: path } : { kind: "network" }
  // "/dashboard" is served as "/dashboard/".
  const key = [path, `${path}/`].find(saved)
  if (key) return { kind: "fresh", key }
  const page = pageOfData(path)
  return page !== null && saved(page) ? { kind: "data" } : { kind: "network" }
}
