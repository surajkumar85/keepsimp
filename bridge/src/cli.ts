#!/usr/bin/env node
/** Starts the KeepSimp bridge: an MCP server on stdio, its browser hidden. */
import { readFileSync } from "node:fs"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { Session } from "./browser.ts"
import { HELP, readOptions } from "./options.ts"
import { Folders } from "./paths.ts"
import { makeServer } from "./server.ts"

// Everything said goes to stderr: stdout carries the protocol.
const log = (line: string) => process.stderr.write(`keepsimp: ${line}\n`)

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { version: string }

let options
try {
  options = readOptions(process.argv.slice(2))
} catch (error) {
  log((error as Error).message)
  process.exit(2)
}
if (options.help) {
  process.stdout.write(HELP)
  process.exit(0)
}
if (options.version) {
  process.stdout.write(`${version}\n`)
  process.exit(0)
}

const session = new Session({
  site: options.site,
  browser: options.browser,
  headed: options.headed,
  log,
})
const { start } = makeServer({
  name: "keepsimp",
  version,
  tools: session,
  folders: new Folders(),
  fallback: [process.cwd()],
  allow: options.allow,
  log,
})

const end = async () => {
  await session.close().catch(() => undefined)
  process.exit(0)
}
process.stdin.on("end", end)
process.on("SIGINT", end)
process.on("SIGTERM", end)

await start(new StdioServerTransport())
log(`ready, with the tools of ${options.site}`)
