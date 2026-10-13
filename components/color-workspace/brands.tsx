"use client"
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
  return (
    <div className="space-y-4">
      <section className={panel}>
        <h2 className="section-title">Company color palettes</h2>
        <p className="text-sm text-muted-foreground">
          Published brand colors and clearly labelled samples from first-party
          assets. Pick a swatch to convert it, copy a code, or make the whole
          palette your own starting point.
        </p>
        <p className="text-xs leading-6 text-muted-foreground">
          Sources checked 13 October 2026. Each entry describes its scope; these
          are references, not endorsements or permission to use a company’s
          identity. Brand and product colors can change.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {brands.map((brand) => (
          <section
            key={brand.name}
            className={panel}
            aria-label={`${brand.name} palette`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading text-xl font-medium">{brand.name}</h3>
              <a
                href={brand.source}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 md:min-h-9"
              >
                Official source
                <span className="sr-only">
                  {" "}
                  for {brand.name} (opens a new tab)
                </span>
              </a>
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              {brand.scope}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
              <Button
                variant="outline"
                onClick={() => onPalette(brand.colors.map((c) => c.value))}
              >
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
          </section>
        ))}
      </div>
    </div>
  )
}
