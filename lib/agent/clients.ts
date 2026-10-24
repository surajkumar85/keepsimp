/**
 * The agent apps that can use KeepSimp's tools through the bridge, each
 * with what to paste where, as its maker's own documentation gives it
 * (checked 2026-10-24; `docs` is the page it was taken from). Apps that
 * start the bridge from a settings file get `--allow` with a folder, since
 * they do not say which folder they work in and the bridge never takes the
 * top of the disk for one.
 */

import type { LogoName } from "@/components/agent/app-logo"
import { BRIDGE_PACKAGE, CODEX_CONFIG } from "./setup"

export interface AgentClient {
  id: string
  name: string
  maker: string
  /** The app's own page. */
  href: string
  /** Its maker's page on adding an MCP server. */
  docs: string
  /** Its logo, when its maker offers one for others to use. */
  logo: LogoName | null
  /** Where the setup goes, in a sentence. */
  where: string
  setup: { label: string; text: string; language: "shell" | "json" | "toml" }[]
}

/** The folder an app that names none is given, which the person changes to their own. */
export const SUGGESTED_FOLDER = "~/Documents"

const args = ["-y", BRIDGE_PACKAGE]
const withFolder = [...args, "--allow", SUGGESTED_FOLDER]
/** Settings as JSON, two spaces deep, with each list of words kept on one line. */
const json = (value: unknown) =>
  JSON.stringify(value, null, 2).replace(
    /\[\s*((?:"[^"]*",\s*)*"[^"]*")\s*\]/g,
    (_, items: string) => `[${items.split(/,\s*/).join(", ")}]`
  )
const mcpServers = (entry: Record<string, unknown>) =>
  json({ mcpServers: { keepsimp: entry } })

export const agentClients: readonly AgentClient[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    maker: "Anthropic",
    href: "https://claude.com/product/claude-code",
    docs: "https://code.claude.com/docs/en/mcp",
    logo: "claude",
    where:
      "Run this in a terminal. Claude Code tells the bridge which folders it works in.",
    setup: [
      {
        label: "Terminal",
        text: `claude mcp add keepsimp -- npx ${args.join(" ")}`,
        language: "shell",
      },
    ],
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    maker: "Anthropic",
    href: "https://claude.ai/download",
    docs: "https://modelcontextprotocol.io/docs/develop/connect-local-servers",
    logo: "claude",
    where:
      "In Claude's Settings, open Developer, then Edit Config, add this to claude_desktop_config.json and restart Claude.",
    setup: [
      {
        label: "claude_desktop_config.json",
        text: mcpServers({ command: "npx", args: withFolder }),
        language: "json",
      },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    maker: "OpenAI",
    href: "https://openai.com/codex/",
    docs: "https://developers.openai.com/codex/mcp",
    logo: null,
    where:
      "Add this to ~/.codex/config.toml. The longer start-up time leaves room for the first start, which downloads the bridge and a browser.",
    setup: [
      { label: "~/.codex/config.toml", text: CODEX_CONFIG, language: "toml" },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    maker: "Anysphere",
    href: "https://cursor.com",
    docs: "https://cursor.com/docs/context/mcp",
    logo: "cursor",
    where:
      "Add this to ~/.cursor/mcp.json for every project, or to .cursor/mcp.json in one.",
    setup: [
      {
        label: "mcp.json",
        text: mcpServers({ type: "stdio", command: "npx", args: withFolder }),
        language: "json",
      },
    ],
  },
  {
    id: "vscode-copilot",
    name: "GitHub Copilot in VS Code",
    maker: "GitHub",
    href: "https://github.com/features/copilot",
    docs: "https://code.visualstudio.com/docs/copilot/customization/mcp-servers",
    logo: "copilot",
    where:
      "Run this in a terminal to add the bridge to your VS Code profile, then use it from Copilot's agent mode.",
    setup: [
      {
        label: "Terminal",
        text: `code --add-mcp '${JSON.stringify({
          name: "keepsimp",
          type: "stdio",
          command: "npx",
          args: withFolder,
        })}'`,
        language: "shell",
      },
    ],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    maker: "Google",
    href: "https://github.com/google-gemini/gemini-cli",
    docs: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
    logo: "gemini",
    where:
      "Add this to ~/.gemini/settings.json, then check it with /mcp. Gemini CLI connects only in a folder you trust.",
    setup: [
      {
        label: "~/.gemini/settings.json",
        text: mcpServers({ command: "npx", args }),
        language: "json",
      },
    ],
  },
  {
    id: "zed",
    name: "Zed",
    maker: "Zed Industries",
    href: "https://zed.dev",
    docs: "https://zed.dev/docs/ai/mcp",
    logo: "zed",
    where:
      "Open your settings with “zed: open settings file” and add this. Settings › AI › MCP Servers shows it running.",
    setup: [
      {
        label: "settings.json",
        text: json({
          context_servers: {
            keepsimp: { command: "npx", args: withFolder, env: {} },
          },
        }),
        language: "json",
      },
    ],
  },
  {
    id: "cline",
    name: "Cline",
    maker: "Cline",
    href: "https://cline.bot",
    docs: "https://docs.cline.bot/mcp/configuring-mcp-servers",
    logo: "cline",
    where:
      "In Cline, press MCP Servers, then Configure, then Configure MCP Servers, and add this to cline_mcp_settings.json.",
    setup: [
      {
        label: "cline_mcp_settings.json",
        text: mcpServers({ command: "npx", args: withFolder, disabled: false }),
        language: "json",
      },
    ],
  },
  {
    id: "jetbrains",
    name: "JetBrains AI Assistant",
    maker: "JetBrains",
    href: "https://www.jetbrains.com/ai-assistant/",
    docs: "https://www.jetbrains.com/help/ai-assistant/mcp.html",
    logo: "jetbrains",
    where:
      "In Settings › Tools › AI Assistant › Model Context Protocol (MCP), press Add, choose STDIO and paste this.",
    setup: [
      {
        label: "New MCP server",
        text: mcpServers({ command: "npx", args: withFolder }),
        language: "json",
      },
    ],
  },
  {
    id: "opencode",
    name: "opencode",
    maker: "opencode",
    href: "https://opencode.ai",
    docs: "https://opencode.ai/docs/mcp-servers/",
    logo: "opencode",
    where: "Add this to opencode.json in your project.",
    setup: [
      {
        label: "opencode.json",
        text: json({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            keepsimp: {
              type: "local",
              command: ["npx", ...args],
              enabled: true,
            },
          },
        }),
        language: "json",
      },
    ],
  },
]
