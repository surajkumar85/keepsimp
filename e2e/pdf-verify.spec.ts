import { readFileSync } from "node:fs"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { makeSignedPdf, SIGNER } from "../tests/pdf-signing"
import { bytesOf, pdf, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/verify-pdf-signature/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const panel = (page: Page) => page.getByTestId("editor-signatures")
const listed = (page: Page) => panel(page).getByTestId("signature")
const toggle = (page: Page) => page.getByTestId("signatures-toggle")

const upload = (bytes: Uint8Array, name = "contract.pdf"): Upload => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(bytes),
})

async function open(page: Page, file: Upload, route = ROUTE) {
  await page.goto(route)
  await page.locator("#editor-file").setInputFiles(file)
  await readerReady(page)
}

test("the door's sample: a signature that holds, whose it is, and the field filled in after it", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await readerReady(page)
  await expect(panel(page)).toBeVisible()
  await expect(listed(page)).toHaveCount(1)
  const one = listed(page).first()
  await expect(one).toHaveAttribute("data-good", "true")
  await expect(one.getByTestId("signature-verdict")).toHaveText(
    "This signature holds over the file as it was signed."
  )
  await expect(one).toContainText(
    "Signed with the certificate of Sam Example (rsa), issued by KeepSimp Test Authority."
  )
  await expect(one).toContainText("Reason: Agreed · Place: Leeds")
  await expect(one).toContainText("14 October 2026")
  await expect(one.getByTestId("signature-changes")).toHaveText(
    "The file was added to once after this signature: a field was filled in or changed (“Witness”); page 1 looks different."
  )
  await expect(one).toContainText("Client · adbe.pkcs7.detached")
  await expect(toggle(page)).toHaveAccessibleName("Signatures: 1")
  await one.getByRole("button", { name: "Show on page 1" }).click()
  // The panel closes and opens from the toolbar.
  await panel(page).getByRole("button", { name: "Close signatures" }).click()
  await expect(panel(page)).toHaveCount(0)
  await toggle(page).click()
  await expect(listed(page)).toHaveCount(1)
})

test("a file changed where its signature covers it does not hold, and says so", async ({
  page,
}) => {
  const signed = await makeSignedPdf({ plain: true })
  const at = Buffer.from(signed).indexOf("/Producer")
  expect(at).toBeGreaterThan(0)
  const changed = signed.slice()
  changed[at + 1] = "Q".charCodeAt(0)
  await open(page, upload(changed))
  const one = listed(page).first()
  await expect(one).toHaveAttribute("data-good", "false")
  await expect(one.getByTestId("signature-verdict")).toContainText(
    "This signature does not hold."
  )
})

test("a signature holds over the whole of an untouched file; a file with none says it has none", async ({
  page,
}) => {
  await open(page, upload(await makeSignedPdf()))
  const one = listed(page).first()
  await expect(one.getByTestId("signature-verdict")).toHaveText(
    "This signature holds: nothing in the file has changed since it was signed."
  )
  await expect(one).toContainText(
    `Signed with the certificate of ${SIGNER}, which signed itself: nobody vouches for that name.`
  )
  await expect(one.getByTestId("signature-changes")).toHaveText(
    "It covers the whole file."
  )
  // Another file: its own list, not the last one's.
  await page.getByRole("button", { name: "Close the editor" }).click()
  await page.getByRole("button", { name: "Close the file" }).click()
  await page
    .locator("#editor-file")
    .setInputFiles(await pdf("plan.pdf", "dr", { pages: 2 }))
  await readerReady(page)
  await expect(panel(page)).toContainText(
    "This file has no digital signatures."
  )
})

test("in the whole editor, a signed file shows its signatures; one filled in here says what changed", async ({
  page,
}) => {
  // A file without signatures has no button for them.
  await open(
    page,
    await pdf("plan.pdf", "dr", { pages: 2 }),
    "/dashboard/pdf-editor/"
  )
  await expect(tool(page)).toBeVisible()
  await expect(toggle(page)).toHaveCount(0)

  // Filled in where a signed form is filled, written after the signature.
  await open(page, upload(await makeSignedPdf()), "/dashboard/fill-pdf-form/")
  await expect(toggle(page)).toHaveAccessibleName("Signatures: 1")
  await expect(panel(page)).toHaveCount(0)
  await page
    .locator('[data-testid=editor-field][data-name="name"]')
    .locator("input")
    .fill("Ada Lovelace")
  await page.keyboard.press("Tab")
  await expect(tool(page)).toHaveAttribute("data-changes", "1", {
    timeout: 30_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
  const pending = page.waitForEvent("download")
  await page.getByTestId("editor-download").click()
  const kept = await bytesOf(await pending)

  await open(page, upload(kept, "filled.pdf"))
  const one = listed(page).first()
  await expect(one.getByTestId("signature-verdict")).toHaveText(
    "This signature holds over the file as it was signed."
  )
  await expect(one.getByTestId("signature-changes")).toContainText(
    "a field was filled in or changed (“name”)"
  )
})

test("checks signatures against the certificates you trust, remembered only when asked", async ({
  page,
}) => {
  const fixture = (path: string) => ({
    name: path.split("/").pop()!,
    mimeType: "application/octet-stream",
    buffer: readFileSync(path),
  })
  const sample = async () => {
    await page.goto(ROUTE)
    await page.getByRole("button", { name: "Try a sample" }).click()
    await readerReady(page)
    await expect(listed(page)).toHaveCount(1)
  }
  const trustedList = () => page.getByTestId("trusted-certificate")
  const goesBack =
    "It goes back to “KeepSimp Test Authority”, a certificate you trust."
  await sample()
  const one = listed(page).first()
  await expect(panel(page)).toContainText("You have added no certificates.")
  await expect(one).not.toContainText("a certificate you trust")

  // A certificate of another authority: the signature does not go back to it.
  await page
    .getByTestId("trusted-file")
    .setInputFiles(fixture("tests/fixtures/trust/root.crt"))
  await expect(trustedList()).toHaveCount(1)
  await expect(one).toContainText(
    // The signature carries the authority's certificate, which signed itself.
    "It goes back to “KeepSimp Test Authority”, which is not among the certificates you trust."
  )
  // The authority that issued it.
  await page
    .getByTestId("trusted-file")
    .setInputFiles(fixture("tests/fixtures/certificates/test-authority.crt"))
  await expect(trustedList()).toHaveCount(2)
  await expect(one).toContainText(goesBack)
  await expect(trustedList().nth(1)).toContainText("KeepSimp Test Authority")
  await expect(trustedList().nth(1)).toContainText("Signed by itself")
  // Added twice, or a file that is not a certificate: said, and nothing added.
  await page
    .getByTestId("trusted-file")
    .setInputFiles(fixture("tests/fixtures/certificates/test-authority.crt"))
  await expect(panel(page).getByRole("alert")).toHaveText(
    "You trust this certificate already."
  )
  await page
    .getByTestId("trusted-file")
    .setInputFiles(fixture("tests/fixtures/certificates/rsa-aes.p12"))
  await expect(panel(page).getByRole("alert")).toContainText(
    "not a .p12 or .pfx"
  )
  await expect(trustedList()).toHaveCount(2)

  // Not kept unless asked: a new visit trusts nothing.
  await sample()
  await expect(trustedList()).toHaveCount(0)
  await page
    .getByTestId("trusted-file")
    .setInputFiles(fixture("tests/fixtures/certificates/test-authority.crt"))
  await expect(listed(page).first()).toContainText(goesBack)
  await page
    .getByRole("switch", { name: "Remember them on this device" })
    .click()
  await sample()
  await expect(trustedList()).toHaveCount(1)
  await expect(listed(page).first()).toContainText(goesBack)
  await expect(
    page.getByRole("switch", { name: "Remember them on this device" })
  ).toBeChecked()
  // Stopping trusting it takes it off the list, and from what is kept.
  await page
    .getByRole("button", { name: "Stop trusting KeepSimp Test Authority" })
    .click()
  await expect(trustedList()).toHaveCount(0)
  await expect(listed(page).first()).not.toContainText(goesBack)
  await page
    .getByRole("switch", { name: "Remember them on this device" })
    .click()
  expect(
    await page.evaluate(() => localStorage.getItem("keepsimp.trusted"))
  ).toBeNull()
})

test("stays accessible, local and responsive", async ({ page }) => {
  const external: string[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      ["http:", "https:"].includes(url.protocol) &&
      (url.origin !== "http://127.0.0.1:4173" ||
        !["GET", "HEAD"].includes(request.method()))
    )
      external.push(request.url())
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await readerReady(page)
  await expect(listed(page)).toHaveCount(1)
  const axe = async () =>
    (
      await new AxeBuilder({ page })
        .include("[data-testid=editor-signatures]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  expect(await axe()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await axe()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(panel(page)).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // Another panel puts this one down.
  await page.getByTestId("document-toggle").click()
  await expect(panel(page)).toHaveCount(0)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
