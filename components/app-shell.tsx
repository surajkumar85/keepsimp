"use client"

import { Suspense } from "react"
import Link from "next/link"
import type { CSSProperties } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
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
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-6">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="text-sm font-medium">
                {designPage ? "Design reference" : "Discover tools"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:block">
                Free. Simple. Yours.
              </span>
              <ThemeToggle />
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-4 text-xs text-muted-foreground md:px-6">
            <span>KeepSimp · A little less complicated.</span>
            <Link href="/blog/" className="underline underline-offset-4">
              Tips from the journal
            </Link>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
