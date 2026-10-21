/**
 * Tesseract, started from this site's own files (never a CDN, never its own
 * store), with the parameters every reading uses. Only for the browser: the
 * editor's OCR panel and the agent tool start it the same way.
 */
import type { Worker as Tesseract } from "tesseract.js"
import type { TesseractBlock } from "./ocr"
import { OCR_BASE, OCR_PARAMETERS } from "./ocr-files"

export type { Tesseract }

/** Loads Tesseract for the languages (codes joined with "+"); `onShare` hears how far a page is. */
export async function startTesseract(
  languages: string,
  onShare: (share: number) => void
): Promise<Tesseract> {
  const { createWorker, OEM } = await import("tesseract.js")
  const worker = await createWorker(languages, OEM.LSTM_ONLY, {
    workerPath: `${OCR_BASE}/worker.min.js`,
    corePath: OCR_BASE,
    langPath: OCR_BASE,
    // The language is kept by the site's offline copy, not a store of Tesseract's own.
    cacheMethod: "none",
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === "recognizing text") onShare(message.progress)
    },
  })
  await worker.setParameters(OCR_PARAMETERS as never)
  return worker
}

/** What Tesseract reads on a page drawn in grey. */
export async function recognise(worker: Tesseract, png: Uint8Array) {
  const reading = await worker.recognize(
    new Blob([png as BlobPart], { type: "image/png" }),
    {},
    { blocks: true, text: false }
  )
  return (reading.data.blocks ?? []) as unknown as TesseractBlock[]
}
