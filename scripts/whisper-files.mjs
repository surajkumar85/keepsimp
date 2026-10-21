/**
 * Puts what transcribes speech into the site before it is built: Whisper's
 * models from the pinned revisions in lib/audio/whisper-models.json, each
 * file checked against its SHA-256, and the engine (Transformers.js and the
 * ONNX Runtime WebAssembly it loads) from node_modules, all under
 * public/whisper/<version>/, which Git ignores. Models are downloaded once
 * into .next/cache/whisper (kept between builds, here and on the host) and
 * never fetched by the site itself: a visitor's browser loads them from
 * this site, only when asked to transcribe.
 */
import { createHash } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  readdir,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const root = join(dirname(new URL(import.meta.url).pathname), "..")
const list = JSON.parse(
  await readFile(join(root, "lib/audio/whisper-models.json"), "utf8")
)
const cache = join(root, ".next/cache/whisper")
const out = join(root, "public/whisper")
const here = join(out, list.version)

/** A file's SHA-256, read as a stream. */
const hashOf = (path) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject)
  })

/** The cached copy of a model file, downloaded and checked when it is missing or wrong. */
async function cached(model, file) {
  const path = join(cache, `${model.repo}@${model.revision}`, file.path)
  if (existsSync(path) && (await hashOf(path)) === file.sha256) return path
  await mkdir(dirname(path), { recursive: true })
  const url = `https://huggingface.co/${model.repo}/resolve/${model.revision}/${file.path}`
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`)
      const { writeFile } = await import("node:fs/promises")
      await writeFile(
        `${path}.part`,
        new Uint8Array(await response.arrayBuffer())
      )
      const got = await hashOf(`${path}.part`)
      if (got !== file.sha256)
        throw new Error(
          `${file.path} of ${model.repo} is not the pinned file (SHA-256 ${got})`
        )
      await rename(`${path}.part`, path)
      console.log(`whisper: downloaded ${model.repo}/${file.path}`)
      return path
    } catch (error) {
      if (attempt === 3) throw error
      console.warn(`whisper: ${url} failed (${error.message}); trying again`)
    }
  }
}

// Earlier versions are taken away.
if (existsSync(out))
  for (const entry of await readdir(out))
    if (entry !== list.version) await rm(join(out, entry), { recursive: true })

/** A file in an installed package, found from the package's own folder (its exports may not name it). */
function packageFile(source) {
  const parts = source.split("/")
  const name = parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
  const inside = source.slice(name.length + 1)
  let folder = dirname(require.resolve(name))
  while (
    !existsSync(join(folder, "package.json")) ||
    require(join(folder, "package.json")).name !== name
  ) {
    const up = dirname(folder)
    if (up === folder) throw new Error(`${name} is not installed`)
    folder = up
  }
  return join(folder, inside)
}

for (const [name, source] of Object.entries(list.engine)) {
  const to = join(here, "engine", name)
  await mkdir(dirname(to), { recursive: true })
  await copyFile(packageFile(source), to)
}
for (const model of list.models)
  for (const file of model.files) {
    const to = join(here, "models", model.repo, file.path)
    if (existsSync(to) && (await hashOf(to)) === file.sha256) continue
    await mkdir(dirname(to), { recursive: true })
    await copyFile(await cached(model, file), to)
  }
console.log(
  `whisper: ${list.models.map((model) => model.id).join(", ")} ready in public/whisper/${list.version}`
)
