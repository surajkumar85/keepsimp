"use client"

import type { ComponentProps } from "react"
import { cn } from "cn"

/** Native light dismissal and focus order, without synthetic focus guards. */
function PopoverContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      popover="auto"
      role="dialog"
      data-slot="popover-content"
      className={cn(
        // Never animate opacity: iPhone Safari must be able to touch-scroll.
        "fixed inset-auto top-16 right-4 m-0 hidden max-h-[calc(100dvh-5rem)] w-88 max-w-[calc(100vw-2rem)] origin-top-right flex-col overflow-hidden rounded-xl border bg-popover p-0 text-sm text-popover-foreground shadow-md transition-transform duration-150 outline-none motion-reduce:transition-none md:right-6 starting:scale-95 [&:popover-open]:flex",
        className
      )}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn("font-heading text-base font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
}

export { PopoverContent, PopoverTitle, PopoverDescription }
