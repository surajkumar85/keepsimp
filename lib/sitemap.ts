/**
 * Every public page for search engines, with the day each last changed in
 * a way a reader would see. Search engines trust these dates only while
 * they are true, so a date is never the day of the build: when a tool's
 * page changes, change its group's date here.
 */

import { posts } from "@/lib/blog"
import { tools } from "@/lib/catalogue"
import { families } from "@/lib/landing"
import { site } from "@/lib/site"

/** The day each group of tool pages (`lib/landing.ts`) last changed. */
export const groupUpdated: Record<string, string> = {
  pdf: "2026-10-24",
  images: "2026-10-24",
  video: "2026-10-24",
  audio: "2026-10-24",
  markdown: "2026-10-24",
  developer: "2026-10-24",
}

/** The day each page that is not a tool or an article last changed. */
export const pageUpdated: Record<string, string> = {
  "/": "2026-10-24",
  "/dashboard/": "2026-10-24",
  "/dashboard/agents/": "2026-10-24",
  "/privacy/": "2026-10-24",
}

export interface SitemapEntry {
  path: string
  /** A day (YYYY-MM-DD) or a moment in ISO 8601. */
  lastModified: string
  /** Pictures shown on the page, by their paths. */
  images?: string[]
}

const postDate = (post: (typeof posts)[number]) =>
  post.modified ?? post.published ?? site.updated

/** The pages, the home page first, then the blog, its articles and the tools. */
export function sitemapEntries(): SitemapEntry[] {
  const groupOf = new Map(
    families.flatMap((family) =>
      [family.lead, ...family.members].map((id) => [id, family.id])
    )
  )
  const newest = posts.map(postDate).sort().at(-1)!
  return [
    ...["/", "/dashboard/", "/dashboard/agents/"].map((path) => ({
      path,
      lastModified: pageUpdated[path],
    })),
    { path: "/blog/", lastModified: newest.slice(0, 10) },
    { path: "/privacy/", lastModified: pageUpdated["/privacy/"] },
    ...posts.map((post) => ({
      path: `/blog/${post.slug}/`,
      lastModified: postDate(post),
      images: [post.image],
    })),
    ...tools
      .filter((tool) => tool.status === "available")
      .map((tool) => ({
        path: `/dashboard/${tool.id}/`,
        lastModified: groupUpdated[groupOf.get(tool.id)!],
      })),
  ]
}
