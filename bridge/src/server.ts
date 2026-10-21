/**
 * The MCP server an agent talks to over stdio. It lists the agent page's
 * tools (asked of the page, so they are always the site's own), keeps to the
 * folders the client names as its roots, and runs each call through the
 * hidden browser.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  RootsListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { Tools } from "./browser.ts"
import { callTool, ignore } from "./calls.ts"
import type { Folders } from "./paths.ts"
import { forAgents, type Listing } from "./tools.ts"

export const INSTRUCTIONS = `KeepSimp's tools run on this computer, in a hidden browser that opens the KeepSimp site and nothing else: files never go to a server. Give files as paths inside the folders you work in; results are saved next to the first file given (or in outputFolder), never over an existing file, and the answer lists where.`

export interface ServerOptions {
  name: string
  version: string
  tools: Tools
  folders: Folders
  /** The folder to use when the client names no roots: where the bridge started. */
  fallback: readonly string[]
  /** Folders given with --allow, used either way. */
  allow: readonly string[]
  log: (line: string) => void
}

export function makeServer(options: ServerOptions) {
  const server = new Server(
    { name: options.name, version: options.version },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  )
  let listings: Promise<Listing[]> | null = null
  const listed = () => {
    listings ??= options.tools.tools().then(
      (all) => all.filter((tool) => !tool.pageOnly),
      (error: unknown) => {
        listings = null
        throw error
      }
    )
    return listings
  }

  const takeRoots = async () => {
    if (!server.getClientCapabilities()?.roots) return
    try {
      const { roots } = await server.listRoots()
      if (roots.length) {
        await options.folders.set([
          ...roots.map((root) => root.uri),
          ...options.allow,
        ])
        options.log(`Using the folders: ${options.folders.list().join(", ")}`)
      }
    } catch (error) {
      options.log(`The client did not give its folders: ${String(error)}`)
    }
  }
  server.oninitialized = () => void takeRoots()
  server.setNotificationHandler(RootsListChangedNotificationSchema, () =>
    takeRoots()
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await listed()).map(forAgents),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const listing = (await listed()).find(
      (tool) => tool.name === request.params.name
    )
    if (!listing)
      return {
        content: [
          {
            type: "text",
            text: `There is no tool called ${request.params.name}.`,
          },
        ],
        isError: true,
      }
    const token = request.params._meta?.progressToken
    return callTool(
      options.tools,
      options.folders,
      listing,
      request.params.arguments ?? {},
      {
        signal: extra.signal,
        onProgress:
          token === undefined
            ? undefined
            : (fraction, note) =>
                void extra
                  .sendNotification({
                    method: "notifications/progress",
                    params: {
                      progressToken: token,
                      progress: fraction,
                      total: 1,
                      ...(note ? { message: note } : {}),
                    },
                  })
                  .catch(ignore),
      }
    )
  })

  return {
    server,
    async start(transport: Transport) {
      await options.folders.set([...options.fallback, ...options.allow])
      await server.connect(transport)
    },
  }
}
