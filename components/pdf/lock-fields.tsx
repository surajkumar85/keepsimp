"use client"

import { useId } from "react"
import { ToggleRow } from "@/components/image-batch/controls"
import { Input } from "@/components/ui/input"

/** What a password on a result is made of. */
export interface LockSettings {
  protect: boolean
  password: string
  ownerPassword: string
  allowPrint: boolean
  allowCopy: boolean
  allowChanges: boolean
}

/**
 * The switch that locks a result with a password, and, once it is on, the
 * password, what a reader may do, and a second password that lifts those
 * limits. Passwords are never stored.
 */
export function LockFields({
  settings,
  update,
  label,
}: {
  settings: LockSettings
  update: (change: Partial<LockSettings>) => void
  /** What the switch says, such as "Lock the merged PDF with a password". */
  label: string
}) {
  const ids = useId()
  return (
    <>
      <ToggleRow
        label={label}
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
              Keep it somewhere safe: a lost password cannot be recovered. It is
              not stored or sent anywhere.
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
                Left empty, a random one is used and thrown away, so the limits
                cannot be lifted. Viewers are asked to respect these limits; not
                every program does.
              </p>
            </div>
          )}
        </>
      )}
    </>
  )
}
