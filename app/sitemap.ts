import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/site"
import { sitemapEntries } from "@/lib/sitemap"

export const dynamic = "force-static"
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map(({ path, lastModified, images }) => ({
    url: absoluteUrl(path),
    lastModified,
    ...(images && { images: images.map((image) => absoluteUrl(image)) }),
  }))
}
