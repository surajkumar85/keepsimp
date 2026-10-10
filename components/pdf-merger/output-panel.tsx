"use client"

import { useId } from "react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MergeSettings } from "@/lib/pdf-merger/settings"

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
    <div
      className="space-y-5 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="output-options"
    >
      <Section title="Details">
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

      <Section title="Password">
        <ToggleRow
          label="Lock the merged PDF with a password"
          hint="It will be asked for whenever the file is opened. Strong encryption (AES-256) is used."
          checked={settings.protect}
          onCheckedChange={(protect) => update({ protect })}
        />
        {settings.protect && (
          <>
            <div>
              <label
                htmlFor={`${ids}-password`}
                className="mb-2 block text-sm font-medium"
              >
                Password to open the file
              </label>
              <Input
                id={`${ids}-password`}
                type="password"
                autoComplete="new-password"
                value={settings.password}
                onChange={(event) => update({ password: event.target.value })}
                aria-describedby={`${ids}-password-hint`}
              />
              <p
                id={`${ids}-password-hint`}
                className="mt-2 text-xs text-muted-foreground"
              >
                Keep it somewhere safe: a lost password cannot be recovered. It
                is not stored or sent anywhere.
              </p>
            </div>
            <ToggleRow
              label="Allow printing"
              checked={settings.allowPrint}
              onCheckedChange={(allowPrint) => update({ allowPrint })}
            />
            <ToggleRow
              label="Allow copying text and pictures"
              checked={settings.allowCopy}
              onCheckedChange={(allowCopy) => update({ allowCopy })}
            />
            <ToggleRow
              label="Allow changes"
              hint="Editing, notes, filling in fields and rearranging pages."
              checked={settings.allowChanges}
              onCheckedChange={(allowChanges) => update({ allowChanges })}
            />
            {!(
              settings.allowPrint &&
              settings.allowCopy &&
              settings.allowChanges
            ) && (
              <div>
                <label
                  htmlFor={`${ids}-owner`}
                  className="mb-2 block text-sm font-medium"
                >
                  Second password, to lift these limits (optional)
                </label>
                <Input
                  id={`${ids}-owner`}
                  type="password"
                  autoComplete="new-password"
                  value={settings.ownerPassword}
                  onChange={(event) =>
                    update({ ownerPassword: event.target.value })
                  }
                  aria-describedby={`${ids}-owner-hint`}
                />
                <p
                  id={`${ids}-owner-hint`}
                  className="mt-2 text-xs text-muted-foreground"
                >
                  Left empty, a random one is used and thrown away, so the
                  limits cannot be lifted. Viewers are asked to respect these
                  limits; not every program does.
                </p>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  )
}
