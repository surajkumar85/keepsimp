"use client"

import type * as React from "react"
import { Toast } from "@base-ui/react/toast"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader2,
  IconX,
} from "@tabler/icons-react"
import { cn } from "cn"

/**
 * One manager for the whole workspace, so a tool, a worker callback or a
 * plain function can say what just happened without holding a hook.
 */
const manager = Toast.createToastManager()

type Kind = "success" | "error" | "info" | "loading"

interface Said {
  description?: React.ReactNode
  /** Milliseconds before it goes; 0 keeps it until it is closed. */
  timeout?: number
  /** A button in the toast, such as "Undo". */
  action?: { label: string; onClick: () => void }
}

function add(type: Kind, title: React.ReactNode, said: Said = {}) {
  return manager.add({
    type,
    title,
    description: said.description,
    // One with a button waits to be closed, so it can be reached from the keyboard.
    timeout: said.timeout ?? (said.action ? 0 : type === "error" ? 8000 : 4000),
    // An error interrupts; anything else waits for a pause.
    priority: type === "error" ? "high" : "low",
    actionProps: said.action
      ? { children: said.action.label, onClick: said.action.onClick }
      : undefined,
  })
}

/** What a tool says after something is done to a file: shown briefly in the corner and read out politely. */
export const toast = {
  success: (title: React.ReactNode, said?: Said) => add("success", title, said),
  error: (title: React.ReactNode, said?: Said) => add("error", title, said),
  info: (title: React.ReactNode, said?: Said) => add("info", title, said),
  /** Work that has started; give its id to `done` or `close` when it ends. */
  loading: (title: React.ReactNode, said?: Said) =>
    add("loading", title, { timeout: 0, ...said }),
  /** Turns a toast (a loading one, say) into another kind. */
  update: (id: string, type: Kind, title: React.ReactNode, said: Said = {}) =>
    manager.update(id, {
      type,
      title,
      description: said.description,
      timeout: said.timeout ?? (type === "loading" ? 0 : 4000),
      priority: type === "error" ? "high" : "low",
    }),
  close: (id: string) => manager.close(id),
}

const ICONS: Record<Kind, React.ReactNode> = {
  success: <IconCircleCheck className="text-primary" aria-hidden="true" />,
  error: <IconAlertTriangle className="text-destructive" aria-hidden="true" />,
  info: <IconInfoCircle className="text-muted-foreground" aria-hidden="true" />,
  loading: (
    <IconLoader2
      className="animate-spin text-primary motion-reduce:animate-none"
      aria-hidden="true"
    />
  ),
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((item) => (
    <Toast.Root
      key={item.id}
      toast={item}
      data-testid="toast"
      // A note in a corner, not a window: a labelled group, so a page's own
      // window stays the only one. Base UI reads it out from its live region.
      render={(props) => <div {...props} role="group" aria-modal={undefined} />}
      className={cn(
        // A stack that opens out under the pointer or the keyboard; it slides in and never fades in.
        "absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-xl border bg-popover text-popover-foreground shadow-md select-none",
        "[--gap:0.5rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.06)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-ending-style:opacity-0 data-limited:opacity-0 data-starting-style:[transform:translateY(150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "[transition:transform_200ms_cubic-bezier(0.22,1,0.36,1),opacity_200ms,height_150ms] motion-reduce:transition-none"
      )}
    >
      <Toast.Content className="flex items-start gap-3 overflow-hidden p-3 pr-2 transition-opacity duration-200 data-behind:opacity-0 data-expanded:opacity-100 motion-reduce:transition-none [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0">
        {ICONS[(item.type as Kind) ?? "info"] ?? ICONS.info}
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* Not a heading, so a page's own window keeps the only heading. */}
          <Toast.Title render={<p />} className="text-sm font-medium" />
          {item.description && (
            <Toast.Description className="text-sm text-muted-foreground" />
          )}
        </div>
        {item.actionProps && (
          <Toast.Action className="inline-flex h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8" />
        )}
        {/* A button of our own: Base UI's hides itself from screen readers
            while the stack is closed, though it can still be reached. */}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => manager.close(item.id)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8 [&_svg]:size-4"
        >
          <IconX aria-hidden="true" />
        </button>
      </Toast.Content>
    </Toast.Root>
  ))
}

/** Where toasts appear: the bottom of the screen on a phone, its bottom right from 640px. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={manager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 z-60 w-[calc(100vw-2rem)] outline-none sm:right-6 sm:bottom-6 sm:w-90">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
