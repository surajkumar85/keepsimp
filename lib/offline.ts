import { posts } from "@/lib/blog"
import { tools } from "@/lib/catalogue"
import { shouldPrecache } from "@/service-worker/rules.js"

/** Every page of the site, as its address. Each is a folder with an index.html in the export. */
export function pagePaths(): string[] {
  return [
    "/",
    "/dashboard/",
    "/design-system/",
    "/blog/",
    "/privacy/",
    ...posts.map((post) => `/blog/${post.slug}/`),
    ...tools
      .filter((tool) => tool.status === "available")
      .map((tool) => `/dashboard/${tool.id}/`),
  ]
}

/** Files Next.js writes at the site root itself, which a visitor's browser asks for. */
const GENERATED = ["/favicon.ico", "/manifest.webmanifest"]

/**
 * The addresses saved for offline use.
 * @param buildFiles Paths relative to `.next/static`, such as "chunks/app.js".
 * @param publicFiles Paths relative to `public`, such as "images/coastline.jpg".
 */
export function offlineFiles(
  buildFiles: readonly string[],
  publicFiles: readonly string[]
): string[] {
  return [
    ...new Set([
      ...pagePaths(),
      ...GENERATED,
      ...buildFiles.map((file) => `/_next/static/${file}`),
      ...publicFiles.filter(shouldPrecache).map((file) => `/${file}`),
    ]),
  ].sort()
}

/**
 * The finished service worker: the release's file list, the shared rules and
 * the worker body, as one classic script.
 * @param rules Text of service-worker/rules.js.
 * @param body Text of service-worker/sw.js.
 */
export function workerScript(
  version: string,
  files: readonly string[],
  rules: string,
  body: string
): string {
  return [
    '"use strict";',
    "(() => {",
    `const VERSION = ${JSON.stringify(version)};`,
    `const PRECACHE = ${JSON.stringify(files)};`,
    // A worker script has no modules, so the rules lose their export keywords.
    rules.replace(/^export /gm, ""),
    body,
    "})();",
    "",
  ].join("\n")
}
