import { mkdir, readFile } from "node:fs/promises"
import { chromium } from "@playwright/test"

// Run with the local preview available. These are exported brand graphics,
// not live product UI; the browser supplies the same locally hosted fonts.
const preview = process.env.KEEPSIMP_PREVIEW_URL || "http://127.0.0.1:3000"
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
    "format-json-without-losing-precision",
    "Make JSON readable. Keep the details.",
    "Format locally, and preserve number precision.",
    "/images/json-guide.svg",
  ],
]
await mkdir("public/images/social", { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    colorScheme: "light",
    reducedMotion: "reduce",
  })
  const exportUrl = `${preview}/__social-export/`
  await page.route(exportUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><style>${css}</style></head><body></body></html>`,
    })
  )
  for (const [slug, title, subtitle, image] of cards) {
    await page.goto(exportUrl)
    await page.evaluate(
      ({ title, subtitle, image }) => {
        document.documentElement.classList.remove("dark")
        const card = document.createElement("div")
        card.style.cssText =
          "display:flex;position:relative;width:1200px;height:630px;overflow:hidden;background:var(--marketing-surface);color:var(--foreground);padding:56px;box-sizing:border-box;"
        const logo = document.createElement("img")
        logo.src = "/brand/keepsimp-logo.svg"
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
        photo.src = image
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
      { title, subtitle, image }
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
