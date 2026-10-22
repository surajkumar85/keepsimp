"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileUpload,
  IconPlayerStop,
  IconTrash,
} from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  FileInput,
  useDropTarget,
} from "@/components/image-compressor/drop-zone"
import { cn } from "cn"
import type { Agent, Call } from "@/lib/agent/agent"
import { download, startAgent, type Started } from "@/lib/agent/browser"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { BRIDGE_COMMAND, CODEX_CONFIG } from "@/lib/agent/setup"

const FILE_INPUT = "agent-file"
const NOTHING: never[] = []

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              },
              () => undefined
            )
          }
        >
          {copied ? (
            <IconCheck data-icon="inline-start" aria-hidden="true" />
          ) : (
            <IconCopy data-icon="inline-start" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
          <span className="sr-only"> {label}</span>
        </Button>
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className="overflow-x-auto rounded-lg border bg-muted px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {text}
      </pre>
    </div>
  )
}

const CALLERS = {
  page: "this page",
  browser: "an agent in this browser",
  bridge: "the KeepSimp bridge",
}

function CallRow({ call, agent }: { call: Call; agent: Agent }) {
  const percent = Math.round(call.progress * 100)
  return (
    <li className="space-y-2 rounded-lg border p-3" data-testid="agent-call">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {call.title}{" "}
          <span className="font-normal text-muted-foreground">
            · asked by {CALLERS[call.caller]}
          </span>
        </p>
        <p
          className="text-xs text-muted-foreground"
          data-testid="agent-call-state"
        >
          {call.state === "running"
            ? `Working: ${percent}%`
            : call.state === "done"
              ? "Done"
              : call.state === "stopped"
                ? "Stopped"
                : "Could not finish"}
        </p>
      </div>
      {call.state === "running" && (
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={`${call.title}: how far`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => agent.stop(call.id)}
          >
            <IconPlayerStop data-icon="inline-start" aria-hidden="true" />
            Stop
          </Button>
        </div>
      )}
      {call.result && (
        <p className="text-sm text-muted-foreground">{call.result.summary}</p>
      )}
      {call.problem && call.state !== "stopped" && (
        <p className="text-sm text-destructive">{call.problem}</p>
      )}
    </li>
  )
}

/**
 * The agent tools run while the page shows: started by the first one to
 * look, stopped by the last to go.
 */
let started: Started | null = null
let watching = 0
function watchAgent() {
  if (watching++ === 0) started = startAgent()
  return () => {
    if (--watching === 0) {
      started?.stop()
      started = null
    }
  }
}

export function AgentPage() {
  const running = useSyncExternalStore(
    watchAgent,
    () => started,
    () => null
  )
  const agent = running?.agent ?? null
  const [webMcp, setWebMcp] = useState<{
    of: Started
    tools: number | null
  } | null>(null)
  useEffect(() => {
    if (!running) return
    let live = true
    void running.webMcp.then((tools) => {
      if (live) setWebMcp({ of: running, tools })
    })
    return () => {
      live = false
    }
  }, [running])
  const webMcpTools = webMcp && webMcp.of === running ? webMcp.tools : undefined

  const watchCalls = useCallback(
    (listener: () => void) => agent?.subscribe(listener) ?? (() => undefined),
    [agent]
  )
  const calls = useSyncExternalStore(
    watchCalls,
    () => agent?.calls() ?? NOTHING,
    () => NOTHING
  )
  const watchFiles = useCallback(
    (listener: () => void) =>
      agent ? agent.files.subscribe(listener) : () => undefined,
    [agent]
  )
  const files = useSyncExternalStore(
    watchFiles,
    () => agent?.files.snapshot() ?? NOTHING,
    () => NOTHING
  )

  const add = (chosen: File[]) => {
    for (const file of chosen) agent?.files.add(file, file.name, "added")
  }
  const { over, handlers } = useDropTarget(add, !agent)
  const tools = agent?.tools() ?? []

  return (
    <div
      className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6"
      data-testid="agent-page"
      data-ready={agent ? "true" : undefined}
    >
      <div>
        <p className="eyebrow mb-3 text-primary">For AI agents</p>
        <h1 className="page-title">Let your agent use KeepSimp</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Claude Code, Codex and agents in your browser can call KeepSimp’s
          tools: the same engines as the tools’ own pages, on your device. Files
          go from your computer into a browser on your computer and back, never
          to a server.
        </p>
      </div>

      <section
        aria-labelledby="connect-title"
        className="space-y-4 rounded-xl border bg-card p-4"
      >
        <h2 id="connect-title" className="section-title">
          Connect an agent
        </h2>
        <p className="text-sm text-muted-foreground">
          The KeepSimp bridge is a small program that runs on your computer. It
          opens this page in a browser of its own, hidden, hands it the files
          your agent names and saves what the tools make next to them. It reads
          and writes only inside the folders your agent works in.
        </p>
        <CopyBlock label="Claude Code" text={BRIDGE_COMMAND} />
        <CopyBlock label="Codex (~/.codex/config.toml)" text={CODEX_CONFIG} />
        <div className="space-y-1">
          <p className="text-sm font-medium">An agent in this browser</p>
          <p
            className="text-sm text-muted-foreground"
            data-testid="webmcp-status"
          >
            {webMcpTools === undefined
              ? "Checking whether this browser offers WebMCP…"
              : webMcpTools === null
                ? "This browser does not offer WebMCP, the proposed standard for giving a page’s tools to an agent in the browser. In Chrome it can be turned on at chrome://flags/#enable-webmcp-testing."
                : `This page has given ${webMcpTools} tools to agents in this browser through WebMCP. They work on the files you add below.`}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="files-title"
        className="space-y-3 rounded-xl border bg-card p-4"
        {...handlers}
      >
        <h2 id="files-title" className="section-title">
          Files for an agent in this browser
        </h2>
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 transition-colors duration-150 motion-reduce:transition-none",
            over && "border-primary bg-primary/5"
          )}
        >
          <FileInput
            id={FILE_INPUT}
            onFiles={add}
            disabled={!agent}
            label="Add files for an agent"
            multiple
            accept="*/*"
          />
          <label
            htmlFor={FILE_INPUT}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50"
            )}
          >
            <IconFileUpload aria-hidden="true" /> Add files
          </label>
          <p className="text-xs text-muted-foreground">
            Or drop them here. They stay in this tab and are gone when it
            closes.
          </p>
        </div>
        {files.length > 0 && (
          <ul className="divide-y rounded-lg border" data-testid="agent-files">
            {files.map((file) => (
              <li key={file.id} className="flex items-center gap-3 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{file.id}</span> ·{" "}
                    {sizeLabel(file.size)} ·{" "}
                    {file.origin === "made" ? "made by a tool" : "added"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Download ${file.name}`}
                  onClick={() => {
                    const held = agent?.files.get(file.id)
                    if (held) download(held.blob, held.ref.name)
                  }}
                >
                  <IconDownload aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => agent?.files.remove(file.id)}
                >
                  <IconTrash aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="calls-title"
        className="space-y-3 rounded-xl border bg-card p-4"
      >
        <h2 id="calls-title" className="section-title">
          What agents asked
        </h2>
        {calls.length ? (
          <ul className="space-y-2" aria-live="polite">
            {calls.map((call) => (
              <CallRow key={call.id} call={call} agent={agent!} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Every call an agent makes here is listed, with Stop
            while it runs.
          </p>
        )}
      </section>

      <section
        aria-labelledby="tools-title"
        className="space-y-3 rounded-xl border bg-card p-4"
      >
        <h2 id="tools-title" className="section-title">
          The tools
        </h2>
        <p className="text-sm text-muted-foreground">
          Signing and recording stay for you to do yourself.
        </p>
        <ul className="divide-y" data-testid="agent-tools">
          {tools.map((tool) => (
            <li key={tool.name} className="py-2.5">
              <p className="text-sm font-medium">
                {tool.title}{" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {tool.name}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {tool.description}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
