"use client"

import * as React from "react"
import { Checkbox } from "@base-ui/react/checkbox"
import { CheckboxGroup } from "@base-ui/react/checkbox-group"
import { IconCheck } from "@tabler/icons-react"
import { cn } from "cn"
import { chipClassName, type ChipOption } from "@/components/ui/choice-chips"

/**
 * Several choices shown as chips that switch on and off independently.
 * Checkbox semantics: each chip is a Tab stop and Space toggles it.
 */
function ToggleChips<T extends string>({
  label,
  hint,
  value,
  onValueChange,
  options,
  className,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  value: T[]
  onValueChange: (value: T[]) => void
  options: ChipOption<T>[]
  className?: string
}) {
  const id = React.useId()
  return (
    <div data-slot="toggle-chips" className={cn("space-y-2", className)}>
      <div id={`${id}-label`} className="text-sm font-medium">
        {label}
      </div>
      <CheckboxGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        onValueChange={(next) => onValueChange(next as T[])}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <Checkbox.Root
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            data-slot="toggle-chip"
            className={cn(
              chipClassName,
              "cursor-pointer outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-checked:hover:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50"
            )}
          >
            <Checkbox.Indicator className="flex">
              <IconCheck aria-hidden="true" />
            </Checkbox.Indicator>
            {option.icon}
            {option.label}
          </Checkbox.Root>
        ))}
      </CheckboxGroup>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

export { ToggleChips }
