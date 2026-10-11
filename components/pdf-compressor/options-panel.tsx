"use client"

import { Section, ToggleRow } from "@/components/image-batch/controls"
import { LockFields } from "@/components/pdf/lock-fields"
import { removalChoices, type Extras } from "@/lib/pdf-compressor/options"

/**
 * What else is done to the files: things taken out of them, each by a
 * switch of its own that is off until asked for, and a password.
 */
export function OptionsPanel({
  extras,
  update,
}: {
  extras: Extras
  update: (change: Partial<Extras>) => void
}) {
  return (
    <div
      className="space-y-5 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="compress-options"
    >
      <Section title="Take out">
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
      <Section title="Password">
        <LockFields
          settings={extras}
          update={update}
          label="Lock the result with a password"
        />
      </Section>
    </div>
  )
}
