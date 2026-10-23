"use client"

import { Section, ToggleRow } from "@/components/image-batch/controls"
import { LockFields } from "@/components/pdf/lock-fields"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { defaultOptions, type SplitOptions } from "@/lib/pdf-splitter/options"
import {
  SPLIT_GROUPS,
  splitSummary,
  type SplitGroup,
} from "@/lib/pdf-splitter/summary"
import { differs, resetOf } from "@/lib/settings-groups"

/**
 * What every part keeps of the file it came from, and, when wanted, a
 * password. What is kept is open; the password folds under its summary.
 */
export function OptionsPanel({
  options,
  update,
}: {
  options: SplitOptions
  update: (change: Partial<SplitOptions>) => void
}) {
  const group = (name: SplitGroup, open: boolean) => ({
    summary: splitSummary(name, options),
    changed: differs(options, defaultOptions, SPLIT_GROUPS[name]),
    onReset: () => update(resetOf(defaultOptions, SPLIT_GROUPS[name])),
    defaultOpen: open,
  })
  return (
    <div data-testid="split-options">
      <Section title="What each part keeps" {...group("keeps", true)}>
        <ToggleRow
          label="Bookmarks"
          hint="Those that lead to the part's own pages."
          checked={options.bookmarks}
          onCheckedChange={(bookmarks) => update({ bookmarks })}
        />
        <ToggleRow
          label="The file's own page numbers"
          hint="A page that viewers call 37 is still called 37 in its part. Off, every part counts from 1."
          checked={options.labels}
          onCheckedChange={(labels) => update({ labels })}
        />
        <ToggleRow
          label="Title, author and other details"
          hint="Turn it off to leave them out, for privacy."
          checked={options.details}
          onCheckedChange={(details) => update({ details })}
        />
        <ChoiceChips
          label="Files attached to the PDF"
          value={options.attachments}
          onValueChange={(attachments) => update({ attachments })}
          options={[
            { value: "first", label: "In the first part" },
            { value: "all", label: "In every part" },
            { value: "none", label: "Left out" },
          ]}
          hint="Attached files are stored whole in each part that carries them."
        />
      </Section>
      <Section title="Password" {...group("password", false)}>
        <LockFields
          settings={options}
          update={update}
          label="Lock every part with a password"
        />
      </Section>
    </div>
  )
}
