import { jsonrepair } from "jsonrepair"
import { integerToken } from "./numbers"
import {
  parseDocument,
  renderJson,
  uniqueDocument,
  pointerEscape,
  visitNodes,
  limitText,
  type JsonNode,
} from "./document"

export type Transform =
  | "format"
  | "minify"
  | "sort-asc"
  | "sort-desc"
  | "repair"
  | "stringify"
  | "parse-string"
  | "flatten"
  | "redact"
  | "base64-encode"
  | "base64-decode"
  | "url-encode"
  | "url-decode"
export function transformJson(
  input: string,
  action: Transform,
  indent = "  ",
  keys = "password,secret,token,api_key,apiKey,authorization"
) {
  limitText(input)
  if (!["", "  ", "    ", "\t"].includes(indent))
    throw new Error("Choose 2 spaces, 4 spaces or tabs.")
  if (action === "repair")
    return renderJson(parseDocument(jsonrepair(input)).root, indent)
  if (action === "base64-decode" || action === "url-decode") {
    let decoded: string
    try {
      decoded =
        action === "url-decode"
          ? decodeURIComponent(input.trim())
          : new TextDecoder("utf-8", { fatal: true }).decode(
              Uint8Array.from(atob(input.trim()), (char) => char.charCodeAt(0))
            )
    } catch {
      throw new Error(
        "The encoded text is not valid UTF-8 Base64 or URL-encoded text."
      )
    }
    return renderJson(parseDocument(decoded).root, indent)
  }
  const document = parseDocument(input)
  if (action === "stringify")
    return JSON.stringify(renderJson(document.root, ""))
  if (action === "parse-string") {
    if (document.root.type !== "string")
      throw new Error("Use a JSON string containing an escaped JSON document.")
    return renderJson(
      parseDocument(JSON.parse(document.root.raw) as string).root,
      indent
    )
  }
  if (action === "base64-encode") {
    const bytes = new TextEncoder().encode(renderJson(document.root, ""))
    let binary = ""
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return btoa(binary)
  }
  if (action === "url-encode")
    return encodeURIComponent(renderJson(document.root, ""))
  if (action === "flatten") {
    uniqueDocument(document)
    const entries: { key: string; keyRaw: string; node: JsonNode }[] = []
    visitNodes(document.root, (node, pointer) => {
      if (
        (node.type === "object" && node.entries.length) ||
        (node.type === "array" && node.items.length)
      )
        return
      entries.push({ key: pointer, keyRaw: JSON.stringify(pointer), node })
    })
    return renderJson({ type: "object", entries }, indent)
  }
  if (action === "redact") {
    const names = new Set(
      keys
        .split(",")
        .map((key) => key.trim().toLocaleLowerCase())
        .filter(Boolean)
    )
    if (!names.size)
      throw new Error("Add at least one property name to redact.")
    function redact(node: JsonNode): JsonNode {
      if (node.type === "object")
        return {
          type: "object",
          entries: node.entries.map((entry) => ({
            ...entry,
            node: names.has(entry.key.toLocaleLowerCase())
              ? { type: "string", raw: '"[REDACTED]"' }
              : redact(entry.node),
          })),
        }
      if (node.type === "array")
        return { type: "array", items: node.items.map(redact) }
      return node
    }
    return renderJson(redact(document.root), indent)
  }
  return renderJson(
    document.root,
    action === "minify" ? "" : indent,
    0,
    action === "sort-asc" ? "asc" : action === "sort-desc" ? "desc" : "none"
  )
}
export function inferSchema(node: JsonNode): unknown {
  if (node.type === "object")
    return {
      type: "object",
      properties: Object.fromEntries(
        node.entries.map((entry) => [entry.key, inferSchema(entry.node)])
      ),
      required: node.entries.map((entry) => entry.key),
      additionalProperties: false,
    }
  if (node.type === "array") {
    const options = [
      ...new Map(
        node.items.map((item) => {
          const schema = inferSchema(item)
          return [JSON.stringify(schema), schema]
        })
      ).values(),
    ]
    return {
      type: "array",
      ...(options.length
        ? { items: options.length === 1 ? options[0] : { anyOf: options } }
        : {}),
    }
  }
  return {
    type:
      node.type === "number" && integerToken(node.raw) ? "integer" : node.type,
  }
}
export function inferTypeScript(node: JsonNode, name = "Root"): string {
  const reserved = new Set(
    "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with implements interface let package private protected public static yield any boolean constructor declare get infer is keyof module namespace never number object readonly require set string symbol type undefined unique unknown async await".split(
      " "
    )
  )
  if (!/^[A-Za-z_$][\w$]*$/u.test(name) || reserved.has(name))
    throw new Error("Use a valid TypeScript type name.")
  function type(value: JsonNode, depth: number): string {
    if (value.type === "object")
      return value.entries.length
        ? `{\n${value.entries.map((entry) => `${"  ".repeat(depth + 1)}${JSON.stringify(entry.key)}: ${type(entry.node, depth + 1)};`).join("\n")}\n${"  ".repeat(depth)}}`
        : "Record<string, never>"
    if (value.type === "array") {
      const types = [...new Set(value.items.map((item) => type(item, depth)))]
      return `Array<${types.length ? types.join(" | ") : "unknown"}>`
    }
    return value.type
  }
  return `export type ${name} = ${type(node, 0)};\n`
}
export function jsonPointerFromParts(parts: readonly (string | number)[]) {
  return parts.map((part) => "/" + pointerEscape(String(part))).join("")
}
