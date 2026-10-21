import { AgentPage } from "@/components/agent/agent-page"
import { ORIGIN_TRIAL_TOKEN } from "@/lib/agent/setup"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata(
  "KeepSimp for AI agents: tools for Claude Code, Codex and WebMCP",
  "Let Claude Code, Codex or an agent in your browser use KeepSimp’s tools, on your device: read, merge, split, compress, organise, redact, recognise and fill PDFs, format and query JSON, convert colours and check contrast, with more to come.",
  "/dashboard/agents/"
)

export default function Page() {
  return (
    <>
      {ORIGIN_TRIAL_TOKEN && (
        <meta httpEquiv="origin-trial" content={ORIGIN_TRIAL_TOKEN} />
      )}
      <AgentPage />
    </>
  )
}
