/**
 * The tools as one thing to call: each call is checked, run with its own
 * Stop, and written in a list the agent page shows, whoever made it.
 */
import { FileStore } from "./files"
import {
  fileFields,
  listingOf,
  ToolError,
  type AgentTool,
  type ToolListing,
  type ToolResult,
} from "./registry"
import { checker } from "./schema"

/** Who asked: the person on the page, an agent in this browser (WebMCP), or the bridge. */
export type Caller = "page" | "browser" | "bridge"

export interface Call {
  id: string
  tool: string
  title: string
  caller: Caller
  state: "running" | "done" | "failed" | "stopped"
  progress: number
  note: string
  result?: ToolResult
  problem?: string
}

export interface CallOptions {
  caller: Caller
  /** The caller's own id for the call, to stop it or follow it. */
  id?: string
  signal?: AbortSignal
  onProgress?: (fraction: number, note: string) => void
}

/** The most calls kept in the list. */
export const KEPT_CALLS = 50

export class Agent {
  readonly files: FileStore
  private readonly byName = new Map<string, AgentTool>()
  private readonly checks = new Map<string, (input: unknown) => string | null>()
  private readonly stops = new Map<string, AbortController>()
  private list: Call[] = []
  private readonly listeners = new Set<() => void>()
  private count = 0

  constructor(tools: AgentTool[], files = new FileStore()) {
    this.files = files
    for (const tool of tools) {
      if (this.byName.has(tool.name))
        throw new Error(`Two tools are called ${tool.name}.`)
      this.byName.set(tool.name, tool)
      this.checks.set(tool.name, checker(tool.inputSchema))
    }
  }

  tools(): ToolListing[] {
    return [...this.byName.values()].map(listingOf)
  }

  tool(name: string) {
    return this.byName.get(name)
  }

  /** The calls, newest first. */
  calls(): readonly Call[] {
    return this.list
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Runs `name` with `input`: the result, or a ToolError that says what went wrong. */
  async call(
    name: string,
    input: unknown,
    options: CallOptions
  ): Promise<ToolResult> {
    const tool = this.byName.get(name)
    if (!tool)
      throw new ToolError(
        `There is no tool called "${name}". The tools are: ${[
          ...this.byName.keys(),
        ].join(", ")}.`
      )
    const problem = this.checks.get(name)!(input)
    if (problem) throw new ToolError(problem)
    const given = input as Record<string, unknown>
    for (const field of fileFields(tool.inputSchema)) {
      const value = given[field.name]
      for (const id of value === undefined ? [] : [value].flat())
        this.files.get(id as string)
    }

    const id = options.id ?? `call-${++this.count}`
    const controller = new AbortController()
    const stopped = () => controller.abort()
    options.signal?.addEventListener("abort", stopped)
    if (options.signal?.aborted) controller.abort()
    this.stops.set(id, controller)
    const call: Call = {
      id,
      tool: name,
      title: tool.title,
      caller: options.caller,
      state: "running",
      progress: 0,
      note: "",
    }
    this.list = [call, ...this.list].slice(0, KEPT_CALLS)
    this.changed()
    const update = (change: Partial<Call>) => {
      this.list = this.list.map((each) =>
        each.id === id ? { ...each, ...change } : each
      )
      this.changed()
    }
    try {
      if (controller.signal.aborted) throw new DOMException("", "AbortError")
      const result = await tool.run(input as Record<string, unknown>, {
        files: this.files,
        signal: controller.signal,
        progress: (fraction, note = "") => {
          const clamped = Math.max(0, Math.min(1, fraction))
          update({ progress: clamped, note })
          options.onProgress?.(clamped, note)
        },
      })
      if (controller.signal.aborted) throw new DOMException("", "AbortError")
      update({ state: "done", progress: 1, result })
      return result
    } catch (error) {
      if (controller.signal.aborted) {
        update({ state: "stopped", problem: "Stopped." })
        throw new ToolError("Stopped before it was done.")
      }
      const message =
        error instanceof Error && error.message
          ? error.message
          : "The tool could not finish."
      update({ state: "failed", problem: message })
      throw new ToolError(message)
    } finally {
      this.stops.delete(id)
      options.signal?.removeEventListener("abort", stopped)
    }
  }

  /** Stops a running call; nothing happens when it has ended. */
  stop(id: string) {
    this.stops.get(id)?.abort()
  }

  private changed() {
    for (const listener of this.listeners) listener()
  }
}
