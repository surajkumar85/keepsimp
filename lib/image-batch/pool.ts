"use client"

interface Slot {
  worker: Worker
  /** Image the worker is processing now. */
  busy: string | null
  /** Image the worker still has decoded. */
  cached: string | null
}

/** Messages every batch worker sends; each tool adds its own payloads. */
export interface PoolMessage {
  type: string
  id: string
}

/** How many workers to run: leave a core for the page, and stay modest on phones. */
export function poolSize(cores: number | undefined) {
  return Math.max(1, Math.min(4, (cores ?? 2) - 1))
}

const FINISHED = ["done", "error", "abandoned", "open-error"]

/**
 * A small pool of image workers. Whenever a worker is free it asks `next` for
 * work, so the newest settings and the selected image always win. Workers
 * receive `{ ...job, type: "process", generation }` and understand
 * `supersede` and `forget`.
 */
export class WorkerPool<
  Job extends { id: string },
  Message extends PoolMessage,
> {
  private slots: Slot[] = []
  private generation = 0

  constructor(
    private readonly size: number,
    /** Must contain the literal `new Worker(new URL(...))` so the bundler can find it. */
    private readonly create: () => Worker,
    private readonly listener: (message: Message) => void,
    private readonly next: (cachedId: string | null) => Job | null
  ) {}

  private spawn(): Slot {
    const worker = this.create()
    const slot: Slot = { worker, busy: null, cached: null }
    worker.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data
      if (FINISHED.includes(message.type)) {
        if (message.type === "open-error") slot.cached = null
        slot.busy = null
      }
      if (message.type !== "abandoned") this.listener(message)
      this.kick()
    }
    worker.onerror = () => {
      const id = slot.busy
      slot.busy = null
      slot.cached = null
      if (id)
        this.listener({
          type: "open-error",
          id,
          message:
            "The image engine stopped unexpectedly. Remove this image and try again.",
        } as unknown as Message)
      this.kick()
    }
    return slot
  }

  /** Images currently being processed. */
  inFlight() {
    return new Set(this.slots.flatMap((slot) => (slot.busy ? [slot.busy] : [])))
  }

  /** Hand work to every idle worker. */
  kick() {
    for (let index = 0; index < this.size; index++) {
      const slot = (this.slots[index] ??= this.spawn())
      if (slot.busy) continue
      const job = this.next(slot.cached)
      if (!job) return
      slot.busy = job.id
      slot.cached = job.id
      slot.worker.postMessage({
        ...job,
        type: "process",
        generation: this.generation,
      })
    }
  }

  /** Settings changed: running jobs stop at their next checkpoint. */
  supersede() {
    this.generation++
    for (const slot of this.slots)
      slot.worker.postMessage({
        type: "supersede",
        generation: this.generation,
      })
  }

  forget(id: string) {
    for (const slot of this.slots) {
      if (slot.cached === id) slot.cached = null
      slot.worker.postMessage({ type: "forget", id })
    }
  }

  /** Stop everything immediately. */
  cancel() {
    for (const slot of this.slots) slot.worker.terminate()
    this.slots = []
  }

  dispose() {
    this.cancel()
  }
}
