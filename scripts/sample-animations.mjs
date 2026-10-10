import { mkdir, readFile } from "node:fs/promises"
import sharp from "sharp"

// The two animations behind "Try a sample" in the animation converter.
// Run with `npm run samples:animations` after changing the artwork.
await mkdir("public/images/samples", { recursive: true })

/** Frames stacked top to bottom, as sharp reads an animation from raw pixels. */
const stacked = (frames, width, height) =>
  sharp(Buffer.concat(frames), {
    raw: {
      width,
      height: height * frames.length,
      channels: 4,
      pageHeight: height,
    },
  })

// 1. A slow pan along the coastline photograph. Kept small: a GIF of a
// photograph is heavy, and this file ships with the site.
{
  const [width, height, count] = [224, 150, 20]
  const travel = 5
  const wide = width + travel * (count - 1)
  const photo = await sharp("public/images/coastline.jpg")
    .resize(wide, height, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer()
  const frames = Array.from({ length: count }, (_, frame) => {
    const data = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y++)
      photo.copy(
        data,
        y * width * 4,
        (y * wide + frame * travel) * 4,
        (y * wide + frame * travel + width) * 4
      )
    return data
  })
  await stacked(frames, width, height)
    .gif({ delay: frames.map(() => 80), loop: 0, effort: 10, colours: 96 })
    .toFile("public/images/samples/coastline-pan.gif")
  console.log("Wrote public/images/samples/coastline-pan.gif")
}

// 2. The KeepSimp mark, gently pulsing on a see-through background: 20 frames.
{
  const [size, count] = [192, 20]
  const mark = await readFile("public/brand/keepsimp-mark.svg")
  const frames = []
  for (let frame = 0; frame < count; frame++) {
    const scale =
      0.72 + 0.2 * (0.5 - 0.5 * Math.cos((frame / count) * 2 * Math.PI))
    const edge = Math.round(size * scale)
    const tile = await sharp(mark, { density: 300 })
      .resize(edge, edge)
      .png()
      .toBuffer()
    frames.push(
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{ input: tile, gravity: "centre" }])
        .raw()
        .toBuffer()
    )
  }
  await stacked(frames, size, size)
    .webp({ delay: frames.map(() => 50), loop: 0, lossless: true, effort: 6 })
    .toFile("public/images/samples/keepsimp-pulse.webp")
  console.log("Wrote public/images/samples/keepsimp-pulse.webp")
}
