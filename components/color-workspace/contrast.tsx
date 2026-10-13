"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import {
  contrast,
  contrastSuggestion,
  parseColor,
  defaults,
  difference,
} from "@/lib/color/core"
import { simulate, type Vision } from "@/lib/color/vision"
import { attempt, Field, panel, Swatch, type Tell } from "./shared"
export function ContrastPanel({
  tell,
  onUse,
  input,
}: {
  input: string
  tell: Tell
  onUse: (color: string) => void
}) {
  const [foreground, setForeground] = useState<string>(defaults.foreground),
    [background, setBackground] = useState<string>(defaults.background),
    [canvas, setCanvas] = useState<string>(defaults.white),
    [target, setTarget] = useState("4.5"),
    [suggestion, setSuggestion] = useState<string | null>(null),
    [vision, setVision] = useState<Vision>("deutan")
  const result = attempt(() => contrast(foreground, background, canvas)),
    delta = attempt(() => difference(foreground, background)),
    preview = attempt(() => ({
      fg: simulate(result.value!.foreground, vision),
      bg: simulate(result.value!.background, vision),
    }))
  function change(set: (s: string) => void, value: string) {
    set(value)
    setSuggestion(null)
  }
  return (
    <div className="space-y-4">
      <section className={panel}>
        <h2 className="section-title">Check two colors together</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label="Text color"
            value={foreground}
            onChange={(v) => change(setForeground, v)}
          />
          <Field
            label="Background color"
            value={background}
            onChange={(v) => change(setBackground, v)}
          />
          <Field
            label="Canvas behind transparency"
            value={canvas}
            onChange={(v) => change(setCanvas, v)}
            hint="Use an opaque color."
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!attempt(() => parseColor(input)).ok}
            onClick={() => change(setForeground, input)}
          >
            Use current color as text
          </Button>
          <Button
            variant="outline"
            disabled={!attempt(() => parseColor(input)).ok}
            onClick={() => change(setBackground, input)}
          >
            Use current color as background
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setForeground(background)
            setBackground(foreground)
            setSuggestion(null)
          }}
        >
          Swap text and background
        </Button>
        {!result.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {result.error}
          </p>
        ) : (
          <>
            <div
              data-color-preview
              className="space-y-2 rounded-lg border p-6"
              style={{
                backgroundColor: result.value.background,
                color: result.value.foreground,
              }}
            >
              <p className="text-3xl font-medium">Make room for clear words.</p>
              <p className="text-base">
                This sample uses your colors, including transparency over the
                canvas.
              </p>
            </div>
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="font-mono text-3xl" data-testid="contrast-ratio">
                {result.value.ratio.toFixed(2)}:1
              </p>
              <p className="text-sm text-muted-foreground">
                WCAG 2.2 contrast ratio
              </p>
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                ["AA normal text (4.5:1)", result.value.aa],
                ["AA large text (3:1)", result.value.largeAA],
                ["AAA normal text (7:1)", result.value.aaa],
                ["AAA large text (4.5:1)", result.value.largeAAA],
                ["Non-text contrast (3:1)", result.value.graphics],
              ].map(([label, pass]) => (
                <li
                  key={String(label)}
                  className="flex justify-between gap-3 rounded-md border p-3"
                >
                  <span>{label}</span>
                  <strong>{pass ? "Pass" : "Fail"}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-xs leading-6 text-muted-foreground">
          Large text means at least 18 pt regular or 14 pt bold. Pass/fail uses
          the unrounded ratio. Colors are mapped to sRGB, with alpha composited
          over the chosen canvas. This checks color contrast, not full page
          accessibility.
        </p>
        <ChoiceChips
          label="Suggested text contrast"
          value={target}
          onValueChange={(v) => {
            setTarget(v)
            setSuggestion(null)
          }}
          options={[
            { value: "3", label: "3:1" },
            { value: "4.5", label: "4.5:1" },
            { value: "7", label: "7:1" },
          ]}
        />
        <Button
          disabled={!result.value}
          onClick={() => {
            const next = contrastSuggestion(
              foreground,
              background,
              canvas,
              Number(target)
            )
            setSuggestion(next)
            tell(
              next
                ? "Suggested an opaque text color with the requested contrast."
                : "No opaque text color can reach this target on the chosen background. Change the background or lower the target."
            )
          }}
        >
          Find a passing text color
        </Button>
        {suggestion && (
          <div className="space-y-3">
            <div className="max-w-xs">
              <Swatch
                value={suggestion}
                label="Suggested text"
                tell={tell}
                onUse={onUse}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setForeground(suggestion)
                setSuggestion(null)
              }}
            >
              Apply suggested text color
            </Button>
          </div>
        )}
      </section>
      <section className={panel}>
        <h2 className="section-title">Look beyond contrast</h2>
        <ChoiceChips
          label="Color vision preview"
          value={vision}
          onValueChange={setVision}
          options={[
            { value: "protan", label: "Protan" },
            { value: "deutan", label: "Deutan" },
            { value: "tritan", label: "Tritan" },
            { value: "grayscale", label: "Grayscale" },
          ]}
        />
        {preview.value && (
          <div
            data-color-preview
            className="rounded-lg border p-6"
            style={{
              backgroundColor: preview.value.bg,
              color: preview.value.fg,
            }}
          >
            <p className="text-xl font-medium">Keep labels as well as color.</p>
            <p className="mt-2 text-base">
              A preview of the same text and background under the selected
              model.
            </p>
          </div>
        )}
        <p className="text-xs leading-6 text-muted-foreground">
          Protan, deutan and tritan use the Machado 2009 model at full severity
          in linear sRGB. These are approximate simulations, not a diagnosis or
          a prediction of every person’s vision. Grayscale uses relative
          luminance.
        </p>
        {delta.value !== undefined && (
          <p className="text-sm">
            Color difference: <strong>ΔE2000 {delta.value.toFixed(3)}</strong>.
            This compares the original colors without opacity. It is not a
            contrast or accessibility score.
          </p>
        )}
      </section>
    </div>
  )
}
