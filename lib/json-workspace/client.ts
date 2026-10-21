/**
 * Running JSON jobs in the worker, with no React: the workspace's hook and
 * the agent tools both use it. One worker, started when first needed; a job
 * that takes too long ends the worker, and every job waiting with it.
 */
import type { JsonJob, JsonResult, JsonWorkerResponse } from "./protocol"

export class JsonOperationError extends Error {
  constructor(
    message: string,
    public offset?: number
  ) {
    super(message)
  }
}

export const CANCELLED = "Operation cancelled. Your source is unchanged."

export const createJsonWorker = () =>
  new Worker(new URL("./json.worker.ts", import.meta.url), { type: "module" })

interface Waiting {
  resolve: (result: JsonResult) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export class JsonClient {
  private worker: Worker | null = null
  private sequence = 0
  private readonly pending = new Map<number, Waiting>()

  constructor(
    private readonly create: () => Worker = createJsonWorker,
    /** Told whether any job is waiting, whenever that changes. */
    private readonly onBusy: (busy: boolean) => void = () => undefined,
    private readonly patience = 20_000
  ) {}

  /** Ends the worker and every job waiting on it, with `reason`. */
  stop(reason = CANCELLED) {
    this.worker?.terminate()
    this.worker = null
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timeout)
      const error = new Error(reason)
      error.name = reason === CANCELLED ? "AbortError" : "Error"
      waiting.reject(error)
    }
    this.pending.clear()
    this.onBusy(false)
  }

  run(job: JsonJob): Promise<JsonResult> {
    if (!this.worker) {
      const worker = this.create()
      worker.onmessage = (event: MessageEvent<JsonWorkerResponse>) => {
        const response = event.data
        const waiting = this.pending.get(response.id)
        if (!waiting) return
        clearTimeout(waiting.timeout)
        this.pending.delete(response.id)
        if ("error" in response)
          waiting.reject(
            new JsonOperationError(response.error, response.offset)
          )
        else waiting.resolve(response.result)
        this.onBusy(this.pending.size > 0)
      }
      worker.onerror = () =>
        this.stop(
          "The JSON worker could not run. Retry the operation or reload the workspace."
        )
      this.worker = worker
    }
    const id = ++this.sequence
    this.onBusy(true)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          this.stop(
            "This operation took too long. Try a smaller document or a simpler query/schema."
          ),
        this.patience
      )
      this.pending.set(id, { resolve, reject, timeout })
      this.worker!.postMessage({ id, job })
    })
  }
}
