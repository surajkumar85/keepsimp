"use client"
import { useState } from "react"
import {
  IconLock,
  IconLockOpen,
  IconArrowLeft,
  IconArrowRight,
  IconTrash,
  IconRefresh,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import {
  defaults,
  hex,
  inspect,
  mixColors,
  parseColor,
  type MixSpace,
} from "@/lib/color/core"
import {
  exportPalette,
  harmony,
  tones,
  type ExportFormat,
  type Harmony,
} from "@/lib/color/palette"
import {
  attempt,
  copy,
  download,
  fieldClass,
  Field,
  panel,
  SaveButton,
  Swatch,
  type Tell,
} from "./shared"
export type PaletteItem = { color: string; locked: boolean }
const harmonies = [
  { value: "analogous", label: "Analogous" },
  { value: "complementary", label: "Complementary" },
  { value: "split", label: "Split complement" },
  { value: "triadic", label: "Triadic" },
  { value: "tetradic", label: "Tetradic" },
  { value: "monochrome", label: "Monochrome" },
] as const
export function PalettePanel({
  input,
  items,
  onChange,
  onUse,
  tell,
}: {
  input: string
  items: PaletteItem[]
  onChange: (items: PaletteItem[]) => void
  onUse: (color: string) => void
  tell: Tell
}) {
  const [mode, setMode] = useState<Harmony>("analogous"),
    [format, setFormat] = useState<ExportFormat>("css"),
    [second, setSecond] = useState<string>(defaults.white),
    [amount, setAmount] = useState(50),
    [space, setSpace] = useState<MixSpace>("oklab")
  const info = attempt(() => inspect(input)),
    scheme = attempt(() => harmony(input, mode)),
    scale = attempt(() => tones(input)),
    blend = attempt(() => mixColors(input, second, amount / 100, space))
  function shuffle() {
    const random = new Uint8Array(items.length * 3)
    crypto.getRandomValues(random)
    onChange(
      items.map((item, i) =>
        item.locked
          ? item
          : {
              ...item,
              color: `rgb(${random[i * 3]} ${random[i * 3 + 1]} ${random[i * 3 + 2]})`,
            }
      )
    )
    tell("Unlocked colors refreshed.")
  }
  function move(i: number, by: number) {
    const next = [...items]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    onChange(next)
  }
  function save() {
    const out = exportPalette(
      items.map((i) => i.color),
      format
    )
    download(out.text, out.mime, `keepsimp-palette.${out.extension}`)
    tell("Palette downloaded.")
  }
  async function png() {
    const canvas = document.createElement("canvas")
    canvas.width = items.length * 160
    canvas.height = 160
    const context = canvas.getContext("2d")!
    items.forEach((item, i) => {
      context.fillStyle = hex(parseColor(item.color))
      context.fillRect(i * 160, 0, 160, 160)
    })
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    )
    if (!blob) {
      tell("PNG export could not be made.")
      return
    }
    const url = URL.createObjectURL(blob),
      a = document.createElement("a")
    a.href = url
    a.download = "keepsimp-palette.png"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    tell("PNG palette downloaded.")
  }
  return (
    <div className="space-y-4">
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Your palette</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={shuffle}>
              <IconRefresh aria-hidden="true" />
              Shuffle unlocked
            </Button>
            <Button
              disabled={!info.value || items.length >= 12}
              onClick={() => {
                onChange([...items, { color: input, locked: false }])
                tell("Current color added.")
              }}
            >
              Add current color
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Keep up to 12 colors. Lock the ones you like before shuffling; use the
          arrows to change their order.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((item, i) => (
            <div key={i} className="min-w-0 space-y-2">
              <Swatch
                value={item.color}
                label={`Color ${i + 1}`}
                onUse={onUse}
                tell={tell}
              />
              <div className="flex flex-wrap justify-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${item.locked ? "Unlock" : "Lock"} color ${i + 1}`}
                  title={`${item.locked ? "Unlock" : "Lock"} color ${i + 1}`}
                  aria-pressed={item.locked}
                  onClick={() =>
                    onChange(
                      items.map((v, j) =>
                        j === i ? { ...v, locked: !v.locked } : v
                      )
                    )
                  }
                >
                  {item.locked ? (
                    <IconLock aria-hidden="true" />
                  ) : (
                    <IconLockOpen aria-hidden="true" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move color ${i + 1} earlier`}
                  title="Move earlier"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <IconArrowLeft aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move color ${i + 1} later`}
                  title="Move later"
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <IconArrowRight aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove color ${i + 1}`}
                  title="Remove color"
                  disabled={items.length === 1}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                >
                  <IconTrash aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 space-y-2 text-sm font-medium">
            <span>Palette export format</span>
            <select
              className={fieldClass}
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              {[
                ["css", "CSS variables"],
                ["scss", "SCSS variables"],
                ["json", "JSON"],
                ["tokens", "Design Tokens JSON"],
                ["tailwind", "Tailwind config JSON"],
                ["gpl", "GIMP palette"],
                ["svg", "SVG swatches"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <SaveButton onClick={save}>Download palette</SaveButton>
          <Button
            variant="outline"
            onClick={() =>
              void copy(
                exportPalette(
                  items.map((i) => i.color),
                  format
                ).text,
                tell
              )
            }
          >
            Copy palette
          </Button>
          <SaveButton onClick={() => void png()}>Download PNG</SaveButton>
        </div>
        <p className="text-xs text-muted-foreground">
          Exports use the sRGB fallback. CSS, JSON, tokens, SVG and PNG keep
          opacity; GIMP palette colors are opaque.
        </p>
      </section>
      <section className={panel}>
        <h2 className="section-title">Colors that go together</h2>
        <ChoiceChips
          label="Color harmony"
          value={mode}
          onValueChange={setMode}
          options={[...harmonies]}
        />
        {!scheme.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {scheme.error}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {scheme.value.map((value, i) => (
                <Swatch
                  key={i}
                  value={value}
                  label={`Harmony ${i + 1}`}
                  tell={tell}
                  onUse={onUse}
                />
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() =>
                onChange(
                  scheme.value.map((color) => ({ color, locked: false }))
                )
              }
            >
              Use harmony as palette
            </Button>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Hues rotate in OKLCH. Swatches and exports are mapped to sRGB; a
          harmony is a starting point, not a contrast guarantee.
        </p>
      </section>
      <section className={panel}>
        <h2 className="section-title">Light to dark</h2>
        {scale.value ? (
          <>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {scale.value.map((t) => (
                <Swatch
                  key={t.label}
                  value={t.value}
                  label={t.label}
                  tell={tell}
                  onUse={onUse}
                />
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() =>
                onChange(
                  scale.value.map((t) => ({ color: t.value, locked: false }))
                )
              }
            >
              Use tonal scale as palette
            </Button>
          </>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {scale.error}
          </p>
        )}
      </section>
      <section className={panel}>
        <h2 className="section-title">Mix two colors</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Second color to mix"
            value={second}
            onChange={setSecond}
          />
          <label className="space-y-2 text-sm font-medium">
            <span>Mix amount: {amount}% of second color</span>
            <input
              aria-label="Mix amount"
              type="range"
              min={0}
              max={100}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="h-11 w-full accent-primary md:h-9"
            />
          </label>
        </div>
        <ChoiceChips
          label="Mix color space"
          value={space}
          onValueChange={setSpace}
          options={[
            { value: "oklab", label: "OKLab" },
            { value: "oklch", label: "OKLCH" },
            { value: "srgb", label: "sRGB" },
            { value: "srgb-linear", label: "Linear sRGB" },
          ]}
        />
        {blend.value ? (
          <div className="max-w-sm">
            <Swatch
              value={blend.value}
              label="Mixed color"
              tell={tell}
              onUse={onUse}
            />
          </div>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {blend.error}
          </p>
        )}
      </section>
    </div>
  )
}
