import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import { tools } from "./catalogue"
import { offlineFiles, pagePaths, workerScript } from "./offline"

it("lists every page of the site, and only working tools", () => {
  const pages = pagePaths()
  for (const page of [
    "/",
    "/dashboard/",
    "/design-system/",
    "/blog/",
    "/privacy/",
    "/blog/jpeg-png-webp-which-format/",
    "/dashboard/image-converter/",
    "/dashboard/json-formatter/",
  ])
    expect(pages).toContain(page)
  for (const tool of tools.filter((tool) => tool.status === "planned"))
    expect(pages).not.toContain(`/dashboard/${tool.id}/`)
  for (const page of pages) expect(page).toMatch(/^\/([a-z0-9-]+\/)*$/)
})

it("gathers pages, build files and public files into one sorted list", () => {
  const files = offlineFiles(
    ["chunks/app.js", "media/avif_enc.wasm", "build-id/_buildManifest.js"],
    [
      "icon.svg",
      "images/coastline.jpg",
      "images/social/keepsimp.png",
      "videos/image-converter-tutorial.mp4",
      "videos/image-converter-tutorial-poster.webp",
      ".gitkeep",
    ]
  )
  for (const file of [
    "/",
    "/dashboard/image-compressor/",
    "/favicon.ico",
    "/manifest.webmanifest",
    "/_next/static/chunks/app.js",
    "/_next/static/media/avif_enc.wasm",
    "/_next/static/build-id/_buildManifest.js",
    "/icon.svg",
    "/images/coastline.jpg",
    "/videos/image-converter-tutorial-poster.webp",
  ])
    expect(files).toContain(file)
  expect(files).not.toContain("/videos/image-converter-tutorial.mp4")
  expect(files).not.toContain("/images/social/keepsimp.png")
  expect(files).not.toContain("/.gitkeep")
  expect(files).not.toContain("/sw.js")
  expect(files).toEqual([...files].sort())
})

it("lists a file once, even when it is found twice", () => {
  const files = offlineFiles(
    ["chunks/app.js", "chunks/app.js"],
    ["favicon.ico"]
  )
  expect(new Set(files).size).toBe(files.length)
  expect(files.filter((file) => file === "/favicon.ico")).toHaveLength(1)
})

it("writes a worker that runs as a plain script", async () => {
  const rules = await readFile("service-worker/rules.js", "utf8")
  const body = await readFile("service-worker/sw.js", "utf8")
  const script = workerScript("abc123", ["/", '/a "quoted" file'], rules, body)
  expect(script).toContain('const VERSION = "abc123";')
  expect(script).toContain('const PRECACHE = ["/","/a \\"quoted\\" file"];')
  // No module syntax survives, and the whole script parses.
  expect(script).not.toMatch(/^\s*(export|import) /m)
  expect(() => new Function(script)).not.toThrow()

  // Run it against a stand-in worker scope: it must take its three events.
  const events: string[] = []
  const scope = {
    location: { origin: "https://keepsimp.vercel.app" },
    addEventListener: (name: string) => events.push(name),
  }
  new Function("self", script)(scope)
  expect(events).toEqual(["install", "activate", "fetch"])
})
