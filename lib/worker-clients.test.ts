import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A tool's worker client must exist before the tool can be given a file. A
 * client made in a passive effect (`useEffect`) does not: React may let the
 * page handle an event, such as a file chosen as soon as the page has
 * loaded, before it runs those effects, and a request made through
 * `client.current?.` is then dropped without a word. WebKit on Linux did
 * this in CI, and the file's row said "Reading…" for ever. A layout effect
 * runs in the task that puts the tool on the page; a `useState` initialiser
 * runs before it.
 */
const ROOTS = ["components", "hooks"]
const MADE = /new ([A-Z]\w*(?:Client|Pool))\(/g
const HOOK = /\b(useEffect|useLayoutEffect|useState|useMemo|useRef)\(/g

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : []
  })
}

/** Each client or pool a component makes, with the hook it is made in. */
function made() {
  return ROOTS.flatMap(sources).flatMap((path) => {
    const text = readFileSync(path, "utf8")
    return [...text.matchAll(MADE)].map((match) => {
      const before = [...text.slice(0, match.index).matchAll(HOOK)]
      return {
        where: `${path}: ${match[1]}`,
        hook: before.at(-1)?.[1] ?? "none",
      }
    })
  })
}

describe("worker clients", () => {
  it("are found", () => {
    // The scan must keep seeing the tools, or it checks nothing.
    const names = made().map(({ where }) => where)
    for (const tool of [
      "components/pdf-splitter/pdf-splitter.tsx: PdfClient",
      "components/pdf-merger/pdf-merger.tsx: PdfClient",
      "components/image-compressor/image-compressor.tsx: CompressorClient",
      "components/audio/audio-workspace.tsx: AudioPool",
      "hooks/use-json-worker.ts: JsonClient",
    ])
      expect(names).toContain(tool)
  })

  it("are made before the tool can be given a file", () => {
    const late = made()
      .filter(({ hook }) => hook !== "useLayoutEffect" && hook !== "useState")
      .map(({ where, hook }) => `${where} (in ${hook})`)
    expect(late).toEqual([])
  })
})
