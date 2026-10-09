import Link from "next/link"
import { IconArrowUpRight, IconLock, IconHeart } from "@tabler/icons-react"
import { BrandLogo } from "@/components/brand-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { buttonVariants } from "@/components/ui/button"

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-shell">
      <a href="#main-content" className="skip-link" tabIndex={0}>
        Skip to content
      </a>
      <header className="marketing-header sticky top-0 z-40 border-b bg-background/95 backdrop-blur-md">
        <div className="marketing-container flex h-18 items-center justify-between gap-3">
          <Link
            prefetch={false}
            href="/"
            aria-label="KeepSimp home"
            className="flex min-h-11 shrink-0 items-center"
          >
            <BrandLogo />
          </Link>
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-7 text-sm md:flex"
          >
            <Link prefetch={false} href="/#tools" className="nav-link">
              The tools
            </Link>
            <Link prefetch={false} href="/#how-it-works" className="nav-link">
              How it works
            </Link>
            <Link prefetch={false} href="/blog/" className="nav-link">
              The journal
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              prefetch={false}
              href="/dashboard/"
              className={buttonVariants({ className: "min-h-11 gap-2 px-3" })}
            >
              Open tools{" "}
              <IconArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <footer className="border-t bg-marketing-surface">
        <div className="marketing-container py-10">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div>
              <Link
                prefetch={false}
                href="/"
                aria-label="KeepSimp home"
                className="inline-flex min-h-11 items-center"
              >
                <BrandLogo />
              </Link>
              <p className="mt-3 text-sm text-muted-foreground">
                A little less complicated.
              </p>
            </div>
            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm"
            >
              <Link prefetch={false} href="/dashboard/" className="nav-link">
                All tools
              </Link>
              <Link prefetch={false} href="/blog/" className="nav-link">
                Journal
              </Link>
              <Link prefetch={false} href="/privacy/" className="nav-link">
                Privacy
              </Link>
              <Link
                prefetch={false}
                href="/design-system/"
                className="nav-link"
              >
                Design reference
              </Link>
            </nav>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-5 text-xs text-muted-foreground">
            <span>© 2026 KeepSimp. Built to keep things simple.</span>
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5">
                <IconHeart className="size-3.5" aria-hidden="true" /> Always
                free
              </span>
              <span className="flex items-center gap-1.5">
                <IconLock className="size-3.5" aria-hidden="true" /> Files stay
                with you
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
