import { describe, expect, it } from "vitest"
import { posts } from "./blog"
import { tools } from "./catalogue"

const ready = tools.filter((tool) => tool.status === "available")
const slugs = new Set(posts.map((post) => post.slug))

describe("the blog", () => {
  it("gives every article an address of its own", () => {
    expect(slugs.size).toBe(posts.length)
    for (const post of posts) expect(post.slug).toMatch(/^[a-z0-9-]+$/)
  })

  it("has an article for every tool that is ready", () => {
    for (const tool of ready)
      expect(
        posts.some((post) => post.tool === tool.id),
        tool.name
      ).toBe(true)
  })

  it("only sends readers to tools that are ready", () => {
    for (const post of posts)
      if (post.tool)
        expect(
          ready.some((tool) => tool.id === post.tool),
          `${post.slug}: ${post.tool}`
        ).toBe(true)
  })

  it("links only to pages of the site that exist, or to pages elsewhere", () => {
    for (const post of posts)
      for (const section of post.sections)
        for (const link of section.links ?? []) {
          const where = `${post.slug}: ${link.href}`
          if (link.href.startsWith("/blog/"))
            expect(slugs.has(link.href.slice(6, -1)), where).toBe(true)
          else if (link.href.startsWith("/dashboard/") && link.href.length > 11)
            expect(
              ready.some((tool) => link.href === `/dashboard/${tool.id}/`),
              where
            ).toBe(true)
          else
            expect(link.href, where).toMatch(
              /^(\/dashboard\/|\/privacy\/|\/|https:\/\/.+)$/
            )
          expect(link.label.length, where).toBeGreaterThan(8)
        }
  })

  it("says what each article is about, in the words people search with", () => {
    for (const post of posts) {
      expect(post.searchTitle, post.slug).toBeTruthy()
      // Longer titles are cut off in search results.
      expect(post.searchTitle!.length, post.slug).toBeLessThanOrEqual(70)
      expect(post.description.length, post.slug).toBeGreaterThan(80)
      expect(post.description.length, post.slug).toBeLessThanOrEqual(200)
      expect(post.keywords?.length ?? 0, post.slug).toBeGreaterThanOrEqual(5)
      expect(new Set(post.keywords).size, post.slug).toBe(post.keywords!.length)
    }
  })

  it("names its sections apart, so the list of contents can jump to each", () => {
    for (const post of posts) {
      const ids = post.sections.map((section) => section.id)
      expect(new Set(ids).size, post.slug).toBe(ids.length)
      expect(post.sections.length, post.slug).toBeGreaterThanOrEqual(3)
      expect(post.sources.length, post.slug).toBeGreaterThan(0)
    }
  })

  it("has one article that goes through every tool", () => {
    const overview = posts.find((post) => !post.tool)!
    for (const tool of ready)
      expect(
        overview.sections.some((section) =>
          section.links?.some((link) => link.href === `/dashboard/${tool.id}/`)
        ),
        tool.name
      ).toBe(true)
  })
})
