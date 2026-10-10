import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { offlineFiles, workerScript } from "@/lib/offline"

// The service worker, written by `next build` like every other page, so any
// host that serves the export serves it too. See docs/pwa.md.
export const dynamic = "force-static"

/** Every file under a folder, relative to it; nothing when the folder is missing. */
async function filesIn(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => []
  )
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await filesIn(root, path)))
    else if (entry.isFile())
      files.push(relative(root, path).split(sep).join("/"))
  }
  return files
}

export async function GET() {
  const project = process.cwd()
  // Build files are complete by the time pages and routes are generated.
  const files = offlineFiles(
    await filesIn(join(project, ".next", "static")),
    await filesIn(join(project, "public"))
  )
  // Build file names change with every build, so this does too.
  const version = createHash("sha256")
    .update(files.join("\n"))
    .digest("hex")
    .slice(0, 12)
  const source = (name: string) =>
    readFile(join(project, "service-worker", name), "utf8")
  return new Response(
    workerScript(
      version,
      files,
      await source("rules.js"),
      await source("sw.js")
    ),
    { headers: { "content-type": "text/javascript; charset=utf-8" } }
  )
}
