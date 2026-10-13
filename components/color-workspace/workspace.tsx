"use client"
import { useState, useSyncExternalStore } from "react"
import {
  IconPalette,
  IconAdjustments,
  IconContrast,
  IconGradienter,
  IconPhoto,
  IconBuilding,
  IconList,
  IconColorPicker,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  WorkspaceTabs,
  WorkspaceTabList,
  WorkspaceTab,
  WorkspaceTabPanel,
} from "@/components/ui/workspace-tabs"
import {
  defaults,
  initialPalette,
  hex,
  inspect,
  parseColor,
  srgb,
} from "@/lib/color/core"
import { attempt, Copy, Field, panel, type Tell } from "./shared"
import { PalettePanel, type PaletteItem } from "./palettes"
import { ContrastPanel } from "./contrast"
import { GradientPanel } from "./gradients"
import { ImagePanel } from "./images"
import { BrandPanel } from "./brands"
import { BatchPanel } from "./batch"
const subscribe = () => () => {}
const tabs = [
  ["convert", "Convert", IconAdjustments],
  ["palette", "Palettes", IconPalette],
  ["contrast", "Contrast", IconContrast],
  ["gradient", "Gradients", IconGradienter],
  ["image", "From image", IconPhoto],
  ["brands", "Brand colors", IconBuilding],
  ["batch", "Batch", IconList],
] as const

const commonFormats = new Set([
  "HEX",
  "RGB",
  "HSL",
  "OKLCH",
  "HSV / HSB",
  "CMYK (approximate)",
])
function FormatRows({
  rows,
  tell,
}: {
  rows: ReturnType<typeof inspect>["rows"]
  tell: Tell
}) {
  return (
    <div className="divide-y">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 py-3">
          <dl className="min-w-0 flex-1">
            <dt className="text-xs font-medium text-muted-foreground">
              {row.label}
              {row.mapped && (
                <span className="ml-2">
                  ·{" "}
                  {row.label.startsWith("CMYK")
                    ? "no ICC profile"
                    : "sRGB fallback"}
                </span>
              )}
            </dt>
            <dd
              className="mt-1 font-mono text-sm break-all"
              data-testid={`format-${row.label}`}
            >
              {row.value}
            </dd>
          </dl>
          <Copy value={row.value} label={row.label} tell={tell} />
        </div>
      ))}
    </div>
  )
}
export function ColorWorkspace() {
  const [tab, setTab] = useState("convert"),
    [input, setInput] = useState<string>(defaults.color),
    [notice, setNotice] = useState("")
  const [items, setItems] = useState<PaletteItem[]>(
    initialPalette.map((color) => ({ color, locked: false }))
  )
  const [history, setHistory] = useState<PaletteItem[][]>([])
  const hasDropper = useSyncExternalStore(
    subscribe,
    () => "EyeDropper" in window,
    () => false
  )
  const current = attempt(() => inspect(input))
  const tell: Tell = setNotice
  function useColor(color: string) {
    setInput(color)
    setTab("convert")
    tell("Color opened in the converter.")
  }
  function palette(next: PaletteItem[]) {
    setHistory([...history.slice(-19), items])
    setItems(next)
  }
  function usePalette(colors: string[]) {
    palette(colors.map((color) => ({ color, locked: false })))
    setTab("palette")
    tell("Palette loaded. You can reorder, lock and export it.")
  }
  async function eyedropper() {
    try {
      const Picker = (
        window as unknown as {
          EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> }
        }
      ).EyeDropper
      const result = await new Picker().open()
      setInput(result.sRGBHex)
      tell("Picked an sRGB screen color.")
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        tell(
          "The screen picker could not open. Use the color field or local image sampling."
        )
    }
  }
  function channel(index: number, value: number) {
    const c = srgb(parseColor(input))
    if (index === 3) c.alpha = value / 100
    else c.coords[index] = value / 255
    setInput(c.toString({ precision: 8, inGamut: false }))
    setNotice("")
  }
  return (
    <div className="space-y-4">
      <WorkspaceTabs
        value={tab}
        onValueChange={(value) => {
          setTab(String(value))
          setNotice("")
        }}
      >
        <WorkspaceTabList label="Color workflows">
          {tabs.map(([value, label, Icon]) => (
            <WorkspaceTab key={String(value)} value={String(value)}>
              <Icon aria-hidden="true" />
              {String(label)}
            </WorkspaceTab>
          ))}
        </WorkspaceTabList>
        <div className="mt-4">
          <WorkspaceTabPanel value="convert">
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <section className={`${panel} lg:sticky lg:top-20`}>
                <h2 className="section-title">
                  One color, every useful format
                </h2>
                <Field
                  label="Color value"
                  value={input}
                  onChange={(v) => {
                    setInput(v)
                    setNotice("")
                  }}
                  hint="HEX, named CSS colors, RGB, HSL, HWB, Lab, LCH, OKLab, OKLCH, Display P3, HSV or CMYK."
                />
                {!current.ok ? (
                  <p role="alert" className="text-sm text-destructive">
                    {current.error}
                  </p>
                ) : (
                  <>
                    <div
                      role="img"
                      aria-label={`Current color ${current.value.hex}`}
                      className="checkerboard h-40 overflow-hidden rounded-lg border"
                    >
                      <div
                        className="h-full w-full"
                        style={{ backgroundColor: current.value.hex }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-sm font-medium">
                        <span className="block">Color picker</span>
                        <Input
                          aria-label="Color picker"
                          type="color"
                          value={hex(current.value.color, false)}
                          onChange={(e) => {
                            const c = parseColor(e.target.value)
                            c.alpha = current.value.alpha
                            setInput(c.toString({ precision: 8 }))
                            setNotice("")
                          }}
                          className="mt-2 block w-16 cursor-pointer p-1"
                        />
                      </label>
                      <div>
                        <p className="font-mono text-sm">{current.value.hex}</p>
                        <p className="text-xs text-muted-foreground">
                          Opacity {Math.round(current.value.alpha * 100)}%
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {["Red", "Green", "Blue", "Opacity"].map((label, i) => (
                        <label
                          key={label}
                          className="block text-xs text-muted-foreground"
                        >
                          <span>
                            {label}:{" "}
                            {i === 3
                              ? Math.round(current.value.alpha * 100)
                              : Math.round(
                                  srgb(current.value.color).coords[i]! * 255
                                )}
                            {i === 3 ? "%" : ""}
                          </span>
                          <input
                            aria-label={`${label} channel`}
                            type="range"
                            min={0}
                            max={i === 3 ? 100 : 255}
                            value={
                              i === 3
                                ? Math.round(current.value.alpha * 100)
                                : Math.round(
                                    srgb(current.value.color).coords[i]! * 255
                                  )
                            }
                            onChange={(e) => channel(i, Number(e.target.value))}
                            className="block h-11 w-full accent-primary md:h-9"
                          />
                        </label>
                      ))}
                    </div>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {current.value.inSrgb
                        ? "Within sRGB."
                        : "Outside sRGB. HEX, RGB and the preview are gamut-mapped fallbacks; wide-gamut formats keep the original color."}{" "}
                      {current.value.inP3
                        ? "Within Display P3."
                        : "Also outside Display P3."}{" "}
                      Editing the picker or RGB channels works on the sRGB
                      fallback.
                    </p>
                    <Button
                      className="mr-2"
                      disabled={items.length >= 12}
                      onClick={() => {
                        palette([...items, { color: input, locked: false }])
                        setTab("palette")
                        tell("Current color added to your palette.")
                      }}
                    >
                      Add to palette
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  disabled={!hasDropper}
                  onClick={() => void eyedropper()}
                >
                  <IconColorPicker aria-hidden="true" />
                  Pick from screen
                </Button>
                <p className="text-xs text-muted-foreground">
                  Screen picking needs a supported browser and your click. If
                  unavailable, use the picker or From image.
                </p>
              </section>
              <section className={`${panel} lg:col-span-2`}>
                <h2 className="section-title">Copy a color format</h2>
                {current.value ? (
                  <>
                    <FormatRows
                      rows={current.value.rows.filter((row) =>
                        commonFormats.has(row.label)
                      )}
                      tell={tell}
                    />
                    <details className="rounded-lg border p-3">
                      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium md:min-h-9">
                        More color spaces: P3, Lab, LCH and XYZ
                      </summary>
                      <FormatRows
                        rows={current.value.rows.filter(
                          (row) => !commonFormats.has(row.label)
                        )}
                        tell={tell}
                      />
                    </details>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Enter a readable color to see the formats.
                  </p>
                )}
                <p className="text-xs leading-6 text-muted-foreground">
                  Conversions use Color.js with D50/D65 adaptation where needed.
                  Displayed values are rounded to seven significant digits; HEX
                  alpha uses 8-bit rounding. HSV and CMYK omit alpha, which is
                  shown separately. CMYK is a mathematical approximation, not a
                  printer profile, ink recipe or Pantone match.
                </p>
              </section>
            </div>
          </WorkspaceTabPanel>
          <WorkspaceTabPanel value="palette">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                Starting color:{" "}
                <span className="font-mono break-all">{input}</span>
              </p>
              <Button
                variant="outline"
                disabled={!history.length}
                onClick={() => {
                  setItems(history.at(-1)!)
                  setHistory(history.slice(0, -1))
                  tell("Last palette change undone.")
                }}
              >
                Undo palette change
              </Button>
            </div>
            <PalettePanel
              input={input}
              items={items}
              onChange={palette}
              onUse={useColor}
              tell={tell}
            />
          </WorkspaceTabPanel>
          <WorkspaceTabPanel value="contrast">
            <ContrastPanel input={input} tell={tell} onUse={useColor} />
          </WorkspaceTabPanel>
          <WorkspaceTabPanel value="gradient">
            <GradientPanel tell={tell} />
          </WorkspaceTabPanel>
          <WorkspaceTabPanel value="image">
            <ImagePanel tell={tell} onUse={useColor} onPalette={usePalette} />
          </WorkspaceTabPanel>
          <WorkspaceTabPanel value="brands">
            <BrandPanel tell={tell} onUse={useColor} onPalette={usePalette} />
          </WorkspaceTabPanel>
          <WorkspaceTabPanel value="batch">
            <BatchPanel tell={tell} />
          </WorkspaceTabPanel>
        </div>
      </WorkspaceTabs>
      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-sm text-primary"
      >
        {notice}
      </p>
      <p className="text-xs leading-6 text-muted-foreground">
        Colors, images and palettes stay in this tab and clear on refresh. No
        uploads, account or saved document history. Brand references are bundled
        locally, so you can browse their swatches offline.
      </p>
    </div>
  )
}
