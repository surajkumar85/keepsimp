# JSON workspace

Implemented 10 October 2026 at `/dashboard/json-formatter/`. This is one local tool with six workflows, following [design reference 3.4](design-system.md). Numerical UI choices remain KeepSimp's decisions; tokens, the shadcn preset and single sidebar are unchanged.

## Research and decisions

The [JSON Editor Online feature inventory](https://jsoneditoronline.org/features.html) informed a useful workflow inventory: text/tree/table views, search, transformations, comparison, queries and conversion. KeepSimp's implementation and limits below are independent decisions. No claim of being objectively the greatest editor or of supporting every JSON-related format is made.

| Area             | Primary reference                                                                                                                                                                    | Implementation decision                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict parsing   | [Microsoft JSON syntax tree parser](https://github.com/microsoft/node-jsonc-parser)                                                                                                  | Reject comments/trailing commas during validation; retain original tokens and useful error offsets.                                                                                               |
| Editor           | [CodeMirror keyboard access](https://codemirror.net/examples/tab/)                                                                                                                   | Line numbers, syntax highlighting, folding, find/replace, undo/redo; Escape then Tab leaves indentation mode.                                                                                     |
| Queries          | [RFC 9535](https://www.rfc-editor.org/rfc/rfc9535.html), [jsonpath-js](https://github.com/ashphy/jsonpath-js)                                                                        | Library evaluates query syntax; selected paths read original AST values. No eval or pasted JavaScript execution. Pin the early library through the lockfile and keep conformance examples tested. |
| Addresses        | [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901.html)                                                                                                                              | Empty pointer is root; decode ~1 before ~0; reject missing values, bad escapes and noncanonical array indexes.                                                                                    |
| Comparison/patch | [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902.html)                                                                                                                              | Compare object values regardless of key order, arrays by position, numbers as exact decimals. Support all six patch operations atomically.                                                        |
| Repair           | [jsonrepair](https://github.com/josdejong/jsonrepair)                                                                                                                                | Explicit preview, never automatic acceptance; repairs can guess and change data.                                                                                                                  |
| Schemas          | [Ajv dialects](https://ajv.js.org/json-schema.html), [security](https://ajv.js.org/security.html), [local references](https://json-schema.org/understanding-json-schema/structuring) | Draft-07, 2019-09 and 2020-12, local references only; worker deadline, no network loading, coercion/defaults/removal.                                                                             |
| YAML             | [YAML library](https://eemeli.org/yaml/)                                                                                                                                             | Core scalar/map/sequence subset, exact numeric source/BigInt; reject aliases, merge keys, custom tags and non-string keys.                                                                        |
| CSV              | [Papa Parse](https://www.papaparse.com/docs), [OWASP CSV injection](https://community.owasp.org/attacks/CSV_Injection)                                                               | Comma-separated rows, cells imported as strings; formula escaping on by default. Protection changes cell text and is not universal across spreadsheet apps.                                       |
| Records          | [JSON Lines](https://jsonlines.org/)                                                                                                                                                 | Array items exported as one compact record per line; import non-empty lines with record-specific errors.                                                                                          |

## Delivered workflows

- **Edit:** strict formatting with 2/4 spaces or tabs, minification, syntax validation and cursor-to-error; recursive key sorting, repair previews, string escape/unwrapping, JSON Pointer leaf flattening, exact-name redaction, UTF-8 Base64 and URL encoding/decoding.
- **Explore:** paged expandable tree, key/value/path search, pointer/value selection, replacement preview, and a table for arrays of objects.
- **Query:** JSONPath selections, descendants, slices and filters; JSON Pointer exact selection; match count, path list and downloadable results.
- **Compare:** semantic value differences and source-to-comparison JSON Patch generation; add/remove/replace/move/copy/test previews, document swapping and failed-operation atomicity.
- **Schema:** the three dialects, local definitions/references, common format checks, paths/details for errors, schema example and sample inference.
- **Convert:** JSON ↔ YAML, JSON ↔ CSV, JSON ↔ JSON Lines; sample TypeScript types and 2020-12 schemas. Exports include an appropriate extension/MIME and an explanatory note.

Shared editing supports local file opening/drop, copy, custom download names, explicit result acceptance, cancellation and honest empty/error states. Refresh clears all document text; Clear also removes comparison/schema/patch text. Browser storage contains preferences/offline app assets, not processed documents. Base64 and URL encoding are representations, not encryption; named-key redaction is not comprehensive secret discovery.

## Architecture and precision

`lib/json-workspace/` owns pure operations. A lazily created module worker imports the parsing/query/schema/conversion engines. `hooks/use-json-worker.ts` correlates jobs, terminates on cancellation/timeouts, rejects pending jobs and releases the worker on unmount. Input/secondary-document changes invalidate pending operations and previous outputs. Component results carry their source/context so older validation cannot appear current. Source is modified only by editing or explicit acceptance.

CodeMirror starts with the current document and reconfigures its language through a compartment. Switching between JSON and import text preserves the editor instance, selection and undo history. External document updates are annotated so they do not feed back as user edits or invalidate a fresh result.

The internal AST retains raw numeric/string/key tokens. Formatting, sorting, pointer selection, ordinary JSONPath selection, patches and JSON-to-YAML keep numeric text. Comparison normalizes decimal coefficients/exponents using BigInt rather than Number. Duplicate keys are visible and preserved by formatting; semantic operations require unique keys. Native-value operations (filters/schema) reject unsafe integers, overflow, underflow and decimal text that would round when passed through JavaScript Number. Nominal safe decimals still use JavaScript floating-point semantics in these native checks; this is not arbitrary-precision arithmetic.

YAML import uses the parsed AST and original decimal source, not a native JSON.stringify round-trip. CSV does not infer cell types. Schema/type inference describes one sample; it cannot establish optionality, business constraints or all future shapes. The inferred schema marks observed fields required and disallows additional fields, so it must be reviewed.

## Bounds

| Input/output                  | Limit                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| Source text and worker output | 5 million UTF-16 characters each                                    |
| Opened UTF-8 text file        | 10 MiB, within the text limit                                       |
| JSON nesting / values         | 100 container levels / 100,000 values                               |
| Query / selected matches      | 2,000 characters / 10,000 matches                                   |
| Tree/table/path preview       | 100 entries per page or preview; exports include accepted full data |
| Comparison or patch           | 500 changes/operations; each intermediate patch document rechecked  |
| Schema text                   | 100,000 characters; first 100 errors shown                          |
| CSV                           | 200 columns / 100,000 rows, also within document limits             |
| Exact comparison exponent     | At most 1,000 exponent digits                                       |
| Worker operation              | 20 seconds; cancellation does not claim completion                  |

No external fetching, accounts, uploads, AI repair, XML conversion, JSON5 output, persistent document storage or unbounded streaming is advertised. These choices preserve predictable local behavior and avoid adding speculative features. The existing offline worker copies the exported JSON module worker/chunks during workspace installation; no service-worker architecture change was required. See [PWA behavior](pwa.md).

## Guides and discovery

Five articles cover editing/precision, querying, repairs/patches, schemas and conversions. Four new local SVG diagrams and sharing PNGs accompany them. Articles are static HTML with examples, source links, canonical metadata and BlogPosting/BreadcrumbList JSON-LD. Tool metadata/featureList, catalogue search terms, the sitemap and article CTAs match shipped features. Article CTAs select a workflow by URL hash; previews remain noindex through the existing environment policy.

## Verification

Run `npm run check`, `npm run test:e2e` and `npm run audit:production`. Unit tests exercise actual libraries and numerical, malformed-input, prototype-key, YAML, CSV, query, schema and patch edge cases. Browser tests inspect actual worker outputs/downloads, keyboard access, both themes, 320px layout and 200% reflow. The offline journey stops its HTTP server before first opening the JSON route, then runs formatting, queries, schema checks and a conversion download.

Browser tests replace CodeMirror documents through a click, keyboard select-all and [Playwright browser input](https://playwright.dev/docs/api/class-keyboard#keyboard-insert-text), using `e2e/editor.ts`. Clicking supplies the user gesture required by iPhone input. Direct `fill()` changed the DOM selection independently of the editor's selection in Android/Safari runs, occasionally appending new text to the previous document. Do not replace processing or editor transactions with mocks to avoid that issue; native form fields still use `fill()` normally.

Release results on 10 October 2026:

| Check                         | Result                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`               | Passed design/format/lint checks, production static build, TypeScript and 484 unit tests in 31 files.                                                                         |
| Selected pure-module coverage | 46 modules; 100% statements, branches, functions and lines. This does not claim coverage of every component or dependency.                                                    |
| JSON browser journeys         | All 55 cases passed across Chromium, Firefox, WebKit, Pixel 7 emulation and iPhone 13 emulation. Actual worker outputs and downloaded bytes were checked.                     |
| Marketing, guides and SEO     | All 45 affected cases passed across the same profiles, including all seven articles, workflow CTAs, canonical metadata and sharing graphics.                                  |
| Offline behavior              | All 25 affected cases verified: 20 in the main run and five first-visit journeys in a separate rerun after excluding Git-ignored sync copies from the local export inventory. |
| Production dependencies       | `npm run audit:production`: zero reported vulnerabilities.                                                                                                                    |

The 125 affected browser cases are verified through the main run and the five offline reruns, rather than a claim that the main run alone was entirely green. Desktop, dark 320px and 720px reflow screenshots were inspected. Keyboard escape and automated axe scans cover the rendered workflows; physical phones, browser zoom controls and a manual screen-reader session were not tested. The 720px viewport checks the CSS space corresponding to a 1440px display at 200% zoom. Generated browser reports and screenshots remain outside Git.

The broader 295-case platform suite was also run. The foundation suite was rechecked with 35 passes; the two longer image-converter checks that timed out during the broad run passed when isolated on Firefox and WebKit (2/2). Image processing code and its codec versions were unchanged.
