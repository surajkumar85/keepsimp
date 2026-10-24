import { AgentPage } from "@/components/agent/agent-page"
import { StructuredData } from "@/components/structured-data"
import { agentClients } from "@/lib/agent/clients"
import { BRIDGE_PACKAGE, ORIGIN_TRIAL_TOKENS } from "@/lib/agent/setup"
import { absoluteUrl, pageMetadata } from "@/lib/site"

const description =
  "Give KeepSimp’s tools to Claude Code, Claude Desktop, Codex, Cursor, GitHub Copilot, Gemini CLI, Zed, Cline and other MCP agents, on your device: work on PDFs, images, animations, sound and video, format and query JSON, convert colours and check contrast."

export const metadata = pageMetadata(
  "KeepSimp MCP tools for Claude, Codex, Cursor, Copilot and Gemini",
  description,
  "/dashboard/agents/"
)

export default function Page() {
  return (
    <>
      {ORIGIN_TRIAL_TOKENS.map((token) => (
        <meta key={token} httpEquiv="origin-trial" content={token} />
      ))}
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: BRIDGE_PACKAGE,
          description,
          url: absoluteUrl("/dashboard/agents/"),
          downloadUrl: `https://www.npmjs.com/package/${BRIDGE_PACKAGE}`,
          applicationCategory: "DeveloperApplication",
          operatingSystem: "macOS, Windows, Linux",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          isAccessibleForFree: true,
          keywords: [
            "MCP server",
            ...agentClients.map((client) => client.name),
          ].join(", "),
        }}
      />
      <AgentPage />
    </>
  )
}
