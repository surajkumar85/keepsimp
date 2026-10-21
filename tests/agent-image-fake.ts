/**
 * Stand-ins for the image tools' workers in unit tests: a pool that answers
 * each job as it is told to, and a compressor that opens and compresses.
 * The real workers are tested by the browser tests and the tools' own.
 */
import type { PoolLike, JobMessage } from "@/lib/agent/pool-jobs"
import type { CompressorLike } from "@/lib/agent/image-engines"
import type {
  CompressRequest,
  OpenRequest,
  WorkerResponse,
} from "@/lib/image-compressor/protocol"

/** A pool whose worker answers each job with what `answer` gives, a moment later. */
export class FakePool<
  Job extends { id: string },
  Message extends JobMessage,
> implements PoolLike {
  jobs: Job[] = []
  cancels = 0
  forgotten: string[] = []
  /** Jobs are held until released, to be stopped while they run. */
  hold = false
  private running: Job | null = null

  constructor(
    private readonly listener: (message: Message) => void,
    private readonly next: (cachedId: string | null) => Job | null,
    private readonly answer: (job: Job) => Message[]
  ) {}

  kick() {
    if (this.running) return
    const job = this.next(this.jobs.at(-1)?.id ?? null)
    if (!job) return
    this.running = job
    this.jobs.push(job)
    if (!this.hold) queueMicrotask(() => this.finish())
  }

  /** Lets the running job answer. */
  finish() {
    const job = this.running
    if (!job) return
    this.running = null
    for (const message of this.answer(job)) this.listener(message)
    this.kick()
  }

  cancel() {
    this.cancels++
    this.running = null
  }
  forget(id: string) {
    this.forgotten.push(id)
  }
  dispose() {
    this.running = null
  }
}

/** A compressor whose image is `width` by `height` and whose result is the given bytes. */
export class FakeCompressor implements CompressorLike {
  opens: OpenRequest[] = []
  compressions: CompressRequest[] = []
  disposed = 0
  hold = false
  width = 400
  height = 300
  transparent = false
  /** What compressing gives: its size in bytes, or a problem. */
  result:
    | { bytes: number; fits?: boolean; downscaled?: boolean }
    | { problem: string } = { bytes: 100 }
  openProblem: string | null = null

  constructor(private readonly listener: (message: WorkerResponse) => void) {}

  /** Says something the worker was not asked for. */
  emit(message: WorkerResponse) {
    this.listener(message)
  }

  open(request: OpenRequest) {
    this.opens.push(request)
    queueMicrotask(() =>
      this.listener(
        this.openProblem
          ? { type: "open-error", message: this.openProblem }
          : {
              type: "opened",
              width: this.width,
              height: this.height,
              transparent: this.transparent,
              preview: { close: () => undefined } as ImageBitmap,
            }
      )
    )
  }

  compress(request: CompressRequest) {
    this.compressions.push(request)
    if (this.hold) return
    queueMicrotask(() => {
      this.listener({ type: "progress", id: request.id, label: "Encoding" })
      // An answer to another job is not this one's.
      this.listener({
        type: "progress",
        id: request.id + 100,
        label: "Not mine",
      })
      const result = this.result
      this.listener(
        "problem" in result
          ? { type: "error", id: request.id, message: result.problem }
          : {
              type: "done",
              id: request.id,
              format: request.candidates[0],
              bytes: new ArrayBuffer(result.bytes),
              size: request.plan.output,
              reference: { close: () => undefined } as ImageBitmap,
              similarity: 0.98765,
              quality: request.quality,
              fits: result.fits ?? null,
              downscaled: result.downscaled ?? false,
            }
      )
    })
  }

  dispose() {
    this.disposed++
  }
}
