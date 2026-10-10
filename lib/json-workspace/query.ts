import { JSONPathJS } from "jsonpath-js"
import {
  nodeAt,
  parseDocument,
  uniqueDocument,
  nativeDocument,
  toNative,
  renderJson,
} from "./document"
import { jsonPointerFromParts } from "./transforms"

export function queryJson(
  input: string,
  query: string,
  mode: "jsonpath" | "pointer"
) {
  const document = uniqueDocument(parseDocument(input))
  if (query.length > 2000)
    throw new Error("Keep queries below 2,000 characters.")
  if (mode === "pointer") {
    const node = nodeAt(document.root, query)
    return { output: renderJson(node), paths: [query], count: 1 }
  }
  if (!query.trim().startsWith("$"))
    throw new Error(
      "Start a JSONPath query with $, for example $.users[*].name."
    )
  const expressions = query.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/gu, "")
  for (const match of expressions.matchAll(/\b([A-Za-z_]\w*)\s*\(/gu)) {
    if (!["length", "count", "match", "search", "value"].includes(match[1]))
      throw new Error(
        `Invalid JSONPath: unknown function ${match[1]}. JavaScript is not executed.`
      )
  }
  const data = expressions.includes("?")
    ? nativeDocument(document)
    : toNative(document.root)
  let paths: string[]
  try {
    paths = new JSONPathJS(query)
      .pathSegments(data as Parameters<JSONPathJS["pathSegments"]>[0])
      .map((result) => jsonPointerFromParts(result.segments))
  } catch (error) {
    throw new Error(`Invalid JSONPath: ${(error as Error).message}`)
  }
  if (paths.length > 10_000)
    throw new Error("More than 10,000 matches. Use a narrower query.")
  const nodes = paths.map((path) => nodeAt(document.root, path))
  return {
    output: renderJson({ type: "array", items: nodes }),
    paths: paths.slice(0, 100),
    count: paths.length,
  }
}
