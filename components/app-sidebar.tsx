"use client"

import Link from "next/link"
import { BrandLogo } from "@/components/brand-logo"
import { usePathname, useSearchParams } from "next/navigation"
import { IconLock, IconPalette, IconX } from "@tabler/icons-react"
import { categories, isActivePath, parseCategory, tools } from "@/lib/catalogue"
import { CategoryIcon } from "@/components/category-icon"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

// sidebar-01's single panel and grouped menu, adapted to KeepSimp.
export function AppSidebar() {
  const pathname = usePathname()
  const activeCategory = parseCategory(useSearchParams().get("category"))
  const { setOpenMobile } = useSidebar()
  const closeMobile = () => setOpenMobile(false)
  return (
    <Sidebar
      collapsible="offcanvas"
      className="group-data-[collapsible=offcanvas]:pointer-events-none group-data-[collapsible=offcanvas]:invisible"
    >
      <SidebarHeader className="h-14 justify-center border-b px-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            aria-label="KeepSimp home"
            onClick={closeMobile}
            className="flex min-h-11 items-center gap-2 font-heading text-base font-semibold tracking-tight md:min-h-9"
          >
            <BrandLogo />
          </Link>
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              onClick={closeMobile}
            >
              <IconX aria-hidden="true" />
            </Button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="p-3">
          <p className="px-2 py-2 text-xs font-medium text-muted-foreground">
            Tools
          </p>
          <SidebarGroupContent>
            <nav aria-label="Tool categories">
              <SidebarMenu className="gap-1">
                {categories.map((category) => (
                  <SidebarMenuItem key={category.id}>
                    <SidebarMenuButton
                      render={
                        <Link
                          href={
                            category.id === "all"
                              ? "/dashboard/"
                              : `/dashboard/?category=${category.id}`
                          }
                        />
                      }
                      onClick={closeMobile}
                      aria-current={
                        isActivePath(pathname, "/dashboard") &&
                        activeCategory === category.id
                          ? "page"
                          : undefined
                      }
                      isActive={
                        isActivePath(pathname, "/dashboard") &&
                        activeCategory === category.id
                      }
                      className="h-11 gap-2.5 px-2.5 md:h-9 data-active:bg-primary/10 data-active:text-sidebar-accent-foreground"
                    >
                      <CategoryIcon
                        category={category.id}
                        className="size-4.5"
                        colourful
                      />
                      <span>{category.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {category.id === "all"
                          ? tools.length
                          : tools.filter(
                              (tool) => tool.category === category.id
                            ).length}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/design-system/" />}
              onClick={closeMobile}
              aria-current={
                isActivePath(pathname, "/design-system") ? "page" : undefined
              }
              isActive={isActivePath(pathname, "/design-system")}
              className="h-11 gap-2.5 px-2.5 md:h-9"
            >
              <IconPalette className="size-4.5" aria-hidden="true" />
              <span>Design reference</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="flex items-center gap-2 px-2.5 text-xs text-muted-foreground">
          <IconLock className="size-3.5" aria-hidden="true" /> Free. Private. No
          account.
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
