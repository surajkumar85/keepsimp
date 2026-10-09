import type { MetadataRoute } from "next"
import { posts } from "@/lib/blog"
import { tools } from "@/lib/catalogue"
import { absoluteUrl, site } from "@/lib/site"

export const dynamic = "force-static"
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/dashboard/",
    "/blog/",
    "/privacy/",
    ...posts.map((post) => `/blog/${post.slug}/`),
    ...tools
      .filter((tool) => tool.status === "available")
      .map((tool) => `/dashboard/${tool.id}/`),
  ].map((path) => ({ url: absoluteUrl(path), lastModified: site.updated }))
}
