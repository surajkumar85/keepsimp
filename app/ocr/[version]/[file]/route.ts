import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  OCR_FILES,
  OCR_PACKAGES,
  OCR_VERSION,
} from "@/lib/pdf-editor/ocr-files"

// The files that recognise words, written by `next build` like every other
// page, from the packages they come in. See lib/pdf-editor/ocr-files.ts.
export const dynamic = "force-static"
export const dynamicParams = false

const TYPES: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  gz: "application/octet-stream",
}

export async function generateStaticParams() {
  const modules = join(process.cwd(), "node_modules")
  // A package that was updated without the version being changed would be
  // served under an address a device may already keep an older copy of.
  for (const [name, version] of OCR_PACKAGES) {
    const { version: installed } = JSON.parse(
      await readFile(join(modules, name, "package.json"), "utf8")
    ) as { version: string }
    if (installed !== version)
      throw new Error(
        `${name} is ${installed}, not ${version}: change OCR_VERSION in lib/pdf-editor/ocr-files.ts.`
      )
  }
  return Object.keys(OCR_FILES).map((file) => ({ version: OCR_VERSION, file }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string; file: string }> }
) {
  const { file } = await params
  const bytes = await readFile(
    join(process.cwd(), "node_modules", OCR_FILES[file])
  )
  return new Response(bytes, {
    headers: { "content-type": TYPES[file.split(".").pop()!] },
  })
}
