// @vitest-environment node
/** The files served for recognising words are the ones the packages hold. */
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { expect, it } from "vitest"
import { OCR_FILES, OCR_LANGUAGES, OCR_PACKAGES } from "./ocr-files"

const modules = join(process.cwd(), "node_modules")

it("serves files that are there, from packages of the numbers it names, of the sizes it says", async () => {
  for (const file of Object.values(OCR_FILES))
    expect((await stat(join(modules, file))).isFile(), file).toBe(true)
  for (const [name, version] of OCR_PACKAGES) {
    const { version: installed } = JSON.parse(
      await readFile(join(modules, name, "package.json"), "utf8")
    ) as { version: string }
    expect(installed, name).toBe(version)
  }
  for (const { code, size } of OCR_LANGUAGES)
    expect(
      (await stat(join(modules, OCR_FILES[`${code}.traineddata.gz`]))).size,
      code
    ).toBe(size)
})
