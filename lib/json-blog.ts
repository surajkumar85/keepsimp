import type { BlogPost } from "./blog"

export const jsonPosts: readonly BlogPost[] = [
  {
    slug: "jsonpath-json-pointer-find-data",
    title: "Find the JSON you need with JSONPath and Pointer.",
    description:
      "Query nested JSON with JSONPath, select an exact value with JSON Pointer, and export results without rounding large IDs.",
    category: "Developer notes",
    readingTime: "4 min read",
    image: "/images/json-query-guide.svg",
    imageAlt:
      "A nested JSON document connected to a query and two selected names",
    tool: "json-formatter",
    toolAnchor: "query",
    intro:
      "A long response often contains a small answer. KeepSimp's Query workflow helps you select that answer, while Explore shows where it sits in the document. Your source stays available, and results appear separately for inspection, copying or download.",
    sections: [
      {
        id: "choose-a-language",
        title: "Choose a query or an exact address.",
        paragraphs: [
          "JSONPath selects zero, one or many values. Start at $ for the root; $.users[*].name selects every user's name, $..id searches descendants, and $.users[0:2] selects the first two users. KeepSimp returns a JSON array of matches and lists their JSON Pointer addresses.",
          "JSON Pointer identifies one value. /users/0/name selects the first user's name, and an empty pointer selects the whole document. A property called a/b uses /a~1b; a literal tilde uses ~0. JSONPath results are arrays even for one match, while Pointer returns the selected value itself.",
        ],
        example: {
          label: "Source for the examples",
          code: '{"users":[{"id":1,"name":"Ada","role":"editor"},{"id":2,"name":"Lin","role":"viewer"}]}',
        },
      },
      {
        id: "filter-and-explore",
        title: "Filter, then inspect the matches.",
        paragraphs: [
          'Choose Query, keep JSONPath selected, and enter $.users[?@.role == "editor"].name. Run query returns ["Ada"] for the example. The query syntax follows RFC 9535 through the bundled JSONPath library; expressions do not execute pasted JavaScript or fetch a URL.',
          "Explore offers an expandable tree and a search across keys, values and paths. Select a row to read its value and copy its pointer. Preview replacement proposes a change without editing your source. Table view accepts an array of objects; select an inner array with Pointer and choose Use result as source to explore it as a table.",
        ],
      },
      {
        id: "precision-and-limits",
        title: "Keep exact text, and understand filter limits.",
        paragraphs: [
          "Selected results come from the original JSON tokens. A value such as 9007199254740993 retains that exact spelling in Pointer and ordinary JSONPath selections. Filters use JavaScript numeric values; KeepSimp rejects documents with numbers that would overflow, underflow, round their decimal text or exceed the safe integer range before running a filter. Quoting IDs lets you compare them as strings.",
          "Queries are limited to 2,000 characters and 10,000 matches. The path list shows the first 100 addresses; the downloaded result contains every accepted match. Duplicate property names must be made unique before querying, so selection cannot silently pick one interpretation.",
        ],
      },
    ],
    sources: [
      {
        title: "IETF: JSONPath, RFC 9535",
        url: "https://www.rfc-editor.org/rfc/rfc9535.html",
      },
      {
        title: "IETF: JSON Pointer, RFC 6901",
        url: "https://www.rfc-editor.org/rfc/rfc6901.html",
      },
      {
        title: "JSONPath library and supported syntax",
        url: "https://github.com/ashphy/jsonpath-js",
      },
    ],
  },
  {
    slug: "repair-compare-json-patch",
    title: "Repair, compare and patch JSON with a preview.",
    description:
      "Review JSON repairs, compare values instead of whitespace, and generate or apply all six JSON Patch operations locally.",
    category: "Developer notes",
    readingTime: "4 min read",
    image: "/images/json-patch-guide.svg",
    imageAlt: "Two JSON documents connected by an explicit replace operation",
    tool: "json-formatter",
    toolAnchor: "compare",
    intro:
      "Fixing a comma and changing a value are different decisions. KeepSimp keeps those decisions visible: repair proposes valid JSON, comparison explains value changes, and a patch previews the resulting document before you replace anything.",
    sections: [
      {
        id: "repair-is-a-proposal",
        title: "Treat repair as a proposal.",
        paragraphs: [
          "In Edit, open More transformations and choose Preview repair. It can handle common pasted-text problems such as single quotes, unquoted property names, comments and trailing commas. The repair library may insert or remove content when it guesses your intent. Always inspect the result; a valid document can still contain the wrong data.",
          "Format JSON validates strict JSON and preserves its tokens. Repair is a separate action, and your original text stays intact. Use result as source accepts the proposed result explicitly; Undo edit restores the previous source. Keep a separate original when a change matters.",
        ],
        example: {
          label: "A repair candidate to review",
          code: "{name:'Ada', active:true,}",
        },
      },
      {
        id: "compare-values",
        title: "Compare JSON values, then check the direction.",
        paragraphs: [
          "Paste the original in Your JSON and the proposed version in Comparison JSON. Compare JSON shows additions, removals and replacements with JSON Pointer paths. Object property order and whitespace do not count as changes; arrays compare by position. Numbers compare as exact decimals, so 1 and 1.0 are equal while adjacent large integers remain different.",
          "The generated patch transforms the source into the comparison document. Download JSON saves that patch. Swap documents reverses the direction. The comparison supports up to 500 changes; use Query to compare a smaller section if a large response exceeds the limit. Duplicate keys must be resolved first.",
        ],
      },
      {
        id: "apply-a-patch",
        title: "Preview all six patch operations.",
        paragraphs: [
          "JSON Patch is an array of operations defined by RFC 6902. KeepSimp supports add, remove, replace, move, copy and test. Use /items/- to append to an array, and escape property names with the JSON Pointer rules. test can confirm an expected old value before a later change proceeds.",
          "Paste a patch into JSON Patch operations and select Preview patch. A failed operation rejects the whole preview and leaves your source unchanged. Removing the root is rejected because it would leave no JSON document; replace it with null if that is your intended result. Intermediate results are checked against the document limits so repeated copy operations cannot grow without a bound.",
        ],
        example: {
          label: "Check a value before replacing it",
          code: '[\n  {"op":"test","path":"/name","value":"Ada"},\n  {"op":"replace","path":"/name","value":"Grace"}\n]',
        },
      },
    ],
    sources: [
      {
        title: "IETF: JSON Patch, RFC 6902",
        url: "https://www.rfc-editor.org/rfc/rfc6902.html",
      },
      {
        title: "IETF: JSON Pointer, RFC 6901",
        url: "https://www.rfc-editor.org/rfc/rfc6901.html",
      },
      {
        title: "jsonrepair: repair behavior and examples",
        url: "https://github.com/josdejong/jsonrepair",
      },
    ],
  },
  {
    slug: "validate-json-schema-locally",
    title: "Check your JSON against a schema, locally.",
    description:
      "Validate JSON Schema draft-07, 2019-09 and 2020-12, inspect error paths, use local references, and infer a starting schema.",
    category: "Developer notes",
    readingTime: "4 min read",
    image: "/images/json-schema-guide.svg",
    imageAlt:
      "A JSON object being checked against a schema with two required fields",
    tool: "json-formatter",
    toolAnchor: "schema",
    intro:
      "Valid JSON syntax only tells you that a document can be read. A schema can check what the reader expects: required fields, types, allowed values, array items and formats. KeepSimp runs those checks in a local worker and reports the paths that need attention.",
    sections: [
      {
        id: "start-with-a-contract",
        title: "Start with the contract you expect.",
        paragraphs: [
          "Open Schema, paste your JSON in Your JSON, and paste the contract in JSON Schema. Validate schema reports whether the data matches, with up to 100 issues showing instance paths, keywords and details. For example, required checks that a field exists; minimum checks a number's lower bound. The tool checks email, URI and date-time formats using Ajv's format plugin.",
          "The default dialect is 2020-12. A $schema declaration can select draft-07 or 2019-09 instead. The validator does not coerce strings into numbers, insert defaults or remove additional properties. Your input stays unchanged when validation passes or fails.",
        ],
        example: {
          label: "A small schema for a project document",
          code: '{\n  "$schema":"https://json-schema.org/draft/2020-12/schema",\n  "type":"object",\n  "properties":{"project":{"type":"string"},"version":{"type":"integer","minimum":1}},\n  "required":["project","version"],\n  "additionalProperties":false\n}',
        },
      },
      {
        id: "keep-references-local",
        title: "Keep reusable definitions inside the schema.",
        paragraphs: [
          "Put reusable definitions in $defs and reference them with a local $ref such as #/$defs/user. draft-07 can use definitions instead. KeepSimp does not download external schemas or resolve remote references. Copy the necessary definitions into the pasted schema when a contract normally depends on another file.",
          "Schemas are limited to 100,000 characters. Async schemas and unknown dialects are rejected, and worker operations stop after 20 seconds. Those bounds keep the workspace responsive when a schema is unexpectedly expensive; a timeout means the check did not finish, not that the data is valid.",
        ],
      },
      {
        id: "infer-and-review",
        title: "Infer a starting point, then review it.",
        paragraphs: [
          "Infer schema from source produces a 2020-12 schema from one sample. It marks observed object fields as required, disallows unobserved fields and uses anyOf for differing array item shapes. That describes the sample, not all valid future inputs. Review optional fields, ranges, enums, formats and additionalProperties before treating it as a contract.",
          "Schema checks use JavaScript numbers. Documents with duplicate keys or numbers that cannot safely pass through that representation are rejected rather than silently changed. Quote large identifiers when the contract describes strings. Formatting, comparison and Pointer selection retain exact numeric text without needing schema validation.",
        ],
      },
    ],
    sources: [
      {
        title: "JSON Schema: types, keywords and dialects in Ajv",
        url: "https://ajv.js.org/json-schema.html",
      },
      {
        title: "JSON Schema: structuring schemas and references",
        url: "https://json-schema.org/understanding-json-schema/structuring",
      },
      {
        title: "Ajv: security and expensive schemas",
        url: "https://ajv.js.org/security.html",
      },
    ],
  },
  {
    slug: "convert-json-yaml-csv-typescript",
    title: "Take JSON into YAML, CSV, JSON Lines and TypeScript.",
    description:
      "Convert JSON locally, keep CSV identifiers as strings, review spreadsheet formula protection, and generate sample types and schemas.",
    category: "Developer notes",
    readingTime: "5 min read",
    image: "/images/json-convert-guide.svg",
    imageAlt:
      "A JSON document branching into YAML, CSV, JSON Lines and TypeScript outputs",
    tool: "json-formatter",
    toolAnchor: "convert",
    intro:
      "A format change needs clear rules. CSV has rows and columns, YAML has features JSON cannot express, and a TypeScript definition describes a shape rather than storing your values. The Convert workflow makes those choices explicit and produces a separate downloadable result.",
    sections: [
      {
        id: "json-and-yaml",
        title: "Move between JSON and a supported YAML subset.",
        paragraphs: [
          "Choose JSON → YAML or YAML → JSON, then Convert document. JSON export quotes property names and strings to avoid implicit YAML type changes, preserving original numeric tokens. YAML import handles scalar values, arrays and mappings with string keys; integer values use an exact representation before JSON is written.",
          "Aliases, merge keys, custom tags, non-string keys and non-finite numbers are rejected. Expand or convert those YAML features first. Duplicate keys also need attention. These restrictions make the conversion predictable; they do not imply that every YAML file is equivalent to JSON.",
        ],
      },
      {
        id: "csv-rows-and-strings",
        title: "Turn arrays of objects into CSV rows.",
        paragraphs: [
          "JSON → CSV expects an array of objects. The export gathers their property names into columns; missing properties become empty cells, and nested values become JSON text inside a cell. Quotes, commas and line breaks are escaped by the CSV library. Table view shows the first 100 rows; a CSV download contains all accepted rows.",
          "CSV → JSON uses a comma delimiter and the first row as unique, non-empty headers. Each cell remains a string, so 0001 does not become 1 and a date is not guessed. Rows must have the header's column count. Up to 200 columns and 100,000 rows are accepted, within the shared document limits.",
        ],
        example: {
          label: "An identifier remains a string when imported",
          code: 'id,name\n0001,"Ada, editor"\n0002,Lin',
        },
      },
      {
        id: "spreadsheet-formulas",
        title: "Review formula protection before spreadsheet use.",
        paragraphs: [
          "Protect spreadsheet formulas is enabled by default for CSV export. It prefixes an apostrophe to cells starting with a formula trigger such as =, +, -, @, tab or carriage return. This changes the exported cell text. It helps keep untrusted content from being interpreted as a formula, but CSV handling varies across spreadsheet apps and is not a universal guarantee.",
          "Keep protection enabled for untrusted text and inspect the file in its destination. Turn it off only when you need the original cell text and understand how that destination interprets it. Nested JSON values are serialized as text; importing the CSV does not automatically restore nested objects, booleans or numbers.",
        ],
      },
      {
        id: "lines-types-and-schemas",
        title: "Export records or a starting definition.",
        paragraphs: [
          "JSON → JSON Lines writes each item of a JSON array as one compact JSON record on its own line. JSON Lines → JSON reads non-empty lines into an array and reports the record that fails validation. Blank lines are ignored. A JSON Lines file does not have a surrounding array or commas between records.",
          "JSON → TypeScript generates an exported type with a name you choose, quoted property names and union types for mixed arrays. JSON → JSON Schema produces a 2020-12 starting schema. Both describe the observed sample and require review for optional fields, unknown values and application rules. These operations generate text; they do not execute it.",
        ],
      },
    ],
    sources: [
      {
        title: "YAML library: parsing and exact integers",
        url: "https://eemeli.org/yaml/",
      },
      {
        title: "Papa Parse: CSV parsing, export and formula escaping",
        url: "https://www.papaparse.com/docs",
      },
      {
        title: "OWASP: CSV injection and spreadsheet differences",
        url: "https://community.owasp.org/attacks/CSV_Injection",
      },
      {
        title: "JSON Lines: file format conventions",
        url: "https://jsonlines.org/",
      },
    ],
  },
]
