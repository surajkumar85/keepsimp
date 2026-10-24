import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const panel = (page: Page) =>
  page.getByRole("dialog", { name: "Kept on this device" })
const trigger = (page: Page) =>
  page.getByRole("button", { name: "Kept on this device", exact: true })
const row = (page: Page, id: string) => page.getByTestId(`kept-${id}`)
const size = (page: Page, id: string) => row(page, id).getByTestId("kept-size")

/** Writes into the stores the tools use, as they would. */
async function fill(page: Page) {
  await page.evaluate(async () => {
    localStorage.setItem("keepsimp.signature", "x".repeat(494))
    localStorage.setItem("keepsimp.comment-author", "Sam")
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("keepsimp-markdown", 1)
      opening.onupgradeneeded = () => opening.result.createObjectStore("drafts")
      opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const db = opening.result
        const transaction = db.transaction("drafts", "readwrite")
        transaction
          .objectStore("drafts")
          .put({ text: "y".repeat(1000) }, "current")
        transaction.oncomplete = () => {
          db.close()
          resolve()
        }
      }
    })
    const kept = await caches.open("keepsimp-kept-on-use")
    await kept.put(
      new Request("/ocr/test/eng.traineddata"),
      new Response("o".repeat(2048))
    )
  })
}

const databases = (page: Page) =>
  page.evaluate(async () =>
    "databases" in indexedDB
      ? (await indexedDB.databases()).map((one) => one.name)
      : null
  )

test("lists what is kept, with its size, and removes each part on request", async ({
  page,
}) => {
  await page.goto("/dashboard/")
  // Measuring an empty browser shows nothing and makes nothing.
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
  await expect(size(page, "markdown-draft")).toHaveText("Nothing kept")
  await expect(size(page, "signature")).toHaveText("Nothing kept")
  await expect(row(page, "markdown-draft").getByRole("button")).toHaveCount(0)
  const before = await databases(page)
  if (before)
    for (const name of [
      "keepsimp-drafts",
      "keepsimp-markdown",
      "keepsimp-recordings",
    ])
      expect(before).not.toContain(name)
  await page.keyboard.press("Escape")
  await expect(panel(page)).toBeHidden()
  await expect(trigger(page)).toBeFocused()

  await fill(page)
  await trigger(page).click()
  // Each part by its own count: keys and values of the draft, two bytes a
  // character in local storage, the bytes of a saved file.
  await expect(size(page, "markdown-draft")).toHaveText("1011 B")
  await expect(size(page, "signature")).toHaveText("1.0 KB")
  await expect(size(page, "comment-name")).toHaveText("52 B")
  await expect(size(page, "ocr")).toHaveText("2.0 KB")
  await expect(size(page, "whisper")).toHaveText("Nothing kept")
  await expect(page.getByTestId("kept-total")).not.toHaveText("Measuring…")

  // Keeping it after all changes nothing.
  await row(page, "signature")
    .getByRole("button", { name: "Remove Your signature and initials" })
    .click()
  await row(page, "signature").getByRole("button", { name: "Keep it" }).click()
  await expect(size(page, "signature")).toHaveText("1.0 KB")

  // Removing takes away that part and nothing else.
  await row(page, "signature")
    .getByRole("button", { name: "Remove Your signature and initials" })
    .click()
  await row(page, "signature")
    .getByRole("button", { name: "Remove", exact: true })
    .click()
  await expect(size(page, "signature")).toHaveText("Nothing kept")
  expect(
    await page.evaluate(() => [
      localStorage.getItem("keepsimp.signature"),
      localStorage.getItem("keepsimp.comment-author"),
    ])
  ).toEqual([null, "Sam"])

  await row(page, "markdown-draft")
    .getByRole("button", { name: "Remove Markdown documents" })
    .click()
  await row(page, "markdown-draft")
    .getByRole("button", { name: "Remove", exact: true })
    .click()
  await expect(size(page, "markdown-draft")).toHaveText("Nothing kept")
  // The store is empty and the database is still there for the editor.
  expect(
    await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const opening = indexedDB.open("keepsimp-markdown")
          opening.onsuccess = () => {
            const count = opening.result
              .transaction("drafts")
              .objectStore("drafts")
              .count()
            count.onsuccess = () => {
              opening.result.close()
              resolve(count.result)
            }
          }
        })
    )
  ).toBe(0)

  await row(page, "ocr")
    .getByRole("button", { name: "Remove Text recognition languages" })
    .click()
  await row(page, "ocr")
    .getByRole("button", { name: "Remove", exact: true })
    .click()
  await expect(size(page, "ocr")).toHaveText("Nothing kept")
  expect(
    await page.evaluate(async () =>
      (await caches.open("keepsimp-kept-on-use"))
        .keys()
        .then((all) => all.length)
    )
  ).toBe(0)

  const results = await new AxeBuilder({ page })
    .include('[data-testid="kept-body"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(results.violations).toEqual([])
})

test("fits a phone and scrolls inside, in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto("/dashboard/")
  await fill(page)
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await trigger(page).click()
    await expect(size(page, "ocr")).toHaveText("2.0 KB")
    const box = (await panel(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(box.y + box.height).toBeLessThanOrEqual(640)
    const body = page.getByTestId("kept-body")
    expect(
      await body.evaluate(
        (element) => element.scrollHeight > element.clientHeight
      )
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    const results = await new AxeBuilder({ page })
      .include('[data-testid="kept-body"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(results.violations).toEqual([])
    await page
      .getByRole("button", { name: "Close kept on this device" })
      .click()
    await expect(panel(page)).toBeHidden()
  }
})
