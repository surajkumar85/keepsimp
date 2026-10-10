"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"
import { themeColors } from "@/lib/pwa"

/**
 * The theme-color tags follow the system setting. When someone picks a theme
 * by hand, point them at that theme so the phone's status bar matches the app.
 */
export function ThemeColor() {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return
    for (const tag of document.querySelectorAll('meta[name="theme-color"]'))
      tag.setAttribute("content", themeColors[resolvedTheme])
  }, [resolvedTheme])
  return null
}
