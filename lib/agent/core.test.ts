import { describe, expect, it } from "vitest"
import { Agent, KEPT_CALLS } from "./agent"
import { FileStore, madeName, safeName, typeOf } from "./files"
import {
  asTool,
  fileFields,
  fileProperty,
  filesProperty,
  listingOf,
  ToolError,
  type AgentTool,
} from "./registry"
import { checker, said } from "./schema"

const echo: AgentTool<{ file?: string; files?: string[]; n?: number }> = {
  name: "echo",
  title: "Echo",
  description: "Says what it was given.",
  inputSchema: {
    type: "object",
    properties: {
      file: fileProperty("One file."),
      files: filesProperty("Several.", 1, 3),
      n: { type: "integer" },
    },
    additionalProperties: false,
  },
  async run(input) {
    return { summary: `n is ${input.n ?? "none"}`, data: input }
  },
}

describe("files", () => {
  it("knows types by extension", () => {
    expect(typeOf("a.JSON")).toBe("application/json")
    expect(typeOf("photo.jpeg")).toBe("image/jpeg")
    expect(typeOf("archive.zzz")).toBe("application/octet-stream")
    expect(typeOf("noextension")).toBe("application/octet-stream")
  })

  it("makes names that are only names", () => {
    expect(safeName("../../etc/passwd")).toBe("passwd")
    expect(safeName("C:\\Users\\x\\report.pdf")).toBe("report.pdf")
    expect(safeName("a\u0000b\u001f.txt")).toBe("ab.txt")
    expect(safeName("...hidden")).toBe("hidden")
    expect(safeName("  ")).toBe("file")
    const long = `${"x".repeat(200)}.json`
    expect(safeName(long)).toHaveLength(120)
    expect(safeName(long).endsWith(".json")).toBe(true)
    expect(safeName("y".repeat(200))).toHaveLength(120)
    expect(madeName("data.json", "-formatted", "json")).toBe(
      "data-formatted.json"
    )
    expect(madeName(null, "-palette", "css")).toBe("palette.css")
    expect(madeName("noext", "-x", "txt")).toBe("noext-x.txt")
  })

  it("holds files by id, and says which there are when one is missing", () => {
    const store = new FileStore()
    let told = 0
    const stop = store.subscribe(() => told++)
    expect(() => store.get("file-1")).toThrow(/none yet/)
    const added = store.add(new Blob(["{}"]), "a.json")
    expect(added).toEqual({
      id: "file-1",
      name: "a.json",
      type: "application/json",
      size: 2,
    })
    const made = store.add(new Blob(["x"], { type: "text/plain" }), "b", "made")
    expect(made.type).toBe("text/plain")
    expect(store.has("file-2")).toBe(true)
    expect(store.list().map((file) => file.origin)).toEqual(["added", "made"])
    expect(() => store.get("file-9")).toThrow(
      'There is no file "file-9". The files that can be named are: file-1, file-2.'
    )
    const first = store.snapshot()
    expect(store.snapshot()).toBe(first)
    store.remove("file-1")
    expect(store.snapshot()).not.toBe(first)
    store.remove("file-1")
    expect(store.list()).toHaveLength(1)
    stop()
    store.add(new Blob([]), "c")
    expect(told).toBe(3)
  })
})

describe("the registry", () => {
  it("marks the properties that name files", () => {
    expect(fileFields(echo.inputSchema)).toEqual([
      { name: "file", many: false },
      { name: "files", many: true },
    ])
    expect(fileFields({ type: "object" })).toEqual([])
    expect(filesProperty("x")).toMatchObject({ minItems: 1, maxItems: 50 })
    expect(listingOf(asTool(echo))).toEqual({
      name: "echo",
      title: "Echo",
      description: "Says what it was given.",
      inputSchema: echo.inputSchema,
      annotations: {},
      pageOnly: false,
    })
  })
})

describe("checking inputs", () => {
  it("says what is wrong, in words", () => {
    const check = checker({
      type: "object",
      properties: {
        style: { type: "string", enum: ["a", "b"] },
        deep: {
          type: "object",
          properties: { n: { type: "integer" } },
        },
      },
      required: ["style"],
      additionalProperties: false,
    })
    expect(check({ style: "a" })).toBeNull()
    expect(check({})).toBe('"style" is needed.')
    expect(check({ style: "c" })).toBe('"style" must be one of "a", "b".')
    expect(check({ style: "a", extra: 1 })).toBe(
      'The input has "extra", which this tool does not take.'
    )
    expect(check({ style: "a", deep: { n: 1.5 } })).toBe(
      '"deep.n" must be integer.'
    )
    expect(check("text")).toBe("The input must be object.")
    expect(
      checker({
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
          c: { type: "string" },
          d: { type: "string" },
          e: { type: "string" },
        },
      })({ a: 1, b: 1, c: 1, d: 1, e: 1 })
    ).toMatch(/; 2 more\.$/)
    expect(
      said({
        keyword: "minimum",
        instancePath: "",
        schemaPath: "",
        params: {},
        message: "must be >= 1",
      })
    ).toBe("The input must be >= 1")
  })
})

describe("the agent", () => {
  it("refuses two tools of one name", () => {
    expect(() => new Agent([asTool(echo), asTool(echo)])).toThrow(/Two tools/)
  })

  it("checks a call before it runs, and lists it", async () => {
    const agent = new Agent([asTool(echo)])
    expect(agent.tools().map((tool) => tool.name)).toEqual(["echo"])
    expect(agent.tool("echo")?.title).toBe("Echo")
    await expect(agent.call("nope", {}, { caller: "page" })).rejects.toThrow(
      'There is no tool called "nope". The tools are: echo.'
    )
    await expect(
      agent.call("echo", { n: "x" }, { caller: "page" })
    ).rejects.toThrow('"n" must be integer.')
    await expect(
      agent.call("echo", { file: "file-1" }, { caller: "page" })
    ).rejects.toThrow(/There is no file "file-1"/)
    await expect(
      agent.call("echo", { files: ["file-1"] }, { caller: "page" })
    ).rejects.toThrow(ToolError)
    const ref = agent.files.add(new Blob(["x"]), "x.txt")
    let told = 0
    const stop = agent.subscribe(() => told++)
    const result = await agent.call(
      "echo",
      { file: ref.id, files: [ref.id], n: 2 },
      { caller: "bridge", id: "mine" }
    )
    expect(result.summary).toBe("n is 2")
    expect(agent.calls()[0]).toMatchObject({
      id: "mine",
      tool: "echo",
      caller: "bridge",
      state: "done",
      progress: 1,
    })
    stop()
    expect(told).toBe(2)
    await agent.call("echo", {}, { caller: "page" })
    expect(agent.calls()[0].id).toBe("call-1")
  })

  it("passes progress on, and says why a tool failed", async () => {
    const working: AgentTool<Record<string, never>> = {
      ...asTool(echo),
      name: "work",
      inputSchema: { type: "object" },
      async run(_input, { progress }) {
        progress(2, "far")
        progress(-1)
        throw new Error("It broke.")
      },
    }
    const silent: AgentTool<Record<string, never>> = {
      ...asTool(echo),
      name: "silent",
      inputSchema: { type: "object" },
      async run() {
        throw "not an error"
      },
    }
    const agent = new Agent([asTool(working), asTool(silent)])
    const told: [number, string][] = []
    await expect(
      agent.call(
        "work",
        {},
        { caller: "page", onProgress: (f, note) => told.push([f, note]) }
      )
    ).rejects.toThrow("It broke.")
    expect(told).toEqual([
      [1, "far"],
      [0, ""],
    ])
    expect(agent.calls()[0]).toMatchObject({
      state: "failed",
      problem: "It broke.",
    })
    await agent.call("work", {}, { caller: "page" }).catch(() => undefined)
    await expect(agent.call("silent", {}, { caller: "page" })).rejects.toThrow(
      "The tool could not finish."
    )
  })

  it("stops a call when asked, from the page or by its caller", async () => {
    let release = () => {}
    const waiting: AgentTool<Record<string, never>> = {
      ...asTool(echo),
      name: "wait",
      inputSchema: { type: "object" },
      run: (_input, { signal }) =>
        new Promise((resolve, reject) => {
          release = () => resolve({ summary: "late" })
          signal.addEventListener("abort", () => reject(new Error("gone")))
        }),
    }
    const agent = new Agent([asTool(waiting)])
    const first = agent.call("wait", {}, { caller: "page", id: "a" })
    agent.stop("a")
    agent.stop("never")
    await expect(first).rejects.toThrow("Stopped before it was done.")
    expect(agent.calls()[0].state).toBe("stopped")

    const outside = new AbortController()
    const second = agent.call(
      "wait",
      {},
      { caller: "browser", signal: outside.signal }
    )
    outside.abort()
    await expect(second).rejects.toThrow("Stopped")

    const already = new AbortController()
    already.abort()
    await expect(
      agent.call("wait", {}, { caller: "browser", signal: already.signal })
    ).rejects.toThrow("Stopped")

    // A tool that finishes anyway after Stop still counts as stopped.
    const third = agent.call("wait", {}, { caller: "page", id: "c" })
    const call = agent.calls()[0]
    expect(call.id).toBe("c")
    release()
    agent.stop("c")
    await expect(third).rejects.toThrow("Stopped")
  })

  it("keeps the newest calls only", async () => {
    const agent = new Agent([asTool(echo)])
    for (let n = 0; n < KEPT_CALLS + 5; n++)
      await agent.call("echo", { n }, { caller: "page" })
    expect(agent.calls()).toHaveLength(KEPT_CALLS)
    expect(agent.calls()[0].result?.summary).toBe(`n is ${KEPT_CALLS + 4}`)
  })
})
