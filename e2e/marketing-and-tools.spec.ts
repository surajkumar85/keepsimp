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
    page.getByTestId("tool-card").getByText("Ready to use", { exact: true })
  ).toHaveCount(4)
  await expect(
    page.getByTestId("tool-card").getByText("Coming soon", { exact: true })
  ).toHaveCount(9)
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
  await input.fill('{"bad":}')
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "not valid"
  )
  const value = '{"id":9007199254740993,"escaped":"a, b","empty":[]}'
  await input.fill(value)
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(page.getByLabel("Formatted result")).toHaveValue(
    /9007199254740993/
  )
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0)
  const downloading = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download JSON" }).click()
  const result = (await downloadedBytes(await downloading)).toString("utf8")
  expect(result).toContain('\n  "id": 9007199254740993')
  expect(result).toContain('"escaped": "a, b"')
  await page.getByRole("button", { name: "Minify", exact: true }).click()
  await expect(page.getByLabel("Formatted result")).toHaveValue(value)
  await page.reload()
  await expect(input).toHaveValue("")
})

test("journal articles have crawlable content, accurate metadata and working tool links", async ({
  page,
}) => {
  await page.goto("/blog/")
  await expect(page.getByRole("article")).toHaveCount(3)
  for (const post of posts) {
    await page.goto(`/blog/${post.slug}/`)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(post.title)
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
    await page.getByRole("link", { name: "Try the tool", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/${post.tool}/$`))
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
  expect(sitemap).not.toContain("video-converter")
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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
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
