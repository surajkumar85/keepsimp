import { mkdir, readFile } from "node:fs/promises"
import { chromium } from "@playwright/test"

// Render standalone brand graphics from local assets and fonts; no server needed.
const tokens = JSON.parse(await readFile("design-system/tokens.json", "utf8"))
const outfit = (
  await readFile(
    "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"
  )
).toString("base64")
const inter = (
  await readFile(
    "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"
  )
).toString("base64")
const css = `
@font-face { font-family: 'Outfit Export'; src: url(data:font/woff2;base64,${outfit}); font-weight: 100 900; }
@font-face { font-family: 'Inter Export'; src: url(data:font/woff2;base64,${inter}); font-weight: 100 900; }
:root { --font-outfit: 'Outfit Export'; --font-inter: 'Inter Export'; ${Object.entries(
  tokens.colors.light
)
  .map(([name, value]) => `--${name}:${value};`)
  .join("")} }
body { margin: 0; }
`
const cards = [
  [
    "keepsimp",
    "Less busywork. More room to create.",
    "Free browser tools. No account. No uploads.",
    "/images/coastline.jpg",
  ],
  [
    "compress-images-without-uploading",
    "A lighter image, without the upload.",
    "Practical notes from the KeepSimp journal",
    "/images/coastline.jpg",
  ],
  [
    "jpeg-png-webp-which-format",
    "JPEG, PNG or WebP? Pick the right fit.",
    "A little know-how. A lot less guesswork.",
    "/images/private-workspace.webp",
  ],
  [
    "gif-webp-apng-or-video",
    "GIF, WebP, APNG or video?",
    "Choose how your animation moves.",
    "/images/coastline.jpg",
  ],
  [
    "format-json-without-losing-precision",
    "Make JSON readable. Keep the details.",
    "Format locally, and preserve number precision.",
    "/images/json-guide.svg",
  ],
  [
    "jsonpath-json-pointer-find-data",
    "Find the JSON you need.",
    "Query with JSONPath. Select with JSON Pointer.",
    "/images/json-query-guide.svg",
  ],
  [
    "repair-compare-json-patch",
    "Preview every JSON change.",
    "Repair, compare and apply JSON Patch locally.",
    "/images/json-patch-guide.svg",
  ],
  [
    "validate-json-schema-locally",
    "Check your JSON's shape.",
    "Local schema validation, with useful error paths.",
    "/images/json-schema-guide.svg",
  ],
  [
    "convert-json-yaml-csv-typescript",
    "Your JSON. The next format.",
    "YAML, CSV, JSON Lines and TypeScript, locally.",
    "/images/json-convert-guide.svg",
  ],
]
const requested = new Set(process.argv.slice(2))
async function asset(path) {
  const mime = path.endsWith(".svg")
    ? "image/svg+xml"
    : path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg"
  return `data:${mime};base64,${(await readFile(`public${path}`)).toString("base64")}`
}
const logoSource = await asset("/brand/keepsimp-logo.svg")
await mkdir("public/images/social", { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    colorScheme: "light",
    reducedMotion: "reduce",
  })
  for (const [slug, title, subtitle, image] of cards) {
    if (requested.size && !requested.has(slug)) continue
    const imageSource = await asset(image)
    await page.setContent(
      `<!doctype html><html><head><style>${css}</style></head><body></body></html>`
    )
    await page.evaluate(
      ({ title, subtitle, image, imageSource, logoSource }) => {
        document.documentElement.classList.remove("dark")
        const card = document.createElement("div")
        card.style.cssText =
          "display:flex;position:relative;width:1200px;height:630px;overflow:hidden;background:var(--marketing-surface);color:var(--foreground);padding:56px;box-sizing:border-box;"
        const logo = document.createElement("img")
        logo.src = logoSource
        logo.style.cssText =
          "position:absolute;top:50px;left:56px;width:168px;height:40px"
        const copy = document.createElement("div")
        copy.style.cssText = "width:510px;align-self:center;padding-top:15px;"
        const heading = document.createElement("h1")
        heading.textContent = title
        heading.style.cssText =
          "font-family:var(--font-outfit),sans-serif;font-weight:500;font-size:64px;line-height:1.04;letter-spacing:-2.5px;margin:0;"
        const description = document.createElement("p")
        description.textContent = subtitle
        description.style.cssText =
          "font-family:var(--font-inter),sans-serif;font-size:22px;line-height:1.5;max-width:440px;color:var(--muted-foreground);margin:24px 0 0;"
        copy.append(heading, description)
        const photo = document.createElement("img")
        photo.src = imageSource
        photo.style.cssText =
          "position:absolute;right:56px;top:80px;width:500px;height:470px;object-fit:cover;border-radius:24px;"
        if (image.endsWith(".svg")) photo.style.objectFit = "contain"
        const footer = document.createElement("p")
        footer.textContent = "keepsimp.vercel.app"
        footer.style.cssText =
          "position:absolute;left:56px;bottom:42px;font-family:var(--font-inter),sans-serif;font-size:18px;color:var(--primary);margin:0;"
        card.append(logo, copy, photo, footer)
        document.body.replaceChildren(card)
      },
      { title, subtitle, image, imageSource, logoSource }
    )
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(Array.from(document.images, (image) => image.decode()))
    })
    await page.screenshot({ path: `public/images/social/${slug}.png` })
    console.log(`Exported ${slug}.png`)
  }
} finally {
  await browser.close()
}
