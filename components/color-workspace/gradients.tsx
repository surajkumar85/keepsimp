"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { defaults, type MixSpace } from "@/lib/color/core"
import {
  gradient,
  gradientFallback,
  type GradientKind,
  type Stop,
} from "@/lib/color/palette"
import {
  attempt,
  Copy,
  download,
  Field,
  panel,
  SaveButton,
  type Tell,
} from "./shared"
export function GradientPanel({ tell }: { tell: Tell }) {
  const [stops, setStops] = useState<Stop[]>([
      { color: defaults.color, position: 0 },
      { color: defaults.background, position: 100 },
    ]),
    [kind, setKind] = useState<GradientKind>("linear"),
    [angle, setAngle] = useState(90),
    [space, setSpace] = useState<MixSpace>("oklab")
  const result = attempt(() => ({
      modern: gradient(stops, kind, angle, space).css,
      fallback: gradientFallback(stops, kind, angle, space),
    })),
    code = result.value
      ? `background: ${result.value.fallback};\nbackground: ${result.value.modern};`
      : ""
  function update(i: number, patch: Partial<Stop>) {
    setStops(stops.map((s, j) => (i === j ? { ...s, ...patch } : s)))
  }
  return (
    <section className={panel}>
      <h2 className="section-title">Build a gradient</h2>
      <ChoiceChips
        label="Gradient shape"
        value={kind}
        onValueChange={setKind}
        options={[
          { value: "linear", label: "Linear" },
          { value: "radial", label: "Radial" },
          { value: "conic", label: "Conic" },
        ]}
      />
      <ChoiceChips
        label="Gradient interpolation"
        value={space}
        onValueChange={setSpace}
        options={[
          { value: "oklab", label: "OKLab" },
          { value: "oklch", label: "OKLCH" },
          { value: "srgb", label: "sRGB" },
          { value: "srgb-linear", label: "Linear sRGB" },
        ]}
      />
      {kind !== "radial" && (
        <label className="block space-y-2 text-sm font-medium">
          <span>Gradient angle: {angle}°</span>
          <input
            aria-label="Gradient angle"
            type="range"
            min={0}
            max={360}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="h-11 w-full accent-primary md:h-9"
          />
        </label>
      )}
      {result.value ? (
        <div
          role="img"
          aria-label={`${kind} gradient preview`}
          className="checkerboard h-48 overflow-hidden rounded-lg border"
        >
          <div
            className="h-full w-full"
            style={{
              background: result.value.fallback,
              backgroundImage: result.value.modern,
            }}
          />
        </div>
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      )}
      <div className="space-y-3">
        {stops.map((stop, i) => (
          <div
            key={i}
            className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-3"
          >
            <Field
              label={`Stop ${i + 1} color`}
              value={stop.color}
              onChange={(color) => update(i, { color })}
            />
            <label className="space-y-2 text-sm font-medium">
              <span>Stop {i + 1} position (%)</span>
              <Input
                aria-label={`Stop ${i + 1} position (%)`}
                type="number"
                min={0}
                max={100}
                value={stop.position}
                onChange={(e) =>
                  update(i, { position: Number(e.target.value) })
                }
              />
            </label>
            <Button
              variant="outline"
              disabled={stops.length <= 2}
              onClick={() => setStops(stops.filter((_, j) => j !== i))}
            >
              Remove stop {i + 1}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={stops.length >= 8}
          onClick={() =>
            setStops([
              ...stops.slice(0, -1),
              {
                color: defaults.color,
                position: Math.round(
                  (stops.at(-2)!.position + stops.at(-1)!.position) / 2
                ),
              },
              stops.at(-1)!,
            ])
          }
        >
          Add color stop
        </Button>
        <SaveButton
          disabled={!result.value}
          onClick={() => {
            download(
              `.gradient {\n  ${code.replaceAll("\n", "\n  ")}\n}\n`,
              "text/css",
              "keepsimp-gradient.css"
            )
            tell("Gradient CSS downloaded.")
          }}
        >
          Download gradient CSS
        </SaveButton>
      </div>
      {result.value && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
          <pre
            tabIndex={0}
            role="region"
            aria-label="Gradient CSS"
            className="max-h-48 min-w-0 flex-1 overflow-auto rounded-md font-mono text-xs break-all whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {code}
          </pre>
          <Copy value={code} label="gradient CSS" tell={tell} />
        </div>
      )}
      <p className="text-xs leading-6 text-muted-foreground">
        2–8 stops, ordered from 0 to 100%. Repeated positions make hard edges.
        The export includes a sampled fallback for browsers without
        interpolation syntax. It is an approximation between samples; stops use
        the sRGB fallback and keep opacity.
      </p>
    </section>
  )
}
