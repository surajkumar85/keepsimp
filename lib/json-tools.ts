import { transformJson } from "./json-workspace/transforms"

/** The shared precision-preserving formatter used by the JSON workspace. */
export function formatJson(input: string, minify = false): string {
  return transformJson(input, minify ? "minify" : "format")
}
