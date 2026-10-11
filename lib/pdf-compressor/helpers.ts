/**
 * Picture encoding on several cores. The PDF engine lives in one worker, and
 * a picture's pixels can be handed to helper workers that only run the
 * codecs. This is the side that hands the work out; `codec.worker.ts` is a
 * helper.
 */
import type { Size } from "@/lib/image-compressor/geometry"
import type { Pixels } from "@/lib/image-compressor/ssim"
import type { Codecs } from "./mupdf-compress"

/** What a helper is asked to do. Each is a call of one of the codecs. */
export type HelperTask =
  | { op: "jpeg"; pixels: Pixels; quality: number; grey: boolean }
  | { op: "resize"; pixels: Pixels; size: Size; linear: boolean }
  | { op: "png"; pixels: Pixels }
  | { op: "deflate"; bytes: Uint8Array }

/** A helper's answer; `failed` when its codec could not load or gave up. */
export type HelperReply =
  | { id: number; bytes: Uint8Array }
  | { id: number; pixels: Pixels }
  | { id: number; failed: true }

/** The end of a line to a helper: a `MessagePort`, or anything shaped like one. */
export interface HelperPort {
  postMessage(message: HelperTask & { id: number }): void
  onmessage: ((event: { data: HelperReply }) => void) | null
}

/**
 * A picture with more pixels than this is encoded where it is. Handing it to
 * a helper means a second copy of its pixels, and the largest pictures are
 * the ones a device has least room for twice.
 */
export const HELPER_PIXELS = 16_000_000

interface Job {
  task: HelperTask
  /** The same work, done here. */
  here: () => Promise<Uint8Array | Pixels>
  resolve: (result: Uint8Array | Pixels) => void
  reject: (error: unknown) => void
}

const pixelsIn = (pixels: Pixels) => pixels.width * pixels.height

/**
 * Codecs that run on helpers when there are any, and here when there are
 * none, when a helper fails, or when a picture is too large to copy.
 */
export class HelperCodecs {
  private readonly idle: HelperPort[] = []
  private readonly busy = new Map<HelperPort, Job & { id: number }>()
  private readonly waiting: Job[] = []
  private ids = 0

  constructor(private readonly local: Codecs) {}

  /** How many pictures can be worked on at once. */
  get lanes() {
    return Math.max(1, this.idle.length + this.busy.size)
  }

  /** A helper is ready for work. */
  add(port: HelperPort) {
    port.onmessage = (event) => this.answered(port, event.data)
    this.idle.push(port)
    this.pump()
  }

  /** The helpers are gone: what they were doing, and what waited for them, is done here. */
  clear() {
    const jobs = [...this.busy.values(), ...this.waiting]
    for (const port of [...this.idle, ...this.busy.keys()])
      port.onmessage = null
    this.idle.length = 0
    this.busy.clear()
    this.waiting.length = 0
    for (const job of jobs) this.doHere(job)
  }

  private doHere(job: Job) {
    job.here().then(job.resolve, job.reject)
  }

  private answered(port: HelperPort, reply: HelperReply) {
    const job = this.busy.get(port)
    if (!job || job.id !== reply.id) return
    this.busy.delete(port)
    if ("failed" in reply) {
      // A helper that failed once is not asked again.
      port.onmessage = null
      this.doHere(job)
      // With the last helper gone, nothing would come for those waiting.
      if (!this.idle.length && !this.busy.size) this.clear()
      return
    }
    job.resolve("bytes" in reply ? reply.bytes : reply.pixels)
    this.idle.push(port)
    this.pump()
  }

  private pump() {
    while (this.idle.length && this.waiting.length) {
      const port = this.idle.pop()!
      const job = { ...this.waiting.shift()!, id: ++this.ids }
      this.busy.set(port, job)
      port.postMessage({ ...job.task, id: job.id })
    }
  }

  private run<T extends Uint8Array | Pixels>(
    task: HelperTask,
    pixels: number,
    here: () => Promise<T>
  ) {
    if (pixels > HELPER_PIXELS || !(this.idle.length + this.busy.size))
      return here()
    return new Promise<T>((resolve, reject) => {
      this.waiting.push({
        task,
        here,
        resolve: resolve as Job["resolve"],
        reject,
      })
      this.pump()
    })
  }

  readonly codecs: Codecs = {
    jpeg: (pixels, quality, grey) =>
      this.run({ op: "jpeg", pixels, quality, grey }, pixelsIn(pixels), () =>
        this.local.jpeg(pixels, quality, grey)
      ),
    resize: (pixels, size, linear) =>
      this.run({ op: "resize", pixels, size, linear }, pixelsIn(pixels), () =>
        this.local.resize(pixels, size, linear)
      ),
    png: (pixels) =>
      this.run({ op: "png", pixels }, pixelsIn(pixels), () =>
        this.local.png(pixels)
      ),
    deflate: (bytes) =>
      // Four bytes a pixel, so the same limit in bytes.
      this.run({ op: "deflate", bytes }, bytes.length / 4, () =>
        this.local.deflate(bytes)
      ),
  }
}

/** Bytes that may be handed over whole: a view of part of a buffer is copied first. */
function whole<T extends Uint8Array | Uint8ClampedArray>(view: T): T {
  return view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
    ? view
    : (view.slice() as T)
}

/**
 * A helper's side: do one task and give the answer, with the buffer to hand
 * over rather than copy.
 */
export async function answer(
  codecs: Codecs,
  task: HelperTask & { id: number }
): Promise<{ reply: HelperReply; transfer: ArrayBufferLike[] }> {
  const { id } = task
  try {
    if (task.op === "resize") {
      const made = await codecs.resize(task.pixels, task.size, task.linear)
      // The resizer gives an ImageData; a plain object crosses just as well.
      const data = whole(made.data)
      return {
        reply: { id, pixels: { data, width: made.width, height: made.height } },
        transfer: [data.buffer],
      }
    }
    const bytes = whole(
      task.op === "jpeg"
        ? await codecs.jpeg(task.pixels, task.quality, task.grey)
        : task.op === "png"
          ? await codecs.png(task.pixels)
          : await codecs.deflate(task.bytes)
    )
    return { reply: { id, bytes }, transfer: [bytes.buffer] }
  } catch {
    return { reply: { id, failed: true }, transfer: [] }
  }
}
