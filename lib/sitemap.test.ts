import { describe, expect, it } from "vitest"
import { posts } from "./blog"
import { tools } from "./catalogue"
import { families } from "./landing"
import { groupUpdated, pageUpdated, sitemapEntries } from "./sitemap"

const paths = () => sitemapEntries().map((entry) => entry.path)

describe("the sitemap", () => {
  it("lists every public page once, the home page first", () => {
    const listed = paths()
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed[0]).toBe("/")
    for (const page of Object.keys(pageUpdated)) expect(listed).toContain(page)
    expect(listed).toContain("/blog/")
    for (const post of posts) expect(listed).toContain(`/blog/${post.slug}/`)
    for (const tool of tools)
      expect(listed.includes(`/dashboard/${tool.id}/`)).toBe(
        tool.status === "available"
      )
    // Pages kept out of search are not listed.
    expect(listed).not.toContain("/design-system/")
  })

  it("dates every group of tools and every page, never later than today", () => {
    expect(Object.keys(groupUpdated).sort()).toEqual(
      families.map((family) => family.id).sort()
    )
    const today = new Date().toISOString().slice(0, 10)
    for (const entry of sitemapEntries()) {
      expect(entry.lastModified, entry.path).toMatch(/^\d{4}-\d{2}-\d{2}/)
      expect(entry.lastModified.slice(0, 10) <= today, entry.path).toBe(true)
    }
  })

  it("dates the blog by its newest article and lists each article's picture", () => {
    const entries = sitemapEntries()
    const articles = entries.filter((entry) => /^\/blog\/.+\//.test(entry.path))
    const newest = articles
      .map((entry) => entry.lastModified)
      .sort()
      .at(-1)!
    expect(entries.find((entry) => entry.path === "/blog/")!.lastModified).toBe(
      newest.slice(0, 10)
    )
    for (const post of posts)
      expect(
        entries.find((entry) => entry.path === `/blog/${post.slug}/`)!.images
      ).toEqual([post.image])
    // Pages other than articles name no pictures.
    expect(
      entries.filter((entry) => entry.images && !articles.includes(entry))
    ).toEqual([])
  })
})
