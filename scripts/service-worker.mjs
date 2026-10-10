import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { build } from "esbuild"
import { shouldPrecache, urlPath } from "../lib/offline.ts"

// Runs after `next build`. Lists the exported files that make up the offline
// copy, then bundles service-worker/sw.ts with that list into out/sw.js.
const out = "out"

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

const files = (await walk(out))
  .map((path) => relative(out, path).split(sep).join("/"))
  .filter(shouldPrecache)
  .sort()

// The version names the cache. It changes whenever any saved file changes.
const version = createHash("sha256")
let bytes = 0
for (const file of files) {
  const path = join(out, file)
  version.update(file)
  version.update(await readFile(path))
  bytes += (await stat(path)).size
}
const id = version.digest("hex").slice(0, 12)

await build({
  entryPoints: ["service-worker/sw.ts"],
  outfile: join(out, "sw.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  define: {
    __VERSION__: JSON.stringify(id),
    __PRECACHE__: JSON.stringify(files.map(urlPath)),
  },
  legalComments: "none",
})

console.log(
  `Wrote out/sw.js: version ${id}, ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB offline copy`
)
