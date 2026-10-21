/**
 * What a tool given to agents is: a name, words that say what it does, the
 * shape of its input as JSON Schema, and the work. Written once here; the
 * agent page offers the same tools through WebMCP (`document.modelContext`)
 * and to the KeepSimp bridge (`window.keepsimp`).
 */
import type { FileStore } from "./files"

/** The version of the tools' interface; the bridge checks it before calling anything. */
export const AGENT_VERSION = 1

export type JsonSchema = { [key: string]: unknown }

/** WebMCP's hints about what a tool does. */
export interface Annotations {
  /** It changes nothing: every result is a new file or an answer. */
  readOnlyHint?: boolean
  /** Its answer can carry words from a file, which are not instructions. */
  untrustedContentHint?: boolean
  /** It does something that cannot be undone; nothing here does. */
  consequentialHint?: boolean
}

/** A file the agent can name: one the person added, or one a tool made. */
export interface FileRef {
  id: string
  name: string
  type: string
  size: number
}

export interface ToolContext {
  files: FileStore
  signal: AbortSignal
  /** How far the work is, from 0 to 1, and what it is doing. */
  progress: (fraction: number, note?: string) => void
}

export interface ToolResult {
  /** What was done and checked, in a sentence or two. */
  summary: string
  /** Files made, kept on the page until it closes. */
  files?: FileRef[]
  /** The answer itself, when there is one: numbers, lists, short text. */
  data?: unknown
}

export interface AgentTool<Input = Record<string, unknown>> {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  annotations?: Annotations
  /** Only for an agent in this browser (it names files the person added here). */
  pageOnly?: boolean
  run(input: Input, context: ToolContext): Promise<ToolResult>
}

/** A problem to tell the agent in its own words, with nothing else attached. */
export class ToolError extends Error {}

/** A property that names one file by its id. The bridge turns it into a path. */
export const fileProperty = (description: string): JsonSchema => ({
  type: "string",
  description,
  "x-keepsimp": "file",
})

/** A property that names several files, in order. */
export const filesProperty = (
  description: string,
  least = 1,
  most = 50
): JsonSchema => ({
  type: "array",
  items: { type: "string" },
  minItems: least,
  maxItems: most,
  description,
  "x-keepsimp": "files",
})

/** The input's top-level properties that name files, and whether each takes several. */
export function fileFields(schema: JsonSchema) {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  return Object.entries(properties)
    .filter(([, property]) => property["x-keepsimp"])
    .map(([name, property]) => ({
      name,
      many: property["x-keepsimp"] === "files",
    }))
}

/** What is told about a tool to whoever lists them. */
export interface ToolListing {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  annotations: Annotations
  pageOnly: boolean
}

export const listingOf = (tool: AgentTool): ToolListing => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  annotations: tool.annotations ?? {},
  pageOnly: Boolean(tool.pageOnly),
})

/** The tools' input types are their own; the registry holds them as one kind. */
export const asTool = <Input>(tool: AgentTool<Input>) =>
  tool as unknown as AgentTool
