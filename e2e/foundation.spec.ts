import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import tokens from "../design-system/tokens.json" with { type: "json" }

test("tools are grouped, coloured by kind, and follow validated category URLs", async ({
  page,
}) => {
  await page.goto("/dashboard/")
  await expect(page.getByTestId("tool-card")).toHaveCount(13)
  // What works comes first; what is still to come is kept apart and quiet
  // (nothing is, now that every tool is built).
  const ready = page.getByTestId("tools-ready")
  const planned = page.getByTestId("tools-planned")
  await expect(ready.getByRole("heading", { level: 3 }).first()).toContainText(
    "Ready to use"
  )
  await expect(ready.getByTestId("tool-card")).toHaveCount(13)
  await expect(planned).toHaveCount(0)
  await expect(ready.getByRole("link")).toHaveCount(13)
  // Each kind of tool has its own colour, taken from the tokens.
  const colourOf = (name: string) =>
    ready
      .getByTestId("tool-card")
      .filter({ hasText: name })
      .locator("p")
      .first()
      .evaluate((label) => getComputedStyle(label).color)
  const colours = new Set([
    await colourOf("Image compressor"),
    await colourOf("PDF merger"),
    await colourOf("JSON formatter"),
  ])
  expect(colours.size).toBe(3)
  expect(await colourOf("Image resizer")).toBe(
    await colourOf("Image compressor")
  )
  // A card that leads somewhere answers the pointer; one that does not stays flat.
  const card = ready.getByTestId("tool-card").first()
  await expect(card).toHaveCSS("box-shadow", "none")
  await card.hover()
  await expect(card).not.toHaveCSS("box-shadow", "none")

  await page.goto("/dashboard/?category=video")
  await expect(page.getByTestId("tool-card")).toHaveCount(1)
  // The Video editor is ready; its doors are not cards.
  await expect(
    page.getByTestId("tools-ready").getByTestId("tool-card")
  ).toHaveText([/Video editor/])
  await page.goto("/dashboard/?category=invalid")
  await expect(page.getByTestId("tool-card")).toHaveCount(13)
})

test("the search in the top bar finds tools and opens them", async ({
  page,
}) => {
  await page.goto("/dashboard/")
  const button = page.getByRole("button", { name: /Search tools/ })
  await button.click()
  const dialog = page.getByRole("dialog", { name: "Search tools" })
  const box = dialog.getByRole("combobox", { name: "Search tools" })
  await expect(box).toBeFocused()
  const options = dialog.getByRole("option")
  // With nothing typed, every tool is offered, working tools first.
  await expect(options).toHaveCount(48)
  await expect(options.first()).toContainText("Video editor")
  await expect(options.first()).toHaveAttribute("aria-selected", "true")
  // Both converters write WebP; only one of them makes boomerangs.
  await box.fill("WEBP")
  await expect(options).toHaveCount(2)
  await box.fill("boomerang")
  await expect(options).toHaveCount(1)
  await expect(options).toContainText("Animation converter")
  await box.fill("nonexistent")
  await expect(dialog).toContainText("No tools found")
  await expect(options).toHaveCount(0)
  // A page that opens a tool for one job is found by its own name.
  await box.fill("video trimmer")
  await expect(options).toHaveCount(1)
  await expect(options).not.toHaveAttribute("aria-disabled", "true")

  // Arrow keys move between tools that can be opened, going round at the ends.
  await box.fill("pdf")
  // The four PDF tools, the pages that open the editor for one job, and two more that name PDFs.
  await expect(options).toHaveCount(15)
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true")
  await box.press("ArrowDown")
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true")
  await expect(box).toHaveAttribute(
    "aria-activedescendant",
    (await options.nth(1).getAttribute("id"))!
  )
  for (let press = 0; press < 14; press++) await box.press("ArrowDown")
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true")
  await box.press("ArrowUp")
  await expect(options.nth(14)).toHaveAttribute("aria-selected", "true")
  for (let press = 0; press < 13; press++) await box.press("ArrowUp")
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true")
  await box.press("Enter")
  await expect(page).toHaveURL(/\/dashboard\/pdf-splitter\/$/)
  await expect(dialog).toBeHidden()

  // The search is in the top bar of every tool, and a press on a result opens it.
  await page.getByRole("button", { name: /Search tools/ }).click()
  await dialog.getByRole("combobox").fill("json")
  await dialog.getByRole("option", { name: /JSON formatter/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/json-formatter\/$/)
  // Escape closes it and gives focus back to the button.
  await page.getByRole("button", { name: /Search tools/ }).click()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("button", { name: /Search tools/ })).toBeFocused()
})

test("search results scroll inside a bounded dialog on short and narrow screens", async ({
  page,
  isMobile,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/")
  for (const [width, height] of [
    [1440, 900],
    [1440, 480],
    [320, 568],
    [740, 360],
  ]) {
    await page.setViewportSize({ width, height })
    await page.getByTestId("search-button").click()
    const dialog = page.getByRole("dialog", { name: "Search tools" })
    const input = dialog.getByRole("combobox"),
      list = dialog.getByRole("listbox")
    await expect(dialog.getByRole("option")).toHaveCount(48)
    const bounds = (await dialog.boundingBox())!
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 8)
    expect(bounds.height).toBeLessThanOrEqual(640)
    expect(
      await list.evaluate((node) => node.scrollHeight > node.clientHeight)
    ).toBe(true)
    const fieldAt = (await input.boundingBox())!.y
    if (!isMobile) {
      await list.hover()
      await page.mouse.wheel(0, 600)
      await expect
        .poll(() => list.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(0)
    }
    // Check content reachability; search-touch.spec.ts exercises finger swipes.
    await list.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    const last = dialog.getByRole("option").last(),
      lastAt = (await last.boundingBox())!,
      listAt = (await list.boundingBox())!
    expect(lastAt.y + lastAt.height).toBeLessThanOrEqual(
      listAt.y + listAt.height
    )
    expect((await input.boundingBox())!.y).toBe(fieldAt)
    await input.press("End")
    const active = dialog.locator('[role="option"][aria-selected="true"]'),
      activeAt = (await active.boundingBox())!
    expect(activeAt.y).toBeGreaterThanOrEqual(listAt.y)
    expect(activeAt.y + activeAt.height).toBeLessThanOrEqual(
      listAt.y + listAt.height
    )
    await input.press("Home")
    await expect
      .poll(() => list.evaluate((node) => node.scrollTop))
      .toBeLessThanOrEqual(8)
    if ((width === 1440 && height === 900) || width === 320)
      await page.screenshot({
        path: `/tmp/search-scroll-${info.project.name}-${width}.png`,
      })
    await input.fill("nonexistent")
    await expect(
      dialog.getByText("No tools found", { exact: true })
    ).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Close search" })
    ).toBeVisible()
    await input.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId("search-button")).toBeFocused()
  }
})

test("⌘K or Ctrl+K opens the search from anywhere, also while typing", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Phones have no keyboard to test with.")
  await page.goto("/dashboard/")
  const dialog = page.getByRole("dialog", { name: "Search tools" })
  // The button says which keys, for the keyboard this browser reports.
  const apple = await page.evaluate(() =>
    /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
  )
  const keys = apple ? "Meta+k" : "Control+k"
  await expect(page.getByTestId("search-button")).toContainText(
    apple ? "⌘K" : "Ctrl K"
  )
  await page.keyboard.press(keys)
  await expect(dialog.getByRole("combobox")).toBeFocused()
  // The same keys close it again.
  await page.keyboard.press(keys)
  await expect(dialog).toBeHidden()

  // From a tool, with the cursor in a text field.
  await page.goto("/dashboard/json-formatter/")
  await page.getByLabel("Your JSON", { exact: true }).click()
  await page.keyboard.press(keys)
  await expect(dialog.getByRole("combobox")).toBeFocused()
  await page.keyboard.type("resize image")
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/dashboard\/image-resizer\/$/)
  // The plain letter does nothing by itself.
  await page.keyboard.press("k")
  await expect(dialog).toBeHidden()
})

test("sidebar navigation works on desktop and mobile", async ({
  page,
  isMobile,
}) => {
  await page.goto("/dashboard/")
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
  // Colours are checked as they settle, not half-way through a transition.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/")
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(results.violations, theme).toEqual([])
    // The search, with its list open and a tool chosen.
    await page.getByTestId("search-button").click()
    const search = page.getByRole("dialog", { name: "Search tools" })
    await expect(search.getByRole("option")).toHaveCount(48)
    const open = await new AxeBuilder({ page })
      .include("[role=dialog]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(open.violations, `${theme} search`).toEqual([])
    await page.keyboard.press("Escape")
    await expect(search).toBeHidden()
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
  await page.goto("/dashboard/")
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
  await expect(page.getByTestId("search-button")).toHaveCSS(
    "height",
    desktop ? tokens.layout["control-desktop"] : tokens.layout["control-touch"]
  )
  // A pill: its corners are rounded by at least half its height, however the browser writes that.
  expect(
    await page
      .getByTestId("search-button")
      .evaluate((button) =>
        parseFloat(getComputedStyle(button).borderTopLeftRadius)
      )
  ).toBeGreaterThanOrEqual(18)
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
  await page.goto("/dashboard/")
  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("link", { name: "Skip to content" })
  ).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()
})

test("navigation remains usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto("/dashboard/")
  await page.getByTestId("search-button").waitFor()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // The search still fits, as a round button, and its list fits the screen.
  await page.getByTestId("search-button").click()
  const search = page.getByRole("dialog", { name: "Search tools" })
  await expect(search.getByRole("option")).toHaveCount(48)
  const box = await search.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  await page.keyboard.press("Escape")
  await expect(search).toBeHidden()
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
  await expect(page.getByTestId("tool-card")).toHaveCount(5)
  await expect(dialog).not.toBeVisible()
})
