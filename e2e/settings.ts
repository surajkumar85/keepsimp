/** Folded groups of settings, as the settings cards show them. */
import { expect, type Page } from "@playwright/test"

/** Opens one group of settings by its title, if it is folded. */
export async function openGroup(page: Page, title: string) {
  const trigger = page
    .locator("[data-slot=settings-section]")
    .getByRole("button", { name: title, exact: true })
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
}

/** Opens every folded group on the page, for a journey through many settings. */
export async function openGroups(page: Page) {
  const folded = page.locator(
    "[data-slot=settings-section] [aria-expanded=false]"
  )
  // Groups can appear as a file is read (pictures, fields), so look again until none is left.
  await expect(async () => {
    while ((await folded.count()) > 0) await folded.first().click()
    expect(await folded.count()).toBe(0)
  }).toPass()
}
