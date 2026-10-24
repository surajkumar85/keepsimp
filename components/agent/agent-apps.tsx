"use client"

import { useEffect } from "react"
import { IconArrowUpRight, IconChevronDown } from "@tabler/icons-react"
import { AppTile } from "@/components/agent/app-logo"
import { CopyBlock } from "@/components/agent/copy-block"
import { agentClients, SUGGESTED_FOLDER } from "@/lib/agent/clients"
import { BRIDGE_PACKAGE } from "@/lib/agent/setup"

/**
 * How to give the bridge to each agent app: its logo and name, where the
 * setup goes, what to paste and its maker's own guide. One is open at a
 * time; the address's fragment (#app-cursor) opens that one.
 */
export function AgentApps() {
  useEffect(() => {
    const open = () => {
      const found = document.getElementById(location.hash.slice(1))
      if (found instanceof HTMLDetailsElement && found.id.startsWith("app-")) {
        found.open = true
        found.scrollIntoView({ block: "nearest" })
      }
    }
    open()
    window.addEventListener("hashchange", open)
    return () => window.removeEventListener("hashchange", open)
  }, [])

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-lg border" data-testid="agent-apps">
        {agentClients.map((client) => (
          <details
            key={client.id}
            id={`app-${client.id}`}
            name="agent-app"
            className="group"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 md:min-h-12 [&::-webkit-details-marker]:hidden">
              <AppTile logo={client.logo} />
              <span className="min-w-0 flex-1">
                <h3 className="text-sm font-medium">{client.name}</h3>
                <span className="block text-xs text-muted-foreground">
                  {client.maker}
                </span>
              </span>
              <IconChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <div className="space-y-3 px-3 pt-1 pb-4">
              <p className="text-sm text-muted-foreground">{client.where}</p>
              {client.setup.map((step) => (
                <CopyBlock
                  key={step.label}
                  label={step.label}
                  text={step.text}
                />
              ))}
              {client.setup.some((step) =>
                step.text.includes(SUGGESTED_FOLDER)
              ) && (
                <p className="text-xs text-muted-foreground">
                  Change {SUGGESTED_FOLDER} to the folder your files are in.
                  KeepSimp reads and writes only there.
                </p>
              )}
              <div className="flex flex-wrap gap-x-5 text-sm">
                <a
                  href={client.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 font-medium text-primary md:min-h-9"
                >
                  {client.name}’s guide to MCP servers
                  <IconArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
                <a
                  href={client.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground md:min-h-9"
                >
                  Get {client.name}
                  <IconArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </details>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Any other app that runs MCP servers can start it the same way:{" "}
        <code className="font-mono">npx -y {BRIDGE_PACKAGE}</code>, with{" "}
        <code className="font-mono">--allow</code> and a folder when the app
        does not say which folder it works in. Its first start downloads the
        bridge, and a browser when Chrome is not installed.
      </p>
    </div>
  )
}
