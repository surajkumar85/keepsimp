import {
  parseDocument,
  uniqueDocument,
  renderJson,
  pointerEscape,
  pointerSegments,
  nodeAt,
  type JsonNode,
} from "./document"
import { decimalIdentity } from "./numbers"

export type JsonChange = {
  op: "add" | "remove" | "replace"
  path: string
  before?: string
  after?: string
}
export function sameValue(left: JsonNode, right: JsonNode): boolean {
  if (left.type !== right.type) return false
  if (left.type === "array" && right.type === "array")
    return (
      left.items.length === right.items.length &&
      left.items.every((item, i) => sameValue(item, right.items[i]))
    )
  if (left.type === "object" && right.type === "object") {
    const values = new Map(
      right.entries.map((entry) => [entry.key, entry.node])
    )
    return (
      left.entries.length === right.entries.length &&
      left.entries.every((entry) => {
        const other = values.get(entry.key)
        return other !== undefined && sameValue(entry.node, other)
      })
    )
  }
  if (left.type === "number" && right.type === "number")
    return decimalIdentity(left.raw) === decimalIdentity(right.raw)
  if (left.type === "string" && right.type === "string")
    return JSON.parse(left.raw) === JSON.parse(right.raw)
  return (
    left.type !== "object" &&
    left.type !== "array" &&
    right.type !== "object" &&
    right.type !== "array" &&
    left.raw === right.raw
  )
}
export function compareJson(input: string, other: string) {
  const left = uniqueDocument(parseDocument(input)).root
  const right = uniqueDocument(parseDocument(other)).root
  const changes: JsonChange[] = []
  function add(
    op: JsonChange["op"],
    path: string,
    before?: JsonNode,
    after?: JsonNode
  ) {
    if (changes.length >= 500)
      throw new Error(
        "More than 500 differences. Compare a smaller section using JSON Pointer."
      )
    changes.push({
      op,
      path,
      ...(before ? { before: renderJson(before, "") } : {}),
      ...(after ? { after: renderJson(after, "") } : {}),
    })
  }
  function walk(a: JsonNode, b: JsonNode, path: string) {
    if (sameValue(a, b)) return
    if (a.type === "object" && b.type === "object") {
      const aKeys = new Map(a.entries.map((entry) => [entry.key, entry.node])),
        bKeys = new Map(b.entries.map((entry) => [entry.key, entry.node]))
      for (const entry of a.entries) {
        const next = bKeys.get(entry.key),
          child = `${path}/${pointerEscape(entry.key)}`
        if (next) walk(entry.node, next, child)
        else add("remove", child, entry.node)
      }
      for (const entry of b.entries)
        if (!aKeys.has(entry.key))
          add(
            "add",
            `${path}/${pointerEscape(entry.key)}`,
            undefined,
            entry.node
          )
    } else if (a.type === "array" && b.type === "array") {
      const length = Math.min(a.items.length, b.items.length)
      for (let i = 0; i < length; i++)
        walk(a.items[i], b.items[i], `${path}/${i}`)
      for (let i = a.items.length - 1; i >= b.items.length; i--)
        add("remove", `${path}/${i}`, a.items[i])
      for (let i = length; i < b.items.length; i++)
        add("add", `${path}/${i}`, undefined, b.items[i])
    } else add("replace", path, a, b)
  }
  walk(left, right, "")
  const patch =
    "[" +
    changes
      .map(
        (change) =>
          `{"op":${JSON.stringify(change.op)},"path":${JSON.stringify(change.path)}${change.after !== undefined ? `,"value":${change.after}` : ""}}`
      )
      .join(",") +
    "]"
  return { changes, patch: renderJson(parseDocument(patch).root) }
}
export function applyJsonPatch(input: string, patch: string) {
  let root = uniqueDocument(parseDocument(input)).root
  const operations = uniqueDocument(parseDocument(patch)).root
  if (operations.type !== "array" || operations.items.length > 500)
    throw new Error("A JSON Patch must be an array of at most 500 operations.")
  function stringField(operation: JsonNode, name: string) {
    if (operation.type !== "object")
      throw new Error("Each patch operation must be an object.")
    const value = operation.entries.find((entry) => entry.key === name)?.node
    if (!value || value.type !== "string")
      throw new Error(`A patch operation needs a string ${name}.`)
    return JSON.parse(value.raw) as string
  }
  function valueField(operation: JsonNode) {
    const value = (
      operation as Extract<JsonNode, { type: "object" }>
    ).entries.find((entry) => entry.key === "value")?.node
    if (!value) throw new Error("This patch operation needs a value.")
    return value
  }
  function change(
    path: string,
    op: "add" | "remove" | "replace",
    value?: JsonNode
  ) {
    const parts = pointerSegments(path)
    if (!parts.length) {
      if (op === "remove")
        throw new Error(
          "Removing the root leaves no JSON document. Replace it with null instead."
        )
      root = structuredClone(value!)
      return
    }
    const key = parts.pop()!
    const parent = nodeAt(
      root,
      parts.map((part) => "/" + pointerEscape(part)).join("")
    )
    if (parent.type === "object") {
      const index = parent.entries.findIndex((entry) => entry.key === key)
      if (op !== "add" && index < 0)
        throw new Error(`No value exists at ${path}.`)
      if (op === "remove") parent.entries.splice(index, 1)
      else {
        const entry = {
          key,
          keyRaw: JSON.stringify(key),
          node: structuredClone(value!),
        }
        if (index < 0) parent.entries.push(entry)
        else parent.entries[index] = entry
      }
    } else if (parent.type === "array") {
      const index =
        key === "-" && op === "add"
          ? parent.items.length
          : /^(0|[1-9]\d*)$/u.test(key)
            ? Number(key)
            : -1
      if (
        index < 0 ||
        index > parent.items.length ||
        (op !== "add" && index === parent.items.length)
      )
        throw new Error(`Invalid array index at ${path}.`)
      if (op === "add") parent.items.splice(index, 0, structuredClone(value!))
      else if (op === "remove") parent.items.splice(index, 1)
      else parent.items[index] = structuredClone(value!)
    } else throw new Error(`The parent of ${path} is not an object or array.`)
  }
  for (const operation of operations.items) {
    const op = stringField(operation, "op"),
      path = stringField(operation, "path")
    if (op === "add" || op === "replace")
      change(path, op, valueField(operation))
    else if (op === "remove") change(path, op)
    else if (op === "test") {
      if (!sameValue(nodeAt(root, path), valueField(operation)))
        throw new Error(
          `Patch test failed at ${path || "the root"}. No changes were applied.`
        )
    } else if (op === "copy" || op === "move") {
      const from = stringField(operation, "from")
      const parts = pointerSegments(path),
        source = pointerSegments(from)
      if (
        op === "move" &&
        parts.length > source.length &&
        source.every((part, i) => part === parts[i])
      )
        throw new Error("Cannot move a value into one of its children.")
      const value = structuredClone(nodeAt(root, from))
      if (op === "move") {
        if (path === from) continue
        change(from, "remove")
      }
      change(path, "add", value)
    } else throw new Error(`Unsupported patch operation: ${op}.`)
    // Bound each intermediate document, so repeated copies cannot grow unchecked.
    root = parseDocument(renderJson(root, "")).root
  }
  return renderJson(root)
}
