import type { MetadataRoute } from "next"
import { posts } from "@/lib/blog"
import { tools } from "@/lib/catalogue"
import { absoluteUrl, site } from "@/lib/site"

export const dynamic = "force-static"
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/dashboard/",
    "/dashboard/agents/",
    "/blog/",
    "/privacy/",
    ...posts.map((post) => `/blog/${post.slug}/`),
    ...tools
      .filter((tool) => tool.status === "available")
      .map((tool) => `/dashboard/${tool.id}/`),
  ].map((path) => {
    const article = posts.find((post) => path === `/blog/${post.slug}/`)
    return {
      url: absoluteUrl(path),
      lastModified:
        article?.modified ??
        article?.published ??
        (path === "/dashboard/color-utility/"
          ? "2026-10-13T00:00:00+05:30"
          : site.updated),
    }
  })
}
