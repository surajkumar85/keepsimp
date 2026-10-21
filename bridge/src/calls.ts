/**
 * One tool call through the bridge: the paths the agent gave are checked
 * and their files handed to the page, the tool runs there, and what it made
 * is saved beside them. The page's ids never reach the agent.
 */
import { randomUUID } from "node:crypto"
import { stat } from "node:fs/promises"
import { basename, dirname } from "node:path"
import { BridgeProblem, freePath, type Folders } from "./paths.ts"
import { fileFields, OUTPUT_FOLDER, type Listing } from "./tools.ts"
import type { Tools } from "./browser.ts"

export interface Written {
  path: string
  type: string
  size: number
}

export interface CallResult {
  [key: string]: unknown
  content: { type: "text"; text: string }[]
  structuredContent?: { summary: string; files: Written[]; data?: unknown }
  isError?: boolean
}

export interface CallOptions {
  onProgress?: (fraction: number, note: string) => void
  signal?: AbortSignal
}

/** For promises whose failure changes nothing, such as telling a client that went away. */
export const ignore = () => undefined

const problem = (text: string): CallResult => ({
  content: [{ type: "text", text }],
  isError: true,
})

/** A name from the page used only as a name: no folders in it. */
export function plainName(name: string) {
  const last = basename(name.replace(/\\/g, "/"))
  return last && last !== "." && last !== ".." ? last : "file"
}

export async function callTool(
  tools: Tools,
  folders: Folders,
  listing: Listing,
  args: Record<string, unknown>,
  options: CallOptions = {}
): Promise<CallResult> {
  const handed: string[] = []
  const settled = await work(
    tools,
    folders,
    listing,
    args,
    options,
    handed
  ).then(
    (result) => ({ result }),
    (error: unknown) => ({ error })
  )
  // Every file handed in or made is let go of, whatever happened.
  await tools.forget(handed).catch(ignore)
  if ("result" in settled) return settled.result
  if (settled.error instanceof BridgeProblem)
    return problem(settled.error.message)
  throw settled.error
}

async function work(
  tools: Tools,
  folders: Folders,
  listing: Listing,
  args: Record<string, unknown>,
  options: CallOptions,
  handed: string[]
): Promise<CallResult> {
  const input: Record<string, unknown> = { ...args }
  delete input[OUTPUT_FOLDER]
  // Files in: each path is judged, then its file goes to the page.
  let first: string | null = null
  for (const { name, many } of fileFields(listing.inputSchema)) {
    const given = args[name]
    if (given === undefined) continue
    const paths = many ? given : [given]
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string"))
      return problem(
        `"${name}" takes ${many ? "a list of paths" : "a path"} to ${many ? "files" : "a file"}.`
      )
    const ids: string[] = []
    for (const path of paths as string[]) {
      const real = await folders.file(path)
      first ??= real
      const ref = await tools.put(real, basename(real))
      handed.push(ref.id)
      ids.push(ref.id)
    }
    input[name] = many ? ids : ids[0]
  }
  const wanted = args[OUTPUT_FOLDER]
  if (wanted !== undefined && typeof wanted !== "string")
    return problem(`"${OUTPUT_FOLDER}" takes the path of a folder.`)

  const id = randomUUID()
  const stop = () => void tools.stop(id).catch(ignore)
  options.signal?.addEventListener("abort", stop)
  let answer
  try {
    answer = await tools.call(id, listing.name, input, (fraction, note) =>
      options.onProgress?.(fraction, note)
    )
  } finally {
    options.signal?.removeEventListener("abort", stop)
  }
  if (!answer.ok) return problem(answer.problem)
  const result = answer.value

  // Files out: saved in the folder asked for, never over another file.
  const made = result.files ?? []
  const written: Written[] = []
  if (made.length) {
    const folder = await folders.folder(
      wanted ?? (first ? dirname(first) : (folders.list()[0] ?? "."))
    )
    for (const file of made) {
      const path = await freePath(folder, plainName(file.name))
      await tools.save(file.id, path)
      written.push({ path, type: file.type, size: (await stat(path)).size })
      handed.push(file.id)
    }
  }
  const lines = [result.summary]
  if (written.length)
    lines.push(
      `Saved ${written.length === 1 ? "this file" : "these files"}:`,
      ...written.map((file) => `- ${file.path}`)
    )
  if (result.data !== undefined)
    lines.push(JSON.stringify(result.data, null, 2))
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    structuredContent: {
      summary: result.summary,
      files: written,
      ...(result.data !== undefined ? { data: result.data } : {}),
    },
  }
}
