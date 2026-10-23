"use client"
import { createContext, useContext, useEffect, useId, useState } from "react"
import { IconCheck, IconCopy, IconDownload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
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
export const CurrentColor = createContext("")
export async function copy(text: string, tell: Tell) {
  try {
    await navigator.clipboard.writeText(text)
    tell("Copied to clipboard.")
    // Said in the corner too, with what was copied, since the line above may be out of sight.
    toast.success("Copied", {
      description: text.length > 80 ? `${text.slice(0, 79)}…` : text,
    })
    return true
  } catch {
    tell(
      "Clipboard access is unavailable. Select the value and copy it with your keyboard."
    )
    return false
  }
}
export function download(text: string, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success("Download started", { description: name })
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
  const [copied, setCopied] = useState<string | null>(null)
  const done = copied === value
  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => setCopied(null), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <Button
      size="icon"
      variant="ghost"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        if (await copy(value, tell)) setCopied(value)
      }}
    >
      {done ? (
        <IconCheck aria-hidden="true" />
      ) : (
        <IconCopy aria-hidden="true" />
      )}
      {done && <span className="sr-only">Copied</span>}
    </Button>
  )
}
export function Field({
  label,
  value,
  onChange,
  hint,
  trailing,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  trailing?: React.ReactNode
}) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={512}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {trailing}
      </div>
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
  const current = useContext(CurrentColor)
  const selected = current === color
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-lg border bg-background ${selected ? "border-primary ring-1 ring-primary" : ""}`}
    >
      <button
        type="button"
        className="checkerboard relative block h-24 w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`Use ${label} ${color}`}
        aria-pressed={selected}
        onClick={() => onUse(value)}
      >
        <span
          className="block h-full w-full"
          style={{ backgroundColor: color }}
        />
        {selected && (
          <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-background text-foreground shadow-sm">
            <IconCheck className="size-4" aria-hidden="true" />
          </span>
        )}
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
