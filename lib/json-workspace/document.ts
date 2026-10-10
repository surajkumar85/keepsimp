import {
  createScanner,
  parseTree,
  printParseErrorCode,
  type Node as ParserNode,
  type ParseError,
} from "jsonc-parser"
import { safeNativeNumber } from "./numbers"

export const MAX_JSON_CHARACTERS = 5_000_000
export const MAX_JSON_NODES = 100_000
export const MAX_JSON_DEPTH = 100
export const MAX_JSON_FILE_BYTES = 10 * 1024 * 1024
export type JsonNode =
  | {
      type: "object"
      entries: { key: string; keyRaw: string; node: JsonNode }[]
    }
  | { type: "array"; items: JsonNode[] }
  | { type: "string" | "number" | "boolean" | "null"; raw: string }
export type JsonDocument = {
  root: JsonNode
  duplicates: string[]
  unsafeNumbers: string[]
  nodes: number
  depth: number
  characters: number
  bytes: number
}
export type TreeRow = {
  pointer: string
  label: string
  type: JsonNode["type"]
  depth: number
  preview: string
  children: number
}

export class JsonInputError extends Error {
  constructor(
    message: string,
    public offset = 0,
    public line = 1,
    public column = 1
  ) {
    super(message)
    this.name = "JsonInputError"
  }
}
export function limitText(input: string) {
  if (input.length > MAX_JSON_CHARACTERS)
    throw new Error("Use at most 5 million characters per document.")
}
export function pointerEscape(value: string) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1")
}
export function pointerSegments(pointer: string): string[] {
  if (pointer === "") return []
  if (!pointer.startsWith("/") || /~(?![01])/u.test(pointer))
    throw new Error(
      "A JSON Pointer must be empty for the root, or start with / and use ~0 and ~1 escapes."
    )
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
}
export function position(input: string, offset: number) {
  const lines = input.slice(0, offset).split(/\r\n|\r|\n/)
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}
export function parseDocument(input: string): JsonDocument {
  limitText(input)
  if (!input.trim()) throw new Error("Add some JSON to get started.")
  // Bound nesting before calling a recursive parser, including malformed input.
  const scanner = createScanner(input, true)
  let nesting = 0
  for (scanner.scan(); scanner.getTokenLength() > 0; scanner.scan()) {
    const token = input[scanner.getTokenOffset()]
    if (token === "{" || token === "[") {
      if (++nesting > MAX_JSON_DEPTH)
        throw new Error(
          "This JSON is too deeply nested. Use at most 100 levels."
        )
    } else if (token === "}" || token === "]")
      nesting = Math.max(0, nesting - 1)
  }
  const errors: ParseError[] = []
  const parsed = parseTree(input, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  })
  if (errors.length) {
    const error = errors[0]
    const offset = error.offset
    const { line, column } = position(input, offset)
    const reason = printParseErrorCode(error.error)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
    throw new JsonInputError(
      `This JSON is not valid: ${reason}. Line ${line}, column ${column}.`,
      offset,
      line,
      column
    )
  }
  const document: JsonDocument = {
    root: { type: "null", raw: "null" },
    duplicates: [],
    unsafeNumbers: [],
    nodes: 0,
    depth: 0,
    characters: input.length,
    bytes: new TextEncoder().encode(input).length,
  }
  function convert(node: ParserNode, pointer: string, depth: number): JsonNode {
    if (++document.nodes > MAX_JSON_NODES)
      throw new Error("Use at most 100,000 values per document.")
    document.depth = Math.max(document.depth, depth)
    if (node.type === "object") {
      const keys = new Set<string>()
      return {
        type: "object",
        entries: node.children!.map((property) => {
          const [key, value] = property.children!
          const path = `${pointer}/${pointerEscape(key.value as string)}`
          if (keys.has(key.value as string)) document.duplicates.push(path)
          keys.add(key.value as string)
          return {
            key: key.value as string,
            keyRaw: input.slice(key.offset, key.offset + key.length),
            node: convert(value, path, depth + 1),
          }
        }),
      }
    }
    if (node.type === "array")
      return {
        type: "array",
        items: node.children!.map((item, index) =>
          convert(item, `${pointer}/${index}`, depth + 1)
        ),
      }
    const raw = input.slice(node.offset, node.offset + node.length)
    if (node.type === "number") {
      if (!safeNativeNumber(raw)) document.unsafeNumbers.push(pointer)
    }
    return { type: node.type as "string" | "number" | "boolean" | "null", raw }
  }
  // A non-empty, error-free strict parse has a root and children on containers.
  document.root = convert(parsed!, "", 0)
  return document
}
export function uniqueDocument(document: JsonDocument) {
  if (document.duplicates.length)
    throw new Error(
      "Duplicate keys are ambiguous for this operation. Format or repair the document, then make each key unique."
    )
  return document
}
export function nativeDocument(document: JsonDocument) {
  uniqueDocument(document)
  if (document.unsafeNumbers.length)
    throw new Error(
      "This operation needs safely representable JavaScript numbers. Quote large IDs, or use formatting, tree view, JSON Pointer or comparison to keep exact numbers."
    )
  return toNative(document.root)
}
export function toNative(node: JsonNode): unknown {
  if (node.type === "array") return node.items.map(toNative)
  if (node.type === "object") {
    const result: Record<string, unknown> = Object.create(null)
    for (const entry of node.entries) result[entry.key] = toNative(entry.node)
    return result
  }
  return JSON.parse(node.raw) as unknown
}
export function renderJson(
  node: JsonNode,
  indent = "  ",
  level = 0,
  sort: "none" | "asc" | "desc" = "none"
): string {
  const budget = { remaining: MAX_JSON_CHARACTERS }
  return renderNode(node, indent, level, sort, budget)
}
function renderNode(
  node: JsonNode,
  indent: string,
  level: number,
  sort: "none" | "asc" | "desc",
  budget: { remaining: number }
): string {
  function reserve(count: number) {
    budget.remaining -= count
    if (budget.remaining < 0)
      throw new Error(
        "The result exceeds 5 million characters. Select a smaller section or use minification."
      )
  }
  if (node.type !== "object" && node.type !== "array") {
    reserve(node.raw.length)
    return node.raw
  }
  reserve(2)
  const object = node.type === "object"
  const open = object ? "{" : "[",
    close = object ? "}" : "]"
  let entries = object ? [...node.entries] : []
  if (sort !== "none")
    entries = entries.sort(
      (a, b) =>
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) * (sort === "asc" ? 1 : -1)
    )
  const values = object
    ? entries.map((entry) => {
        reserve(entry.keyRaw.length + 1 + (indent ? 1 : 0))
        return `${entry.keyRaw}:${indent ? " " : ""}${renderNode(entry.node, indent, level + 1, sort, budget)}`
      })
    : node.items.map((item) =>
        renderNode(item, indent, level + 1, sort, budget)
      )
  if (!values.length) return open + close
  reserve(values.length - 1)
  if (!indent) return open + values.join(",") + close
  reserve(
    values.length + 1 + indent.length * ((level + 1) * values.length + level)
  )
  return (
    open +
    "\n" +
    values.map((value) => indent.repeat(level + 1) + value).join(",\n") +
    "\n" +
    indent.repeat(level) +
    close
  )
}
export function nodeAt(root: JsonNode, pointer: string): JsonNode {
  let node = root
  for (const part of pointerSegments(pointer)) {
    let next: JsonNode | undefined
    if (node.type === "object")
      next = node.entries.find((entry) => entry.key === part)?.node
    else if (node.type === "array" && /^(0|[1-9]\d*)$/u.test(part))
      next = node.items[Number(part)]
    if (!next) throw new Error(`No value exists at ${pointer}.`)
    node = next
  }
  return node
}
export function visitNodes(
  root: JsonNode,
  visitor: (
    node: JsonNode,
    pointer: string,
    label: string,
    depth: number
  ) => void,
  pointer = "",
  label = "$",
  depth = 0
) {
  visitor(root, pointer, label, depth)
  if (root.type === "object")
    for (const entry of root.entries)
      visitNodes(
        entry.node,
        visitor,
        `${pointer}/${pointerEscape(entry.key)}`,
        entry.key,
        depth + 1
      )
  else if (root.type === "array")
    root.items.forEach((node, index) =>
      visitNodes(node, visitor, `${pointer}/${index}`, String(index), depth + 1)
    )
}
export function treeRows(
  document: JsonDocument,
  expanded: string[] = [""],
  search = "",
  offset = 0
) {
  const visible = new Set(expanded)
  const needle = search.toLocaleLowerCase()
  const matches: TreeRow[] = []
  visitNodes(document.root, (node, pointer, label, depth) => {
    const children =
      node.type === "object"
        ? node.entries.length
        : node.type === "array"
          ? node.items.length
          : 0
    const preview =
      node.type === "object"
        ? `${children} properties`
        : node.type === "array"
          ? `${children} items`
          : node.raw.slice(0, 120)
    if (needle) {
      if (
        ![label, pointer, preview].some((text) =>
          text.toLocaleLowerCase().includes(needle)
        )
      )
        return
    } else {
      let parent = pointer
      while (parent !== "") {
        parent = parent.slice(0, parent.lastIndexOf("/"))
        if (!visible.has(parent)) return
      }
    }
    matches.push({ pointer, label, type: node.type, depth, preview, children })
  })
  return { rows: matches.slice(offset, offset + 100), total: matches.length }
}
