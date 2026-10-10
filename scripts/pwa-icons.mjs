import { mkdir, readFile } from "node:fs/promises"
import sharp from "sharp"

// Home-screen icons, exported from the brand mark so its geometry never drifts.
// Run with `npm run pwa:icons` after changing public/brand/keepsimp-mark.svg.
const mark = await readFile("public/brand/keepsimp-mark.svg", "utf8")
const tile = '<rect width="64" height="64" rx="16"'
if (!mark.includes(tile)) throw new Error("The mark's tile has changed.")
// Launchers and iOS cut their own shape, so those icons fill the square. The
// glyph already sits inside the maskable safe zone (a circle 80% of the width).
const fullBleed = mark.replace(tile, '<rect width="64" height="64"')

const icons = [
  ["icon-192.png", mark, 192],
  ["icon-512.png", mark, 512],
  ["icon-maskable-192.png", fullBleed, 192],
  ["icon-maskable-512.png", fullBleed, 512],
  ["apple-touch-icon.png", fullBleed, 180],
]

await mkdir("public/icons", { recursive: true })
for (const [name, svg, size] of icons) {
  await sharp(Buffer.from(svg), { density: (72 * size) / 64 })
    .resize(size, size)
    .png({ compressionLevel: 9, palette: true })
    .toFile(`public/icons/${name}`)
  console.log(`Wrote public/icons/${name} (${size} × ${size})`)
}
