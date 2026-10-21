/**
 * The image compressor's worker, as the agent tools use it: one image at a
 * time, opened then compressed, as the compressor's page does. Stop lets
 * the worker go altogether: the next image starts a fresh one, so nothing
 * the stopped one still had to say can be taken for an answer.
 */
import type {
  CompressRequest,
  OpenRequest,
  WorkerResponse,
} from "@/lib/image-compressor/protocol"
import { ToolError } from "./registry"

/** What of `CompressorClient` is used; the class itself, or a stand-in in tests. */
export interface CompressorLike {
  open(request: OpenRequest): void
  compress(request: CompressRequest): void
  dispose(): void
}

export type Opened = Extract<WorkerResponse, { type: "opened" }>
export type Compressed = Extract<WorkerResponse, { type: "done" }>

/** For messages that come when nothing waits for them. */
const nothing = () => undefined

export class CompressorEngine {
  private readonly client: CompressorLike
  private listener: (message: WorkerResponse) => void = nothing
  private turn: Promise<unknown> = Promise.resolve()
  private count = 0

  constructor(
    make: (listener: (message: WorkerResponse) => void) => CompressorLike
  ) {
    this.client = make((message) => this.listener(message))
  }

  /** Opens an image to say what it is (its size, and whether it has transparency), after any image before it. */
  read(open: Omit<OpenRequest, "type">, signal: AbortSignal) {
    return this.run(open, null, signal, nothing).then(({ opened }) => opened)
  }

  /**
   * Opens an image and compresses it, after any image before it.
   * `compress` is given the image's size and makes the request from it.
   */
  run(
    open: Omit<OpenRequest, "type">,
    compress: ((opened: Opened) => Omit<CompressRequest, "type" | "id">) | null,
    signal: AbortSignal,
    onProgress: (label: string) => void
  ): Promise<{ opened: Opened; done: Compressed | null }> {
    const work = this.turn.then(
      () =>
        new Promise<{ opened: Opened; done: Compressed | null }>(
          (resolve, reject) => {
            if (signal.aborted)
              return reject(new DOMException("Stopped.", "AbortError"))
            const id = ++this.count
            let opened: Opened | null = null
            const stop = () => {
              this.listener = nothing
              this.client.dispose()
              reject(new DOMException("Stopped.", "AbortError"))
            }
            signal.addEventListener("abort", stop, { once: true })
            const finish = (then: () => void) => {
              signal.removeEventListener("abort", stop)
              this.listener = nothing
              then()
            }
            this.listener = (message) => {
              if (message.type === "opened" && !opened) {
                // Pictures for the page's preview are not wanted here.
                message.preview?.close?.()
                opened = message
                if (!compress)
                  return finish(() => resolve({ opened: message, done: null }))
                let request
                try {
                  request = compress(message)
                } catch (error) {
                  return finish(() =>
                    reject(new ToolError((error as Error).message))
                  )
                }
                this.client.compress({ ...request, type: "compress", id })
              } else if (message.type === "open-error")
                finish(() => reject(new ToolError(message.message)))
              else if (message.type === "progress" && message.id === id)
                onProgress(message.label)
              else if (message.type === "error" && message.id === id)
                finish(() => reject(new ToolError(message.message)))
              else if (message.type === "done" && message.id === id) {
                message.reference?.close?.()
                finish(() => resolve({ opened: opened!, done: message }))
              }
            }
            this.client.open({ ...open, type: "open" })
          }
        )
    )
    this.turn = work.catch(() => undefined)
    return work
  }
}
