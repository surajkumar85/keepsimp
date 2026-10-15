"use client"

import { Suspense } from "react"
import Link from "next/link"
import type { CSSProperties } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { ToolSearch } from "@/components/tool-search"
import { MemoryUsage } from "@/components/memory-usage"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export function AppShell({ children }: { children: React.ReactNode }) {
  const designPage = usePathname().startsWith("/design-system")
  return (
    <TooltipProvider delay={250}>
      <a href="#main-content" className="skip-link" tabIndex={0}>
        Skip to content
      </a>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "var(--layout-sidebar)",
          } as CSSProperties
        }
      >
        <Suspense
          fallback={
            <div
              className="hidden w-56 shrink-0 border-r bg-sidebar md:block"
              aria-hidden="true"
            />
          }
        >
          <AppSidebar />
        </Suspense>
        <SidebarInset className="min-w-0">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:gap-3 md:px-6">
            {/* The sides are equally wide from 640px, so the search sits in the middle. */}
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-24 sm:basis-0 md:min-w-20">
              <SidebarTrigger />
              <span className="truncate text-sm font-medium">
                {designPage ? "Design reference" : "Discover tools"}
              </span>
            </div>
            <div className="flex justify-end sm:w-full sm:max-w-sm sm:justify-center">
              <ToolSearch />
            </div>
            <div className="flex items-center justify-end gap-1 sm:flex-1 sm:basis-0 sm:gap-2">
              <span className="hidden text-xs text-muted-foreground xl:block">
                Free. Simple. Yours.
              </span>
              <MemoryUsage />
              <ThemeToggle />
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-4 text-xs text-muted-foreground md:px-6">
            <span>KeepSimp · A little less complicated.</span>
            <Link href="/blog/" className="underline underline-offset-4">
              Tips from the blog
            </Link>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
