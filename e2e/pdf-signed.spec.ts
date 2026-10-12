import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { PDFDocument } from "@cantoo/pdf-lib"
import { makeSignedPdf, readSignature, SIGNER } from "../tests/pdf-signing"
import { bytesOf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/fill-pdf-form/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const control = (page: Page, name: string) =>
  page
    .locator(`[data-testid=editor-field][data-name="${name}"]`)
    .locator("input, select, textarea")
const choice = (page: Page) =>
  page.getByRole("radiogroup", { name: "The signature in this file" })

/** A form of one page that has been signed with a certificate; see `makeSignedPdf`. */
const signed = async (name = "contract.pdf"): Promise<Upload> => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(await makeSignedPdf()),
})

async function open(page: Page, upload: Upload) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(upload)
  await readerReady(page)
}

async function changes(page: Page, count: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(count), {
    timeout: 30_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}

async function saved(page: Page, trigger: Locator) {
  const pending = page.waitForEvent("download")
  await trigger.click()
  const got = await pending
  await expect(page.getByTestId("editor-check")).toBeVisible()
  return bytesOf(got)
}

test("fills in a signed form and keeps its signature valid", async ({
  page,
}) => {
  const upload = await signed()
  expect(readSignature(upload.buffer)).toEqual({
    valid: true,
    whole: true,
    signer: SIGNER,
  })
  await open(page, upload)
  await control(page, "name").fill("Ada Lovelace")
  await page.keyboard.press("Tab")
  await changes(page, 1)
  await control(page, "agree").click()
  await changes(page, 2)

  // Straight from the window: the changes are written after the signed part.
  const kept = await saved(page, page.getByTestId("editor-download"))
  await expect(page.getByTestId("editor-check")).toContainText(
    "The signed part of the file is untouched, so its signature still holds. What you changed was written after it."
  )
  expect(
    Buffer.from(kept.subarray(0, upload.buffer.length)).equals(upload.buffer)
  ).toBe(true)
  expect(readSignature(kept)).toEqual({
    valid: true,
    whole: false,
    signer: SIGNER,
  })
  const form = (await PDFDocument.load(kept)).getForm()
  expect(form.getTextField("name").getText()).toBe("Ada Lovelace")
  expect(form.getCheckBox("agree").isChecked()).toBe(true)

  // The page says what it is doing, and offers nothing that would spoil it.
  await expect(tool(page)).toContainText(
    "This file carries a digital signature. It still holds after your changes if they are written after the signed part"
  )
  await expect(
    choice(page).getByRole("radio", { name: "Keep it valid" })
  ).toBeChecked()
  const panel = page.getByTestId("result")
  await expect(
    panel.getByRole("switch", { name: "Keep what you added editable" })
  ).toHaveCount(0)
  await expect(
    panel.getByRole("radiogroup", { name: "Form fields" })
  ).toHaveCount(0)
  await expect(
    panel.getByRole("switch", { name: "Lock the result with a password" })
  ).toHaveCount(0)

  // Again after undoing and changing more: every download is whole and valid.
  await page.getByRole("button", { name: "Keep editing" }).click()
  await readerReady(page)
  await page.getByTestId("editor-undo").click()
  await changes(page, 1)
  await control(page, "name").fill("Ada King")
  await page.keyboard.press("Tab")
  await changes(page, 2)
  const again = await saved(page, page.getByTestId("editor-download"))
  expect(readSignature(again)).toMatchObject({ valid: true, whole: false })
  const second = (await PDFDocument.load(again)).getForm()
  expect(second.getTextField("name").getText()).toBe("Ada King")
  expect(second.getCheckBox("agree").isChecked()).toBe(false)

  // Written anew, the usual choices are back, and the signature no longer holds.
  await choice(page).getByRole("radio", { name: "Write the file anew" }).click()
  await expect(panel).toContainText("The signature in it will no longer hold.")
  await expect(
    panel.getByRole("radiogroup", { name: "Form fields" })
  ).toBeVisible()
  const anew = await saved(
    page,
    panel.getByRole("button", { name: /^Download/ })
  )
  await expect(page.getByTestId("editor-check")).not.toContainText(
    "signed part"
  )
  expect(readSignature(anew).valid).toBe(false)
  expect(
    (await PDFDocument.load(anew)).getForm().getTextField("name").getText()
  ).toBe("Ada King")
})

test("keeps the choice for a signed file accessible in both themes", async ({
  page,
}) => {
  const scan = async () =>
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open(page, await signed())
  await expect(reader(page)).toBeVisible()
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(choice(page)).toBeVisible()
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    expect(await scan(), theme).toEqual([])
  }
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})
