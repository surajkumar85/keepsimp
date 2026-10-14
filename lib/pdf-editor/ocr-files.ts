/**
 * The files Tesseract needs in the browser, served by the site itself
 * (`app/ocr/[version]/[file]/route.ts`) from the packages they come in, so
 * that nothing is fetched from anywhere else. They sit under a folder named
 * for their versions: a new version is a new address, and a copy kept on
 * the device for working offline is never out of date.
 */

/** tesseract.js, its core, and the English data, as their packages are numbered. */
export const OCR_VERSION = "7.0.0-7.0.0-eng4.0.0"

/** Where the files are served from. */
export const OCR_BASE = `/ocr/${OCR_VERSION}`

/**
 * Each file by its name, with the package file it is. Only the cores that
 * read with the LSTM engine alone are served: the one the browser can run
 * fastest is picked by tesseract.js (relaxed SIMD, SIMD, or neither).
 */
export const OCR_FILES: Record<string, string> = {
  "worker.min.js": "tesseract.js/dist/worker.min.js",
  "tesseract-core-lstm.wasm.js":
    "tesseract.js-core/tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js":
    "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js":
    "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "eng.traineddata.gz":
    "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
}

/** The packages whose numbers make up the version, to be checked when the site is built. */
export const OCR_PACKAGES = [
  ["tesseract.js", "7.0.0"],
  ["tesseract.js-core", "7.0.0"],
] as const
