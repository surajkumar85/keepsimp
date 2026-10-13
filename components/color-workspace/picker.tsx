"use client"
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react"
import { IconChevronDown } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { defaults, hex, parseColor, srgb } from "@/lib/color/core"
import {
  clamp,
  hueTrack,
  pickerColor,
  pickerPoint,
  pickerValue,
  type PickerValue,
} from "@/lib/color/picker"
import { attempt, Field } from "./shared"
import styles from "./picker.module.css"

const initial: PickerValue = {
  hue: 180,
  saturation: 100,
  brightness: 50,
  alpha: 100,
}
export function ColorPicker({
  value,
  onChange,
  label = "Color",
  layout = "stack",
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  layout?: "stack" | "wide"
}) {
  const id = useId(),
    area = useRef<HTMLDivElement>(null)
  const [memory, setMemory] = useState({ value: "", channels: initial })
  const [active, setActive] = useState<"saturation" | "brightness" | null>(null)
  const result = attempt(() => pickerValue(value, memory.channels))
  if (!result.ok) return null
  if (value !== memory.value) setMemory({ value, channels: result.value })
  const channels = value === memory.value ? memory.channels : result.value
  function change(patch: Partial<PickerValue>) {
    const next = { ...channels, ...patch },
      color = pickerColor(next)
    setMemory({ value: color, channels: next })
    onChange(color)
  }
  function pointer(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    change(
      pickerPoint(
        event.clientX - box.left,
        event.clientY - box.top,
        box.width,
        box.height
      )
    )
  }
  const opaque = hex(parseColor(value), false)
  const trackStyle = (track: string) =>
    ({ "--color-track": track }) as CSSProperties
  return (
    <div
      className={layout === "wide" ? "grid gap-4 md:grid-cols-2" : "space-y-3"}
      aria-label={`${label} visual picker`}
      role="group"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span id={`${id}-label`}>Saturation & brightness</span>
          <span className="font-mono">
            {Math.round(channels.saturation)}% ·{" "}
            {Math.round(channels.brightness)}%
          </span>
        </div>
        <div
          ref={area}
          role="group"
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-help`}
          data-testid={`${label}-color-area`}
          className="relative h-56 cursor-crosshair touch-none rounded-lg border ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
          style={{
            background: `linear-gradient(to top, ${defaults.black}, transparent), linear-gradient(to right, ${defaults.white}, hsl(${channels.hue} 100% 50%))`,
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            pointer(e)
            area.current?.querySelector("input")?.focus({ preventScroll: true })
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) pointer(e)
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ring-2 ring-foreground"
            style={{
              left: `clamp(10px, ${channels.saturation}%, calc(100% - 10px))`,
              top: `clamp(10px, ${100 - channels.brightness}%, calc(100% - 10px))`,
              backgroundColor: opaque,
            }}
          />
          {(["saturation", "brightness"] as const).map((axis) => (
            <input
              key={axis}
              type="range"
              className="sr-only"
              min={0}
              max={100}
              step={1}
              value={channels[axis]}
              aria-label={`${label} ${axis}`}
              aria-valuetext={`${Math.round(channels[axis])} percent`}
              aria-describedby={`${id}-help`}
              onFocus={() => setActive(axis)}
              onBlur={() => setActive(null)}
              onChange={(e) => change({ [axis]: Number(e.target.value) })}
            />
          ))}
        </div>
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {active
            ? `Adjusting ${active}: ${Math.round(channels[active])}%. Arrow keys change it; Tab moves to the next control.`
            : "sRGB editing. Drag or tap to pick. Tab to each channel; arrow keys adjust it."}
        </p>
      </div>
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          <span className="flex justify-between gap-2">
            Hue{" "}
            <span className="font-mono text-muted-foreground">
              {Math.round(channels.hue)}°
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={channels.hue}
            aria-label={`${label} hue`}
            aria-valuetext={`${Math.round(channels.hue)} degrees`}
            className={styles.range}
            style={trackStyle(hueTrack)}
            onChange={(e) => change({ hue: Number(e.target.value) })}
          />
        </label>
        <label className="block text-sm font-medium">
          <span className="flex justify-between gap-2">
            Opacity{" "}
            <span className="font-mono text-muted-foreground">
              {Math.round(channels.alpha)}%
            </span>
          </span>
          <span className="block rounded-full">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={channels.alpha}
              aria-label={
                label === "Color" ? "Opacity channel" : `${label} opacity`
              }
              aria-valuetext={`${Math.round(channels.alpha)} percent`}
              className={styles.range}
              style={trackStyle(
                `linear-gradient(to right, transparent, ${opaque})`
              )}
              onChange={(e) => {
                const c = parseColor(value)
                c.alpha = Number(e.target.value) / 100
                onChange(c.toString({ precision: 12, inGamut: false }))
              }}
            />
          </span>
        </label>
        <details className="rounded-lg border px-3">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium md:min-h-9">
            <IconChevronDown className="size-4" aria-hidden="true" />
            Exact channels
          </summary>
          <div className="grid grid-cols-2 gap-3 py-3">
            {(["saturation", "brightness"] as const).map((axis) => (
              <label key={axis} className="space-y-2 text-xs font-medium">
                <span className="capitalize">{axis} (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  aria-label={`${label} ${axis} (%)`}
                  value={Number(channels[axis].toFixed(2))}
                  onChange={(e) =>
                    change({ [axis]: clamp(Number(e.target.value)) })
                  }
                />
              </label>
            ))}
          </div>
          {["Red", "Green", "Blue"].map((name, i) => (
            <label key={name} className="block text-xs text-muted-foreground">
              <span>
                {name}: {Math.round(srgb(parseColor(value)).coords[i]! * 255)}
              </span>
              <input
                type="range"
                min={0}
                max={255}
                value={Math.round(srgb(parseColor(value)).coords[i]! * 255)}
                aria-label={`${label} ${name} channel`}
                className="block h-11 w-full accent-primary md:h-9"
                onChange={(e) => {
                  const c = srgb(parseColor(value))
                  c.coords[i] = Number(e.target.value) / 255
                  onChange(c.toString({ precision: 12, inGamut: false }))
                }}
              />
            </label>
          ))}
        </details>
      </div>
    </div>
  )
}

export function ColorControl({
  label,
  value,
  onChange,
  hint,
  onPick,
  pickerOpen,
  pickerId,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  onPick?: () => void
  pickerOpen?: boolean
  pickerId?: string
}) {
  const [open, setOpen] = useState(false),
    id = useId(),
    color = attempt(() => hex(parseColor(value)))
  return (
    <div className="min-w-0 space-y-3">
      <Field
        label={label}
        value={value}
        onChange={onChange}
        hint={hint}
        trailing={
          <Button
            variant="outline"
            size="icon"
            aria-label={`Pick ${label.toLowerCase()}`}
            title={`Pick ${label.toLowerCase()}`}
            aria-expanded={onPick ? pickerOpen : open}
            aria-controls={pickerId ?? id}
            onClick={onPick ?? (() => setOpen(!open))}
          >
            <span className="checkerboard size-6 overflow-hidden rounded-md border">
              <span
                className="block h-full w-full"
                style={{ backgroundColor: color.value ?? "transparent" }}
              />
            </span>
          </Button>
        }
      />
      {!onPick && open && (
        <div id={id} className="rounded-xl border bg-background p-3">
          <ColorPicker value={value} label={label} onChange={onChange} />
          {!color.ok && (
            <p className="text-xs text-muted-foreground">
              Enter a readable color to open the visual picker.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
