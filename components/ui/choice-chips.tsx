"use client"

import * as React from "react"
import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { cn } from "cn"

export interface ChipOption<T extends string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

/** Pill-radius choice chip. Shared so static format badges match selectable chips. */
export const chipClassName =
  "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-medium whitespace-nowrap text-foreground transition-colors duration-150 select-none md:h-9 motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0"

/**
 * Single choice shown as a row of chips, so every option is visible at once.
 * Radio semantics: Tab enters the group, arrow keys move between chips.
 */
function ChoiceChips<T extends string>({
  label,
  hint,
  value,
  onValueChange,
  options,
  disabled,
  className,
  hideLabel,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  value: T
  onValueChange: (value: T) => void
  options: ChipOption<T>[]
  disabled?: boolean
  className?: string
  hideLabel?: boolean
}) {
  const id = React.useId()
  return (
    <div data-slot="choice-chips" className={cn("space-y-2", className)}>
      <div
        id={`${id}-label`}
        className={cn("text-sm font-medium", hideLabel && "sr-only")}
      >
        {label}
      </div>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        disabled={disabled}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <Radio.Root
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            data-slot="choice-chip"
            className={cn(
              chipClassName,
              "cursor-pointer outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-checked:hover:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-background"
            )}
          >
            {option.icon}
            {option.label}
          </Radio.Root>
        ))}
      </RadioGroup>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

export { ChoiceChips }
