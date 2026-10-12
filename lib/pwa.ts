import type { MetadataRoute } from "next"
import { listed } from "@/lib/catalogue"

/**
 * sRGB exports of the light and dark `background` tokens. A web manifest and
 * the theme-color tag cannot read CSS variables, so these literals live here
 * and nowhere else in product code. See docs/design-system.md.
 */
export const themeColors = { light: "#ffffff", dark: "#0a0a0a" } as const

const icon = (name: string, size: number, purpose: "any" | "maskable") => ({
  src: `/icons/${name}`,
  sizes: `${size}x${size}`,
  type: "image/png",
  purpose,
})

/** What a phone needs to install KeepSimp to the home screen. */
export function webManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KeepSimp",
    short_name: "KeepSimp",
    description:
      "Free tools that work in your browser. No account and no file uploads.",
    lang: "en",
    dir: "ltr",
    // Installed, KeepSimp opens on the tools rather than the marketing page.
    start_url: "/dashboard/",
    scope: "/",
    display: "standalone",
    background_color: themeColors.light,
    theme_color: themeColors.light,
    categories: ["utilities", "productivity"],
    icons: [
      icon("icon-192.png", 192, "any"),
      icon("icon-512.png", 512, "any"),
      icon("icon-maskable-192.png", 192, "maskable"),
      icon("icon-maskable-512.png", 512, "maskable"),
    ],
    // Long-pressing the icon offers the working tools; planned ones stay
    // out, and so do the doors into a tool that is already there.
    shortcuts: listed
      .filter((tool) => tool.status === "available")
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        url: `/dashboard/${tool.id}/`,
        icons: [icon("icon-192.png", 192, "any")],
      })),
  }
}
