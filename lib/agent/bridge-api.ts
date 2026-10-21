/**
 * What the agent page offers the KeepSimp bridge as `window.keepsimp`. The
 * bridge runs a browser on the person's computer: it hands files in through
 * addresses it answers itself, calls tools, and saves what they made from
 * downloads. Every answer is plain data, never an exception.
 */
import type { Agent } from "./agent"
import {
  AGENT_VERSION,
  type FileRef,
  type ToolListing,
  type ToolResult,
} from "./registry"

export type Answer<T> = { ok: true; value: T } | { ok: false; problem: string }

export interface BridgeApi {
  version: number
  tools(): ToolListing[]
  /** Fetches `url` (an address the bridge answers) as a file called `name`. */
  load(url: string, name: string, type: string): Promise<Answer<FileRef>>
  /** Calls a tool; progress goes to `keepsimpBridgeProgress(id, fraction, note)`. */
  run(id: string, name: string, input: unknown): Promise<Answer<ToolResult>>
  stop(id: string): void
  /** Starts a download of a file, which the bridge saves. */
  save(fileId: string): Answer<FileRef>
  /** Lets go of files the bridge no longer needs. */
  forget(ids: string[]): void
}

export interface BridgeHooks {
  download: (blob: Blob, name: string) => void
  progress: (id: string, fraction: number, note: string) => void
  fetch: (url: string) => Promise<Response>
}

const problemOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong."

export function bridgeApi(agent: Agent, hooks: BridgeHooks): BridgeApi {
  return {
    version: AGENT_VERSION,
    tools: () => agent.tools().filter((tool) => !tool.pageOnly),
    async load(url, name, type) {
      try {
        const response = await hooks.fetch(url)
        if (!response.ok)
          return { ok: false, problem: `${name} could not be read.` }
        const bytes = await response.blob()
        return {
          ok: true,
          value: agent.files.add(new Blob([bytes], { type }), name, "added"),
        }
      } catch (error) {
        return { ok: false, problem: problemOf(error) }
      }
    },
    async run(id, name, input) {
      try {
        const value = await agent.call(name, input, {
          caller: "bridge",
          id,
          onProgress: (fraction, note) => hooks.progress(id, fraction, note),
        })
        return { ok: true, value }
      } catch (error) {
        return { ok: false, problem: problemOf(error) }
      }
    },
    stop: (id) => agent.stop(id),
    save(fileId) {
      try {
        const { blob, ref } = agent.files.get(fileId)
        hooks.download(blob, ref.name)
        return { ok: true, value: ref }
      } catch (error) {
        return { ok: false, problem: problemOf(error) }
      }
    },
    forget(ids) {
      for (const id of ids) agent.files.remove(id)
    },
  }
}
