import type { Metadata } from "next"
import tokens from "@/design-system/tokens.json"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChoiceChipsDemo } from "@/components/choice-chips-demo"

export const metadata: Metadata = {
  title: "Design reference",
  robots: { index: false, follow: false },
}
const colors = [
  "background",
  "foreground",
  "primary",
  "muted",
  "border",
] as const

export default function DesignSystem() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <p className="eyebrow mb-3 text-primary">
          KeepSimp design system · v{tokens.version}
        </p>
        <h1 className="page-title">Familiar. Calm. Consistent.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A shared reference for every tool we build. Inspired by Airbnb’s
          public design principles, with our own colors, fonts, and precise
          tokens.
        </p>
      </div>
      <section aria-labelledby="radii-title">
        <h2 id="radii-title" className="section-title mb-4">
          A corner for every purpose
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(tokens.radius).map(([name, value]) => (
            <div key={name} className="rounded-lg border p-3">
              <div
                data-testid={`radius-${name}`}
                className="mb-3 h-16 border bg-accent"
                style={{ borderRadius: `var(--radius-${name})` }}
              />
              <p className="text-sm font-medium">
                {name === "pill" ? "Pill" : `Radius ${name}`}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="colors-title">
        <h2 id="colors-title" className="section-title mb-4">
          Colors with a clear role
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {colors.map((color) => (
            <div key={color} className="rounded-lg border p-3">
              <div
                className="mb-3 h-16 rounded-md border"
                style={{ background: `var(--${color})` }}
              />
              <p className="text-sm font-medium capitalize">{color}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Adapts to your theme
              </p>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="type-title" className="rounded-xl border p-4">
        <h2 id="type-title" className="section-title mb-4">
          Type that puts clarity first
        </h2>
        <p className="font-heading text-xl">Outfit for a little personality.</p>
        <p className="mt-4">
          Inter for everyday reading. Comfortable spacing, clear labels, and
          room to breathe.
        </p>
        <p className="mt-4 font-mono text-sm">
          Geist Mono for code and exact values.
        </p>
      </section>
      <section
        aria-labelledby="controls-title"
        className="rounded-xl border p-4"
      >
        <h2 id="controls-title" className="section-title mb-4">
          Controls that feel familiar
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Primary example</Button>
          <Button variant="outline" disabled>
            Secondary example
          </Button>
          <Button variant="ghost" disabled>
            Quiet example
          </Button>
        </div>
        <div className="mt-4 max-w-md">
          <label
            htmlFor="reference-input"
            className="mb-2 block text-sm font-medium"
          >
            A clearly labelled field
          </label>
          <Input id="reference-input" placeholder="Try typing here" />
          <p className="mt-2 text-xs text-muted-foreground">
            36px desktop control. 44px mobile touch target. 8px radius.
          </p>
        </div>
        <div className="mt-6 max-w-md" data-testid="choice-chips-example">
          <ChoiceChipsDemo />
        </div>
      </section>
      <div className="rounded-xl border bg-accent p-4">
        <h2 className="section-title">Design that welcomes everyone</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Keyboard access, readable contrast, reduced motion, and layouts that
          work on small screens are part of the foundation. Change your theme
          above to inspect both palettes.
        </p>
      </div>
    </div>
  )
}
