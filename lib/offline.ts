/**
 * Offline support: which exported files are kept on the device, and how the
 * service worker answers a request. Pure, so both the build step and the
 * worker share one set of rules.
 */

/** Left out of the offline copy. */
const SKIPPED = [
  // Tutorial videos are 29 MB and stream on demand; posters and captions stay.
  /^videos\/.*\.mp4$/,
  // Link-preview images are read by other sites, never by a visitor.
  /^images\/social\//,
  // Not-found pages answer under other addresses, and only with a connection.
  /^404(\.html$|\/)/,
  /^_not-found\//,
  // The worker never serves itself, so updates always come from the network.
  /^sw\.js$/,
  // Dotfiles such as .gitkeep.
  /(^|\/)\.[^/]*$/,
]

/** Whether a file in the export belongs in the offline copy. */
export function shouldPrecache(file: string): boolean {
  return !SKIPPED.some((pattern) => pattern.test(file))
}

/** The URL path a file in the export is served at: "blog/index.html" is "/blog/". */
export function urlPath(file: string): string {
  return `/${file}`.replace(/\/index\.html$/, "/")
}

/** Build files carry a content hash in their name, so a saved copy never goes stale. */
export function isImmutable(path: string): boolean {
  return path.startsWith("/_next/static/")
}

export type Route =
  /** Not ours to answer; the browser handles it as if there were no worker. */
  | { kind: "network" }
  /** A hashed build file: the saved copy first. */
  | { kind: "immutable"; key: string }
  /** A page or asset that can change: the network first, the saved copy when it fails. */
  | { kind: "fresh"; key: string }

/** Decide how to answer a request, given what the offline copy holds. */
export function routeFor(
  request: { method: string; url: string; range: boolean },
  origin: string,
  saved: (path: string) => boolean
): Route {
  const url = new URL(request.url)
  // Range requests are video seeks; the worker never slices files.
  if (request.method !== "GET" || url.origin !== origin || request.range)
    return { kind: "network" }
  // The query is ignored: page data is requested with a cache-busting one.
  const path = url.pathname
  if (isImmutable(path))
    return saved(path) ? { kind: "immutable", key: path } : { kind: "network" }
  // "/dashboard" is served as "/dashboard/".
  const key = [path, `${path}/`].find(saved)
  return key ? { kind: "fresh", key } : { kind: "network" }
}
