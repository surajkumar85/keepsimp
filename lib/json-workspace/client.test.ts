import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CANCELLED,
  createJsonWorker,
  JsonClient,
  JsonOperationError,
} from "./client"
import { answer } from "./jobs"
import type { JsonJob } from "./protocol"

/** A worker that answers with the real jobs, as the JSON worker does. */
class AnsweringWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  silent = false
  postMessage({ id, job }: { id: number; job: JsonJob }) {
    if (this.silent) return
    queueMicrotask(() =>
      this.onmessage?.({ data: answer(id, job) } as MessageEvent)
    )
  }
  terminate() {
    this.terminated = true
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("the JSON client", () => {
  it("runs jobs in one worker, saying when it is busy", async () => {
    const workers: AnsweringWorker[] = []
    const busy: boolean[] = []
    const client = new JsonClient(
      () => {
        const worker = new AnsweringWorker()
        workers.push(worker)
        return worker as unknown as Worker
      },
      (now) => busy.push(now)
    )
    const formatted = await client.run({
      action: "transform",
      input: '{"a":1.50}',
      transform: "format",
    })
    expect(formatted.output).toBe('{\n  "a": 1.50\n}')
    await client.run({ action: "transform", input: "[]", transform: "minify" })
    expect(workers).toHaveLength(1)
    expect(busy).toEqual([true, false, true, false])
  })

  it("gives the place of a problem in the input", async () => {
    const client = new JsonClient(
      () => new AnsweringWorker() as unknown as Worker
    )
    const error = await client
      .run({ action: "transform", input: '{"a":}', transform: "format" })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(JsonOperationError)
    expect((error as JsonOperationError).offset).toBe(5)
  })

  it("ends the worker when a job takes too long, and on Stop", async () => {
    vi.useFakeTimers()
    const worker = new AnsweringWorker()
    worker.silent = true
    const client = new JsonClient(
      () => worker as unknown as Worker,
      undefined,
      100
    )
    const slow = client
      .run({ action: "table", input: "[]" })
      .catch((error: Error) => error)
    vi.advanceTimersByTime(100)
    const late = await slow
    expect((late as Error).message).toMatch(/took too long/)
    expect((late as Error).name).toBe("Error")
    expect(worker.terminated).toBe(true)

    const stopped = client
      .run({ action: "table", input: "[]" })
      .catch((error: Error) => error)
    client.stop()
    const error = (await stopped) as Error
    expect(error.message).toBe(CANCELLED)
    expect(error.name).toBe("AbortError")
  })

  it("says so when the worker cannot run, and ignores answers it did not ask for", async () => {
    const worker = new AnsweringWorker()
    worker.silent = true
    const client = new JsonClient(() => worker as unknown as Worker)
    const waiting = client
      .run({ action: "table", input: "[]" })
      .catch((error: Error) => error)
    worker.onmessage?.({ data: { id: 99, result: {} } } as MessageEvent)
    worker.onerror?.()
    expect(((await waiting) as Error).message).toMatch(/could not run/)
  })

  it("starts the JSON worker as a module", () => {
    const made: unknown[][] = []
    vi.stubGlobal(
      "Worker",
      class {
        constructor(...args: unknown[]) {
          made.push(args)
        }
      }
    )
    createJsonWorker()
    expect(String(made[0][0])).toMatch(/json\.worker\.ts/)
    expect(made[0][1]).toEqual({ type: "module" })
  })
})
