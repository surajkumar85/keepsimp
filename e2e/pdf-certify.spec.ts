import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import {
  CERTIFICATE_PASSWORD,
  certificateFile,
  HAS_PDFSIG,
  opensslSignatures,
  pdfsigSays,
} from "../tests/pdf-certificates"
import { danglingRefs, readPdf } from "../tests/pdf-reader"
import { makeSignedPdf } from "../tests/pdf-signing"
import { bytesOf, pdf, readerReady, type Upload } from "./pdf"

const card = (page: Page) => page.getByTestId("editor-certify")
const download = (page: Page) =>
  page.getByRole("button", { name: "Download PDF" })

async function open(page: Page, upload: Upload) {
  await page.goto("/dashboard/pdf-editor/")
  await page.locator("#editor-file").setInputFiles(upload)
  await readerReady(page)
  await page.getByRole("button", { name: "Close the editor" }).click()
}

const signing = (page: Page) =>
  page.getByRole("switch", { name: "Sign with a certificate" })

/** Choose a certificate of the test set and open it with its password. */
async function openCertificate(
  page: Page,
  name: string,
  password = CERTIFICATE_PASSWORD
) {
  if ((await signing(page).getAttribute("aria-checked")) !== "true")
    await signing(page).click()
  await page.getByTestId("certificate-file").setInputFiles({
    name: `${name}.p12`,
    mimeType: "application/x-pkcs12",
    buffer: Buffer.from(certificateFile(name)),
  })
  await card(page).getByLabel("The certificate's password").fill(password)
  await card(page).getByRole("button", { name: "Open" }).click()
}

async function saved(page: Page) {
  const pending = page.waitForEvent("download")
  await download(page).click()
  const got = await pending
  await expect(page.getByTestId("editor-check")).toBeVisible()
  const bytes = await bytesOf(got)
  expect(await danglingRefs(bytes)).toEqual([])
  return bytes
}

test("signs a file with a certificate at download, in a box on a page, and other software says it holds", async ({
  page,
}) => {
  await open(page, await pdf("contract.pdf", "C", { pages: 2 }))
  // Until a certificate is open, there is nothing to sign with.
  await page.getByRole("switch", { name: "Sign with a certificate" }).click()
  await expect(
    page.getByRole("alert").filter({
      hasText: "Choose your certificate file (.p12 or .pfx) to sign with.",
    })
  ).toBeVisible()
  await expect(download(page)).toBeDisabled()
  await page.getByRole("switch", { name: "Sign with a certificate" }).click()
  await expect(download(page)).toBeEnabled()

  await openCertificate(page, "rsa-legacy", "wrong")
  await expect(card(page).getByRole("alert")).toHaveText(
    "That password does not open this certificate file."
  )
  await card(page)
    .getByLabel("The certificate's password")
    .fill(CERTIFICATE_PASSWORD)
  await card(page).getByRole("button", { name: "Open" }).click()
  const signer = page.getByTestId("certificate-signer")
  await expect(signer).toContainText("Sam Example (rsa)")
  await expect(signer).toContainText("Issued by KeepSimp Test Authority")
  await expect(signer).toContainText("RSA 2048")
  await card(page).getByRole("radio", { name: "A box on a page" }).click()
  await card(page).getByLabel("Page", { exact: true }).fill("2")
  await card(page).getByLabel("Reason (if you like)").fill("Approved")
  await expect(download(page)).toBeEnabled()

  const bytes = await saved(page)
  await expect(page.getByTestId("editor-check")).toContainText(
    "Signed with the certificate of Sam Example (rsa), issued by KeepSimp Test Authority, as “Signature”. It shows on page 2."
  )
  expect(opensslSignatures(bytes)).toEqual([{ valid: true, whole: true }])
  const read = await readPdf(bytes)
  expect(read.pages[0].text).toContain("C-P1")
  if (HAS_PDFSIG) {
    const said = pdfsigSays(bytes)!
    expect(said).toContain("Signature is Valid.")
    expect(said).toContain("Total document signed")
  }
})

test("adds a signature to a file that is signed already, keeping the first valid", async ({
  page,
}) => {
  await open(page, {
    name: "signed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await makeSignedPdf({ plain: true })),
  })
  await openCertificate(page, "ec-aes")
  await expect(page.getByTestId("certificate-signer")).toContainText(
    "ECDSA P-256"
  )
  const bytes = await saved(page)
  expect(opensslSignatures(bytes)).toEqual([
    { valid: true, whole: false },
    { valid: true, whole: true },
  ])
  await expect(page.getByTestId("editor-check")).toContainText(
    "It is not shown on a page."
  )
})

test("will not sign with a certificate that has expired, nor a file it is told to lock", async ({
  page,
}) => {
  await open(page, await pdf("contract.pdf", "C", { pages: 1 }))
  await openCertificate(page, "expired")
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This certificate expired on 1 February 2020" })
  ).toBeVisible()
  await expect(download(page)).toBeDisabled()
  // Another certificate, with no password, that signed itself.
  await openCertificate(page, "self-nopass", "")
  await expect(page.getByTestId("certificate-signer")).toContainText(
    "Self Signed Sam"
  )
  await expect(page.getByTestId("certificate-signer")).toContainText(
    "Signed by itself"
  )
  await expect(download(page)).toBeEnabled()
  // A lock and a signature do not go together here: once the lock has its password, that is what is said.
  await page
    .getByRole("switch", { name: "Lock the result with a password" })
    .click()
  await page.getByLabel("Password to open the file").fill("open sesame")
  await expect(
    page.getByRole("alert").filter({
      hasText: "A file locked with a password cannot be signed here.",
    })
  ).toBeVisible()
  await expect(download(page)).toBeDisabled()
})

test("stays accessible and local while a certificate is chosen", async ({
  page,
}) => {
  const external: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.origin !== "http://127.0.0.1:4173"
    )
      external.push(request.url())
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open(page, await pdf("contract.pdf", "C", { pages: 1 }))
  await openCertificate(page, "rsa-aes")
  await expect(page.getByTestId("certificate-signer")).toBeVisible()
  const axe = async () =>
    (
      await new AxeBuilder({ page })
        .include("[data-testid=editor-certify]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  expect(await axe()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await axe()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await saved(page)
  expect(external).toEqual([])
})
