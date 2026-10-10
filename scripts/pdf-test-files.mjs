import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "@playwright/test"
import sharp from "sharp"

// PDFs for the merger's tests that come from other producers than pdf-lib:
// Chromium's print engine (Skia) and macOS's own (Quartz). Run on a Mac with
// `node scripts/pdf-test-files.mjs` after changing them; the results are
// committed, so tests do not need either producer.
const out = "e2e/fixtures/pdf"
const scratch = mkdtempSync(join(tmpdir(), "keepsimp-pdf-"))

// 1. A tagged document with headings, a picture, a link inside the document
// and one outside it, as Chromium prints it.
{
  const picture = await sharp({
    create: { width: 240, height: 120, channels: 3, background: "#00786f" },
  })
    .png()
    .toBuffer()
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Printed by Chromium</title>
<style>
  @page { size: A5; margin: 18mm }
  body { font: 12pt/1.5 Helvetica, Arial, sans-serif }
  section { break-after: page }
  section:last-child { break-after: auto }
</style></head><body>
<section><h1 id="one">CHROME-ONE</h1>
  <p>The first printed page. <a href="#three">Jump to the third page</a>.</p>
  <p><a href="https://keepsimp.vercel.app/">An address outside the document</a></p>
  <img alt="A teal block" src="data:image/png;base64,${picture.toString("base64")}"></section>
<section><h1 id="two">CHROME-TWO</h1><p>The second printed page, with accents: café, naïve, Zürich.</p></section>
<section><h1 id="three">CHROME-THREE</h1><p>The third printed page.</p></section>
</body></html>`
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html)
  writeFileSync(
    `${out}/chromium-tagged.pdf`,
    await page.pdf({ preferCSSPageSize: true, tagged: true, outline: true })
  )
  await browser.close()
}

// 2. A picture turned into a one-page PDF by macOS, as a scan would be.
{
  const scan = join(scratch, "scan.png")
  await sharp({
    create: { width: 620, height: 877, channels: 3, background: "#f4f1ea" },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="620" height="877" xmlns="http://www.w3.org/2000/svg"><text x="60" y="140" font-family="Helvetica" font-size="44" fill="#222">QUARTZ-SCAN</text><rect x="60" y="200" width="500" height="6" fill="#00786f"/></svg>`
        ),
      },
    ])
    .png()
    .toFile(scan)
  execFileSync(
    "sips",
    ["-s", "format", "pdf", scan, "--out", `${out}/quartz-scan.pdf`],
    {
      stdio: "ignore",
    }
  )
}
console.log(`Wrote ${out}/chromium-tagged.pdf and ${out}/quartz-scan.pdf`)
