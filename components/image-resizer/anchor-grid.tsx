"use client"

import { useId } from "react"
import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { anchors, type Anchor } from "@/lib/image-resizer/focus"

/** Nine positions in a 3×3 grid: which part of the picture to keep, or where to place it. */
export function AnchorGrid({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string
  hint?: string
  value: Anchor | null
  onValueChange: (anchor: Anchor) => void
}) {
  const id = useId()
  return (
    <div className="space-y-2">
      <div id={`${id}-label`} className="text-sm font-medium">
        {label}
      </div>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value ?? ""}
        onValueChange={(next) => onValueChange(next as Anchor)}
        className="grid w-fit grid-cols-3 gap-1 rounded-lg border bg-background p-1"
      >
        {anchors.map((anchor) => (
          <Radio.Root
            key={anchor.id}
            value={anchor.id}
            aria-label={anchor.label}
            title={anchor.label}
            className="group flex size-11 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:size-9 data-checked:bg-primary/10"
          >
            <span className="size-2 rounded-full bg-muted-foreground/50 group-data-checked:size-3 group-data-checked:bg-primary" />
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
