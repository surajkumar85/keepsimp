import { expect, it } from "vitest"
import { listed } from "./catalogue"
import { themeColors, webManifest } from "./pwa"

it("describes an installable app that opens on the tools", () => {
  const manifest = webManifest()
  expect(manifest).toMatchObject({
    id: "/",
    name: "KeepSimp",
    short_name: "KeepSimp",
    start_url: "/dashboard/",
    scope: "/",
    display: "standalone",
    background_color: themeColors.light,
    theme_color: themeColors.light,
  })
  expect(manifest.start_url!.startsWith(manifest.scope!)).toBe(true)
})

it("offers the sizes launchers need, as plain and maskable icons", () => {
  const icons = webManifest().icons!
  for (const purpose of ["any", "maskable"])
    expect(
      icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes)
    ).toEqual(["192x192", "512x512"])
  for (const icon of icons) {
    expect(icon.type).toBe("image/png")
    expect(icon.src).toMatch(/^\/icons\/[a-z0-9-]+\.png$/)
  }
})

it("lists only working tools as shortcuts", () => {
  const shortcuts = webManifest().shortcuts!
  // Every tool once: a door into a tool is not a shortcut beside it.
  const available = listed.filter((tool) => tool.status === "available")
  expect(shortcuts.map((shortcut) => shortcut.url)).toEqual(
    available.map((tool) => `/dashboard/${tool.id}/`)
  )
  expect(shortcuts).toHaveLength(12)
  expect(shortcuts.map((shortcut) => shortcut.name)).not.toContain(
    "PDF annotator"
  )
  expect(shortcuts.map((shortcut) => shortcut.name)).not.toContain(
    "Video converter"
  )
  for (const shortcut of shortcuts) expect(shortcut.icons).toHaveLength(1)
})
