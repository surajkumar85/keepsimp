import { createServer, type Server } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".vtt": "text/vtt; charset=utf-8",
}

/**
 * Serves the exported site on its own port, so a test can take the network
 * away for real (stop), bring it back (start), or publish changed files.
 */
export async function serveExport(root = "out") {
  const replaced = new Map<string, string>()
  const delays: [RegExp, number][] = []
  const requests: string[] = []
  let server: Server | undefined
  let port = 0

  const start = () =>
    new Promise<void>((resolve) => {
      server = createServer(async (request, response) => {
        const path = decodeURIComponent(
          new URL(request.url!, "http://site").pathname
        )
        requests.push(path)
        const wait = delays.find(([pattern]) => pattern.test(path))?.[1]
        if (wait) await new Promise((done) => setTimeout(done, wait))
        const file = path.endsWith("/") ? `${path}index.html` : path
        let body: Buffer
        let status = 200
        try {
          body = replaced.has(path)
            ? Buffer.from(replaced.get(path)!)
            : await readFile(join(root, normalize(file)))
        } catch {
          body = await readFile(join(root, "404.html"))
          status = 404
        }
        const headers: Record<string, string> = {
          "content-type":
            status === 404
              ? TYPES[".html"]
              : (TYPES[extname(file)] ?? "application/octet-stream"),
          "cache-control": "no-cache",
          "accept-ranges": "bytes",
        }
        // Browsers ask for videos in ranges.
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "")
        if (range && status === 200) {
          const first = Number(range[1])
          const last = range[2] ? Number(range[2]) : body.length - 1
          headers["content-range"] = `bytes ${first}-${last}/${body.length}`
          status = 206
          body = body.subarray(first, last + 1)
        }
        response.writeHead(status, {
          ...headers,
          "content-length": String(body.length),
        })
        response.end(body)
      }).listen(port, "127.0.0.1", () => {
        const address = server!.address()
        if (address && typeof address === "object") port = address.port
        resolve()
      })
    })

  const stop = () =>
    new Promise<void>((resolve) => {
      if (!server) return resolve()
      server.close(() => resolve())
      server.closeAllConnections()
      server = undefined
    })

  await start()
  return {
    origin: `http://127.0.0.1:${port}`,
    /** Paths asked for since the last call. */
    seen: () => requests.splice(0),
    /** Publish different content at a path, as a new release would. */
    replace: (path: string, body: string) => replaced.set(path, body),
    /** Make matching paths answer slowly. */
    delay: (pattern: RegExp, milliseconds: number) =>
      delays.push([pattern, milliseconds]),
    start,
    stop,
  }
}

export type Site = Awaited<ReturnType<typeof serveExport>>
