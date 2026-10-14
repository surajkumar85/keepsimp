"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SHORTCUTS } from "@/lib/pdf-editor/shortcuts"

const keyClass =
  "inline-flex h-6 min-w-6 items-center justify-center rounded-sm border bg-muted px-1.5 font-mono text-xs text-foreground"

/** The editor's keys, as a sheet: opened with `?` or its button. */
export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[85dvh] max-w-2xl overflow-y-auto"
        data-testid="editor-shortcuts"
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            A letter on its own works when the keyboard is not in a field. Press
            ? to see these again.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {SHORTCUTS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-2 font-heading text-sm font-medium">
                {group.title}
              </h3>
              <dl className="space-y-1.5 text-sm">
                {group.shortcuts.map((one) => (
                  <div
                    key={`${one.keys.join("+")} ${one.does}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <dt className="text-muted-foreground">{one.does}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {one.keys.map((key) => (
                        <kbd key={key} className={keyClass}>
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
