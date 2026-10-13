"use client"
import { useState } from "react"
import { IconArrowUpRight, IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { brands } from "@/lib/color/brands"
import { exportPalette } from "@/lib/color/palette"
import { copy, panel, Swatch, type Tell } from "./shared"
export function BrandPanel({
  tell,
  onUse,
  onPalette,
}: {
  tell: Tell
  onUse: (value: string) => void
  onPalette: (colors: string[]) => void
}) {
  const [name, setName] = useState("Anthropic")
  const brand = brands.find((b) => b.name === name)!
  return (
    <div className="space-y-4">
      <section className={panel}>
        <div>
          <h2 className="section-title">Explore company colors</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a company. Pick a color, copy its code or load the whole
            palette.
          </p>
        </div>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
          role="group"
          aria-label="Choose a company palette"
        >
          {brands.map((b) => (
            <button
              key={b.name}
              type="button"
              aria-label={`View ${b.name} palette`}
              aria-pressed={b.name === name}
              onClick={() => setName(b.name)}
              className={`min-h-20 overflow-hidden rounded-lg border bg-background text-left transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring ${b.name === name ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <span className="flex h-6" aria-hidden="true">
                {b.colors.map((c) => (
                  <span
                    key={c.name}
                    className="flex-1"
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </span>
              <span className="flex items-center justify-between gap-2 px-3 py-3 text-sm font-medium">
                {b.name}
                {b.name === name && (
                  <IconCheck
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className={panel} aria-label={`${brand.name} palette`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">
              Company reference · {brand.colors.length} colors
            </p>
            <h3 className="mt-1 font-heading text-2xl font-medium">
              {brand.name}
            </h3>
          </div>
          <a
            href={brand.source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm text-primary underline underline-offset-4 md:min-h-9"
          >
            Official source
            <IconArrowUpRight className="size-4" aria-hidden="true" />
            <span className="sr-only"> for {brand.name} (opens a new tab)</span>
          </a>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{brand.scope}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {brand.colors.map((color) => (
            <Swatch
              key={color.name}
              value={color.value}
              label={color.name}
              tell={tell}
              onUse={onUse}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onPalette(brand.colors.map((c) => c.value))}>
            Use {brand.name} palette
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void copy(
                exportPalette(
                  brand.colors.map((c) => c.value),
                  "css"
                ).text,
                tell
              )
            }
          >
            Copy {brand.name} CSS
          </Button>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          Sources checked 13 October 2026. These are scoped references, not
          endorsements or permission to use a company’s identity. Brand and
          product colors can change.
        </p>
      </section>
    </div>
  )
}
