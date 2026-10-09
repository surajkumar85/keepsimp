"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { IconArrowUpRight, IconSearch, IconX } from "@tabler/icons-react"
import { categories, filterTools, parseCategory } from "@/lib/catalogue"
import { CategoryIcon } from "@/components/category-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ToolCatalogue() {
  const [query, setQuery] = useState("")
  const category = parseCategory(useSearchParams().get("category"))
  const results = filterTools(query, category)
  const selected = categories.find((entry) => entry.id === category)!
  return (
    <section
      aria-labelledby="catalogue-heading"
      id="tool-catalogue"
      className="scroll-mt-8"
    >
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 id="catalogue-heading" className="section-title">
            {category === "all"
              ? "Explore the collection"
              : `${selected.label} tools`}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Four tools ready to use. More good things on the way.
          </p>
        </div>
        <div className="relative w-full sm:max-w-72">
          <label htmlFor="tool-search" className="sr-only">
            Search tools
          </label>
          <IconSearch
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="tool-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “compress” or “PDF”"
            className="pr-11 pl-9"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-0 right-0"
            >
              <IconX aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <p
        className="mb-3 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {results.length} {results.length === 1 ? "tool" : "tools"} ·{" "}
        {results.filter((tool) => tool.status === "available").length} ready to
        use
      </p>
      {results.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((tool) => (
            <article
              key={tool.id}
              data-testid="tool-card"
              className="tool-card relative rounded-lg border bg-card p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-accent text-primary">
                  <CategoryIcon category={tool.category} className="size-4.5" />
                </div>
                <span
                  className={
                    tool.status === "available"
                      ? "text-xs text-primary"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {tool.status === "available" ? "Ready to use" : "Coming soon"}
                </span>
              </div>
              <h3 className="font-heading text-base font-medium">
                {tool.status === "available" ? (
                  <Link
                    href={`/dashboard/${tool.id}/`}
                    className="after:absolute after:inset-0 after:rounded-lg hover:text-primary"
                  >
                    {tool.name}{" "}
                    <IconArrowUpRight
                      className="ml-1 inline size-4"
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  tool.name
                )}
              </h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {tool.description}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <IconSearch
            className="mx-auto mb-4 size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h3 className="font-heading text-xl font-medium">No tools found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Try another name or a different category.
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => setQuery("")}
          >
            Clear search <IconArrowUpRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  )
}
