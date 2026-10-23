"use client"

import { useId } from "react"
import { Section } from "@/components/image-batch/controls"
import { LockFields } from "@/components/pdf/lock-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MergeSettings } from "@/lib/pdf-merger/settings"
import { mergeGroup } from "./structure-panel"

type Details = Pick<MergeSettings, "title" | "author" | "subject" | "keywords">

const fields: [keyof Details, string][] = [
  ["title", "Title"],
  ["author", "Author"],
  ["subject", "Subject"],
  ["keywords", "Keywords"],
]

/** The result's details and, when wanted, a password. */
export function OutputPanel({
  settings,
  update,
  first,
}: {
  settings: MergeSettings
  update: (change: Partial<MergeSettings>) => void
  /** The details the first file carries, to take over with one press; null when it has none. */
  first: Partial<Details> | null
}) {
  const ids = useId()
  return (
    <div className="border-t first:border-t-0" data-testid="output-options">
      <Section title="Details" {...mergeGroup("details", settings, update)}>
        <p className="text-xs text-muted-foreground">
          Shown by viewers and search tools. Nothing is taken from your files
          unless you put it here.
        </p>
        {fields.map(([key, label]) => (
          <div key={key}>
            <label
              htmlFor={`${ids}-${key}`}
              className="mb-2 block text-sm font-medium"
            >
              {label}
            </label>
            <Input
              id={`${ids}-${key}`}
              value={settings[key]}
              maxLength={500}
              onChange={(event) => update({ [key]: event.target.value })}
            />
          </div>
        ))}
        {first && (
          <Button
            variant="outline"
            onClick={() =>
              update({
                title: first.title ?? "",
                author: first.author ?? "",
                subject: first.subject ?? "",
                keywords: first.keywords ?? "",
              })
            }
          >
            Take them from the first file
          </Button>
        )}
      </Section>

      <Section title="Password" {...mergeGroup("password", settings, update)}>
        <LockFields
          settings={settings}
          update={update}
          label="Lock the merged PDF with a password"
        />
      </Section>
    </div>
  )
}
