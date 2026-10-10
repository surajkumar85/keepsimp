"use client"

import { useId } from "react"
import { Switch } from "@/components/ui/switch"

export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 border-t pt-5 first:border-t-0 first:pt-0">
      <h3 className="font-heading text-base font-medium">{title}</h3>
      {children}
    </section>
  )
}

export function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5"
      />
    </div>
  )
}
