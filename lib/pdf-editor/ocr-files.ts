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

/** A language words can be recognised in. */
export interface OcrLanguage {
  /** Tesseract's name for it, which its data file is named by. */
  code: string
  /** Its name in English, and in itself. */
  name: string
  own: string
  /** The language tags a browser may give for it, as it says which languages its user reads. */
  tags: string[]
  /** How large its data file is, in bytes: what is downloaded the first time it is used. */
  size: number
}

/**
 * The languages offered, by their English names: those Tesseract reads
 * best, written across the page (not down it). Each is served as the
 * `best_int` data of its package `@tesseract.js-data/<code>`; the sizes
 * are checked against the files when the site is tested.
 */
export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: "ara", name: "Arabic", own: "العربية", tags: ["ar"], size: 1661906 },
  { code: "ben", name: "Bengali", own: "বাংলা", tags: ["bn"], size: 1373429 },
  {
    code: "chi_sim",
    name: "Chinese, simplified",
    own: "简体中文",
    tags: ["zh-Hans", "zh-CN", "zh-SG", "zh"],
    size: 1718768,
  },
  {
    code: "chi_tra",
    name: "Chinese, traditional",
    own: "繁體中文",
    tags: ["zh-Hant", "zh-TW", "zh-HK", "zh-MO"],
    size: 1656239,
  },
  { code: "ces", name: "Czech", own: "Čeština", tags: ["cs"], size: 2225029 },
  { code: "dan", name: "Danish", own: "Dansk", tags: ["da"], size: 1845116 },
  {
    code: "nld",
    name: "Dutch",
    own: "Nederlands",
    tags: ["nl"],
    size: 3005696,
  },
  { code: "eng", name: "English", own: "English", tags: ["en"], size: 2952873 },
  { code: "fin", name: "Finnish", own: "Suomi", tags: ["fi"], size: 3795323 },
  { code: "fra", name: "French", own: "Français", tags: ["fr"], size: 707406 },
  { code: "deu", name: "German", own: "Deutsch", tags: ["de"], size: 1333102 },
  { code: "ell", name: "Greek", own: "Ελληνικά", tags: ["el"], size: 1324749 },
  {
    code: "heb",
    name: "Hebrew",
    own: "עברית",
    tags: ["he", "iw"],
    size: 580576,
  },
  { code: "hin", name: "Hindi", own: "हिन्दी", tags: ["hi"], size: 1389692 },
  {
    code: "hun",
    name: "Hungarian",
    own: "Magyar",
    tags: ["hu"],
    size: 2854466,
  },
  {
    code: "ind",
    name: "Indonesian",
    own: "Bahasa Indonesia",
    tags: ["id", "in"],
    size: 1194182,
  },
  {
    code: "ita",
    name: "Italian",
    own: "Italiano",
    tags: ["it"],
    size: 1660998,
  },
  { code: "jpn", name: "Japanese", own: "日本語", tags: ["ja"], size: 2030256 },
  { code: "kor", name: "Korean", own: "한국어", tags: ["ko"], size: 1572336 },
  {
    code: "nor",
    name: "Norwegian",
    own: "Norsk",
    tags: ["no", "nb", "nn"],
    size: 2490241,
  },
  { code: "fas", name: "Persian", own: "فارسی", tags: ["fa"], size: 424507 },
  { code: "pol", name: "Polish", own: "Polski", tags: ["pl"], size: 2642356 },
  {
    code: "por",
    name: "Portuguese",
    own: "Português",
    tags: ["pt"],
    size: 1392239,
  },
  { code: "ron", name: "Romanian", own: "Română", tags: ["ro"], size: 1692160 },
  { code: "rus", name: "Russian", own: "Русский", tags: ["ru"], size: 2679598 },
  { code: "spa", name: "Spanish", own: "Español", tags: ["es"], size: 2100190 },
  { code: "swe", name: "Swedish", own: "Svenska", tags: ["sv"], size: 2503095 },
  { code: "tha", name: "Thai", own: "ไทย", tags: ["th"], size: 896631 },
  { code: "tur", name: "Turkish", own: "Türkçe", tags: ["tr"], size: 2141291 },
  {
    code: "ukr",
    name: "Ukrainian",
    own: "Українська",
    tags: ["uk"],
    size: 2114206,
  },
  {
    code: "vie",
    name: "Vietnamese",
    own: "Tiếng Việt",
    tags: ["vi"],
    size: 1423003,
  },
]

/**
 * How Tesseract is set up to read a page. Left to itself, the library that
 * tesseract.js is made of takes a page for one block of text and reads
 * across its columns; Tesseract's own program, and OCRmyPDF, find the
 * columns and blocks first ("automatic page segmentation", 3). On pages in
 * columns that read 3 to 8 points more of the words (see the benchmark in
 * docs/pdf-editor.md).
 */
export const OCR_PARAMETERS = { tessedit_pageseg_mode: "3" } as const

/** No more languages than this are read at once: each one more makes reading slower and no better. */
export const MOST_LANGUAGES = 3

/** The core files and the worker: what is downloaded the first time any language is read, in bytes, as served compressed. */
export const OCR_ENGINE_SIZE = 1_150_000

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
  ...Object.fromEntries(
    OCR_LANGUAGES.map(({ code }) => [
      `${code}.traineddata.gz`,
      `@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`,
    ])
  ),
}

/** The packages whose numbers make up the version, to be checked when the site is built. */
export const OCR_PACKAGES: readonly (readonly [string, string])[] = [
  ["tesseract.js", "7.0.0"],
  ["tesseract.js-core", "7.0.0"],
  ...OCR_LANGUAGES.map(
    ({ code }) => [`@tesseract.js-data/${code}`, "1.0.0"] as const
  ),
]

/** The language a browser's user reads, of those offered: English when none of them is. */
export function preferredLanguage(tags: readonly string[]): string {
  for (const tag of tags) {
    const wanted = tag.toLowerCase()
    // The most particular tag that is offered: "zh-TW" before "zh".
    const found = OCR_LANGUAGES.map((language) => ({
      language,
      match: language.tags.find(
        (one) =>
          wanted === one.toLowerCase() ||
          wanted.startsWith(`${one.toLowerCase()}-`)
      ),
    }))
      .filter((one) => one.match)
      .sort((a, b) => b.match!.length - a.match!.length)[0]
    if (found) return found.language.code
  }
  return "eng"
}

/** A size in bytes as it is said: "1.3 MB", "690 KB". */
export function sizeSaid(bytes: number) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`
}
