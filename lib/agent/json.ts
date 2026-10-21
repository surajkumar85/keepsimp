/**
 * The JSON workspace's jobs as tools. They run in the same worker as the
 * workspace (`JsonClient`), so numbers keep their exact digits, schemas fetch
 * nothing and pasted JavaScript never runs.
 */
import { MAX_JSON_FILE_BYTES } from "@/lib/json-workspace/document"
import type { JsonJob, JsonResult } from "@/lib/json-workspace/protocol"
import type { Conversion } from "@/lib/json-workspace/convert"
import type { Transform } from "@/lib/json-workspace/transforms"
import { asTool, type AgentTool, type FileRef } from "./registry"
import { textOrFile, wordsMade, wordsOf } from "./text"
import type { FileStore } from "./files"

export type RunJson = (job: JsonJob) => Promise<JsonResult>

const most = MAX_JSON_FILE_BYTES

const INDENTS = { "2": "  ", "4": "    ", tab: "\t" } as const
const indent = {
  type: "string",
  enum: ["2", "4", "tab"],
  description: "Two spaces (the default), four, or a tab.",
}

const document = (input: Record<string, unknown>, files: FileStore) =>
  wordsOf(input, files, { what: "the JSON", most })

/** The result of a job that makes words: the sentence, and the words or their file. */
function made(
  files: FileStore,
  words: string,
  from: string | null,
  how: { suffix: string; extension: string; type: string },
  said: string,
  data: Record<string, unknown> = {}
) {
  const { file, inline } = wordsMade(files, words, { from, ...how })
  const madeFiles: FileRef[] = file ? [file] : []
  return {
    summary: file ? `${said} Written to ${file.name}.` : said,
    files: madeFiles,
    data: { ...data, ...(inline !== undefined ? { output: inline } : {}) },
  }
}

const JSON_FILE = { extension: "json", type: "application/json" }

export function jsonTools(run: RunJson): AgentTool[] {
  const formatJson: AgentTool<{
    text?: string
    file?: string
    style?: "pretty" | "minify" | "sort-keys" | "sort-keys-descending"
    indent?: keyof typeof INDENTS
  }> = {
    name: "format_json",
    title: "Format JSON",
    description:
      "Formats JSON with indentation, minifies it, or sorts its keys. Numbers keep their exact digits. Give the JSON as text or as a file.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The JSON"),
        style: {
          type: "string",
          enum: ["pretty", "minify", "sort-keys", "sort-keys-descending"],
          description: "pretty (the default), minify, or sort keys A–Z or Z–A.",
        },
        indent,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await document(input, files)
      const style = input.style ?? "pretty"
      const transform: Transform = {
        pretty: "format" as const,
        minify: "minify" as const,
        "sort-keys": "sort-asc" as const,
        "sort-keys-descending": "sort-desc" as const,
      }[style]
      const { output } = await run({
        action: "transform",
        input: words,
        transform,
        indent: INDENTS[input.indent ?? "2"],
      })
      return made(
        files,
        output!,
        from,
        {
          suffix: style === "minify" ? "-min" : "-formatted",
          ...JSON_FILE,
        },
        style === "minify"
          ? `Minified: ${words.length.toLocaleString("en")} characters became ${output!.length.toLocaleString("en")}.`
          : style === "pretty"
            ? "Formatted."
            : "Formatted with the keys sorted."
      )
    },
  }

  const repairJson: AgentTool<{
    text?: string
    file?: string
    indent?: keyof typeof INDENTS
  }> = {
    name: "repair_json",
    title: "Repair JSON",
    description:
      "Repairs JSON that does not parse (missing quotes or commas, trailing commas, comments, single quotes, Python constants and the like) and formats it. Check the result: a repair is a guess at what was meant.",
    inputSchema: {
      type: "object",
      properties: { ...textOrFile("The JSON to repair"), indent },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await document(input, files)
      const { output } = await run({
        action: "transform",
        input: words,
        transform: "repair",
        indent: INDENTS[input.indent ?? "2"],
      })
      return made(
        files,
        output!,
        from,
        { suffix: "-repaired", ...JSON_FILE },
        "Repaired and formatted; check it, as a repair is a guess at what was meant."
      )
    },
  }

  const TRANSFORMS = [
    "stringify",
    "parse-string",
    "flatten",
    "redact",
    "base64-encode",
    "base64-decode",
    "url-encode",
    "url-decode",
  ] as const
  const transformJson: AgentTool<{
    text?: string
    file?: string
    action: (typeof TRANSFORMS)[number]
    keys?: string[]
  }> = {
    name: "transform_json",
    title: "Transform JSON",
    description:
      "Turns JSON into a JSON string or back (stringify, parse-string), flattens nested keys into one level, hides the values of secret keys (redact), or encodes and decodes it as Base64 or for a URL.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The JSON (or, to decode, the encoded text)"),
        action: { type: "string", enum: [...TRANSFORMS] },
        keys: {
          type: "array",
          items: { type: "string" },
          maxItems: 100,
          description:
            "For redact: the keys whose values are hidden. By default password, secret, token, api_key, apiKey and authorization.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await wordsOf(input, files, {
        what: "the input",
        most,
      })
      const { output } = await run({
        action: "transform",
        input: words,
        transform: input.action,
        ...(input.keys ? { keys: input.keys.join(",") } : {}),
      })
      const json = !["base64-encode", "url-encode"].includes(input.action)
      return made(
        files,
        output!,
        from,
        json
          ? { suffix: `-${input.action}`, ...JSON_FILE }
          : {
              suffix: `-${input.action}`,
              extension: "txt",
              type: "text/plain",
            },
        `Done: ${input.action}.`
      )
    },
  }

  const queryJson: AgentTool<{
    text?: string
    file?: string
    query: string
    mode?: "jsonpath" | "pointer"
  }> = {
    name: "query_json",
    title: "Query JSON",
    description:
      "Finds values in JSON with a JSONPath ($.items[?@.price < 10].name) or a JSON Pointer (/items/0/name). Gives the values found, their paths (the first 100) and how many there are. Nothing in the query runs as code.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The JSON to search"),
        query: { type: "string", maxLength: 2000 },
        mode: {
          type: "string",
          enum: ["jsonpath", "pointer"],
          description:
            "jsonpath or pointer; by default a query that starts with $ is JSONPath and any other is a pointer.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await document(input, files)
      const mode =
        input.mode ?? (input.query.startsWith("$") ? "jsonpath" : "pointer")
      const result = await run({
        action: "query",
        input: words,
        query: input.query,
        mode,
      })
      return made(
        files,
        result.output!,
        from,
        { suffix: "-query", ...JSON_FILE },
        `Found ${result.count} ${result.count === 1 ? "value" : "values"}.`,
        { count: result.count, paths: result.paths }
      )
    },
  }

  const validateJson: AgentTool<{
    text?: string
    file?: string
    schema?: string
    schemaFile?: string
  }> = {
    name: "validate_json",
    title: "Validate JSON against a schema",
    description:
      "Checks JSON against a JSON Schema (draft-07, 2019-09 or 2020-12, chosen by its $schema). Gives whether it is valid and the first 100 errors with their paths. References are never fetched.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The JSON to check"),
        ...textOrFile("The JSON Schema", "schema", "schemaFile"),
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words } = await document(input, files)
      const { words: schema } = await wordsOf(input, files, {
        what: "the schema",
        text: "schema",
        file: "schemaFile",
        most,
      })
      const result = await run({ action: "schema", input: words, schema })
      return {
        summary: result.valid
          ? "Valid against the schema."
          : `Not valid: ${result.errors!.length} ${result.errors!.length === 1 ? "error" : "errors"}${result.errors!.length === 100 ? " shown (there may be more)" : ""}.`,
        data: { valid: result.valid, errors: result.errors },
      }
    },
  }

  const compareJson: AgentTool<{
    text?: string
    file?: string
    otherText?: string
    otherFile?: string
  }> = {
    name: "compare_json",
    title: "Compare two JSON documents",
    description:
      "Compares two JSON documents: what was added, removed and changed, with paths, and a JSON Patch that turns the first into the second. Objects ignore key order; arrays compare by position.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The first JSON"),
        ...textOrFile("The second JSON", "otherText", "otherFile"),
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await document(input, files)
      const { words: other } = await wordsOf(input, files, {
        what: "the second JSON",
        text: "otherText",
        file: "otherFile",
        most,
      })
      const result = await run({ action: "compare", input: words, other })
      const changes = result.changes!
      return made(
        files,
        result.patch!,
        from,
        { suffix: "-patch", ...JSON_FILE },
        changes.length
          ? `${changes.length} ${changes.length === 1 ? "difference" : "differences"}. The patch turns the first into the second.`
          : "The two are the same.",
        { changes }
      )
    },
  }

  const patchJson: AgentTool<{
    text?: string
    file?: string
    patch?: string
    patchFile?: string
  }> = {
    name: "patch_json",
    title: "Apply a JSON Patch",
    description:
      "Applies a JSON Patch (RFC 6902, at most 500 operations) to JSON. All or nothing: when one operation fails, nothing is changed.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The JSON to change"),
        ...textOrFile("The JSON Patch", "patch", "patchFile"),
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await document(input, files)
      const { words: patch } = await wordsOf(input, files, {
        what: "the patch",
        text: "patch",
        file: "patchFile",
        most,
      })
      const { output } = await run({ action: "patch", input: words, patch })
      return made(
        files,
        output!,
        from,
        { suffix: "-patched", ...JSON_FILE },
        "Patched: every operation applied."
      )
    },
  }

  const CONVERSIONS: Conversion[] = [
    "json-yaml",
    "yaml-json",
    "json-csv",
    "csv-json",
    "json-lines",
    "lines-json",
    "typescript",
    "schema",
  ]
  const convertJson: AgentTool<{
    text?: string
    file?: string
    to: Conversion
    protectCsv?: boolean
    typeName?: string
  }> = {
    name: "convert_json",
    title: "Convert JSON",
    description:
      "Converts JSON to YAML, CSV, JSON Lines, TypeScript types or an inferred JSON Schema, or YAML, CSV and JSON Lines to JSON. CSV cells that a spreadsheet would run as formulas are protected unless protectCsv is false.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The document to convert"),
        to: {
          type: "string",
          enum: CONVERSIONS,
          description:
            "json-yaml, yaml-json, json-csv, csv-json, json-lines (JSON to JSON Lines), lines-json, typescript or schema.",
        },
        protectCsv: { type: "boolean" },
        typeName: {
          type: "string",
          maxLength: 100,
          description: "For typescript: the name of the root type (Root).",
        },
      },
      required: ["to"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await wordsOf(input, files, {
        what: "the document",
        most,
      })
      const result = await run({
        action: "convert",
        input: words,
        format: input.to,
        protectCsv: input.protectCsv ?? true,
        ...(input.typeName ? { typeName: input.typeName } : {}),
      })
      return made(
        files,
        result.output!,
        from,
        {
          suffix: `-${input.to}`,
          extension: result.extension!,
          type: result.mime!,
        },
        ["Converted.", result.note].filter(Boolean).join(" ")
      )
    },
  }

  return [
    formatJson,
    repairJson,
    transformJson,
    queryJson,
    validateJson,
    compareJson,
    patchJson,
    convertJson,
  ].map((tool) => asTool(tool as AgentTool<never>))
}
