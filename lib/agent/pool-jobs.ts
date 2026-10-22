/**
 * An agent's jobs for one of the image tools' worker pools (resizer,
 * converter, animation, audio): each job is handed to the pool as the
 * tool's page hands one, and its answer comes back as a promise. The
 * agent has pools of its own, so a setting changed on a page never stops
 * an agent's job, nor the other way round.
 */
import { ToolError } from "./registry"

/** What of `WorkerPool` is used: asking for work, and stopping it. */
export interface PoolLike {
  kick(): void
  cancel(): void
  forget(id: string): void
  dispose(): void
}

/** The messages every pool's workers send. */
export interface JobMessage {
  type: string
  id: string
  message?: string
}

/** A job without its id, for each kind of job in a union. */
export type WithoutId<Job> = Job extends unknown ? Omit<Job, "id"> : never

interface Waiting<Message> {
  job: { id: string }
  resolve: (done: Message) => void
  reject: (error: Error) => void
  onMessage?: (message: Message) => void
}

export class PoolJobs<Job extends { id: string }, Message extends JobMessage> {
  private readonly pool: PoolLike
  private readonly waiting = new Map<string, Waiting<Message>>()
  private readonly queue: string[] = []
  private count = 0

  constructor(
    make: (
      listener: (message: Message) => void,
      next: (cachedId: string | null) => Job | null
    ) => PoolLike,
    private readonly prefix: string
  ) {
    this.pool = make(
      (message) => this.heard(message),
      // Each of an agent's jobs is new to the worker: the oldest goes first.
      () => {
        const id = this.queue.shift()
        return id ? (this.waiting.get(id)!.job as Job) : null
      }
    )
  }

  private heard(message: Message) {
    const waiting = this.waiting.get(message.id)
    if (!waiting) return
    if (message.type === "done") {
      this.waiting.delete(message.id)
      waiting.resolve(message)
    } else if (message.type === "error" || message.type === "open-error") {
      this.waiting.delete(message.id)
      waiting.reject(
        new ToolError(message.message ?? "The image could not be read.")
      )
    } else if (message.type === "abandoned") {
      this.waiting.delete(message.id)
      waiting.reject(new DOMException("Stopped.", "AbortError"))
    } else waiting.onMessage?.(message)
  }

  /** Runs one job: its "done" answer, or the worker's problem as a ToolError. */
  run(
    job: WithoutId<Job>,
    options: { signal: AbortSignal; onMessage?: (message: Message) => void }
  ): Promise<Message> {
    const id = `${this.prefix}-${++this.count}`
    const promise = new Promise<Message>((resolve, reject) => {
      this.waiting.set(id, {
        job: { ...job, id } as unknown as Job,
        resolve,
        reject,
        onMessage: options.onMessage,
      })
      this.queue.push(id)
    })
    const stop = () => {
      if (!this.waiting.has(id)) return
      const queued = this.queue.indexOf(id)
      this.waiting.get(id)!.reject(new DOMException("Stopped.", "AbortError"))
      this.waiting.delete(id)
      if (queued >= 0) this.queue.splice(queued, 1)
      else {
        // A running job stops only with its worker; the others carry on in a new one.
        this.pool.cancel()
        this.pool.forget(id)
        this.pool.kick()
      }
    }
    options.signal.addEventListener("abort", stop)
    if (options.signal.aborted) stop()
    else this.pool.kick()
    return promise.finally(() =>
      options.signal.removeEventListener("abort", stop)
    )
  }

  dispose() {
    this.pool.dispose()
    for (const waiting of this.waiting.values())
      waiting.reject(new DOMException("Stopped.", "AbortError"))
    this.waiting.clear()
    this.queue.length = 0
  }
}
