/**
 * Records a tool tutorial into public/videos.
 *
 *   npm run build && npx serve out --listen tcp://127.0.0.1:4180
 *   KEEPSIMP_PREVIEW_URL=http://127.0.0.1:4180 npm run tutorial:video -- image-resizer
 *
 * Each tool has a storyboard in scripts/tutorial/. The recorder is shared.
 */
import { record } from "./tutorial/recorder.mjs"

const tools = ["image-compressor", "image-resizer"]
const tool = process.argv[2] ?? tools[0]
if (!tools.includes(tool)) {
  console.error(
    `Unknown tutorial "${tool}". Choose one of: ${tools.join(", ")}`
  )
  process.exit(1)
}
const { default: storyboard, options } = await import(`./tutorial/${tool}.mjs`)
await record(options, storyboard)
