import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  RNNOISE_FILES,
  RNNOISE_PACKAGE,
  RNNOISE_VERSION,
} from "@/lib/audio/rnnoise-files"

// RNNoise, written by `next build` like every other page, from its package.
// See lib/audio/rnnoise-files.ts.
export const dynamic = "force-static"
export const dynamicParams = false

export async function generateStaticParams() {
  // A package updated without the version being changed would be served
  // under an address a device may already keep an older copy of.
  const { version } = JSON.parse(
    await readFile(
      join(process.cwd(), "node_modules", RNNOISE_PACKAGE, "package.json"),
      "utf8"
    )
  ) as { version: string }
  if (version !== RNNOISE_VERSION)
    throw new Error(
      `${RNNOISE_PACKAGE} is ${version}, not ${RNNOISE_VERSION}: change RNNOISE_VERSION in lib/audio/rnnoise-files.ts.`
    )
  return Object.keys(RNNOISE_FILES).map((file) => ({
    version: RNNOISE_VERSION,
    file,
  }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string; file: string }> }
) {
  const { file } = await params
  const bytes = await readFile(
    join(process.cwd(), "node_modules", RNNOISE_FILES[file])
  )
  return new Response(bytes, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  })
}
