import { before, describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  mkdtemp,
  readFile,
  realpath,
  writeFile,
  copyFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import {
  ListRootsRequestSchema,
  ProgressNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js"
import type { Answer, FileRef, Tools, ToolResult } from "../../src/browser.ts"
import { callTool, plainName } from "../../src/calls.ts"
import { Folders } from "../../src/paths.ts"
import { makeServer } from "../../src/server.ts"
import { forAgents, type Listing } from "../../src/tools.ts"

const listing = (
  name: string,
  properties: Record<string, unknown>
): Listing => ({
  name,
  title: name,
  description: `${name} does a thing.`,
  inputSchema: { type: "object", properties, additionalProperties: false },
  annotations: { readOnlyHint: true },
  pageOnly: false,
})

const JOIN = listing("join_files", {
  first: { type: "string", description: "The first.", "x-keepsimp": "file" },
  rest: { type: "array", items: { type: "string" }, "x-keepsimp": "files" },
  words: { type: "string" },
})
const WAIT = listing("wait_a_while", {})
const LIST = { ...listing("list_files", {}), pageOnly: true }
const BARE = {
  ...listing("bare_tool", {}),
  inputSchema: { type: "object" },
}

/** A page of its own: files are held as their paths, tools answer here. */
class FakeTools implements Tools {
  held = new Map<string, string>()
  forgotten: string[] = []
  stopped: string[] = []
  count = 0
  listFails = 0
  private waiting = new Map<string, (answer: Answer<ToolResult>) => void>()

  async tools() {
    if (this.listFails-- > 0) throw new Error("the page did not open")
    return [JOIN, WAIT, LIST, BARE]
  }
  async put(path: string, name: string): Promise<FileRef> {
    const id = `file-${++this.count}`
    this.held.set(id, path)
    return { id, name, type: "", size: 0 }
  }
  async call(
    id: string,
    name: string,
    input: unknown,
    onProgress: (fraction: number, note: string) => void
  ): Promise<Answer<ToolResult>> {
    const given = input as { first?: string; rest?: string[]; words?: string }
    if (name === "wait_a_while") {
      onProgress(0.5, "halfway")
      onProgress(0.75, "")
      return new Promise((resolve) => this.waiting.set(id, resolve))
    }
    if (name === "bare_tool") return { ok: true, value: { summary: "Bare." } }
    if (given.words === "fail") return { ok: false, problem: "It failed." }
    if (given.words === "answer")
      return { ok: true, value: { summary: "An answer.", data: { n: 1 } } }
    const id2 = `file-${++this.count}`
    this.held.set(id2, "made")
    return {
      ok: true,
      value: {
        summary: "Joined.",
        files: [
          { id: id2, name: "../joined.txt", type: "text/plain", size: 0 },
          ...(given.words === "two"
            ? [{ id: `file-${++this.count}`, name: "..", type: "", size: 0 }]
            : []),
        ],
        data: { first: given.first, rest: given.rest },
      },
    }
  }
  async stop(id: string) {
    this.stopped.push(id)
    this.waiting.get(id)?.({
      ok: false,
      problem: "Stopped before it was done.",
    })
  }
  async save(_fileId: string, target: string) {
    await writeFile(target, "made")
  }
  async forget(ids: string[]) {
    this.forgotten.push(...ids)
  }
  async close() {}
}

let work: string
before(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), "keepsimp-server-")))
  await writeFile(join(work, "a.txt"), "a")
  await copyFile(join(work, "a.txt"), join(work, "b.txt"))
})

describe("a call", () => {
  it("hands paths in as ids, saves what was made and lets go of both", async () => {
    const tools = new FakeTools()
    const folders = new Folders()
    await folders.set([work])
    const result = await callTool(tools, folders, JOIN, {
      first: "a.txt",
      rest: ["a.txt", join(work, "b.txt")],
      outputFolder: "out",
    })
    assert.equal(result.isError, undefined)
    assert.deepEqual(result.structuredContent!.data, {
      first: "file-1",
      rest: ["file-2", "file-3"],
    })
    const saved = join(work, "out", "joined.txt")
    assert.deepEqual(result.structuredContent!.files, [
      { path: saved, type: "text/plain", size: 4 },
    ])
    assert.equal(await readFile(saved, "utf8"), "made")
    assert.match(
      result.content[0].text,
      /^Joined\.\nSaved this file:\n- .*joined\.txt\n\{/
    )
    assert.deepEqual(tools.forgotten, ["file-1", "file-2", "file-3", "file-4"])

    const two = await callTool(tools, folders, JOIN, {
      first: "a.txt",
      words: "two",
    })
    assert.deepEqual(
      two.structuredContent!.files.map((file) => file.path),
      [join(work, "joined.txt"), join(work, "file")]
    )
    assert.match(two.content[0].text, /Saved these files:/)
  })

  it("saves where the bridge works when no file was given", async () => {
    const tools = new FakeTools()
    const folders = new Folders()
    await folders.set([work])
    const result = await callTool(tools, folders, JOIN, {})
    assert.equal(
      result.structuredContent!.files[0].path,
      join(work, "joined (2).txt")
    )
    const answer = await callTool(tools, folders, JOIN, { words: "answer" })
    assert.deepEqual(answer.structuredContent, {
      summary: "An answer.",
      files: [],
      data: { n: 1 },
    })
    const bare = await callTool(tools, folders, BARE, {})
    assert.deepEqual(bare.structuredContent, { summary: "Bare.", files: [] })
    assert.equal(bare.content[0].text, "Bare.")
    const nowhere = new Folders()
    assert.match(
      (await callTool(tools, nowhere, JOIN, {})).content[0].text,
      /may not use any folder/
    )
  })

  it("says what is wrong with the paths given, and passes the page's problems on", async () => {
    const tools = new FakeTools()
    const folders = new Folders()
    await folders.set([work])
    const said = async (args: Record<string, unknown>) =>
      (await callTool(tools, folders, JOIN, args)).content[0].text
    assert.equal(await said({ first: 3 }), '"first" takes a path to a file.')
    assert.equal(
      await said({ rest: "a.txt" }),
      '"rest" takes a list of paths to files.'
    )
    assert.equal(
      await said({ rest: [1] }),
      '"rest" takes a list of paths to files.'
    )
    assert.equal(
      await said({ outputFolder: 5 }),
      '"outputFolder" takes the path of a folder.'
    )
    assert.equal(await said({ words: "fail" }), "It failed.")
    assert.match(await said({ first: "/etc/hosts" }), /outside the folders/)
    const broken = new FakeTools()
    broken.put = () => Promise.reject(new Error("the page broke"))
    await assert.rejects(
      callTool(broken, folders, JOIN, { first: "a.txt" }),
      /the page broke/
    )
  })

  it("stops the tool when the agent cancels", async () => {
    const tools = new FakeTools()
    const folders = new Folders()
    await folders.set([work])
    const controller = new AbortController()
    const told: [number, string][] = []
    const running = callTool(
      tools,
      folders,
      WAIT,
      {},
      {
        signal: controller.signal,
        onProgress: (fraction, note) => told.push([fraction, note]),
      }
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    const result = await running
    assert.equal(result.isError, true)
    assert.equal(tools.stopped.length, 1)
    assert.deepEqual(told, [
      [0.5, "halfway"],
      [0.75, ""],
    ])
    // Without a way to be told, progress goes nowhere.
    const quiet = callTool(tools, folders, WAIT, {})
    await new Promise((resolve) => setTimeout(resolve, 10))
    await tools.stop(tools.stopped.length ? "nothing" : "")
    void quiet
  })

  it("carries on when the page cannot let go or stop", async () => {
    const tools = new FakeTools()
    tools.forget = () => Promise.reject(new Error("gone"))
    const folders = new Folders()
    await folders.set([work])
    const done = await callTool(tools, folders, JOIN, { words: "answer" })
    assert.equal(done.isError, undefined)
    const stuck = new FakeTools()
    stuck.stop = () => Promise.reject(new Error("gone"))
    const controller = new AbortController()
    const running = callTool(
      stuck,
      folders,
      WAIT,
      {},
      { signal: controller.signal }
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 10))
    void running
  })

  it("keeps names from the page to names", () => {
    assert.equal(plainName("a.json"), "a.json")
    assert.equal(plainName("../../x.txt"), "x.txt")
    assert.equal(plainName("..\\..\\y.txt"), "y.txt")
    assert.equal(plainName(".."), "file")
    assert.equal(plainName("."), "file")
    assert.equal(plainName(""), "file")
  })
})

describe("the tools as agents see them", () => {
  it("take paths for files and a folder for results, and say they send nothing", () => {
    const tool = forAgents(JOIN)
    const properties = tool.inputSchema.properties as Record<
      string,
      Record<string, unknown>
    >
    assert.match(
      String(properties.first.description),
      /^The first\. A path to the file/
    )
    assert.match(String(properties.rest.description), /^Paths to the files/)
    assert.ok(!("x-keepsimp" in properties.first))
    assert.ok(properties.outputFolder)
    assert.deepEqual(tool.annotations, {
      title: "join_files",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    })
    const plain = forAgents(
      listing("plain_files", {
        one: { type: "string", "x-keepsimp": "file" },
        many: {
          type: "array",
          items: { type: "string" },
          "x-keepsimp": "files",
        },
      })
    )
    const plainProperties = plain.inputSchema.properties as Record<
      string,
      { description: string }
    >
    assert.match(plainProperties.one.description, /^A path to the file/)
    assert.match(plainProperties.many.description, /^Paths to the files/)
    const bare = forAgents(BARE)
    assert.deepEqual(Object.keys(bare.inputSchema.properties as object), [
      "outputFolder",
    ])
  })
})

async function connected(
  tools: FakeTools,
  roots: string[] | null,
  allow: string[] = []
) {
  const folders = new Folders()
  const logged: string[] = []
  const { start } = makeServer({
    name: "keepsimp",
    version: "0.0.0",
    tools,
    folders,
    fallback: [work],
    allow,
    log: (line) => logged.push(line),
  })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await start(serverSide)
  const client = new Client(
    { name: "test", version: "1" },
    { capabilities: roots ? { roots: { listChanged: true } } : {} }
  )
  if (roots)
    client.setRequestHandler(ListRootsRequestSchema, async () => {
      if (roots[0] === "fail") throw new Error("no roots today")
      return { roots: roots.map((uri) => ({ uri })) }
    })
  await client.connect(clientSide)
  await new Promise((resolve) => setTimeout(resolve, 20))
  return { client, folders, logged }
}

describe("the server", () => {
  it("lists the tools without the page's own, asking the page again after a failure", async () => {
    const tools = new FakeTools()
    tools.listFails = 1
    const { client } = await connected(tools, null)
    await assert.rejects(client.listTools(), /the page did not open/)
    const { tools: listed } = await client.listTools()
    assert.deepEqual(
      listed.map((tool) => tool.name),
      ["join_files", "wait_a_while", "bare_tool"]
    )
    await client.close()
  })

  it("uses the folders the client names, with those allowed, or where it started", async () => {
    const elsewhere = await realpath(
      await mkdtemp(join(tmpdir(), "keepsimp-root-"))
    )
    const extra = await realpath(
      await mkdtemp(join(tmpdir(), "keepsimp-allow-"))
    )
    const named = await connected(
      new FakeTools(),
      [pathToFileURL(elsewhere).href],
      [extra]
    )
    assert.deepEqual(named.folders.list(), [elsewhere, extra])
    assert.match(named.logged.join("\n"), /Using the folders/)
    await named.client.sendRootsListChanged()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.deepEqual(named.folders.list(), [elsewhere, extra])
    await named.client.close()

    const none = await connected(new FakeTools(), [])
    assert.deepEqual(none.folders.list(), [work])
    await none.client.close()
    const failing = await connected(new FakeTools(), ["fail"])
    assert.deepEqual(failing.folders.list(), [work])
    assert.match(failing.logged.join("\n"), /did not give its folders/)
    await failing.client.close()
    const plain = await connected(new FakeTools(), null)
    assert.deepEqual(plain.folders.list(), [work])
    await plain.client.close()
  })

  it("runs a call, telling progress to a client that asks for it", async () => {
    const tools = new FakeTools()
    const { client } = await connected(tools, null)
    const told: { progress: number; message?: string }[] = []
    client.setNotificationHandler(
      ProgressNotificationSchema,
      (notification) => {
        told.push(notification.params)
      }
    )
    const unknown = await client.callTool({ name: "nope", arguments: {} })
    assert.equal(unknown.isError, true)
    const done = await client.callTool({
      name: "join_files",
      arguments: { words: "answer" },
    })
    assert.match((done.content as { text: string }[])[0].text, /^An answer\./)
    const noArguments = await client.callTool({ name: "bare_tool" })
    assert.equal((noArguments.content as { text: string }[])[0].text, "Bare.")
    const controller = new AbortController()
    const waiting = client
      .callTool({ name: "wait_a_while", arguments: {} }, undefined, {
        signal: controller.signal,
        onprogress: () => undefined,
      })
      .catch((error: Error) => error)
    await new Promise((resolve) => setTimeout(resolve, 30))
    controller.abort()
    await waiting
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(tools.stopped.length, 1)
    await client.close()
  })
})
