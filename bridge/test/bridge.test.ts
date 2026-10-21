/**
 * The bridge as an agent uses it: started over stdio by the MCP SDK's own
 * client, against a KeepSimp site (KEEPSIMP_SITE, the local build in the
 * tests), with real files in a folder of its own.
 */
import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { crc32, deflateSync } from "node:zlib"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

/** A PNG, left half teal (#00786f), right half white, written byte by byte. */
function twoColourPng() {
  const width = 64
  const height = 32
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      rows.set(
        x < width / 2 ? [0x00, 0x78, 0x6f] : [0xff, 0xff, 0xff],
        y * (width * 3 + 1) + 1 + x * 3
      )
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, check])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const SITE = process.env.KEEPSIMP_SITE ?? "http://127.0.0.1:4173"
const CLI = new URL("../src/cli.ts", import.meta.url).pathname

type Text = { type: "text"; text: string }
type Result = {
  content: Text[]
  isError?: boolean
  structuredContent?: {
    summary: string
    files: { path: string; size: number }[]
    data?: unknown
  }
}

let work: string
let outside: string
let client: Client
let said = ""

before(async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "keepsimp-bridge-")))
  work = join(base, "project")
  outside = join(base, "elsewhere")
  await mkdir(work)
  await mkdir(outside)
  await writeFile(
    join(work, "data.json"),
    '{"b":1.000000000000000000001,"a":[1,2]}'
  )
  await writeFile(join(outside, "secret.json"), '{"secret":true}')
  await symlink(join(outside, "secret.json"), join(work, "link.json"))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI, "--site", SITE, "--browser", "chromium"],
    cwd: work,
    stderr: "pipe",
  })
  transport.stderr?.on("data", (chunk: Buffer) => {
    said += chunk.toString()
  })
  client = new Client({ name: "keepsimp-bridge-test", version: "1.0.0" })
  await client.connect(transport)
})

after(async () => {
  await client?.close()
})

const call = (name: string, args: Record<string, unknown>) =>
  client.callTool({ name, arguments: args }) as Promise<Result>

describe("the KeepSimp bridge", () => {
  it("lists the site's tools, with paths for files and a folder for results", async () => {
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name)
    assert.ok(names.includes("format_json"))
    assert.ok(names.includes("colors_from_image"))
    assert.ok(!names.includes("list_files"), "the page's own tool is left out")
    const format = tools.find((tool) => tool.name === "format_json")!
    const properties = format.inputSchema.properties as Record<
      string,
      { description: string }
    >
    assert.match(properties.file.description, /A path to the file/)
    assert.ok(!JSON.stringify(format.inputSchema).includes("x-keepsimp"))
    assert.ok(properties.outputFolder)
    assert.equal(format.annotations?.destructiveHint, false)
    assert.equal(format.annotations?.openWorldHint, false)
    assert.match(client.getInstructions() ?? "", /never go to a server/)
  })

  it("works on a file and saves the result beside it, never over another", async () => {
    const first = await call("format_json", {
      file: "data.json",
      style: "sort-keys",
    })
    assert.equal(first.isError, undefined)
    const saved = first.structuredContent!.files[0].path
    assert.equal(saved, join(work, "data-formatted.json"))
    assert.equal(
      await readFile(saved, "utf8"),
      '{\n  "a": [\n    1,\n    2\n  ],\n  "b": 1.000000000000000000001\n}'
    )
    assert.match(
      first.content[0].text,
      /Saved this file:\n- .*data-formatted\.json/
    )
    const again = await call("format_json", { file: join(work, "data.json") })
    assert.equal(
      again.structuredContent!.files[0].path,
      join(work, "data-formatted (2).json")
    )
    const elsewhere = await call("convert_json", {
      file: "data.json",
      to: "json-yaml",
      outputFolder: "out/yaml",
    })
    assert.equal(
      elsewhere.structuredContent!.files[0].path,
      join(work, "out", "yaml", "data-json-yaml.yaml")
    )
  })

  it("answers without a file when there is nothing to save", async () => {
    const contrast = await call("check_contrast", {
      foreground: "#777",
      background: "#fff",
    })
    assert.match(contrast.content[0].text, /^4\.47:1\. Fails AA/)
    assert.deepEqual(contrast.structuredContent!.files, [])
    const inline = await call("format_json", { text: '{"x":1}' })
    assert.equal(
      (inline.structuredContent!.data as { output: string }).output,
      '{\n  "x": 1\n}'
    )
  })

  it("refuses paths outside the folders, links that lead out, and bad input", async () => {
    const outsideFile = await call("format_json", {
      file: join(outside, "secret.json"),
    })
    assert.equal(outsideFile.isError, true)
    assert.match(
      outsideFile.content[0].text,
      /outside the folders KeepSimp may use/
    )
    const link = await call("format_json", { file: "link.json" })
    assert.equal(link.isError, true)
    assert.match(link.content[0].text, /outside the folders/)
    const outFolder = await call("format_json", {
      file: "data.json",
      outputFolder: outside,
    })
    assert.equal(outFolder.isError, true)
    const missing = await call("format_json", { file: "nope.json" })
    assert.match(missing.content[0].text, /There is no file/)
    const wrong = await call("format_json", { text: "[]", style: "fancy" })
    assert.equal(wrong.isError, true)
    assert.match(wrong.content[0].text, /must be one of/)
    const unknown = await call("no_such_tool", {})
    assert.equal(unknown.isError, true)
    assert.deepEqual((await readdir(outside)).sort(), ["secret.json"])
  })

  it("reads an image from disk", async () => {
    await writeFile(join(work, "two.png"), twoColourPng())
    const found = await call("colors_from_image", { file: "two.png", count: 2 })
    assert.equal(found.isError, undefined)
    assert.deepEqual(
      (found.structuredContent!.data as { color: string }[])
        .map((each) => each.color)
        .sort(),
      ["#00786f", "#ffffff"]
    )
  })

  it("merges and splits PDFs on disk", async () => {
    const samples = new URL("../../public/samples/", import.meta.url).pathname
    await copyFile(
      join(samples, "keepsimp-report.pdf"),
      join(work, "report.pdf")
    )
    await copyFile(
      join(samples, "keepsimp-appendix.pdf"),
      join(work, "appendix.pdf")
    )
    const merged = await call("merge_pdfs", {
      files: ["report.pdf", "appendix.pdf"],
      name: "together",
    })
    assert.equal(merged.isError, undefined, merged.content[0].text)
    const saved = merged.structuredContent!.files[0].path
    assert.equal(saved, join(work, "together.pdf"))
    assert.equal((await readFile(saved)).subarray(0, 5).toString(), "%PDF-")
    const pages = (merged.structuredContent!.data as { pages: number }).pages
    const info = await call("pdf_info", { file: "together.pdf" })
    assert.equal(
      (info.structuredContent!.data as { pages: number }).pages,
      pages
    )
    const split = await call("split_pdf", {
      file: "together.pdf",
      mode: "single",
      outputFolder: "pages",
    })
    assert.equal(split.structuredContent!.files.length, pages)
    assert.match(
      split.structuredContent!.files[0].path,
      /pages\/together-1\.pdf$/
    )
  })

  it("runs the PDF editor's jobs on files on disk", async () => {
    const numbered = await call("add_page_numbers", {
      file: "report.pdf",
      format: "Page 1 of 9",
    })
    assert.equal(numbered.isError, undefined, numbered.content[0].text)
    assert.match(numbered.content[0].text, /read back from the file/)
    assert.equal(
      numbered.structuredContent!.files[0].path,
      join(work, "report-numbered.pdf")
    )
    const fields = await call("list_pdf_form_fields", { file: "report.pdf" })
    assert.deepEqual(fields.structuredContent!.files, [])
  })

  it("tells progress, and stops a long job when the agent cancels", async () => {
    const samples = new URL("../../public/samples/", import.meta.url).pathname
    await copyFile(
      join(samples, "keepsimp-brochure.pdf"),
      join(work, "brochure.pdf")
    )
    const told: number[] = []
    const done = (await client.callTool(
      { name: "compress_pdf", arguments: { file: "brochure.pdf" } },
      undefined,
      {
        onprogress: (progress) => told.push(progress.progress),
        timeout: 240_000,
      }
    )) as Result
    assert.equal(done.isError, undefined, done.content[0].text)
    assert.ok(told.length > 1, "progress was told")
    assert.ok(told.every((fraction) => fraction >= 0 && fraction <= 1))
    const controller = new AbortController()
    const stopped = client
      .callTool(
        {
          name: "compress_pdf",
          arguments: { file: "brochure.pdf", level: "strong" },
        },
        undefined,
        { signal: controller.signal, onprogress: () => controller.abort() }
      )
      .then(
        () => "finished",
        () => "cancelled"
      )
    assert.equal(await stopped, "cancelled")
    // Nothing was saved for the stopped job, and the bridge goes on working.
    const after = await call("pdf_info", { file: "brochure.pdf" })
    assert.equal(after.isError, undefined)
    const names = (await readdir(work)).filter((name) =>
      name.startsWith("brochure-compressed")
    )
    assert.deepEqual(names, ["brochure-compressed.pdf"])
  })

  it("never lets the browser leave the site", () => {
    assert.doesNotMatch(said, /Refused a request/)
  })
})
