"use client"

import type { CSSProperties } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { IconArrowUpRight } from "@tabler/icons-react"
import { ToolIcon, categoryTone } from "@/components/tool-icon"
import { cn } from "cn"
import {
  categories,
  filterTools,
  parseCategory,
  type Tool,
} from "@/lib/catalogue"

const labelOf = (tool: Tool) =>
  categories.find((category) => category.id === tool.category)!.label

/** A tool that can be opened: its colour, its own icon, and the whole card as the way in. */
function ReadyCard({ tool, order }: { tool: Tool; order: number }) {
  const tone = categoryTone[tool.category]
  return (
    <article
      data-testid="tool-card"
      data-ready=""
      // Cards settle into place one after another.
      style={{ animationDelay: `${order * 30}ms` } as CSSProperties}
      className={cn(
        "tool-card group relative rounded-lg border bg-card p-4",
        "animate-[enter-soft_var(--motion-standard)_ease-out_backwards] motion-reduce:animate-none",
        "transition-[translate,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
        tone.card
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <ToolIcon
          tool={tool}
          className="transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <IconArrowUpRight
          className="size-4 text-muted-foreground transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground motion-reduce:transition-none motion-reduce:group-hover:translate-0"
          aria-hidden="true"
        />
      </div>
      <p className={cn("text-xs font-medium", tone.text)}>{labelOf(tool)}</p>
      <h3 className="mt-0.5 font-heading text-base font-medium">
        <Link
          href={`/dashboard/${tool.id}/`}
          className="outline-none after:absolute after:inset-0 after:rounded-lg"
        >
          {tool.name}
        </Link>
      </h3>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        {tool.description}
      </p>
    </article>
  )
}

/** A tool that is not built yet: quiet, without colour, and not a way in. */
function PlannedCard({ tool }: { tool: Tool }) {
  return (
    <article
      data-testid="tool-card"
      className="tool-card rounded-lg border border-dashed p-4"
    >
      <div className="mb-3">
        <ToolIcon tool={tool} />
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        {labelOf(tool)}
      </p>
      <h3 className="mt-0.5 font-heading text-base font-medium">{tool.name}</h3>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        {tool.description}
      </p>
    </article>
  )
}

function Group({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} data-testid={id}>
      <h3
        id={id}
        className="mb-3 flex items-baseline gap-2 text-sm font-medium"
      >
        {title}
        <span className="text-xs font-normal text-muted-foreground">
          {note}
        </span>
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  )
}

/**
 * The tools of the chosen category: those that work first, in colour, then
 * those still to come. Searching is done from the top bar.
 */
export function ToolCatalogue() {
  const category = parseCategory(useSearchParams().get("category"))
  const results = filterTools("", category)
  const ready = results.filter((tool) => tool.status === "available")
  const planned = results.filter((tool) => tool.status !== "available")
  const selected = categories.find((entry) => entry.id === category)!
  return (
    <section
      aria-labelledby="catalogue-heading"
      id="tool-catalogue"
      className="scroll-mt-8 space-y-6"
    >
      <div>
        <h2 id="catalogue-heading" className="section-title">
          {category === "all"
            ? "Explore the collection"
            : `${selected.label} tools`}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground" role="status">
          {results.length} {results.length === 1 ? "tool" : "tools"} ·{" "}
          {ready.length} ready to use
        </p>
      </div>
      {ready.length > 0 && (
        <Group
          id="tools-ready"
          title="Ready to use"
          note="Free, and they run on your device"
        >
          {ready.map((tool, order) => (
            <ReadyCard key={tool.id} tool={tool} order={order} />
          ))}
        </Group>
      )}
      {planned.length > 0 && (
        <Group id="tools-planned" title="Coming soon" note="Still being built">
          {planned.map((tool) => (
            <PlannedCard key={tool.id} tool={tool} />
          ))}
        </Group>
      )}
    </section>
  )
}
