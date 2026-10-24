import { before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join, parse } from "node:path"
import { pathToFileURL } from "node:url"
import {
  BridgeProblem,
  Folders,
  freePath,
  rootPath,
  startFolders,
} from "../../src/paths.ts"
import { HELP, readOptions, SITE } from "../../src/options.ts"

let base: string
before(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "keepsimp-paths-")))
  await mkdir(join(base, "work", "deep"), { recursive: true })
  await mkdir(join(base, "other"))
  await writeFile(join(base, "work", "a.json"), "{}")
  await writeFile(join(base, "work", "a (2).json"), "{}")
  await writeFile(join(base, "other", "secret.txt"), "x")
  await symlink(join(base, "other"), join(base, "work", "door"))
  await symlink(
    join(base, "other", "secret.txt"),
    join(base, "work", "leak.txt")
  )
})

describe("the folders", () => {
  it("reads roots as paths or file: addresses, and keeps only real folders", async () => {
    assert.equal(
      rootPath(pathToFileURL(join(base, "work")).href),
      join(base, "work")
    )
    const folders = new Folders()
    await folders.set([
      join(base, "work"),
      pathToFileURL(join(base, "work")).href,
      join(base, "missing"),
      join(base, "work", "a.json"),
    ])
    assert.deepEqual(folders.list(), [join(base, "work")])
  })

  it("reads a leading ~ as the home folder, as apps that start it from JSON do not", () => {
    assert.equal(rootPath("~", "/home/me"), "/home/me")
    assert.equal(rootPath("~/Documents", "/home/me"), "/home/me/Documents")
    assert.equal(rootPath("~\\Documents", "/home/me"), "/home/me/Documents")
    assert.equal(rootPath("~/Documents"), join(homedir(), "Documents"))
    // Only a ~ that starts the path, alone or before a separator.
    assert.equal(rootPath("~me", "/home/me"), join(process.cwd(), "~me"))
  })

  it("uses the folder it was started in, but never the top of a disk", () => {
    assert.deepEqual(startFolders(join(base, "work")), [join(base, "work")])
    assert.deepEqual(startFolders(parse(base).root), [])
  })

  it("lets in files inside, by absolute or relative path", async () => {
    const folders = new Folders()
    await folders.set([join(base, "work")])
    assert.equal(await folders.file("a.json"), join(base, "work", "a.json"))
    assert.equal(
      await folders.file(join(base, "work", "a.json")),
      join(base, "work", "a.json")
    )
  })

  it("keeps out what lies outside, however it is reached", async () => {
    const folders = new Folders()
    await folders.set([join(base, "work")])
    for (const path of [
      join(base, "other", "secret.txt"),
      "../other/secret.txt",
      "leak.txt",
      "door/secret.txt",
    ])
      await assert.rejects(
        folders.file(path),
        /outside the folders KeepSimp may use/
      )
    await assert.rejects(folders.file("nope.json"), /There is no file at/)
    await assert.rejects(folders.file("deep"), /is a folder, not a file/)
    const everything = new Folders()
    await everything.set(["/"])
    assert.equal(
      await everything.file(join(base, "other", "secret.txt")),
      join(base, "other", "secret.txt")
    )
    const none = new Folders()
    await assert.rejects(none.file("a.json"), /There is no file|may not use/)
    await assert.rejects(none.folder("somewhere"), /may not use any folder/)
    await assert.rejects(none.file(join(base, "work", "a.json")), (error) => {
      assert.ok(error instanceof BridgeProblem)
      assert.match(error.message, /may not use any folder yet/)
      return true
    })
  })

  it("makes a folder to write in only inside, judged through links", async () => {
    const folders = new Folders()
    await folders.set([join(base, "work")])
    assert.equal(await folders.folder("deep"), join(base, "work", "deep"))
    assert.equal(
      await folders.folder("made/here"),
      join(base, "work", "made", "here")
    )
    assert.equal(
      await folders.folder(join(base, "work", "made", "here")),
      join(base, "work", "made", "here")
    )
    await assert.rejects(folders.folder("door/new"), /outside the folders/)
    await assert.rejects(folders.folder(join(base, "other")), /outside/)
    await assert.rejects(folders.folder("a.json"), /is a file, not a folder/)
    // A path from a filesystem root that does not exist at all.
    await assert.rejects(
      folders.folder("/keepsimp-nowhere-at-all/x"),
      /outside/
    )
  })

  it("finds a name that is free", async () => {
    const work = join(base, "work")
    assert.equal(await freePath(work, "b.json"), join(work, "b.json"))
    assert.equal(await freePath(work, "a.json"), join(work, "a (3).json"))
    assert.equal(await freePath(work, "deep"), join(work, "deep (2)"))
  })
})

describe("the options", () => {
  it("reads the command line", () => {
    assert.deepEqual(readOptions([]), {
      site: SITE,
      allow: [],
      browser: "auto",
      headed: false,
      help: false,
      version: false,
    })
    assert.deepEqual(
      readOptions([
        "--allow",
        "/a",
        "--allow",
        "/b",
        "--site",
        "http://127.0.0.1:4173/dashboard/",
        "--browser",
        "chromium",
        "--headed",
        "-h",
        "-v",
      ]),
      {
        site: "http://127.0.0.1:4173",
        allow: ["/a", "/b"],
        browser: "chromium",
        headed: true,
        help: true,
        version: true,
      }
    )
    assert.equal(
      readOptions(["--site", "https://example.com"]).site,
      "https://example.com"
    )
    assert.equal(
      readOptions(["--site", "http://localhost:3000"]).site,
      "http://localhost:3000"
    )
    assert.equal(readOptions(["--help", "--version"]).version, true)
    assert.throws(() => readOptions(["--allow"]), /--allow needs a value/)
    assert.throws(() => readOptions(["--allow", "--headed"]), /needs a value/)
    assert.throws(
      () => readOptions(["--site", "http://example.com"]),
      /must be an https/
    )
    assert.throws(
      () => readOptions(["--browser", "edge"]),
      /chrome, chromium or auto/
    )
    assert.throws(() => readOptions(["--fast"]), /is not an option/)
    assert.match(HELP, /claude mcp add keepsimp/)
  })
})
