import { test, expect, type Page } from "@playwright/test"

test("touch movement leaves selection alone; mouse and keyboard navigation still work", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/")
  await page.getByTestId("search-button").click()
  const dialog = page.getByRole("dialog", { name: "Search tools" }),
    input = dialog.getByRole("combobox"),
    list = dialog.getByRole("listbox"),
    target = dialog.getByRole("option", { name: /PDF annotator/ })
  const first = await input.getAttribute("aria-activedescendant")
  const beforeHover = await list.evaluate((node) => node.scrollTop)
  await target.dispatchEvent("pointermove", { pointerType: "touch" })
  await expect(input).toHaveAttribute("aria-activedescendant", first!)
  await target.dispatchEvent("pointermove", { pointerType: "mouse" })
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    (await target.getAttribute("id"))!
  )
  expect(await list.evaluate((node) => node.scrollTop)).toBe(beforeHover)
  await input.press("End")
  await expect
    .poll(() => list.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100)
  await input.press("Home")
  await expect
    .poll(() => list.evaluate((node) => node.scrollTop))
    .toBeLessThanOrEqual(8)
  await list.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  // Home must still bring the first result back when it is already selected.
  await input.press("Home")
  await expect
    .poll(() => list.evaluate((node) => node.scrollTop))
    .toBeLessThanOrEqual(8)
})

test("search fits a shortened visual viewport and follows its vertical offset", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/")
  await page.getByTestId("search-button").click()
  const dialog = page.getByRole("dialog", { name: "Search tools" }),
    list = dialog.getByRole("listbox"),
    input = dialog.getByRole("combobox")
  // Headless browsers have no OS keyboard. Keep the layout viewport unchanged
  // and simulate its actual effect on VisualViewport, including Safari's pan.
  for (const [height, offsetTop] of [
    [320, 0],
    [260, 70],
    [844, 0],
  ]) {
    await page.evaluate(
      ({ height, offsetTop }) => {
        const viewport = window.visualViewport!
        Object.defineProperties(viewport, {
          height: { configurable: true, value: height },
          offsetTop: { configurable: true, value: offsetTop },
        })
        viewport.dispatchEvent(new Event("resize"))
        viewport.dispatchEvent(new Event("scroll"))
      },
      { height, offsetTop }
    )
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!
        return box.y + box.height
      })
      .toBeLessThanOrEqual(height + offsetTop - 15)
    const box = (await dialog.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(offsetTop + 15)
    await expect(input).toBeFocused()
    await expect(
      dialog.getByRole("button", { name: "Close search" })
    ).toBeVisible()
    await input.press("End")
    await expect
      .poll(() => list.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(100)
    await input.press("Home")
    await expect
      .poll(() => list.evaluate((node) => node.scrollTop))
      .toBeLessThanOrEqual(8)
    if (height === 320) {
      await page.screenshot({
        path: `/tmp/search-keyboard-${info.project.name}.png`,
      })
    }
  }
  await dialog.getByRole("button", { name: "Close search" }).click()
  await expect(page.getByTestId("search-button")).toBeFocused()
})

// Chromium's compositor receives trusted touch events: dispatchEvent alone
// does not perform the browser's default finger scrolling.
async function swipe(
  page: Page,
  start: { x: number; y: number },
  endY: number
) {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...start, id: 1 }],
    })
    for (let i = 1; i <= 12; i++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: start.x, y: start.y + ((endY - start.y) * i) / 12, id: 1 },
        ],
      })
      await page.waitForTimeout(16)
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
  } finally {
    await session.detach()
  }
}

test("finger swipes scroll search results without changing selection or moving the page", async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== "chromium" || !isMobile,
    "Trusted swipe injection uses Chromium's mobile protocol."
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/")
  await page.getByTestId("search-button").click()
  const dialog = page.getByRole("dialog", { name: "Search tools" }),
    list = dialog.getByRole("listbox"),
    input = dialog.getByRole("combobox")
  const selected = await input.getAttribute("aria-activedescendant"),
    scroll = await page.evaluate(() => scrollY),
    box = (await list.boundingBox())!
  await swipe(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height - 50 },
    box.y + 50
  )
  await expect
    .poll(() => list.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100)
  await expect(input).toHaveAttribute("aria-activedescendant", selected!)
  expect(await page.evaluate(() => scrollY)).toBe(scroll)
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard\/$/)
  await expect(
    dialog.getByRole("button", { name: "Close search" })
  ).toBeVisible()
  await swipe(
    page,
    { x: box.x + box.width / 2, y: box.y + 50 },
    box.y + box.height - 50
  )
  await expect
    .poll(() => list.evaluate((node) => node.scrollTop))
    .toBeLessThan(100)
  await expect(input).toHaveAttribute("aria-activedescendant", selected!)
  // A swipe must suppress link activation, while a deliberate tap still opens it.
  await input.press("Home")
  const first = (await dialog.getByRole("option").first().boundingBox())!
  await page.touchscreen.tap(
    first.x + first.width / 2,
    first.y + first.height / 2
  )
  await expect(page).toHaveURL(/\/dashboard\/video-editor\/$/)
  await expect(dialog).toBeHidden()
})

// Safari on a phone cannot scroll by touch anything inside an element whose
// opacity was animated when it appeared: a finger on the search results moved
// nothing (seen in the iOS simulator; no browser that runs here shows it).
// So a window grows in and a sheet slides in, and neither fades in.
test("a window and a sheet appear without fading in, so a phone can scroll inside them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/")
  /** How see-through an element is in the state it appears from, with nothing in between. */
  const startsAt = (which: string) =>
    page.evaluate((name) => {
      const element = document.querySelector<HTMLElement>(name)!
      const before = element.style.transition
      element.style.transition = "none"
      element.setAttribute("data-starting-style", "")
      const opacity = getComputedStyle(element).opacity
      element.removeAttribute("data-starting-style")
      element.style.transition = before
      return opacity
    }, which)
  await page.getByTestId("search-button").click()
  const dialog = page.getByRole("dialog", { name: "Search tools" })
  await expect(dialog.getByRole("listbox")).toBeVisible()
  expect(await startsAt('[data-slot="dialog-content"]')).toBe("1")
  await dialog.getByRole("button", { name: "Close search" }).click()
  await expect(dialog).toBeHidden()
  // The list of tools at the side is a sheet on a phone.
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await expect(page.locator('[data-mobile="true"]')).toBeVisible()
  expect(await startsAt('[data-mobile="true"]')).toBe("1")
})
