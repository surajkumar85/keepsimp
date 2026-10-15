import { expect, test, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import tokens from "../design-system/tokens.json" with { type: "json" }

type MemoryProbe = {
  bytes: number
  reads: number
}

type ProbeWindow = Window & { memoryProbe: MemoryProbe }

const mib = 1024 * 1024
const reading = (value: number) => new RegExp(`^${value} MiB$`)
const panel = (page: Page) => page.getByRole("dialog", { name: "Memory usage" })
const trigger = (page: Page) =>
  page.getByRole("button", { name: "Memory usage", exact: true })

async function openMemory(page: Page) {
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
  return panel(page)
}

// Only the browser's reporting API is controlled here. The actual component,
// reader, sampling lifecycle and navigation run in the production application.
async function useHeap(page: Page) {
  await page.addInitScript(() => {
    const state = { bytes: 32 * 1024 * 1024, reads: 0 }
    ;(window as unknown as ProbeWindow).memoryProbe = state
    Object.defineProperty(window, "crossOriginIsolated", {
      configurable: true,
      value: false,
    })
    Object.defineProperty(performance, "measureUserAgentSpecificMemory", {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(performance, "memory", {
      configurable: true,
      get() {
        state.reads++
        return {
          usedJSHeapSize: state.bytes,
          totalJSHeapSize: 128 * 1024 * 1024,
          jsHeapSizeLimit: 1024 * 1024 * 1024,
        }
      },
    })
  })
}

async function setBytes(page: Page, value: number) {
  await page.evaluate((bytes) => {
    ;(window as unknown as ProbeWindow).memoryProbe.bytes = bytes
  }, value * mib)
}

const readCount = (page: Page) =>
  page.evaluate(() => (window as unknown as ProbeWindow).memoryProbe.reads)

test("memory reports the real browser capability without inventing a reading or sending it away", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = []
  const external: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin)
      external.push(request.url())
  })
  await page.goto("/dashboard/json-formatter/")
  const nativeHeap = await page.evaluate(() => {
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize?: number } }
    ).memory
    return (
      typeof memory?.usedJSHeapSize === "number" &&
      Number.isFinite(memory.usedJSHeapSize)
    )
  })
  const dialog = await openMemory(page)
  await expect(dialog).toContainText("JSON formatter")
  if (nativeHeap) {
    await expect(dialog).toContainText("JavaScript memory")
    await expect(dialog.getByTestId("memory-current")).toHaveText(
      /\d[\d.,]* (?:B|KB|MB|GB|KiB|MiB|GiB)/
    )
    expect(
      parseFloat(
        (await dialog.getByTestId("memory-current").innerText()).replaceAll(
          ",",
          ""
        )
      )
    ).toBeGreaterThan(0)
    await expect(dialog).not.toContainText(
      "This browser doesn’t report memory usage."
    )
  } else {
    await expect(dialog).toContainText(
      "This browser doesn’t report memory usage."
    )
    await expect(dialog.getByTestId("memory-current")).toHaveCount(0)
    await expect(dialog).not.toContainText(/\b0 (?:MB|MiB|GB|GiB)\b/)
  }
  await dialog.getByText("About these readings", { exact: true }).click()
  await expect(dialog).toContainText("this reading isn’t a per-tool total")
  await expect(dialog).toContainText("Nothing is stored or sent")
  await dialog.getByRole("button", { name: "Close memory usage" }).click()
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test("heap readings update, retain the observed peak and stop sampling when hidden or closed", async ({
  page,
}) => {
  await useHeap(page)
  await page.goto("/dashboard/")
  const dialog = await openMemory(page)
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(32))
  await setBytes(page, 96)
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(96), {
    timeout: 5000,
  })
  await expect(dialog.getByTestId("memory-peak")).toHaveText(reading(96))
  await setBytes(page, 64)
  await dialog.getByRole("button", { name: "Refresh memory reading" }).click()
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(64))
  await expect(dialog.getByTestId("memory-peak")).toHaveText(reading(96))

  // A nested disclosure has a toggle event of its own. It must not be treated
  // as opening/closing the surrounding native popover, or reset its readings.
  const disclosure = dialog.getByText("About these readings", { exact: true })
  await disclosure.focus()
  await disclosure.press("Enter")
  await expect(dialog.locator("details")).toHaveAttribute("open", "")
  await expect(disclosure).toBeFocused()
  await disclosure.press("Enter")
  await expect(dialog.locator("details")).not.toHaveAttribute("open", "")
  await expect(disclosure).toBeFocused()
  await expect(dialog).toBeVisible()
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "true")
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(64))
  await expect(dialog.getByTestId("memory-peak")).toHaveText(reading(96))

  // A background tab should spend no work polling its heap. Headless browsers
  // do not consistently background a second page, so signal the browser state.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    })
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  const hiddenReads = await readCount(page)
  await page.waitForTimeout(2300)
  expect(await readCount(page)).toBe(hiddenReads)
  await setBytes(page, 48)
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    })
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(48), {
    timeout: 5000,
  })
  await dialog.getByRole("button", { name: "Close memory usage" }).click()
  await expect(dialog).toBeHidden()
  const closedReads = await readCount(page)
  await page.waitForTimeout(2300)
  expect(await readCount(page)).toBe(closedReads)
  await setBytes(page, 24)
  await openMemory(page)
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(24))
})

test("an unavailable browser has an honest empty state and remains usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(performance, "memory", {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(performance, "measureUserAgentSpecificMemory", {
      configurable: true,
      value: undefined,
    })
  })
  await page.goto("/dashboard/")
  const dialog = await openMemory(page)
  await expect(dialog).toContainText(
    "This browser doesn’t report memory usage."
  )
  await expect(dialog.getByTestId("memory-current")).toHaveCount(0)
  await expect(dialog.getByTestId("memory-peak")).toHaveCount(0)
  await expect(dialog).not.toContainText(/\b0 (?:MB|MiB|GB|GiB)\b/)
  await dialog.getByRole("button", { name: "Close memory usage" }).click()
  await expect(trigger(page)).toBeFocused()
  await page.getByTestId("search-button").click()
  await expect(page.getByRole("dialog", { name: "Search tools" })).toBeVisible()
})

test("the broader page measurement runs on opening and explicit refresh, without polling", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { bytes: 32 * 1024 * 1024, reads: 0 }
    ;(window as unknown as ProbeWindow).memoryProbe = state
    Object.defineProperty(window, "crossOriginIsolated", {
      configurable: true,
      value: true,
    })
    Object.defineProperty(performance, "memory", {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(performance, "measureUserAgentSpecificMemory", {
      configurable: true,
      value: async () => {
        state.reads++
        return { bytes: state.bytes, breakdown: [] }
      },
    })
  })
  await page.goto("/dashboard/")
  const dialog = await openMemory(page)
  await expect(dialog).toContainText("Page memory")
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(32))
  expect(await readCount(page)).toBe(1)
  await setBytes(page, 96)
  await page.waitForTimeout(2300)
  expect(await readCount(page)).toBe(1)
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(32))
  await dialog.getByRole("button", { name: "Refresh memory reading" }).click()
  await expect(dialog.getByTestId("memory-current")).toHaveText(reading(96))
  expect(await readCount(page)).toBe(2)
  await expect(dialog.getByTestId("memory-peak")).toHaveText(reading(96))
})

test("memory closes by keyboard, button and outside press, and follows the current tool", async ({
  page,
}) => {
  await useHeap(page)
  await page.goto("/dashboard/")
  const button = trigger(page)
  await button.focus()
  await button.press("Enter")
  const dialog = panel(page)
  await expect(dialog).toBeVisible()
  await expect(button).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()
  await openMemory(page)
  await dialog.getByRole("button", { name: "Close memory usage" }).click()
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()
  await openMemory(page)
  // The header action is outside the panel at every viewport width; on a
  // phone the dropdown legitimately covers the page heading below it.
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page
    .getByTestId("tools-ready")
    .getByRole("link", { name: /JSON formatter/ })
    .click()
  await expect(page).toHaveURL(/\/dashboard\/json-formatter\/$/)
  await openMemory(page)
  await expect(dialog).toContainText("JSON formatter")
  const editor = page.getByLabel("Your JSON", { exact: true })
  // Returning to the actual editor must keep the insertion point there,
  // rather than pull focus back to the Memory button after dismissal.
  const editorBox = (await editor.boundingBox())!
  await editor.click({ position: { x: 16, y: editorBox.height - 16 } })
  await expect(dialog).toBeHidden()
  await expect(editor).toBeFocused()
  await openMemory(page)
  const shortcut = await page
    .getByTestId("search-button")
    .getAttribute("aria-keyshortcuts")
  const search = page.getByRole("dialog", { name: "Search tools" })
  // A native popover can appear before its queued toggle moves focus inside.
  // Exercise the shortcut directly from its trigger as well as from the panel.
  await button.press(shortcut!)
  await expect(search.getByRole("combobox")).toBeFocused()
  await expect(dialog).toBeHidden()
  await search.getByRole("combobox").press("Escape")
  await expect(search).toBeHidden()
  await openMemory(page)
  await dialog
    .getByRole("button", { name: "Close memory usage" })
    .press(shortcut!)
  await expect(search.getByRole("combobox")).toBeFocused()
  await expect(dialog).toBeHidden()
  await search.getByRole("combobox").fill("image compressor")
  await search.getByRole("option", { name: /Image compressor/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/image-compressor\/$/)
  await openMemory(page)
  await expect(dialog).toContainText("Image compressor")
  await expect(dialog).not.toContainText("JSON formatter")
})

test("the compact memory panel fits narrow and short screens and scrolls inside its bounds", async ({
  page,
}, info) => {
  await useHeap(page)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/")
  for (const [width, height] of [
    [1440, 900],
    [768, 720],
    [820, 720],
    [320, 568],
    [740, 320],
  ]) {
    await page.setViewportSize({ width, height })
    const dialog = await openMemory(page)
    await expect(dialog.getByTestId("memory-current")).toHaveText(reading(32))
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(7)
    expect(box.y).toBeGreaterThanOrEqual(7)
    expect(box.x + box.width).toBeLessThanOrEqual(width - 7)
    expect(box.y + box.height).toBeLessThanOrEqual(height - 7)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    if (width >= 640) {
      const header = (await page.locator("header").first().boundingBox())!
      const search = (await page.getByTestId("search-button").boundingBox())!
      expect(
        Math.abs(search.x + search.width / 2 - (header.x + header.width / 2))
      ).toBeLessThanOrEqual(1)
    }
    await expect(trigger(page)).toHaveCSS(
      "height",
      width < 768
        ? tokens.layout["control-touch"]
        : tokens.layout["control-desktop"]
    )
    if (height === 320) {
      const scroll = await dialog.evaluate((element) => {
        const scroller = [
          element,
          ...element.querySelectorAll<HTMLElement>("*"),
        ].find(
          (node) =>
            /^(auto|scroll)$/.test(getComputedStyle(node).overflowY) &&
            node.scrollHeight > node.clientHeight
        )
        if (!scroller) return null
        scroller.scrollTop = scroller.scrollHeight
        return {
          top: scroller.scrollTop,
          max: scroller.scrollHeight - scroller.clientHeight,
        }
      })
      expect(scroll).not.toBeNull()
      expect(scroll!.top).toBeGreaterThan(0)
      expect(Math.abs(scroll!.top - scroll!.max)).toBeLessThanOrEqual(1)
    }
    await page.screenshot({
      path: info.outputPath(`memory-${width}x${height}.png`),
    })
    const pageScroll = await page.evaluate(() => scrollY)
    await dialog.getByText("About these readings", { exact: true }).click()
    await expect(dialog).toContainText("this reading isn’t a per-tool total")
    const expanded = (await dialog.boundingBox())!
    expect(expanded.y).toBeGreaterThanOrEqual(7)
    expect(expanded.y + expanded.height).toBeLessThanOrEqual(height - 7)
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll)
    const lastExplanation = dialog.getByText(/Nothing is stored or sent/)
    await lastExplanation.scrollIntoViewIfNeeded()
    await expect(lastExplanation).toBeInViewport()
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll)
    await page.screenshot({
      path: info.outputPath(`memory-expanded-${width}x${height}.png`),
    })
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  }
})

test("memory follows the design tokens, passes both-theme accessibility and never fades in", async ({
  page,
}, info) => {
  await useHeap(page)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/")
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    const dialog = await openMemory(page)
    await expect(dialog.getByTestId("memory-current")).toHaveText(reading(32))
    await expect(dialog).toHaveCSS("border-radius", tokens.radius.xl)
    const style = await dialog.evaluate((element) => {
      const before = element.style.transition
      element.style.transition = "none"
      element.setAttribute("data-starting-style", "")
      const opacity = getComputedStyle(element).opacity
      element.removeAttribute("data-starting-style")
      element.style.transition = before
      const settled = getComputedStyle(element)
      return {
        opacity,
        transition: settled.transitionDuration,
        animation: settled.animationDuration,
      }
    })
    expect(style.opacity).toBe("1")
    for (const duration of [style.transition, style.animation].flatMap(
      (value) => value.split(",")
    )) {
      expect(parseFloat(duration)).toBeLessThanOrEqual(0.00001)
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(results.violations, theme).toEqual([])
    await page.screenshot({ path: info.outputPath(`memory-${theme}.png`) })
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  }
})
