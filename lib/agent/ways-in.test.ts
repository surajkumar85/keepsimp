import { describe, expect, it } from "vitest"
import { runJob } from "@/lib/json-workspace/jobs"
import { FakePdfClient } from "@/tests/agent-pdf-fake"
import { Agent } from "./agent"
import { PdfEngine } from "./pdf-engine"
import { CompressorEngine } from "./image-engines"
import { PoolJobs } from "./pool-jobs"
import { FakeCompressor, FakePool } from "@/tests/agent-image-fake"
import { bridgeApi } from "./bridge-api"
import { AGENT_VERSION, asTool, type AgentTool } from "./registry"
import { agentTools } from "./tools"
import { modelContextOf, registerTools, type WebMcpTool } from "./webmcp"

const engines = {
  runJson: (job: Parameters<typeof runJob>[0]) => Promise.resolve(runJob(job)),
  sampleImage: async () => ({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  }),
  paletteStrip: async () => new Blob(),
  pdf: new PdfEngine((onFile) => new FakePdfClient(onFile)),
  text: {
    font: async () => new ArrayBuffer(1),
    own: async () => undefined,
    layOut: (object: never) => object,
  },
  ocr: async () => ({ read: async () => [], stop: () => undefined }),
  images: {
    compressor: new CompressorEngine(
      (listener) => new FakeCompressor(listener)
    ),
    resizer: new PoolJobs(
      (listener, next) => new FakePool(listener, next, () => []),
      "r"
    ) as never,
    converter: new PoolJobs(
      (listener, next) => new FakePool(listener, next, () => []),
      "c"
    ) as never,
    rasterise: async () => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    }),
  },
  animation: new PoolJobs(
    (listener, next) => new FakePool(listener, next, () => []),
    "a"
  ) as never,
  audio: {
    pool: new PoolJobs(
      (listener, next) => new FakePool(listener, next, () => []),
      "s"
    ) as never,
    decode: async () => ({ planes: [], sampleRate: 44100 }),
    transcribe: () => () => undefined,
    video: () => () => undefined,
    colours: () => ({
      background: "rgb(0, 0, 0)",
      foreground: "rgb(255, 255, 255)",
      muted: "rgb(128, 128, 128)",
      accent: "rgb(0, 128, 128)",
    }),
  },
  video: {
    pool: new PoolJobs(
      (listener, next) => new FakePool(listener, next, () => []),
      "v"
    ) as never,
    ask: { video: async () => true, sound: async () => true },
    folder: "test",
    frame: async () => new Blob(),
  },
}

describe("every tool", () => {
  it("has its own name, a checked schema and words for the agent", async () => {
    const agent = new Agent(agentTools(engines))
    const names = agent.tools().map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    for (const tool of agent.tools()) {
      expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)+$/)
      expect(tool.description.length).toBeGreaterThan(40)
      expect(tool.inputSchema.additionalProperties).toBe(false)
    }
    const empty = await agent.call("list_files", {}, { caller: "browser" })
    expect(empty.summary).toMatch(/No files yet/)
    agent.files.add(new Blob(["x"]), "x.txt")
    expect(
      (await agent.call("list_files", {}, { caller: "page" })).summary
    ).toBe("1 file.")
    agent.files.add(new Blob(["y"]), "y.txt")
    const two = await agent.call("list_files", {}, { caller: "page" })
    expect(two.summary).toBe("2 files.")
    expect(two.data).toHaveLength(2)
  })
})

describe("WebMCP", () => {
  it("finds the browser's model context only where it can register tools", () => {
    expect(modelContextOf(document)).toBeNull()
    const context = { registerTool: () => undefined }
    expect(
      modelContextOf({ modelContext: context } as unknown as Document)
    ).toBe(context)
    expect(
      modelContextOf({ modelContext: {} } as unknown as Document)
    ).toBeNull()
  })

  it("registers each tool, answers as JSON text and takes them away", async () => {
    const agent = new Agent(agentTools(engines))
    const registered: WebMcpTool[] = []
    let signal: AbortSignal | undefined
    const refused: string[] = []
    const { taken, undo } = await registerTools(
      agent,
      {
        registerTool(tool, options) {
          signal = options?.signal
          if (tool.name === "convert_color") throw new Error("not today")
          registered.push(tool)
        },
      },
      (name, problem) => refused.push(`${name}: ${problem}`)
    )
    expect(taken).toBe(agent.tools().length - 1)
    expect(refused).toEqual(["convert_color: not today"])
    const format = registered.find((tool) => tool.name === "format_json")!
    expect(format.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
    expect(JSON.parse(await format.execute({ text: "[1]" }))).toMatchObject({
      summary: "Formatted.",
    })
    expect(JSON.parse(await format.execute({ style: "x" }))).toEqual({
      problem: expect.stringMatching(/must be one of/),
    })
    expect(agent.calls()[0].caller).toBe("browser")
    undo()
    expect(signal?.aborted).toBe(true)
    // Without a way to say what was refused, nothing breaks.
    const quiet = await registerTools(agent, {
      registerTool: () => Promise.reject(new Error("no")),
    })
    expect(quiet.taken).toBe(0)
  })
})

describe("the bridge's interface", () => {
  const slow: AgentTool<Record<string, never>> = {
    name: "slow_thing",
    title: "Slow",
    description: "Waits until it is stopped, telling how far it is.",
    inputSchema: { type: "object", additionalProperties: false },
    run: (_input, { signal, progress }) =>
      new Promise((_resolve, reject) => {
        progress(0.5, "halfway")
        signal.addEventListener("abort", () => reject(new Error("x")))
      }),
  }

  it("lists the tools without the page's own, and runs them", async () => {
    const agent = new Agent([...agentTools(engines), asTool(slow)])
    const told: [string, number, string][] = []
    const saved: string[] = []
    const api = bridgeApi(agent, {
      download: (_blob, name) => saved.push(name),
      progress: (id, fraction, note) => told.push([id, fraction, note]),
      fetch: async (url) =>
        url === "/__bridge/in/bad"
          ? new Response("", { status: 404 })
          : url === "/__bridge/in/throws"
            ? Promise.reject(new Error("refused"))
            : new Response('{"a":1}'),
    })
    expect(api.version).toBe(AGENT_VERSION)
    expect(api.tools().some((tool) => tool.name === "list_files")).toBe(false)

    const loaded = await api.load(
      "/__bridge/in/1",
      "a.json",
      "application/json"
    )
    expect(loaded).toEqual({
      ok: true,
      value: expect.objectContaining({
        name: "a.json",
        type: "application/json",
      }),
    })
    expect(await api.load("/__bridge/in/bad", "b.json", "")).toEqual({
      ok: false,
      problem: "b.json could not be read.",
    })
    expect(await api.load("/__bridge/in/throws", "c.json", "")).toEqual({
      ok: false,
      problem: "refused",
    })

    const id = loaded.ok ? loaded.value.id : ""
    const done = await api.run("c1", "format_json", { file: id })
    expect(done.ok).toBe(true)
    const made = done.ok ? done.value.files![0] : null
    expect(api.save(made!.id)).toEqual({ ok: true, value: made })
    expect(saved).toEqual(["a-formatted.json"])
    expect(api.save("file-99")).toMatchObject({ ok: false })
    expect(await api.run("c2", "nope", {})).toMatchObject({ ok: false })

    const running = api.run("c3", "slow_thing", {})
    api.stop("c3")
    expect(await running).toEqual({
      ok: false,
      problem: "Stopped before it was done.",
    })
    expect(told).toEqual([["c3", 0.5, "halfway"]])

    api.forget([id, made!.id])
    expect(agent.files.list()).toEqual([])
  })

  it("says something went wrong even when a problem has no words", async () => {
    const agent = new Agent([])
    const api = bridgeApi(agent, {
      download: () => undefined,
      progress: () => undefined,
      fetch: () => Promise.reject("nothing"),
    })
    expect(await api.load("/x", "x", "")).toEqual({
      ok: false,
      problem: "Something went wrong.",
    })
  })
})
