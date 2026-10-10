"use client"
import { Tabs } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

export const WorkspaceTabs = Tabs.Root
export function WorkspaceTabList({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <Tabs.List
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-xl border bg-muted/40 p-1"
    >
      {children}
    </Tabs.List>
  )
}
export function WorkspaceTab({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  return (
    <Tabs.Tab
      value={value}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:h-9 data-active:bg-background data-active:text-foreground [&_svg]:size-4"
    >
      {children}
    </Tabs.Tab>
  )
}
export function WorkspaceTabPanel({
  value,
  children,
  className,
}: {
  value: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Tabs.Panel
      keepMounted
      value={value}
      className={cn(
        "min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {children}
    </Tabs.Panel>
  )
}
