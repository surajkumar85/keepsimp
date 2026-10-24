import { replaceEditor } from "./editor"
import { test, expect, type Download } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import sharp from "sharp"
import { posts } from "../lib/blog"

async function downloadedBytes(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

test("landing CTA opens the working dashboard", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Less busywork"
  )
  await expect(page.locator('[data-sidebar="sidebar"]')).toHaveCount(0)
  await page
    .getByRole("link", { name: "Open the dashboard", exact: true })
    .first()
    .click()
  await expect(page).toHaveURL(/\/dashboard\/$/)
  await expect(page.getByTestId("tool-card")).toHaveCount(13)
  await expect(
    page.getByTestId("tools-ready").getByTestId("tool-card")
  ).toHaveCount(13)
  await expect(page.getByTestId("tools-planned")).toHaveCount(0)
  await page.getByRole("link", { name: "JSON formatter", exact: true }).click()
  await expect(page.getByLabel("Your JSON", { exact: true })).toBeVisible()
})

test("landing demonstration creates a real smaller image download", async ({
  page,
}) => {
  await page.goto("/")
  const webpSupported = await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    return canvas.toDataURL("image/webp").startsWith("data:image/webp")
  })
  await page.getByRole("button", { name: "Try image compression" }).click()
  const link = page.getByRole("link", { name: "Download example" })
  await expect(link).toBeVisible()
  const downloading = page.waitForEvent("download")
  await link.click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe(
    `coastline-keepsimp.${webpSupported ? "webp" : "jpg"}`
  )
  const buffer = await downloadedBytes(download)
  const metadata = await sharp(buffer).metadata()
  expect(metadata.format).toBe(webpSupported ? "webp" : "jpeg")
  expect(metadata.width).toBe(960)
  const original = await page.request.get("/images/coastline.jpg")
  expect(buffer.length).toBeLessThan((await original.body()).length)
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Try image compression" })
  ).toBeVisible()
})

// Each image tool has its own engine and spec file: image-compressor,
// image-resizer and image-converter.

test("JSON formatting validates input and preserves precision in the download", async ({
  page,
}) => {
  await page.goto("/dashboard/json-formatter/")
  const input = page.getByLabel("Your JSON", { exact: true })
  await replaceEditor(input, '{"bad":}')
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "not valid"
  )
  const value = '{"id":9007199254740993,"escaped":"a, b","empty":[]}'
  await replaceEditor(input, value)
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(page.getByLabel("Formatted result")).toContainText(
    /9007199254740993/
  )
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0)
  const downloading = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download JSON" }).click()
  const result = (await downloadedBytes(await downloading)).toString("utf8")
  expect(result).toContain('\n  "id": 9007199254740993')
  expect(result).toContain('"escaped": "a, b"')
  await page.getByRole("button", { name: "Minify", exact: true }).click()
  await expect(page.getByLabel("Formatted result")).toContainText(value)
  await page.reload()
  await expect(input.locator(".cm-placeholder")).toBeVisible()
})

test("blog articles have crawlable content, accurate metadata and working tool links", async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.goto("/blog/")
  await expect(page.getByRole("article")).toHaveCount(posts.length)
  for (const post of posts) {
    await page.goto(`/blog/${post.slug}/`, { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(post.title)
    // The tab says what people search for, where an article has such a title.
    await expect(page).toHaveTitle(
      new RegExp(
        (post.searchTitle ?? post.title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      )
    )
    if (post.keywords)
      await expect(page.getByTestId("topics")).toContainText(post.keywords[0])
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://keepsimp.vercel.app/blog/${post.slug}/`
    )
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "article"
    )
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      post.description
    )
    const data = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent())!
    )
    expect(data["@graph"][0]["@type"]).toBe("BlogPosting")
    expect(data["@graph"][0].headline).toBe(post.title)
    expect(data["@graph"][1]["@type"]).toBe("BreadcrumbList")
    await page
      .getByRole("navigation", { name: "In this article" })
      .getByRole("link")
      .first()
      .click()
    await expect(page).toHaveURL(new RegExp(`#${post.sections[0].id}$`))
    // Links inside the article lead to pages of this site that are there.
    const inside = page.locator(".article-copy section ul a[href^='/']")
    for (const href of await inside.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")!)
    ))
      expect((await page.request.get(href)).ok(), href).toBe(true)
    await page
      .getByRole("link", {
        name: post.tool ? "Try the tool" : "Open the tools",
        exact: true,
      })
      .click()
    await expect(page).toHaveURL(
      post.tool
        ? new RegExp(
            `/dashboard/${post.tool}/${post.toolAnchor ? `#${post.toolAnchor}` : ""}$`
          )
        : /\/dashboard\/$/
    )
    if (post.toolAnchor)
      await expect(
        page.getByRole("tab", { name: new RegExp(`^${post.toolAnchor}$`, "i") })
      ).toHaveAttribute("aria-selected", "true")
  }
})

test("sitemap, robots and social graphics are production ready", async ({
  page,
  request,
}) => {
  await page.goto("/")
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://keepsimp.vercel.app/"
  )
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image"
  )
  const response = await request.get("/sitemap.xml")
  expect(response.ok()).toBe(true)
  const sitemap = await response.text()
  for (const post of posts)
    expect(sitemap).toContain(`https://keepsimp.vercel.app/blog/${post.slug}/`)
  expect(sitemap).toContain(
    "https://keepsimp.vercel.app/dashboard/image-compressor/"
  )
  expect(sitemap).not.toContain("design-system")
  // Ready tools and their doors are listed.
  expect(sitemap).toContain(
    "https://keepsimp.vercel.app/dashboard/video-editor/"
  )
  expect(sitemap).toContain(
    "https://keepsimp.vercel.app/dashboard/video-converter/"
  )
  expect(sitemap).toContain(
    "https://keepsimp.vercel.app/dashboard/video-compressor/"
  )
  expect(sitemap).toContain(
    "https://keepsimp.vercel.app/dashboard/video-trimmer/"
  )
  const robots = await (await request.get("/robots.txt")).text()
  expect(robots).toContain("Allow: /")
  expect(robots).toContain("Sitemap: https://keepsimp.vercel.app/sitemap.xml")
  for (const slug of ["keepsimp", ...posts.map((post) => post.slug)]) {
    const graphic = await request.get(`/images/social/${slug}.png`)
    expect(graphic.ok()).toBe(true)
    const image = await sharp(await graphic.body()).metadata()
    expect(image.width).toBe(1200)
    expect(image.height).toBe(630)
  }
})

test("marketing pages and tool editors are accessible in both themes", async ({
  page,
}) => {
  test.setTimeout(90_000)
  for (const route of [
    "/",
    "/blog/compress-images-without-uploading/",
    "/dashboard/json-formatter/",
    "/dashboard/image-compressor/",
  ]) {
    await page.goto(route)
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(results.violations).toEqual([])
  }
  await page.goto("/")
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  const dark = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(dark.violations).toEqual([])
})

test("mobile marketing has no overflow, keyboard FAQ access or unhandled errors", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  for (const route of [
    "/",
    "/blog/",
    "/blog/format-json-without-losing-precision/",
    "/privacy/",
  ]) {
    await page.goto(route)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    // Once the page has settled: a browser may measure it a moment before its styles are all in.
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
      .toBe(true)
  }
  await page.goto("/")
  const summary = page.locator("summary").first()
  await summary.focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("details").first()).toHaveAttribute("open", "")
  const duration = await page
    .locator(".enter-soft")
    .evaluate((element) =>
      parseFloat(getComputedStyle(element).animationDuration)
    )
  expect(duration).toBeLessThanOrEqual(0.00001)
  await page.getByRole("link", { name: "Skip to content" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()
  expect(errors).toEqual([])
})

test("can be installed to the home screen", async ({ page, request }) => {
  for (const route of ["/", "/dashboard/", "/dashboard/image-converter/"]) {
    await page.goto(route)
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest"
    )
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/icons/apple-touch-icon.png"
    )
  }
  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]')
  ).toHaveAttribute("content", "KeepSimp")

  const response = await request.get("/manifest.webmanifest")
  expect(response.ok()).toBe(true)
  expect(response.headers()["content-type"]).toContain(
    "application/manifest+json"
  )
  const manifest = await response.json()
  expect(manifest).toMatchObject({
    name: "KeepSimp",
    short_name: "KeepSimp",
    start_url: "/dashboard/",
    scope: "/",
    display: "standalone",
  })

  // Every icon is a real square PNG of the size it claims.
  for (const icon of [
    ...manifest.icons,
    { src: "/icons/apple-touch-icon.png", sizes: "180x180" },
  ]) {
    const file = await request.get(icon.src)
    expect(file.ok()).toBe(true)
    const image = await sharp(await file.body()).metadata()
    expect(image.format).toBe("png")
    expect(`${image.width}x${image.height}`).toBe(icon.sizes)
  }
  // Maskable icons fill the square; plain ones keep the mark's clear corners.
  for (const icon of manifest.icons) {
    const { data } = await sharp(await (await request.get(icon.src)).body())
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(data[3] === 255).toBe(icon.purpose === "maskable")
  }

  // The app opens on the tools, and each shortcut leads to a working one.
  expect(manifest.shortcuts).toHaveLength(13)
  for (const url of [
    manifest.start_url,
    ...manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url),
  ]) {
    const target = await request.get(url)
    expect(target.ok()).toBe(true)
  }
  await page.goto(manifest.shortcuts[0].url)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    manifest.shortcuts[0].name
  )
})

test("the status bar colour follows the chosen theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/dashboard/")
  const tags = page.locator('meta[name="theme-color"]')
  await expect(tags).toHaveCount(2)
  await expect(tags.first()).toHaveAttribute("content", "#ffffff")
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  for (const tag of await tags.all())
    await expect(tag).toHaveAttribute("content", "#0a0a0a")
  // The page background matches, so the bar and the app read as one surface.
  expect(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")!
      context.fillStyle = getComputedStyle(document.body).backgroundColor
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    })
  ).toEqual([10, 10, 10])
  await page.reload()
  for (const tag of await tags.all())
    await expect(tag).toHaveAttribute("content", "#0a0a0a")
})
