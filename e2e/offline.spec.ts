import { replaceEditor } from "./editor"
import { readdir, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { test, expect, type Download, type Page } from "@playwright/test"
import sharp from "sharp"
import { readPdf } from "../tests/pdf-reader"
import { serveExport, type Site } from "./static-server"

// The other suites block service workers; these journeys are about the worker.
test.use({ serviceWorkers: "allow" })
test.describe.configure({ timeout: 180_000 })

let site: Site
test.beforeEach(async () => {
  site = await serveExport()
})
test.afterEach(async () => {
  await site.stop()
})

async function exported(directory = "out"): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await exported(path)))
    else files.push(relative("out", path).split(sep).join("/"))
  }
  return files
}

/** What the browser holds once the worker is in charge of the page. */
async function offlineCopy(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        })
      )
    const names = (await caches.keys()).filter((name) =>
      name.startsWith("keepsimp-offline-")
    )
    const saved: string[] = []
    for (const name of names)
      for (const request of await (await caches.open(name)).keys())
        saved.push(new URL(request.url).pathname)
    return { names, saved, waiting: Boolean(registration.waiting) }
  })
}

/** Open the tools once, online, and wait until the offline copy is complete. */
async function install(page: Page) {
  await page.goto(`${site.origin}/dashboard/`)
  return offlineCopy(page)
}

async function bytesOf(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const photo = async () => ({
  name: "photo.jpg",
  mimeType: "image/jpeg",
  buffer: await sharp("public/images/coastline.jpg")
    .resize(600, 400)
    .jpeg({ quality: 92 })
    .toBuffer(),
})

/** The privacy page as a later release might publish it, with its heading marked. */
async function privacyPage(note: string) {
  const page = await readFile("out/privacy/index.html", "utf8")
  const heading = "A straightforward approach to privacy."
  // The heading is in the markup and again in the data React hydrates from.
  expect(page.split(heading).length).toBeGreaterThan(2)
  return page.replaceAll(heading, `${heading} (${note})`)
}

test("marketing pages do not start the offline download", async ({ page }) => {
  await page.goto(`${site.origin}/`)
  await page.waitForLoadState("networkidle")
  expect(
    await page.evaluate(async () => ({
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      caches: (await caches.keys()).length,
    }))
  ).toEqual({ workers: 0, caches: 0 })
  expect(site.seen()).not.toContain("/sw.js")
})

test("every tool works offline after one visit", async ({ page }) => {
  const copy = await install(page)
  expect(copy.names).toHaveLength(1)
  // Worked out here from the export itself, not from the app's own list.
  const left = [
    /^sw\.js$/,
    /\.map$/,
    // Git-ignored local sync copies can reappear in out/ after the build.
    // They are not artifacts of the release being tested.
    /(^|\/)[^/]* [2-9](?:\.|$)/,
    /^videos\/.*\.mp4$/,
    /^images\/social\//,
    /^(robots\.txt|sitemap\.xml|\.gitkeep)$/,
    // Not-found pages, and the data Next.js fetches for page transitions.
    /^(404\.html|404\/|_not-found\/)/,
    /(^|\/)(index|__next\.[^/]+)\.txt$/,
  ]
  const expected = (await exported())
    .filter((file) => !left.some((pattern) => pattern.test(file)))
    .map((file) => `/${file}`.replace(/\/index\.html$/, "/"))
  expect(copy.saved.map(decodeURIComponent).sort()).toEqual(expected.sort())
  expect(copy.saved.some((path) => path.endsWith(".map"))).toBe(false)
  expect(expected).toContain("/dashboard/image-converter/")
  expect(expected.some((path) => path.endsWith(".wasm"))).toBe(true)

  await site.stop()

  // A full page load, then a move between tools from a link.
  await page.reload()
  await expect(page.getByTestId("tool-card")).toHaveCount(15)
  await page
    .getByTestId("tool-card")
    .getByRole("link", { name: "Image compressor" })
    .click()
  await expect(page).toHaveURL(/\/dashboard\/image-compressor\/$/)
  // Offline, a link loads its page in full; wait for it as a direct visit would.
  await page.waitForLoadState("load")
  await expect(
    page.getByRole("heading", { name: "Drop an image to compress" })
  ).toBeVisible()
  await page.locator("#compressor-file").setInputFiles(await photo())
  await expect(page.getByTestId("image-compressor")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 120_000 }
  )
  let pending = page.waitForEvent("download")
  await page.getByRole("link", { name: /^Download JPEG/ }).click()
  const compressed = await bytesOf(await pending)
  expect(await sharp(compressed).metadata()).toMatchObject({
    format: "jpeg",
    width: 600,
    height: 400,
  })
  expect(compressed.length).toBeLessThan((await photo()).buffer.length)

  // The converter needs the largest codec, which was never used while online.
  await page.goto(`${site.origin}/dashboard/image-converter/`)
  await page.locator("#converter-file").setInputFiles(await photo())
  await page
    .getByRole("radiogroup", { name: "Format", exact: true })
    .getByRole("radio", { name: "AVIF", exact: true })
    .click()
  await expect(page.getByTestId("image-converter")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 150_000 }
  )
  pending = page.waitForEvent("download")
  await page.getByRole("link", { name: "Download image", exact: true }).click()
  expect(await sharp(await bytesOf(await pending)).metadata()).toMatchObject({
    format: "heif",
    compression: "av1",
    width: 600,
    height: 400,
  })

  await page.goto(`${site.origin}/dashboard/image-resizer/`)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(page.getByTestId("image-resizer")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 150_000 }
  )

  // The animation converter, its samples and gifski all come from the saved copy.
  await page.goto(`${site.origin}/dashboard/animation-converter/`)
  await page.getByRole("button", { name: "Try a sample" }).click()
  // A format chosen while the sample is still loading is put back by the sample's own.
  await expect(page.getByTestId("animation-converter")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 150_000 }
  )
  await page
    .getByRole("radiogroup", { name: "Format", exact: true })
    .getByRole("radio", { name: "GIF", exact: true })
    .click()
  await page
    .getByRole("radiogroup", { name: "GIF encoder", exact: true })
    .getByRole("radio", { name: "Best (gifski)", exact: true })
    .click()
  await expect(page.getByTestId("animation-converter")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 150_000 }
  )
  pending = page.waitForEvent("download")
  await page
    .getByRole("link", { name: "Download keepsimp-pulse.gif", exact: true })
    .click()
  expect(
    await sharp(await bytesOf(await pending), { animated: true }).metadata()
  ).toMatchObject({ format: "gif", width: 192, pages: 20 })
  // Text needs the caption font, which is part of the saved copy too.
  await page.getByLabel("Top text").fill("Offline")
  await expect(page.getByTestId("animation-converter")).not.toHaveAttribute(
    "data-settled",
    "true"
  )
  await expect(page.getByTestId("animation-converter")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 150_000 }
  )
  await expect(page.getByRole("main").getByRole("alert")).toBeHidden()

  // The PDF merger's engine (10 MB) and its samples come from the saved copy.
  await page.goto(`${site.origin}/dashboard/pdf-merger/`)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(page.getByTestId("pdf-merger")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 150_000 }
  )
  await page.getByRole("button", { name: "Merge PDF" }).click()
  await expect(page.getByTestId("pdf-merger")).toHaveAttribute(
    "data-merged",
    "true",
    { timeout: 150_000 }
  )
  pending = page.waitForEvent("download")
  await page.getByRole("link", { name: "Download PDF" }).click()
  const merged = await readPdf(new Uint8Array(await bytesOf(await pending)))
  expect(merged.pages).toHaveLength(5)
  expect(merged.bookmarks.map((entry) => entry.title)).toEqual([
    "keepsimp-report",
    "keepsimp-appendix",
  ])

  // The PDF splitter uses the same engine and a sample of its own.
  await page.goto(`${site.origin}/dashboard/pdf-splitter/`)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(page.getByTestId("pdf-splitter")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 150_000 }
  )
  await page.getByRole("button", { name: "Every page on its own" }).click()
  await page.getByRole("button", { name: "Split PDF" }).click()
  await expect(page.getByTestId("pdf-splitter")).toHaveAttribute(
    "data-split",
    "true",
    { timeout: 150_000 }
  )
  pending = page.waitForEvent("download")
  await page
    .getByRole("link", { name: "Download keepsimp-handbook-02.pdf" })
    .click()
  const part = await readPdf(new Uint8Array(await bytesOf(await pending)))
  expect(part.pages).toHaveLength(1)

  // The PDF compressor adds the picture codecs to the same engine.
  await page.goto(`${site.origin}/dashboard/pdf-compressor/`)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(page.getByTestId("pdf-compressor")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 150_000 }
  )
  await page.getByRole("button", { name: "Compress PDF" }).click()
  await expect(page.getByTestId("pdf-compressor")).toHaveAttribute(
    "data-compressed",
    "true",
    { timeout: 150_000 }
  )
  await expect(page.getByTestId("saving")).toHaveText(/^\d+% smaller$/)
  pending = page.waitForEvent("download")
  await page.getByRole("link", { name: "Download PDF" }).click()
  const smaller = await readPdf(new Uint8Array(await bytesOf(await pending)))
  expect(smaller.pages).toHaveLength(3)
  // On a device with cores to spare its pictures are encoded by helper
  // workers, which have to start from the saved copy as well.
  if ((await page.evaluate(() => navigator.hardwareConcurrency)) >= 3) {
    const loaded = await Promise.all(
      page
        .workers()
        .map((worker) =>
          worker.evaluate(() =>
            performance
              .getEntriesByType("resource")
              .map((entry) => entry.name.split("/").pop()!)
          )
        )
    )
    const encoder = (names: string[]) =>
      names.some((name) => name.startsWith("mozjpeg_enc"))
    const engine = loaded.find((names) =>
      names.some((name) => name.startsWith("mupdf"))
    )
    expect(engine).toBeDefined()
    expect(encoder(engine!)).toBe(false)
    expect(loaded.filter(encoder).length).toBeGreaterThan(0)
  }

  // The PDF editor needs its fonts as well: one is read from the saved copy
  // when text is typed, shown on the screen and put into the file.
  await page.goto(`${site.origin}/dashboard/pdf-editor/`)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(page.getByTestId("reader")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 150_000 }
  )
  const sheet = page.locator('[data-testid=editor-layer][data-page="1"]')
  const place = (await sheet.boundingBox())!
  await page
    .getByTestId("reader")
    .getByRole("button", { name: "Text", exact: true })
    .click()
  await page.mouse.click(
    place.x + place.width * 0.2,
    place.y + place.width * 0.3
  )
  await expect(page.getByTestId("editor-typing")).toBeFocused({
    timeout: 60_000,
  })
  await page.keyboard.type("Written offline")
  await page.keyboard.press("Control+Enter")
  await expect(page.getByTestId("pdf-editor")).toHaveAttribute(
    "data-changes",
    "1",
    { timeout: 60_000 }
  )
  pending = page.waitForEvent("download")
  await page.getByTestId("editor-download").click()
  const edited = await readPdf(new Uint8Array(await bytesOf(await pending)))
  expect(edited.pages).toHaveLength(12)
  expect(edited.pages[0].text).toContain("Written offline")
  await expect(page.getByTestId("editor-check")).toContainText(
    "The text you added was read back from the result."
  )

  await page.goto(`${site.origin}/dashboard/json-formatter/`)
  await replaceEditor(
    page.getByLabel("Your JSON", { exact: true }),
    '{"id":9007199254740993}'
  )
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(page.getByLabel("Formatted result")).toContainText(
    /"id": 9007199254740993/
  )
  await page.getByRole("tab", { name: "Query", exact: true }).click()
  await page.getByRole("radio", { name: "JSON Pointer", exact: true }).click()
  await page.getByLabel("JSON Pointer", { exact: true }).fill("/id")
  await page.getByRole("button", { name: "Run query" }).click()
  await expect(page.getByLabel("Formatted result")).toContainText(
    "9007199254740993"
  )
  await replaceEditor(
    page.getByLabel("Your JSON", { exact: true }),
    '{"project":"KeepSimp","version":1}'
  )
  await page.getByRole("tab", { name: "Schema", exact: true }).click()
  await page.getByRole("button", { name: "Use schema example" }).click()
  await page
    .getByRole("button", { name: "Validate schema", exact: true })
    .click()
  await expect(
    page.getByText("Your JSON matches the schema.", { exact: true })
  ).toBeVisible()
  await page.getByRole("tab", { name: "Convert", exact: true }).click()
  await page
    .getByRole("button", { name: "Convert document", exact: true })
    .click()
  pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download YAML", exact: true }).click()
  expect((await bytesOf(await pending)).toString("utf8")).toContain(
    '"project": "KeepSimp"'
  )
  await page.goto(`${site.origin}/blog/validate-json-schema-locally/`)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("schema")

  // The rest of the site is there too, including a path without its slash.
  await page.goto(`${site.origin}/`)
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Less busywork"
  )
  await page.goto(`${site.origin}/blog/jpeg-png-webp-which-format/`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto(`${site.origin}/privacy`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  // A page that was never saved is not invented.
  await expect(page.goto(`${site.origin}/not-a-page/`)).rejects.toThrow()
})

test("shows the latest page online and the saved one when the network fails", async ({
  page,
}) => {
  await install(page)
  site.replace("/privacy/", await privacyPage("published later"))

  // Online, the worker steps aside for the newer page.
  await page.goto(`${site.origin}/privacy/`)
  const heading = page.getByRole("heading", { level: 1 })
  await expect(heading).toContainText("(published later)")

  // A stalled connection falls back to the saved page after a few seconds.
  site.delay(/^\/(privacy|blog)\//, 20_000)
  let started = Date.now()
  await page.goto(`${site.origin}/privacy/`)
  await expect(heading).toBeVisible()
  await expect(heading).not.toContainText("(published later)")
  expect(Date.now() - started).toBeLessThan(15_000)

  // A link does not hang on it either: the transition gives up on its data
  // and the page loads in full from the saved copy.
  started = Date.now()
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Blog", exact: true })
    .click()
  await expect(page).toHaveURL(/\/blog\/$/, { timeout: 18_000 })
  await expect(heading).toBeVisible()
  expect(Date.now() - started).toBeLessThan(18_000)

  // So does no connection at all.
  await site.stop()
  await page.goto(`${site.origin}/privacy/`)
  await expect(heading).toContainText("privacy")
  await expect(heading).not.toContainText("(published later)")
})

test("a new release replaces the saved copy once the old pages are closed", async ({
  page,
  context,
}) => {
  const first = await install(page)
  const worker = await readFile("out/sw.js", "utf8")
  const version = first.names[0].replace("keepsimp-offline-", "")
  expect(worker).toContain(version)
  // The next release also lists a file its host does not serve; that must not block it.
  expect(worker).toContain('"/licenses/outfit.txt"')
  site.replace(
    "/sw.js",
    worker
      .replaceAll(version, "next-release")
      .replace('"/licenses/outfit.txt"', '"/licenses/withdrawn.txt"')
  )
  site.replace("/privacy/", await privacyPage("next release"))
  site.seen()

  // The open page keeps its release while the next one downloads beside it.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })
  await expect
    .poll(async () => (await offlineCopy(page)).waiting, { timeout: 120_000 })
    .toBe(true)
  const during = await offlineCopy(page)
  expect(during.names.sort()).toEqual(
    [first.names[0], "keepsimp-offline-next-release"].sort()
  )
  // Hashed build files are copied from the earlier release, not downloaded again.
  const fetched = site.seen()
  expect(fetched).toContain("/privacy/")
  expect(fetched.filter((path) => path.startsWith("/_next/static/"))).toEqual(
    []
  )

  // Closing the app lets the new release take over.
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto(`${site.origin}/dashboard/`)
  await expect
    .poll(async () => (await offlineCopy(reopened)).names, { timeout: 60_000 })
    .toEqual(["keepsimp-offline-next-release"])

  await site.stop()
  await reopened.goto(`${site.origin}/privacy/`)
  await expect(reopened.getByRole("heading", { level: 1 })).toContainText(
    "(next release)"
  )
  await reopened.goto(`${site.origin}/dashboard/image-converter/`)
  await expect(reopened.getByRole("heading", { level: 1 })).toHaveText(
    "Image converter"
  )
})

test("tutorial videos stream through the worker and say so when offline", async ({
  page,
  browserName,
}) => {
  await install(page)
  await page.goto(`${site.origin}/dashboard/image-converter/`)
  const section = page.getByRole("region", {
    name: "A little help along the way",
  })
  const video = section.locator("video")
  const load = () =>
    video.evaluate((element: HTMLVideoElement) => {
      element.preload = "metadata"
      element.load()
    })

  // Playwright's Firefox build has no H.264 decoder; real Firefox uses the system one.
  if (browserName !== "firefox") {
    await load()
    await expect
      .poll(() =>
        video.evaluate((element: HTMLVideoElement) => element.videoWidth)
      )
      .toBe(1920)
    await expect(section.getByRole("status")).toHaveCount(0)
  }

  await site.stop()
  await page.reload()
  // The poster and the written guide are part of the offline copy; the film is not.
  await expect(section.locator("#tutorial-steps > li")).toHaveCount(6)
  expect(
    await page.evaluate(
      async (poster) => {
        const image = new Image()
        image.src = poster!
        await image.decode()
        return image.naturalWidth
      },
      await video.getAttribute("poster")
    )
  ).toBeGreaterThan(0)
  await load()
  await expect(section.getByRole("status")).toContainText(
    "The video could not load"
  )
})
