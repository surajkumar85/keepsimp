/**
 * The tools given to an agent in this browser through WebMCP: each is
 * registered on `document.modelContext` while the agent page is open, and
 * answers with its result as JSON text.
 */
import type { Agent } from "./agent"

export interface WebMcpTool {
  name: string
  title: string
  description: string
  inputSchema: object
  annotations: object
  execute: (
    input: unknown,
    client?: { signal?: AbortSignal }
  ) => Promise<string>
}

export interface ModelContextLike {
  registerTool(
    tool: WebMcpTool,
    options?: { signal?: AbortSignal }
  ): Promise<unknown> | unknown
}

/** The browser's model context, where it has one. */
export function modelContextOf(document: Document): ModelContextLike | null {
  const found = (document as Document & { modelContext?: ModelContextLike })
    .modelContext
  return found && typeof found.registerTool === "function" ? found : null
}

/**
 * Registers every tool; gives how many the browser took and how to take them
 * away again. A tool that the browser refuses is left out and named in
 * `refused`.
 */
export async function registerTools(
  agent: Agent,
  context: ModelContextLike,
  refused: (name: string, problem: string) => void = () => undefined
) {
  const controller = new AbortController()
  let taken = 0
  for (const tool of agent.tools())
    try {
      await context.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: async (input, client) => {
            try {
              const result = await agent.call(tool.name, input, {
                caller: "browser",
                signal: client?.signal,
              })
              return JSON.stringify(result)
            } catch (error) {
              return JSON.stringify({ problem: (error as Error).message })
            }
          },
        },
        { signal: controller.signal }
      )
      taken++
    } catch (error) {
      refused(tool.name, (error as Error).message)
    }
  return { taken, undo: () => controller.abort() }
}
