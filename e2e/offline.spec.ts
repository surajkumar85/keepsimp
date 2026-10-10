import { readdir, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { test, expect, type Download, type Page } from "@playwright/test"
import sharp from "sharp"
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
  expect(expected).toContain("/dashboard/image-converter/")
  expect(expected.some((path) => path.endsWith(".wasm"))).toBe(true)

  await site.stop()

  // A full page load, then a move between tools from a link.
  await page.reload()
  await expect(page.getByTestId("tool-card")).toHaveCount(13)
  await page
    .getByTestId("tool-card")
    .getByRole("link", { name: "Image compressor" })
    .click()
  await expect(page).toHaveURL(/\/dashboard\/image-compressor\/$/)
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

  await page.goto(`${site.origin}/dashboard/json-formatter/`)
  await page
    .getByLabel("Your JSON", { exact: true })
    .fill('{"id":9007199254740993}')
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(page.getByLabel("Formatted result")).toHaveValue(
    /"id": 9007199254740993/
  )

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
    .getByRole("link", { name: "Journal", exact: true })
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
