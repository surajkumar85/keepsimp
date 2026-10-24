/** What the bridge is started with, read from its command line. */
import type { BrowserChoice } from "./browser.ts"

export const SITE = "https://www.keepsimp.com"

export interface Options {
  site: string
  allow: string[]
  browser: BrowserChoice
  headed: boolean
  help: boolean
  version: boolean
}

export const HELP = `keepsimp-mcp: KeepSimp's tools for MCP agents, run on this computer.

Usage: keepsimp-mcp [options]

  --allow <folder>   Also let KeepSimp read and write in this folder (repeatable;
                     ~ is your home folder). By default it uses the folders
                     the agent names, or the folder it was started in, never
                     the top of a disk.
  --browser <which>  chrome, chromium or auto (the default: Chrome if installed).
  --headed           Show the browser window instead of hiding it.
  --site <url>       The KeepSimp site to open (${SITE}).
  --version          Print the version.
  --help             Print this.

In Claude Code:  claude mcp add keepsimp -- npx -y keepsimp-mcp
In Codex, in ~/.codex/config.toml:
  [mcp_servers.keepsimp]
  command = "npx"
  args = ["-y", "keepsimp-mcp"]
`

export function readOptions(args: readonly string[]): Options {
  const options: Options = {
    site: SITE,
    allow: [],
    browser: "auto",
    headed: false,
    help: false,
    version: false,
  }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    const value = () => {
      const next = args[++index]
      if (next === undefined || next.startsWith("--"))
        throw new Error(`${arg} needs a value.`)
      return next
    }
    if (arg === "--allow") options.allow.push(value())
    else if (arg === "--site") {
      const site = new URL(value())
      if (
        site.protocol !== "https:" &&
        site.hostname !== "127.0.0.1" &&
        site.hostname !== "localhost"
      )
        throw new Error(
          "--site must be an https address, or one on this computer."
        )
      options.site = site.origin
    } else if (arg === "--browser") {
      const which = value()
      if (which !== "auto" && which !== "chrome" && which !== "chromium")
        throw new Error("--browser is chrome, chromium or auto.")
      options.browser = which
    } else if (arg === "--headed") options.headed = true
    else if (arg === "--help" || arg === "-h") options.help = true
    else if (arg === "--version" || arg === "-v") options.version = true
    else throw new Error(`${arg} is not an option. Try --help.`)
  }
  return options
}
