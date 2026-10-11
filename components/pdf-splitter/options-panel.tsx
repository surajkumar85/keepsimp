"use client"

import { Section, ToggleRow } from "@/components/image-batch/controls"
import { LockFields } from "@/components/pdf/lock-fields"
import { ChoiceChips } from "@/components/ui/choice-chips"
import type { SplitOptions } from "@/lib/pdf-splitter/options"

/** What every part keeps of the file it came from, and, when wanted, a password. */
export function OptionsPanel({
  options,
  update,
}: {
  options: SplitOptions
  update: (change: Partial<SplitOptions>) => void
}) {
  return (
    <div
      className="space-y-5 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="split-options"
    >
      <Section title="What each part keeps">
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
      <Section title="Password">
        <LockFields
          settings={options}
          update={update}
          label="Lock every part with a password"
        />
      </Section>
    </div>
  )
}
