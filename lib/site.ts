import type { Metadata } from "next"

export const site = {
  name: "KeepSimp",
  origin: (
    process.env.NEXT_PUBLIC_SITE_URL || "https://keepsimp.vercel.app"
  ).replace(/\/$/, ""),
  updated: "2026-10-10T00:00:00+05:30",
}

export function absoluteUrl(path: string) {
  return new URL(path, `${site.origin}/`).toString()
}

export function pageMetadata(
  title: string,
  description: string,
  path: string,
  image = "/images/social/keepsimp.png"
): Metadata {
  const preview = {
    url: absoluteUrl(image),
    width: 1200,
    height: 630,
    alt: `${title} — KeepSimp`,
  }
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    robots:
      process.env.VERCEL_ENV === "preview"
        ? { index: false, follow: false }
        : { index: true, follow: true },
    openGraph: {
      title: `${title} | KeepSimp`,
      description,
      url: absoluteUrl(path),
      siteName: site.name,
      locale: "en_US",
      type: "website",
      images: [preview],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | KeepSimp`,
      description,
      images: [preview.url],
    },
  }
}

export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
