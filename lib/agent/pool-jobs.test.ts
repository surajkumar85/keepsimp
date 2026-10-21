import { describe, expect, it } from "vitest"
import { FakePool } from "@/tests/agent-image-fake"
import { PoolJobs, type JobMessage } from "./pool-jobs"
import { ToolError } from "./registry"

type Job = { id: string; what: string }

function setup(answer: (job: Job) => JobMessage[]) {
  let pool!: FakePool<Job, JobMessage>
  const jobs = new PoolJobs<Job, JobMessage>(
    (listener, next) => (pool = new FakePool(listener, next, answer)),
    "t"
  )
  return { jobs, pool: () => pool }
}

const signal = () => new AbortController().signal

describe("an agent's jobs on a pool", () => {
  it("hands each job to the pool in turn and gives its answer", async () => {
    const heard: string[] = []
    const { jobs, pool } = setup((job) => [
      { type: "progress", id: job.id },
      { type: "progress", id: "someone-else" },
      { type: "done", id: job.id, message: job.what },
    ])
    const [first, second] = await Promise.all([
      jobs.run(
        { what: "a" },
        { signal: signal(), onMessage: (message) => heard.push(message.type) }
      ),
      jobs.run({ what: "b" }, { signal: signal() }),
    ])
    expect([first.message, second.message]).toEqual(["a", "b"])
    expect(pool().jobs.map((job) => job.id)).toEqual(["t-1", "t-2"])
    expect(heard).toEqual(["progress"])
  })

  it("passes a worker's problems on, and a job it gave up as stopped", async () => {
    const { jobs } = setup((job) =>
      job.what === "bad"
        ? [{ type: "error", id: job.id, message: "Cannot decode." }]
        : job.what === "unopened"
          ? [{ type: "open-error", id: job.id }]
          : [{ type: "abandoned", id: job.id }]
    )
    await expect(
      jobs.run({ what: "bad" }, { signal: signal() })
    ).rejects.toThrow(new ToolError("Cannot decode."))
    await expect(
      jobs.run({ what: "unopened" }, { signal: signal() })
    ).rejects.toThrow("The image could not be read.")
    await expect(
      jobs.run({ what: "given-up" }, { signal: signal() })
    ).rejects.toThrow("Stopped.")
  })

  it("stops a waiting job without touching the worker, and a running one with it", async () => {
    const { jobs, pool } = setup((job) => [{ type: "done", id: job.id }])
    pool().hold = true
    const running = new AbortController()
    const waiting = new AbortController()
    const first = jobs.run({ what: "a" }, { signal: running.signal })
    const second = jobs.run({ what: "b" }, { signal: waiting.signal })
    const third = jobs.run({ what: "c" }, { signal: signal() })
    waiting.abort()
    await expect(second).rejects.toThrow("Stopped.")
    expect(pool().cancels).toBe(0)
    running.abort()
    await expect(first).rejects.toThrow("Stopped.")
    expect(pool().cancels).toBe(1)
    expect(pool().forgotten).toEqual(["t-1"])
    // The next job goes on in a new worker; stopping it after it ended changes nothing.
    pool().hold = false
    pool().finish()
    expect((await third).id).toBe("t-3")
    running.abort()

    const before = new AbortController()
    before.abort()
    await expect(
      jobs.run({ what: "d" }, { signal: before.signal })
    ).rejects.toThrow("Stopped.")
  })

  it("ignores a stop that comes just after the answer", async () => {
    const { jobs, pool } = setup((job) => [{ type: "done", id: job.id }])
    pool().hold = true
    const controller = new AbortController()
    const answer = jobs.run({ what: "a" }, { signal: controller.signal })
    pool().finish()
    controller.abort()
    expect((await answer).id).toBe("t-1")
  })

  it("lets every job go when it is put away", async () => {
    const { jobs, pool } = setup(() => [])
    pool().hold = true
    const left = jobs.run({ what: "a" }, { signal: signal() })
    jobs.dispose()
    await expect(left).rejects.toThrow("Stopped.")
  })
})
