import { test, expect, type Download } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import sharp from "sharp"
import { serveExport } from "./static-server"

const route = "/dashboard/color-utility/"
async function bytes(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
async function tab(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("tab", { name, exact: true }).click()
}

test("converts actual colors, preserves alpha and distinguishes wide-gamut fallbacks", async ({
  page,
  browserName,
}) => {
  await page.goto(route)
  if (browserName === "chromium")
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  const field = page.getByLabel("Color value", { exact: true })
  await field.fill("rgb(255 0 0 / .5)")
  await expect(page.getByTestId("format-HEX")).toHaveText("#ff000080")
  await expect(page.getByTestId("format-CMYK (approximate)")).toHaveText(
    "cmyk(0% 100% 100% 0%)"
  )
  await page.getByRole("button", { name: "Copy HEX", exact: true }).click()
  await expect(page.getByRole("status")).toContainText(
    /Copied|Clipboard access/
  )
  if (browserName === "chromium")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "#ff000080"
    )
  await page
    .getByText("More color spaces: P3, Lab, LCH and XYZ", { exact: true })
    .click()
  await field.fill("color(display-p3 0 1 0)")
  await expect(page.getByTestId("format-Display P3")).toHaveText(
    "color(display-p3 0 1 0)"
  )
  await expect(page.getByText(/Outside sRGB\. HEX/)).toBeVisible()
  await field.fill("var(--brand)")
  await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText(
    "without variables"
  )
  await expect(page.getByTestId("format-HEX")).toHaveCount(0)
  await field.fill("hsv(240 100% 100%)")
  await expect(page.getByTestId("format-HEX")).toHaveText("#0000ff")
  await page.getByLabel("Opacity channel").press("Home")
  for (let i = 0; i < 25; i++)
    await page.getByLabel("Opacity channel").press("ArrowRight")
  await expect(page.getByTestId("format-HEX")).toHaveText("#0000ff40")
  const supported = await page.evaluate(() => "EyeDropper" in window)
  if (supported)
    await expect(
      page.getByRole("button", { name: "Pick from screen" })
    ).toBeEnabled()
  else
    await expect(
      page.getByRole("button", { name: "Pick from screen" })
    ).toBeDisabled()
})

test("brand references open, copy and load a palette without fetching assets", async ({
  page,
}) => {
  const external: string[] = []
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/127\.0\.0\.1|localhost/))
      external.push(request.url())
  })
  await page.goto(route)
  await tab(page, "Brand colors")
  for (const name of [
    "Google",
    "Meta",
    "Anthropic",
    "Discord",
    "Slack",
    "IBM",
    "Linear",
    "Spotify",
    "Netflix",
    "GitHub",
    "Vercel",
    "Microsoft",
  ]) {
    const card = page.getByRole("region", { name: `${name} palette` })
    await expect(card.getByRole("heading", { name, exact: true })).toBeVisible()
    await expect(
      card.getByRole("link", {
        name: `Official source for ${name} (opens a new tab)`,
      })
    ).toHaveAttribute("href", /^https:/)
  }
  await page
    .getByRole("button", { name: "Use Orange #d97757", exact: true })
    .click()
  await expect(page.getByLabel("Color value", { exact: true })).toHaveValue(
    "#d97757"
  )
  await tab(page, "Brand colors")
  await page
    .getByRole("button", { name: "Use Anthropic palette", exact: true })
    .click()
  await expect(
    page.getByRole("tab", { name: "Palettes", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  const first = page.getByRole("button", {
    name: "Use Color 1 #141413",
    exact: true,
  })
  await expect(first).toBeVisible()
  await page.getByRole("button", { name: "Lock color 1", exact: true }).click()
  await page.getByRole("button", { name: "Shuffle unlocked" }).click()
  await expect(first).toBeVisible()
  await page.getByRole("button", { name: "Undo palette change" }).click()
  await expect(
    page.getByRole("button", { name: "Use Color 2 #faf9f5", exact: true })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Move color 1 later", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Use Color 2 #141413", exact: true })
  ).toBeVisible()
  expect(external).toEqual([])
})

test("downloads real JSON, tokens, SVG and transparent PNG palettes", async ({
  page,
}) => {
  await page.goto(route)
  await page.getByLabel("Color value", { exact: true }).fill("#ff000080")
  await page
    .getByRole("button", { name: "Add to palette", exact: true })
    .click()
  for (const format of ["json", "tokens", "svg"]) {
    await page.getByLabel("Palette export format").selectOption(format)
    const pending = page.waitForEvent("download")
    await page
      .getByRole("button", { name: "Download palette", exact: true })
      .click()
    const file = await pending
    const content = (await bytes(file)).toString()
    if (format === "json")
      expect(JSON.parse(content)["color-6"]).toBe("#ff000080")
    else if (format === "tokens")
      expect(JSON.parse(content)["color-6"].$value.alpha).toBeCloseTo(128 / 255)
    else {
      expect(file.suggestedFilename()).toBe("keepsimp-palette.svg")
      const png = await sharp(Buffer.from(content)).png().toBuffer()
      expect((await sharp(png).metadata()).width).toBe(960)
    }
  }
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download PNG", exact: true }).click()
  const png = await bytes(await pending),
    meta = await sharp(png).metadata()
  expect(meta.width).toBe(960)
  expect(meta.height).toBe(160)
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const end = (900 + 80 * info.width) * 4
  expect([...data.subarray(end, end + 4)]).toEqual([255, 0, 0, 128])
})

test("checks alpha-aware contrast and applies a verified passing suggestion", async ({
  page,
}) => {
  await page.goto(route)
  await tab(page, "Contrast")
  await page.getByLabel("Text color", { exact: true }).fill("black")
  await page.getByLabel("Background color", { exact: true }).fill("white")
  await expect(page.getByTestId("contrast-ratio")).toHaveText("21.00:1")
  await page.getByLabel("Text color", { exact: true }).fill("transparent")
  await expect(page.getByTestId("contrast-ratio")).toHaveText("1.00:1")
  await page
    .getByLabel("Canvas behind transparency", { exact: true })
    .fill("#ffffff80")
  await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText(
    "opaque"
  )
  await expect(page.getByTestId("contrast-ratio")).toHaveCount(0)
  await page
    .getByLabel("Canvas behind transparency", { exact: true })
    .fill("white")
  await page.getByLabel("Text color", { exact: true }).fill("#aaa")
  await page.getByRole("radio", { name: "7:1", exact: true }).click()
  await page.getByRole("button", { name: "Find a passing text color" }).click()
  await page.getByRole("button", { name: "Apply suggested text color" }).click()
  expect(
    Number(
      (await page.getByTestId("contrast-ratio").textContent())!.split(":")[0]
    )
  ).toBeGreaterThanOrEqual(7)
  await page.getByRole("radio", { name: "Tritan", exact: true }).click()
  await expect(
    page.getByText("Keep labels as well as color.", { exact: true })
  ).toBeVisible()
  await page.getByLabel("Background color", { exact: true }).fill("#777")
  await page.getByRole("button", { name: "Find a passing text color" }).click()
  await expect(page.getByRole("status")).toContainText(
    "No opaque text color can reach this target"
  )
})

test("builds actual gradient CSS, validates stop order and retains hard edges", async ({
  page,
}) => {
  await page.goto(route)
  await tab(page, "Gradients")
  await page.getByLabel("Stop 1 color", { exact: true }).fill("red")
  await page.getByLabel("Stop 2 color", { exact: true }).fill("blue")
  await page.getByRole("radio", { name: "sRGB", exact: true }).click()
  await page.getByLabel("Stop 1 position (%)", { exact: true }).fill("50")
  await page.getByLabel("Stop 2 position (%)", { exact: true }).fill("50")
  const pending = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download gradient CSS", exact: true })
    .click()
  const content = (await bytes(await pending)).toString()
  expect(content).toContain("#ff0000 50%, #0000ff 50%")
  expect(content).toContain("90deg in srgb")
  expect(content.match(/background:/g)).toHaveLength(2)
  await page.getByLabel("Stop 1 position (%)", { exact: true }).fill("60")
  await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText(
    "smallest to largest"
  )
  await expect(
    page.getByRole("button", { name: "Download gradient CSS" })
  ).toBeDisabled()
  await page.getByLabel("Stop 1 position (%)", { exact: true }).fill("0")
  await page.getByRole("radio", { name: "Conic", exact: true }).click()
  await expect(
    page.getByRole("img", { name: "conic gradient preview", exact: true })
  ).toBeVisible()
})

test("extracts actual local image pixels with a keyboard-equivalent sampling path", async ({
  page,
}) => {
  const pixels = Buffer.alloc(80 * 40 * 4)
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 80; x++) {
      const p = (y * 80 + x) * 4
      pixels[p] = x < 40 ? 255 : 0
      pixels[p + 1] = 0
      pixels[p + 2] = x >= 40 ? 255 : 0
      pixels[p + 3] = 255
    }
  const png = await sharp(pixels, {
    raw: { width: 80, height: 40, channels: 4 },
  })
    .png()
    .toBuffer()
  await page.goto(route)
  await tab(page, "From image")
  await page.getByLabel("Choose an image for colors").setInputFiles({
    name: "two-colors.png",
    mimeType: "image/png",
    buffer: png,
  })
  await expect(
    page.getByText("two-colors.png · sample 80 × 40", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Use Image color 1 #ff0000", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Use Image color 2 #0000ff", exact: true })
  ).toBeVisible()
  await page.getByLabel("Pixel X", { exact: true }).fill("60")
  await page
    .getByRole("button", { name: "Sample this pixel", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Use Sampled pixel #0000ff", exact: true })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Use image colors as palette" })
    .click()
  await expect(
    page.getByRole("button", { name: "Use Color 2 #0000ff", exact: true })
  ).toBeVisible()
  await tab(page, "From image")
  await page.getByRole("button", { name: "Remove image", exact: true }).click()
  await expect(
    page.getByRole("img", { name: "Resized image for color sampling" })
  ).toBeHidden()
  await page.getByLabel("Choose an image for colors").setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  })
  await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText(
    "Choose a PNG"
  )
  await page.getByLabel("Choose an image for colors").setInputFiles({
    name: "disguised.png",
    mimeType: "image/png",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  })
  await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText(
    "bytes do not match"
  )
})

test("batch reports line errors and clears outdated results", async ({
  page,
}) => {
  await page.goto(route)
  await tab(page, "Batch")
  await page.getByLabel("Colors, one per line").fill("red\nbroken\n#abc8")
  await page.getByRole("button", { name: "Convert color list" }).click()
  const output = page.getByLabel("Converted color list", { exact: true })
  await expect(output).toContainText("#ff0000")
  await expect(output).toContainText("Line 2:")
  await expect(output).toContainText("#aabbcc88")
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download converted list" }).click()
  expect((await bytes(await pending)).toString()).toContain("#aabbcc88")
  await page.getByRole("radio", { name: "OKLCH", exact: true }).click()
  await expect(output).toHaveCount(0)
  await page.getByRole("button", { name: "Convert color list" }).click()
  await expect(output).toContainText("oklch(")
})

test("keeps controls accessible in both themes at narrow and reflow widths", async ({
  page,
}, info) => {
  test.setTimeout(180000)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(route)
  for (const width of [1440, 720, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const name of [
      "Convert",
      "Palettes",
      "Contrast",
      "Gradients",
      "From image",
      "Brand colors",
      "Batch",
    ]) {
      await tab(page, name)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true)
    }
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark")
    }, theme)
    for (const name of [
      "Convert",
      "Palettes",
      "Contrast",
      "Gradients",
      "From image",
      "Brand colors",
      "Batch",
    ]) {
      await tab(page, name)
      const results = await new AxeBuilder({ page })
        .exclude("[data-color-preview]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
      expect(results.violations, `${theme}: ${name}`).toEqual([])
    }
  }
  if (info.project.name === "chromium") {
    await page.evaluate(() => document.documentElement.classList.remove("dark"))
    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const name of ["Convert", "Palettes", "Brand colors", "Gradients"]) {
      await tab(page, name)
      await page.screenshot({
        path: `/tmp/color-light-${name.replaceAll(" ", "-")}.png`,
        fullPage: true,
      })
    }
    await page.evaluate(() => document.documentElement.classList.add("dark"))
  }
  await tab(page, "Convert")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({
    path: `/tmp/color-${info.project.name}-desktop.png`,
    fullPage: true,
  })
  await page.setViewportSize({ width: 320, height: 900 })
  await page.screenshot({
    path: `/tmp/color-${info.project.name}-mobile.png`,
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test.describe("offline colors", () => {
  test.use({ serviceWorkers: "allow" })
  test("keeps the tool, brand references, conversions and exports working offline", async ({
    page,
  }) => {
    test.setTimeout(180000)
    await page.context().clearCookies()
    const site = await serveExport()
    try {
      await page.goto(`${site.origin}/dashboard/`)
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready
        if (!navigator.serviceWorker.controller)
          await new Promise((resolve) =>
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              resolve,
              { once: true }
            )
          )
      })
      await site.stop()
      await page.goto(`${site.origin}${route}`)
      await page
        .getByLabel("Color value", { exact: true })
        .fill("hsl(120 100% 50%)")
      await expect(page.getByTestId("format-HEX")).toHaveText("#00ff00")
      await tab(page, "Brand colors")
      await page
        .getByRole("button", { name: "Use Google palette", exact: true })
        .click()
      await page.getByLabel("Palette export format").selectOption("json")
      const pending = page.waitForEvent("download")
      await page
        .getByRole("button", { name: "Download palette", exact: true })
        .click()
      expect(
        JSON.parse((await bytes(await pending)).toString())["color-1"]
      ).toBe("#4285f4")
      await page.goto(`${site.origin}/blog/convert-hex-rgb-hsl-oklch/`)
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "One color."
      )
    } finally {
      await site.stop()
    }
  })
})

test("publishes the color tool and guides with matching SEO and dates", async ({
  page,
}) => {
  await page.goto(route)
  await expect(page).toHaveTitle(
    /Free color converter, palette maker & contrast checker/
  )
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://keepsimp.vercel.app/dashboard/color-utility/"
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /convert-hex-rgb-hsl-oklch\.png$/
  )
  const map = await (await page.request.get("/sitemap.xml")).text()
  expect(map).toContain("/dashboard/color-utility/")
  for (const slug of [
    "convert-hex-rgb-hsl-oklch",
    "check-color-contrast-wcag",
    "make-color-palettes-gradients",
    "company-brand-color-palettes",
  ]) {
    expect(map).toContain(`/blog/${slug}/`)
    await page.goto(`/blog/${slug}/`)
    await expect(page.locator("time")).toHaveText("13 October 2026")
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://keepsimp.vercel.app/blog/${slug}/`
    )
    const data = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents()
    const article = data
      .flatMap((text) => {
        const obj = JSON.parse(text)
        return obj["@graph"] ?? [obj]
      })
      .find((obj) => obj["@type"] === "BlogPosting")
    expect(article.datePublished).toBe("2026-10-13T00:00:00+05:30")
    await expect(
      page.getByRole("link", { name: "Try the tool", exact: true })
    ).toBeVisible()
  }
})
