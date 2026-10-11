import { expect, type Download, type Page } from "@playwright/test"
import { makePdf, type FixtureOptions } from "../tests/pdf-fixtures"

export type Upload = { name: string; mimeType: string; buffer: Buffer }

/** A PDF written by pdf-lib; every page says "<tag>-P<number>". */
export async function pdf(
  name: string,
  tag: string,
  options: FixtureOptions = {}
): Promise<Upload> {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(await makePdf(tag, options)),
  }
}

export async function bytesOf(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return new Uint8Array(Buffer.concat(chunks))
}

/** The reader window and what it says about itself. */
export const reader = (page: Page) => page.getByTestId("reader")

/** Wait until the reader has laid its pages out. */
export async function readerReady(page: Page) {
  await expect(reader(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
}

/** A page of the reader, by its number from 1, once its picture is drawn. */
export const drawnPage = (page: Page, number: number) =>
  page.locator(
    `[data-testid=reader-page][data-page="${number}"][data-state=drawn]`
  )

/** Scroll the reader's pages to a distance from the top. */
export const scrollReader = (page: Page, top: number) =>
  page.getByTestId("reader-pages").evaluate((element, to) => {
    element.scrollTop = to
  }, top)
