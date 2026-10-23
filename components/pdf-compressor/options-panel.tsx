"use client"

import { Section, ToggleRow } from "@/components/image-batch/controls"
import { LockFields } from "@/components/pdf/lock-fields"
import {
  defaultExtras,
  removalChoices,
  type Extras,
} from "@/lib/pdf-compressor/options"
import {
  EXTRAS_GROUPS,
  extrasSummary,
  type ExtrasGroup,
} from "@/lib/pdf-compressor/summary"
import { differs, resetOf } from "@/lib/settings-groups"

/**
 * What else is done to the files: things taken out of them, each by a
 * switch of its own that is off until asked for, and a password. Both fold
 * under their summaries, as most files need neither.
 */
export function OptionsPanel({
  extras,
  update,
}: {
  extras: Extras
  update: (change: Partial<Extras>) => void
}) {
  const group = (name: ExtrasGroup) => ({
    summary: extrasSummary(name, extras),
    changed: differs(extras, defaultExtras, EXTRAS_GROUPS[name]),
    onReset: () => update(resetOf(defaultExtras, EXTRAS_GROUPS[name])),
    defaultOpen: false,
  })
  return (
    <div className="border-t first:border-t-0" data-testid="compress-options">
      <Section title="Take out" {...group("takeOut")}>
        <p className="text-xs text-muted-foreground">
          Everything here stays in unless you turn its switch on.
        </p>
        {removalChoices.map(({ key, label, hint }) => (
          <ToggleRow
            key={key}
            label={label}
            hint={hint}
            checked={extras[key]}
            onCheckedChange={(checked) => update({ [key]: checked })}
          />
        ))}
      </Section>
      <Section title="Password" {...group("password")}>
        <LockFields
          settings={extras}
          update={update}
          label="Lock the result with a password"
        />
      </Section>
    </div>
  )
}
