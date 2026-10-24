import { expect, it, vi } from "vitest"
import { absoluteUrl, jsonLd, pageMetadata } from "./site"

it("uses the real deployment origin for canonical and sharing metadata", () => {
  expect(absoluteUrl("/blog/")).toBe("https://www.keepsimp.com/blog/")
  const metadata = pageMetadata("A guide", "Helpful words", "/blog/a-guide/")
  expect(metadata.alternates?.canonical).toBe(
    "https://www.keepsimp.com/blog/a-guide/"
  )
  expect(metadata.description).toBe("Helpful words")
})
it("prevents script termination inside JSON-LD", () => {
  const data = { text: "</script><script>bad()</script>" }
  const encoded = jsonLd(data)
  expect(encoded).not.toContain("<")
  expect(JSON.parse(encoded)).toEqual(data)
})
it("marks Vercel preview builds as noindex", () => {
  vi.stubEnv("VERCEL_ENV", "preview")
  expect(pageMetadata("Preview", "Description", "/").robots).toEqual({
    index: false,
    follow: false,
  })
  vi.unstubAllEnvs()
})
