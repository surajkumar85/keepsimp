/**
 * The page's tools as the agent sees them through the bridge: a property
 * that names a file by its id on the page takes a path instead, and every
 * tool can be told where to save what it makes.
 */

export type JsonSchema = { [key: string]: unknown }

/** A tool as the agent page lists it (`window.keepsimp.tools()`). */
export interface Listing {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  annotations: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
    consequentialHint?: boolean
  }
  pageOnly: boolean
}

export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema & { type: "object" }
  annotations: {
    title: string
    readOnlyHint: boolean
    destructiveHint: boolean
    openWorldHint: boolean
  }
}

export const OUTPUT_FOLDER = "outputFolder"

/** The properties that name files, and whether each takes several. */
export function fileFields(schema: JsonSchema) {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  return Object.entries(properties)
    .filter(([, property]) => property["x-keepsimp"])
    .map(([name, property]) => ({
      name,
      many: property["x-keepsimp"] === "files",
    }))
}

const asPath = (description: unknown) =>
  `${String(description ?? "")} A path to the file, absolute or from the folder the agent works in.`.trim()

export function forAgents(listing: Listing): McpTool {
  const properties = {
    ...((listing.inputSchema.properties ?? {}) as Record<string, JsonSchema>),
  }
  for (const { name, many } of fileFields(listing.inputSchema)) {
    const { "x-keepsimp": _, ...rest } = properties[name]
    void _
    properties[name] = many
      ? {
          ...rest,
          description:
            `${String(rest.description ?? "")} Paths to the files, absolute or from the folder the agent works in.`.trim(),
        }
      : { ...rest, description: asPath(rest.description) }
  }
  properties[OUTPUT_FOLDER] = {
    type: "string",
    description:
      "Where to save the files the tool makes: by default the folder of the first file given, or the folder the agent works in. Existing files are never overwritten.",
  }
  return {
    name: listing.name,
    title: listing.title,
    description: listing.description,
    inputSchema: {
      ...listing.inputSchema,
      type: "object",
      properties,
    },
    annotations: {
      title: listing.title,
      // It writes new files next to the agent's; it never changes or removes one.
      readOnlyHint: false,
      destructiveHint: false,
      // Nothing is sent anywhere: the work is done in a browser on this computer.
      openWorldHint: false,
    },
  }
}
