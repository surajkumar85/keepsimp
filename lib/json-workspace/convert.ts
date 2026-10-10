import Papa from "papaparse"
import {
  parseDocument as parseYaml,
  isMap,
  isSeq,
  isScalar,
  isAlias,
  type Node as YamlNode,
} from "yaml"
import { inferSchema, inferTypeScript } from "./transforms"
import {
  parseDocument,
  renderJson,
  uniqueDocument,
  limitText,
  type JsonNode,
} from "./document"

export type Conversion =
  | "json-yaml"
  | "yaml-json"
  | "json-csv"
  | "csv-json"
  | "json-lines"
  | "lines-json"
  | "typescript"
  | "schema"
export type Converted = {
  output: string
  extension: string
  mime: string
  note: string
}
function yamlText(node: JsonNode, depth = 0): string {
  const pad = "  ".repeat(depth)
  if (node.type === "object" && node.entries.length)
    return node.entries
      .map(
        (entry) =>
          `${pad}${JSON.stringify(entry.key)}:${nodeValue(entry.node, depth)}`
      )
      .join("\n")
  if (node.type === "array" && node.items.length)
    return node.items
      .map((item) => `${pad}-${nodeValue(item, depth)}`)
      .join("\n")
  return pad + renderJson(node, "")
}
function nodeValue(node: JsonNode, depth: number) {
  if (
    (node.type === "object" && node.entries.length) ||
    (node.type === "array" && node.items.length)
  )
    return "\n" + yamlText(node, depth + 1)
  return " " + renderJson(node, "")
}
function fromYaml(input: string) {
  limitText(input)
  const document = parseYaml(input, { intAsBigInt: true, uniqueKeys: true })
  if (document.warnings.length)
    throw new Error(`Unsupported YAML: ${document.warnings[0].message}`)
  if (document.errors.length)
    throw new Error(`Invalid YAML: ${document.errors[0].message}`)
  let count = 0
  function walk(node: YamlNode | null, depth: number): JsonNode {
    if (depth > 100 || ++count > 100_000)
      throw new Error("YAML exceeds 100 levels or 100,000 values.")
    if (isAlias(node))
      throw new Error(
        "YAML aliases are not supported. Expand anchors before converting."
      )
    if (isMap(node))
      return {
        type: "object",
        entries: node.items.map((pair) => {
          if (!isScalar(pair.key) || typeof pair.key.value !== "string")
            throw new Error(
              "JSON objects need string keys. Quote numeric or complex YAML keys."
            )
          if (pair.key.value === "<<")
            throw new Error(
              "YAML merge keys are not supported. Expand them first."
            )
          return {
            key: pair.key.value,
            keyRaw: JSON.stringify(pair.key.value),
            node: walk(pair.value as YamlNode | null, depth + 1),
          }
        }),
      }
    if (isSeq(node))
      return {
        type: "array",
        items: node.items.map((item) =>
          walk(item as YamlNode | null, depth + 1)
        ),
      }
    if (!isScalar(node)) return { type: "null", raw: "null" }
    const value = node.value
    if (typeof value === "number" || typeof value === "bigint") {
      const source = node
        .source!.replace(/^\+/u, "")
        .replace(/^(-?)\./u, "$10.")
        .replace(/\.(?=([eE]|$))/u, ".0")
      if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/u.test(source))
        return { type: "number", raw: source }
      if (typeof value === "bigint")
        return { type: "number", raw: value.toString() }
      throw new Error("YAML non-finite numbers cannot be represented in JSON.")
    }
    // The core schema only produces JSON scalar types; unsupported tags were
    // rejected through parser warnings above, before visiting any values.
    return {
      type: value === null ? "null" : (typeof value as "string" | "boolean"),
      raw: JSON.stringify(value),
    }
  }
  return renderJson(
    parseDocument(renderJson(walk(document.contents as YamlNode | null, 0), ""))
      .root
  )
}
export function tableData(root: JsonNode) {
  if (
    root.type !== "array" ||
    !root.items.every((item) => item.type === "object")
  )
    throw new Error("Use a JSON array of objects for table view or CSV export.")
  const columns = [
    ...new Set(
      root.items.flatMap((item) =>
        (item as Extract<JsonNode, { type: "object" }>).entries.map(
          (entry) => entry.key
        )
      )
    ),
  ]
  if (columns.length > 200)
    throw new Error("Use at most 200 columns for a table or CSV export.")
  const rows = root.items.map((item) => {
    const entries = (item as Extract<JsonNode, { type: "object" }>).entries
    return columns.map((column) => {
      const node = entries.find((entry) => entry.key === column)?.node
      if (!node) return ""
      return node.type === "string"
        ? (JSON.parse(node.raw) as string)
        : renderJson(node, "")
    })
  })
  return { columns, rows }
}
export function convertJson(
  input: string,
  format: Conversion,
  protectCsv = true,
  typeName = "Root"
): Converted {
  limitText(input)
  if (format === "yaml-json")
    return {
      output: fromYaml(input),
      extension: "json",
      mime: "application/json",
      note: "YAML comments and anchors are not carried into JSON; aliases and merge keys must be expanded first.",
    }
  if (format === "csv-json") {
    const parsed = Papa.parse<string[]>(input, {
      skipEmptyLines: "greedy",
      delimiter: ",",
    })
    if (parsed.errors.length)
      throw new Error(`Invalid CSV: ${parsed.errors[0].message}`)
    const [headers, ...rows] = parsed.data
    if (
      !headers?.length ||
      headers.some((header) => !header) ||
      new Set(headers).size !== headers.length
    )
      throw new Error(
        "CSV needs a first row of unique, non-empty column names."
      )
    if (
      headers.length > 200 ||
      rows.length > 100_000 ||
      rows.some((row) => row.length !== headers.length)
    )
      throw new Error(
        "CSV rows must match the headers, with at most 200 columns and 100,000 rows."
      )
    const items: JsonNode[] = rows.map((row) => ({
      type: "object",
      entries: headers.map((key, index) => ({
        key,
        keyRaw: JSON.stringify(key),
        node: { type: "string", raw: JSON.stringify(row[index]) },
      })),
    }))
    return {
      output: renderJson(
        parseDocument(renderJson({ type: "array", items }, "")).root
      ),
      extension: "json",
      mime: "application/json",
      note: "CSV cells stay strings so IDs, leading zeros and dates are not guessed or rounded.",
    }
  }
  if (format === "lines-json") {
    const items = input
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return parseDocument(line).root
        } catch (error) {
          throw new Error(
            `JSON Lines record ${index + 1}: ${(error as Error).message}`
          )
        }
      })
    if (!items.length) throw new Error("Add one JSON value per non-empty line.")
    return {
      output: renderJson(
        parseDocument(renderJson({ type: "array", items }, "")).root
      ),
      extension: "json",
      mime: "application/json",
      note: "Each non-empty line becomes one array item.",
    }
  }
  const document = uniqueDocument(parseDocument(input)),
    root = document.root
  if (format === "json-yaml")
    return {
      output: yamlText(root) + "\n",
      extension: "yaml",
      mime: "application/yaml",
      note: "Quoted keys and strings preserve JSON types. Numbers retain their source spelling.",
    }
  if (format === "json-csv") {
    const { columns, rows } = tableData(root)
    return {
      output: Papa.unparse(
        { fields: columns, data: rows },
        { escapeFormulae: protectCsv }
      ),
      extension: "csv",
      mime: "text/csv",
      note: protectCsv
        ? "Formula protection prefixes risky cells with an apostrophe. Nested values are JSON text; CSV cannot preserve JSON types."
        : "Formula protection is off. Spreadsheet programs may execute cells starting with =, +, -, @, tab or carriage return.",
    }
  }
  if (format === "json-lines") {
    if (root.type !== "array")
      throw new Error("Use a JSON array to create one JSON value per line.")
    return {
      output:
        root.items.map((item) => renderJson(item, "")).join("\n") +
        (root.items.length ? "\n" : ""),
      extension: "jsonl",
      mime: "application/x-ndjson",
      note: "Each array item becomes one record; an empty array produces an empty file.",
    }
  }
  if (format === "typescript")
    return {
      output: inferTypeScript(root, typeName),
      extension: "ts",
      mime: "text/plain",
      note: "Types are inferred from this sample, not every possible payload. Review optional fields and unions; TypeScript numbers cannot hold all JSON integers exactly.",
    }
  return {
    output: JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        ...(inferSchema(root) as object),
      },
      null,
      2
    ),
    extension: "schema.json",
    mime: "application/schema+json",
    note: "This sample makes every observed property required and disallows additional properties. Review those assumptions before using the schema.",
  }
}
