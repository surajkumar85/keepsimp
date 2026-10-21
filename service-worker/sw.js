// @ts-check
/// <reference lib="webworker" />
/* global VERSION, PRECACHE, isImmutable, routeFor, keptFolders */

// The body of the service worker. app/sw.js/route.ts writes the finished
// worker at build time: VERSION and PRECACHE first, then the functions of
// rules.js, then this file.

const worker = /** @type {ServiceWorkerGlobalScope} */ (
  /** @type {unknown} */ (self)
)
const PREFIX = "keepsimp-offline-"
// One cache per release: a copy of the site as it was built.
const CACHE = PREFIX + VERSION
// Files saved when they are first used. Not one release's: they are kept
// across releases, so this name does not start with PREFIX.
const KEPT = "keepsimp-kept-on-use"
// Spelled the way the browser spells the address of a request.
const saved = new Set(
  PRECACHE.map((path) => new URL(path, worker.location.origin).pathname)
)
/** How long a slow connection may take before the saved copy is shown instead. */
const PATIENCE = 4000
const lookup = { ignoreVary: true }

/**
 * The same response without an address of its own, so it takes the address that was asked for.
 * @param {Response} response
 */
const unaddressed = (response) =>
  new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })

/**
 * Resolves with nothing once a request has had its share of patience.
 * @returns {{ stalled: Promise<undefined>, settle: () => void }}
 */
function patience() {
  let timer = 0
  /** @type {Promise<undefined>} */
  const stalled = new Promise((resolve) => {
    timer = worker.setTimeout(() => resolve(undefined), PATIENCE)
  })
  return { stalled, settle: () => worker.clearTimeout(timer) }
}

/** Save every file of this release. A failure fails the install, which the browser retries later. */
async function precache() {
  const cache = await caches.open(CACHE)
  const queue = [...PRECACHE]
  const download = async () => {
    for (let path = queue.pop(); path; path = queue.pop()) {
      // An interrupted install picks up where it stopped.
      if (await cache.match(path, lookup)) continue
      // Hashed files are identical across releases; reuse an earlier download.
      const earlier = isImmutable(path)
        ? await caches.match(path, lookup)
        : undefined
      const response =
        earlier ??
        (await fetch(path, {
          cache: isImmutable(path) ? "default" : "no-cache",
        }))
      // A file this host does not serve cannot be needed offline either.
      if (response.status === 404) continue
      if (!response.ok) throw new Error(`${path}: ${response.status}`)
      await cache.put(
        path,
        // A redirected response cannot answer a page load, so store a plain copy.
        response.redirected ? unaddressed(response) : response
      )
    }
  }
  // A few at a time, so the page that is open keeps its share of the connection.
  await Promise.all(Array.from({ length: 4 }, download))
}

/**
 * @param {Request} request
 * @param {string} key
 */
async function immutable(request, key) {
  const cache = await caches.open(CACHE)
  const copy = await cache.match(key, lookup)
  if (!copy) return fetch(request)
  // A worker started from a saved response would take that response's address
  // and lose the "#params" the bundler passes in the address it asked for.
  return request.destination === "worker" ? unaddressed(copy) : copy
}

/**
 * The latest from the network; the saved copy when offline or the connection stalls.
 * @param {Request} request
 * @param {string} key
 */
async function fresh(request, key) {
  const cache = await caches.open(CACHE)
  const network = fetch(request)
  // If the saved copy answers first, a late network failure has nobody to report to.
  network.catch(() => undefined)
  const { stalled, settle } = patience()
  try {
    const response = await Promise.race([network, stalled])
    return response ?? (await cache.match(key, lookup)) ?? (await network)
  } catch (error) {
    const copy = await cache.match(key, lookup)
    if (copy) return copy
    throw error
  } finally {
    settle()
  }
}

/**
 * The saved copy; the network the first time, when what it answers is saved.
 * Files of the same kind and another version are let go of then.
 * @param {Request} request
 * @param {string} key
 */
async function kept(request, key) {
  const cache = await caches.open(KEPT)
  const copy = await cache.match(key, lookup)
  if (copy) return request.destination === "worker" ? unaddressed(copy) : copy
  const response = await fetch(request)
  if (response.ok && !response.redirected)
    // Keeping it is a kindness: a full store (a private window's is small)
    // must not cost the page the file it asked for.
    try {
      await cache.put(key, response.clone())
      const { kind, version } = keptFolders(key)
      for (const old of await cache.keys()) {
        const path = new URL(old.url).pathname
        if (path.startsWith(kind) && !path.startsWith(version))
          await cache.delete(old)
      }
    } catch {
      // Fetched again next time.
    }
  return response
}

/**
 * Page data is not saved. When it cannot arrive, say so promptly: the page
 * then loads in full instead, and that load can use the saved copy.
 * @param {Request} request
 */
async function data(request) {
  const network = fetch(request)
  network.catch(() => undefined)
  const { stalled, settle } = patience()
  try {
    return (await Promise.race([network, stalled])) ?? Response.error()
  } finally {
    settle()
  }
}

worker.addEventListener("install", (event) => event.waitUntil(precache()))

// No skipWaiting: a new release takes over once the pages of the old one are
// closed, so an open page keeps the files it was built with.
worker.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name)
      await worker.clients.claim()
    })()
  )
)

worker.addEventListener("fetch", (event) => {
  const { request } = event
  const route = routeFor(
    {
      method: request.method,
      url: request.url,
      range: request.headers.has("range"),
    },
    worker.location.origin,
    (path) => saved.has(path)
  )
  if (route.kind === "network") return
  event.respondWith(
    route.kind === "immutable"
      ? immutable(request, route.key)
      : route.kind === "fresh"
        ? fresh(request, route.key)
        : route.kind === "kept"
          ? kept(request, route.key)
          : data(request)
  )
})
