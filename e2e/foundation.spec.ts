import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import tokens from "../design-system/tokens.json" with { type: "json" }

test("search, empty state, and validated category URLs", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("tool-card")).toHaveCount(12)
  await page.getByRole("searchbox").fill("WEBP")
  await expect(page.getByTestId("tool-card")).toHaveCount(1)
  await expect(page.getByTestId("tool-card")).toContainText("Image converter")
  await page.getByRole("searchbox").fill("nonexistent")
  await expect(
    page.getByRole("heading", { name: "No tools found" })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Clear search", exact: true })
    .first()
    .click()
  await expect(page.getByTestId("tool-card")).toHaveCount(12)
  await page.goto("/?category=video")
  await expect(page.getByTestId("tool-card")).toHaveCount(3)
  await page.goto("/?category=invalid")
  await expect(page.getByTestId("tool-card")).toHaveCount(12)
})

test("sidebar navigation works on desktop and mobile", async ({
  page,
  isMobile,
}) => {
  await page.goto("/")
  if (isMobile)
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  const navigation = page.getByRole("navigation", { name: "Tool categories" })
  await expect(page.locator('[data-sidebar="sidebar"]')).toHaveCount(1)
  await expect(navigation.getByRole("link")).toHaveCount(6)
  await navigation.getByRole("link", { name: "Images" }).click()
  await expect(
    page.getByRole("heading", { name: "Images tools" })
  ).toBeVisible()
  if (isMobile) {
    await expect(page.getByRole("dialog")).not.toBeVisible()
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()
    await expect(
      page.getByRole("button", { name: "Toggle Sidebar" })
    ).toBeFocused()
  } else {
    await expect(
      navigation.getByRole("link", { name: "Images" })
    ).toHaveAttribute("aria-current", "page")
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(navigation).not.toBeVisible()
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(navigation).toBeVisible()
  }
})

test("theme persists and both themes pass accessibility checks", async ({
  page,
}) => {
  await page.goto("/")
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(results.violations).toEqual([])
  }
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "Switch to light theme" }).click()
  await expect(page.locator("html")).not.toHaveClass(/dark/)
})

test("reference matches tokens, has no overflow, and honors reduced motion", async ({
  page,
}) => {
  await page.goto("/design-system/")
  for (const [name, value] of Object.entries(tokens.radius))
    await expect(page.getByTestId(`radius-${name}`)).toHaveCSS(
      "border-top-left-radius",
      value
    )
  await expect(page.getByLabel("A clearly labelled field")).toHaveCSS(
    "border-radius",
    tokens.radius.md
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(results.violations).toEqual([])
  await page.emulateMedia({ reducedMotion: "reduce" })
  const duration = await page
    .getByLabel("A clearly labelled field")
    .evaluate((element) =>
      parseFloat(getComputedStyle(element).transitionDuration)
    )
  expect(duration).toBeLessThanOrEqual(0.00001)
})

test("compact production pages run without errors or external requests", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = []
  const external: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin)
      external.push(request.url())
  })
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.locator(".page-intro")).toBeVisible()
  const intro = await page.locator(".page-intro").boundingBox()
  expect(intro!.height).toBeLessThan(160)
  await expect(page.locator("header").first()).toHaveCSS(
    "height",
    tokens.layout.header
  )
  await expect(page.getByTestId("tool-card").first()).toHaveCSS(
    "border-radius",
    tokens.radius.lg
  )
  await expect(page.getByTestId("tool-card").first()).toHaveCSS(
    "padding",
    tokens.layout["card-padding"]
  )
  await expect(page.getByTestId("tool-card").first()).toHaveCSS(
    "box-shadow",
    "none"
  )
  const desktop = page.viewportSize()!.width >= 768
  await expect(page.getByRole("searchbox")).toHaveCSS(
    "height",
    desktop ? tokens.layout["control-desktop"] : tokens.layout["control-touch"]
  )
  if (desktop)
    await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCSS(
      "width",
      tokens.layout.sidebar
    )
  await page.goto("/design-system/")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test("skip link moves keyboard focus into the content", async ({ page }) => {
  await page.goto("/")
  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("link", { name: "Skip to content" })
  ).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()
})

test("navigation remains usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto("/")
  await page.getByRole("searchbox").waitFor()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS("width", tokens.layout["sidebar-mobile"])
  await expect(page.locator('[data-sidebar="sidebar"]')).toHaveCount(1)
  const close = await page
    .getByRole("button", { name: "Close navigation" })
    .boundingBox()
  // WebKit can report a subpixel difference after device scaling.
  expect(close!.width).toBeCloseTo(44, 3)
  expect(close!.x + close!.width).toBeLessThanOrEqual(
    parseFloat(tokens.layout["sidebar-mobile"])
  )
  await page
    .getByRole("navigation", { name: "Tool categories" })
    .getByRole("link", { name: "Documents" })
    .click()
  await expect(page.getByTestId("tool-card")).toHaveCount(2)
  await expect(dialog).not.toBeVisible()
})
