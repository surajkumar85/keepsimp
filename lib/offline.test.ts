import { describe, expect, it } from "vitest"
import { isImmutable, routeFor, shouldPrecache, urlPath } from "./offline"

describe("shouldPrecache", () => {
  it("keeps pages, page data, build files, images and icons", () => {
    for (const file of [
      "index.html",
      "dashboard/image-converter/index.html",
      "dashboard/index.txt",
      "__next.!KG1hcmtldGluZyk.__PAGE__.txt",
      "_next/static/chunks/abc.js",
      "_next/static/media/avif_enc.wasm",
      "images/coastline.jpg",
      "icons/icon-192.png",
      "manifest.webmanifest",
      "videos/image-converter-tutorial-poster.webp",
      "videos/image-converter-tutorial.vtt",
    ])
      expect(shouldPrecache(file), file).toBe(true)
  })

  it("leaves out video files, link-preview images, not-found pages, the worker and dotfiles", () => {
    for (const file of [
      "videos/image-converter-tutorial.mp4",
      "images/social/keepsimp.png",
      "sw.js",
      "404.html",
      "404/index.html",
      "_not-found/index.txt",
      ".gitkeep",
      "images/.DS_Store",
    ])
      expect(shouldPrecache(file), file).toBe(false)
  })

  it("does not mistake similar names for skipped ones", () => {
    expect(shouldPrecache("blog/videos/index.html")).toBe(true)
    expect(shouldPrecache("_next/static/chunks/sw.js")).toBe(true)
    expect(shouldPrecache("images/social.png")).toBe(true)
    expect(shouldPrecache("blog/404-errors/index.html")).toBe(true)
    expect(shouldPrecache("4040.html")).toBe(true)
  })
})

describe("urlPath", () => {
  it("serves index pages at their folder", () => {
    expect(urlPath("index.html")).toBe("/")
    expect(urlPath("blog/index.html")).toBe("/blog/")
    expect(urlPath("dashboard/image-converter/index.html")).toBe(
      "/dashboard/image-converter/"
    )
  })

  it("leaves every other file at its own path", () => {
    expect(urlPath("icon.svg")).toBe("/icon.svg")
    expect(urlPath("dashboard/index.txt")).toBe("/dashboard/index.txt")
    expect(urlPath("images/my-index.html")).toBe("/images/my-index.html")
  })
})

describe("routeFor", () => {
  const origin = "https://keepsimp.vercel.app"
  const files = new Set([
    "/",
    "/dashboard/",
    "/dashboard/index.txt",
    "/_next/static/chunks/app.js",
    "/images/coastline.jpg",
  ])
  const saved = (path: string) => files.has(path)
  const route = (
    path: string,
    options: { method?: string; range?: boolean } = {}
  ) =>
    routeFor(
      {
        method: options.method ?? "GET",
        url: new URL(path, origin).toString(),
        range: options.range ?? false,
      },
      origin,
      saved
    )

  it("answers hashed build files from the saved copy", () => {
    expect(isImmutable("/_next/static/chunks/app.js")).toBe(true)
    expect(isImmutable("/_next/image")).toBe(false)
    expect(route("/_next/static/chunks/app.js")).toEqual({
      kind: "immutable",
      key: "/_next/static/chunks/app.js",
    })
  })

  it("leaves build files from a newer release to the network", () => {
    expect(route("/_next/static/chunks/newer.js")).toEqual({ kind: "network" })
  })

  it("prefers the network for pages, page data and assets", () => {
    expect(route("/")).toEqual({ kind: "fresh", key: "/" })
    expect(route("/dashboard/")).toEqual({ kind: "fresh", key: "/dashboard/" })
    expect(route("/images/coastline.jpg")).toEqual({
      kind: "fresh",
      key: "/images/coastline.jpg",
    })
  })

  it("ignores the query and a missing trailing slash", () => {
    expect(route("/dashboard/index.txt?_rsc=1a2b3")).toEqual({
      kind: "fresh",
      key: "/dashboard/index.txt",
    })
    expect(route("/dashboard?category=image")).toEqual({
      kind: "fresh",
      key: "/dashboard/",
    })
  })

  it("stays out of the way of everything else", () => {
    expect(route("/videos/image-converter-tutorial.mp4")).toEqual({
      kind: "network",
    })
    expect(route("/images/coastline.jpg", { range: true })).toEqual({
      kind: "network",
    })
    expect(route("/dashboard/", { method: "POST" })).toEqual({
      kind: "network",
    })
    expect(
      routeFor(
        { method: "GET", url: "https://example.com/", range: false },
        origin,
        saved
      )
    ).toEqual({ kind: "network" })
  })
})
