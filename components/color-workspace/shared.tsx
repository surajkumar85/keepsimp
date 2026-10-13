"use client"
import { useId } from "react"
import { IconCopy, IconDownload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { hex, parseColor } from "@/lib/color/core"

export const panel = "min-w-0 space-y-4 rounded-xl border bg-card p-4"
export const fieldClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
export function attempt<T>(
  work: () => T
):
  | { ok: true; value: T; error?: never }
  | { ok: false; value?: never; error: string } {
  try {
    return { ok: true, value: work() }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
export type Tell = (message: string) => void
export async function copy(text: string, tell: Tell) {
  try {
    await navigator.clipboard.writeText(text)
    tell("Copied to clipboard.")
  } catch {
    tell(
      "Clipboard access is unavailable. Select the value and copy it with your keyboard."
    )
  }
}
export function download(text: string, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function Copy({
  value,
  label,
  tell,
}: {
  value: string
  label: string
  tell: Tell
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() => void copy(value, tell)}
    >
      <IconCopy aria-hidden="true" />
    </Button>
  )
}
export function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={512}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}
export function Swatch({
  value,
  label,
  onUse,
  tell,
}: {
  value: string
  label: string
  onUse: (value: string) => void
  tell: Tell
}) {
  const color = hex(parseColor(value))
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
      <button
        type="button"
        className="checkerboard block h-20 w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`Use ${label} ${color}`}
        onClick={() => onUse(value)}
      >
        <span
          className="block h-full w-full"
          style={{ backgroundColor: color }}
        />
      </button>
      <div className="flex items-center gap-1 p-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-sm break-all">{color}</p>
        </div>
        <Copy value={color} label={`${label} ${color}`} tell={tell} />
      </div>
    </div>
  )
}
export function SaveButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <Button variant="outline" disabled={disabled} onClick={onClick}>
      <IconDownload aria-hidden="true" />
      {children}
    </Button>
  )
}
