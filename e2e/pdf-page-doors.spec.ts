import { test, expect, type Page } from "@playwright/test"
import { pdf, reader, readerReady } from "./pdf"

const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })

/** The pages that open the editor for one job on the pages themselves. */
const DOORS = [
  {
    route: "/dashboard/create-pdf-form/",
    title: /Create a fillable PDF form online for free/,
    drop: "Drop a PDF to make a fillable form",
    ability: "Make fields others can fill in",
    guide: "/blog/create-a-fillable-pdf-form/",
    article: "Make a form people can fill in.",
    focused: "opened for making fillable form fields",
    name: "Create a fillable PDF form",
  },
  {
    route: "/dashboard/crop-pdf/",
    title: /Crop a PDF online for free/,
    drop: "Drop a PDF to crop",
    ability: "Cut pages to a frame",
    guide: "/blog/crop-pdfs-without-uploading/",
    article: "Trim the page, and know what trimming means.",
    focused: "opened for cropping",
    name: "Crop PDF",
  },
  {
    route: "/dashboard/add-page-numbers/",
    title: /Add page numbers to a PDF online for free/,
    drop: "Drop a PDF to number its pages",
    ability: "Number the pages",
    guide: "/blog/add-page-numbers-to-a-pdf/",
    article: "Number the pages, where you want the numbers.",
    focused: "opened for numbering pages",
    name: "Add page numbers",
  },
  {
    route: "/dashboard/watermark-pdf/",
    title: /Add a watermark to a PDF online for free/,
    drop: "Drop a PDF to watermark",
    ability: "Words or a picture",
    guide: "/blog/watermark-a-pdf-without-uploading/",
    article: "Mark it as a draft, without sending it anywhere.",
    focused: "opened for watermarks",
    name: "Watermark PDF",
  },
  {
    route: "/dashboard/redact-pdf/",
    title: /Redact a PDF online for free/,
    drop: "Drop a PDF to redact",
    ability: "Taken out, not covered",
    guide: "/blog/redact-a-pdf-without-uploading/",
    article: "A black box is not a redaction.",
    focused: "opened for taking things out for good",
    name: "Redact PDF",
  },
  {
    route: "/dashboard/ocr-pdf/",
    title: /OCR a PDF online for free/,
    drop: "Drop a scanned PDF to make it searchable",
    ability: "Scans you can search",
    guide: "/blog/make-a-scanned-pdf-searchable/",
    article: "A scan you can search.",
    focused: "opened for recognising the words of scanned pages",
    name: "OCR PDF",
  },
  {
    route: "/dashboard/verify-pdf-signature/",
    title: /Verify a PDF signature online for free/,
    drop: "Drop a signed PDF to check its signatures",
    ability: "Does it still hold?",
    guide: "/blog/verify-a-pdf-signature/",
    article: "Is the signature still good?",
    focused: "opened for checking signatures",
    name: "Verify a PDF signature",
  },
] as const

async function open(page: Page, route: string) {
  await page.goto(route)
  await page
    .locator("#editor-file")
    .setInputFiles(await pdf("plan.pdf", "dr", { pages: 3 }))
  await readerReady(page)
}

for (const door of DOORS)
  test(`${door.name} says what it is: a door into the editor, with help and a guide of its own`, async ({
    page,
  }) => {
    await page.goto(door.route)
    await expect(page).toHaveTitle(door.title)
    await expect(page.getByText(door.drop, { exact: true })).toBeVisible()
    await expect(page.getByText(door.ability, { exact: true })).toBeVisible()
    // Said beside the file, and again in the help under it.
    await expect(page.getByText(door.focused).first()).toBeVisible()
    await expect(
      page.getByRole("link", { name: "PDF editor", exact: true })
    ).toHaveAttribute("href", "/dashboard/pdf-editor/")
    await expect(
      page.getByRole("link", { name: "Read the step-by-step guide" })
    ).toHaveAttribute("href", door.guide)
    // The guide is there, and leads back to the door.
    await page.goto(door.guide)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      door.article
    )
    await expect(page.locator(`a[href="${door.route}"]`).first()).toBeVisible()
    // It is found by searching, and is not a tool of its own in the list.
    await page.goto("/dashboard/?category=document")
    await expect(page.getByTestId("tool-card")).toHaveCount(4)
    await expect(
      page.getByTestId("tool-card").filter({ hasText: door.name })
    ).toHaveCount(0)
  })

test("Crop PDF opens with the frame on the page, and the other tools one press away", async ({
  page,
}) => {
  await open(page, "/dashboard/crop-pdf/")
  await expect(page.getByTestId("crop-frame")).toBeVisible()
  await expect(pick(page, "Crop and page size")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  // Only the tools for the job: the rest are behind one button.
  await expect(pick(page, "Text")).toHaveCount(0)
  await expect(pick(page, "Highlight")).toHaveCount(0)
  await expect(pick(page, "Pages")).toBeVisible()
  await expect(pick(page, "Numbers and watermarks")).toBeVisible()
  await page.getByTestId("all-tools").click()
  await expect(pick(page, "Text")).toBeVisible()
  await expect(pick(page, "Highlight")).toBeVisible()
  await expect(page.getByTestId("crop-frame")).toBeVisible()
})

test("Add page numbers and Watermark PDF open with their panel, set for the job", async ({
  page,
}) => {
  await open(page, "/dashboard/add-page-numbers/")
  const panel = page.getByTestId("editor-repeat")
  await expect(panel).toBeVisible()
  await expect(
    panel.getByRole("radio", { name: "Page numbers", exact: true })
  ).toBeChecked()
  await expect(
    panel.getByRole("button", { name: "Add to 3 pages", exact: true })
  ).toBeEnabled()
  await expect(pick(page, "Text")).toHaveCount(0)
  await expect(page.getByTestId("all-tools")).toBeVisible()

  await open(page, "/dashboard/watermark-pdf/")
  await expect(panel).toBeVisible()
  await expect(
    panel.getByRole("radio", { name: "Watermark", exact: true })
  ).toBeChecked()
  await expect(panel.getByLabel("Words")).toHaveValue("DRAFT")

  // In the whole editor these are tools among the others, and nothing is open at first.
  await open(page, "/dashboard/pdf-editor/")
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId("crop-frame")).toHaveCount(0)
  await expect(pick(page, "Text")).toBeVisible()
  await expect(pick(page, "Crop and page size")).toBeVisible()
})
