"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { IconMoon, IconSun } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

const subscribe = () => () => {}
export function ThemeToggle() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
  const { resolvedTheme, setTheme } = useTheme()
  const dark = mounted && resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <IconSun aria-hidden="true" /> : <IconMoon aria-hidden="true" />}
    </Button>
  )
}
