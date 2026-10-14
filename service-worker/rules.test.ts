import { describe, expect, it } from "vitest"
import {
  isImmutable,
  isKeptOnUse,
  pageOfData,
  routeFor,
  shouldPrecache,
} from "./rules.js"

describe("shouldPrecache", () => {
  it("keeps images, icons, posters, captions and licences", () => {
    for (const file of [
      "icon.svg",
      "images/coastline.jpg",
      "icons/icon-192.png",
      "brand/keepsimp-mark.svg",
      "licenses/outfit.txt",
      "videos/image-converter-tutorial-poster.webp",
      "videos/image-converter-tutorial.vtt",
    ])
      expect(shouldPrecache(file), file).toBe(true)
  })

  it("leaves out video files, link-preview images and dotfiles", () => {
    for (const file of [
      "videos/image-converter-tutorial.mp4",
      "images/social/keepsimp.png",
      ".gitkeep",
      "images/.DS_Store",
    ])
      expect(shouldPrecache(file), file).toBe(false)
  })

  it("leaves out the copies a syncing program makes beside a file", () => {
    for (const file of [
      "images/pdf-edit-guide 2.svg",
      "fonts/editor/LICENSE 3.txt",
      "samples/handbook 2",
    ])
      expect(shouldPrecache(file), file).toBe(false)
    // A number that is part of a name is not such a copy.
    expect(shouldPrecache("images/chapter 12.svg")).toBe(true)
    expect(shouldPrecache("images/step2.svg")).toBe(true)
    expect(shouldPrecache("images 2/guide.svg")).toBe(true)
  })

  it("does not mistake similar names for skipped ones", () => {
    expect(shouldPrecache("images/videos/clip.mp4.png")).toBe(true)
    expect(shouldPrecache("images/social.png")).toBe(true)
    expect(shouldPrecache("images/mp4-guide.svg")).toBe(true)
  })
})

describe("pageOfData", () => {
  it("finds the page a data file belongs to", () => {
    expect(pageOfData("/index.txt")).toBe("/")
    expect(pageOfData("/blog/index.txt")).toBe("/blog/")
    expect(pageOfData("/dashboard/__next._tree.txt")).toBe("/dashboard/")
    expect(
      pageOfData(
        "/dashboard/image-converter/__next.!KHdvcmtzcGFjZSk.dashboard.$d$tool.__PAGE__.txt"
      )
    ).toBe("/dashboard/image-converter/")
  })

  it("ignores every other file", () => {
    expect(pageOfData("/licenses/outfit.txt")).toBeNull()
    expect(pageOfData("/robots.txt")).toBeNull()
    expect(pageOfData("/dashboard/")).toBeNull()
    expect(pageOfData("/blog/my-index.txt")).toBeNull()
  })
})

describe("routeFor", () => {
  const origin = "https://keepsimp.vercel.app"
  const files = new Set([
    "/",
    "/dashboard/",
    "/_next/static/chunks/app.js",
    "/images/coastline.jpg",
    "/licenses/outfit.txt",
  ])
  const saved = (/** @type {string} */ path: string) => files.has(path)
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

  it("prefers the network for pages and assets", () => {
    expect(route("/")).toEqual({ kind: "fresh", key: "/" })
    expect(route("/dashboard/")).toEqual({ kind: "fresh", key: "/dashboard/" })
    expect(route("/images/coastline.jpg")).toEqual({
      kind: "fresh",
      key: "/images/coastline.jpg",
    })
    expect(route("/licenses/outfit.txt")).toEqual({
      kind: "fresh",
      key: "/licenses/outfit.txt",
    })
  })

  it("ignores the query and a missing trailing slash", () => {
    expect(route("/dashboard?category=image")).toEqual({
      kind: "fresh",
      key: "/dashboard/",
    })
    expect(route("/images/coastline.jpg?v=2")).toEqual({
      kind: "fresh",
      key: "/images/coastline.jpg",
    })
  })

  it("watches over the data of saved pages only", () => {
    expect(route("/dashboard/index.txt?_rsc=1a2b3")).toEqual({ kind: "data" })
    expect(route("/__next._tree.txt")).toEqual({ kind: "data" })
    expect(route("/pricing/index.txt")).toEqual({ kind: "network" })
  })

  it("keeps what recognises words once it is first used, whatever its version", () => {
    expect(isKeptOnUse("/ocr/7.0.0-6.1.2-eng4.0.0/eng.traineddata.gz")).toBe(
      true
    )
    expect(isKeptOnUse("/ocr/")).toBe(false)
    expect(isKeptOnUse("/ocr/worker.min.js")).toBe(false)
    expect(isKeptOnUse("/blog/ocr/a/b")).toBe(false)
    expect(route("/ocr/v1/worker.min.js?x=1")).toEqual({
      kind: "kept",
      key: "/ocr/v1/worker.min.js",
    })
    // Range requests are never sliced from a kept copy.
    expect(route("/ocr/v1/worker.min.js", { range: true })).toEqual({
      kind: "network",
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
