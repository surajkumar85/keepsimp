"use client"

import { useId, useState } from "react"
import { usePathname } from "next/navigation"
import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconRotate,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"
import { cn } from "cn"

/**
 * Whether each group of settings was left open or closed, kept for each
 * page while the site is open, so that choosing another file, or a panel
 * drawn again, does not fold away what someone opened; another door into
 * the same tool starts with its own groups open.
 */
const remembered = new Map<string, boolean>()

/**
 * A group of settings that folds away. Folded, it still says what it is
 * set to (`summary`) and whether anything in it differs from the usual
 * (`changed`), so nothing that will be done to a file is out of sight.
 * Open from the start unless `defaultOpen` is false: the groups people
 * reach for first stay open, the rest wait under their summaries.
 */
export function Section({
  title,
  children,
  summary,
  changed = false,
  onReset,
  defaultOpen = true,
  id: key,
}: {
  title: string
  children: React.ReactNode
  /** The group's settings in a few words, shown while it is folded. */
  summary?: string
  /** Something in the group differs from the usual. */
  changed?: boolean
  /** Puts the group's settings back to the usual; offered while it is changed. */
  onReset?: () => void
  defaultOpen?: boolean
  /** What the open state is remembered by, when the title is not unique on the page. */
  id?: string
}) {
  const memory = `${usePathname()}:${key ?? title}`
  const [open, setOpen] = useState(() => remembered.get(memory) ?? defaultOpen)
  const panel = useId()
  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        remembered.set(memory, next)
        setOpen(next)
      }}
      render={<section />}
      data-slot="settings-section"
      data-changed={changed || undefined}
      className="border-t first:border-t-0"
    >
      <div className="flex items-start gap-1">
        <h3 className="min-w-0 flex-1">
          <CollapsibleTrigger
            className="group/section flex min-h-12 w-full items-center gap-3 rounded-md py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-11"
            aria-controls={panel}
            // Named by its title alone, so the heading keeps its name.
            aria-label={title}
            // Its mark and summary, though hidden from reading in place, are read as its description.
            aria-describedby={
              [
                changed && `${panel}-changed`,
                summary && !open && `${panel}-summary`,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2" aria-hidden="true">
                <span className="font-heading text-base font-medium">
                  {title}
                </span>
                {changed && (
                  <span
                    id={`${panel}-changed`}
                    className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"
                  >
                    <span
                      className="size-1.5 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    Changed
                  </span>
                )}
              </span>
              {summary && !open && (
                <span
                  className="mt-0.5 block truncate text-sm font-normal text-muted-foreground"
                  id={`${panel}-summary`}
                  data-slot="settings-summary"
                  aria-hidden="true"
                >
                  {summary}
                </span>
              )}
            </span>
            <IconChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open/section:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
        </h3>
        {onReset && changed && open && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2.5 h-11 text-muted-foreground md:h-7"
            onClick={onReset}
            aria-label={`Reset ${title.toLowerCase()}`}
          >
            <IconRotate aria-hidden="true" />
            Reset
          </Button>
        )}
      </div>
      {/* Folded settings stay in the page, so their state is kept and the browser's find can open them. */}
      <CollapsibleContent
        id={panel}
        hiddenUntilFound
        className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden"
      >
        <div className="space-y-4 pt-1 pb-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Where a tool's settings stand: being taken up, or taken up. */
export type SettingsState = "idle" | "pending" | "done"

/**
 * The card that holds a tool's settings. Its head says at once that a
 * change was seen and is being taken up ("Applying…"), then that it was
 * ("Up to date"), with a count of what differs from the usual and one
 * button to put it all back. From 1024px it stays in view beside the
 * file and scrolls by itself.
 */
export function SettingsCard({
  title = "Settings",
  state = "idle",
  pendingText = "Applying your changes…",
  doneText = "Up to date",
  changed = 0,
  onResetAll,
  children,
  className,
  sticky = true,
}: {
  title?: string
  state?: SettingsState
  pendingText?: string
  doneText?: string
  /** How many groups differ from the usual. */
  changed?: number
  onResetAll?: () => void
  children: React.ReactNode
  className?: string
  sticky?: boolean
}) {
  return (
    <div
      data-slot="settings-card"
      className={cn(
        "rounded-xl border bg-card",
        sticky &&
          "lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:overscroll-contain",
        className
      )}
    >
      <div
        className={cn(
          "z-10 flex min-h-14 items-center gap-3 rounded-t-xl border-b bg-card px-4 py-2",
          // Its head stays at the top while the card scrolls by itself.
          sticky && "lg:sticky lg:top-0"
        )}
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base font-medium">{title}</h2>
          {/* Read out as it changes; not a "status" of its own, so a page's own status stays the one. */}
          <p
            aria-live="polite"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            data-slot="settings-state"
            data-state={state}
          >
            {state === "pending" ? (
              <>
                <IconLoader2
                  className="size-3.5 animate-spin text-primary motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {pendingText}
              </>
            ) : state === "done" ? (
              <>
                <IconCheck
                  className="size-3.5 text-primary"
                  aria-hidden="true"
                />
                {doneText}
              </>
            ) : changed > 0 ? (
              `${changed} ${changed === 1 ? "group" : "groups"} changed`
            ) : (
              "The usual settings"
            )}
          </p>
        </div>
        {onResetAll && changed > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-11 md:h-8"
            onClick={onResetAll}
          >
            <IconRotate aria-hidden="true" />
            Reset all
          </Button>
        )}
      </div>
      <div className="px-4 pb-1">{children}</div>
    </div>
  )
}

export function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5"
      />
    </div>
  )
}
