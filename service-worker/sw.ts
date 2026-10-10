/// <reference lib="webworker" />
import { isImmutable, routeFor } from "../lib/offline"

// Built by scripts/service-worker.mjs after `next build`, which fills these in.
declare const self: ServiceWorkerGlobalScope
declare const __VERSION__: string
declare const __PRECACHE__: string[]

const PREFIX = "keepsimp-offline-"
// One cache per release: a complete copy of the site as it was built.
const CACHE = PREFIX + __VERSION__
// Spelled the way the browser spells the address of a request.
const saved = new Set(
  __PRECACHE__.map((path) => new URL(path, self.location.origin).pathname)
)
/** How long a slow connection may take before the saved copy is shown instead. */
const PATIENCE = 4000
const lookup = { ignoreVary: true }

/** The same response without an address of its own, so it takes the address that was asked for. */
const unaddressed = (response: Response) =>
  new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })

/** Save every file of this release. A failure fails the install, which the browser retries later. */
async function precache() {
  const cache = await caches.open(CACHE)
  const queue = [...__PRECACHE__]
  const worker = async () => {
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
  await Promise.all(Array.from({ length: 4 }, worker))
}

async function immutable(request: Request, key: string) {
  const cache = await caches.open(CACHE)
  const copy = await cache.match(key, lookup)
  if (!copy) return fetch(request)
  // A worker started from a saved response would take that response's address
  // and lose the "#params" the bundler passes in the address it asked for.
  return request.destination === "worker" ? unaddressed(copy) : copy
}

/** The latest from the network; the saved copy when offline or the connection stalls. */
async function fresh(request: Request, key: string) {
  const cache = await caches.open(CACHE)
  const network = fetch(request)
  // If the saved copy answers first, a late network failure has nobody to report to.
  network.catch(() => undefined)
  let timer: number | undefined
  const stalled = new Promise<undefined>((resolve) => {
    timer = self.setTimeout(resolve, PATIENCE)
  })
  try {
    const response = await Promise.race([network, stalled])
    return response ?? (await cache.match(key, lookup)) ?? (await network)
  } catch (error) {
    const copy = await cache.match(key, lookup)
    if (copy) return copy
    throw error
  } finally {
    clearTimeout(timer)
  }
}

self.addEventListener("install", (event) => event.waitUntil(precache()))

// No skipWaiting: a new release takes over once the pages of the old one are
// closed, so an open page keeps the files it was built with.
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name)
      await self.clients.claim()
    })()
  )
)

self.addEventListener("fetch", (event) => {
  const { request } = event
  const route = routeFor(
    {
      method: request.method,
      url: request.url,
      range: request.headers.has("range"),
    },
    self.location.origin,
    (path) => saved.has(path)
  )
  if (route.kind === "network") return
  event.respondWith(
    route.kind === "immutable"
      ? immutable(request, route.key)
      : fresh(request, route.key)
  )
})
