/**
 * A helper for the PDF compressor: it runs the picture codecs on a core of
 * its own. The page starts it and hands it one end of a line to the PDF
 * worker, which sends pixels and gets back bytes (see `helpers.ts`).
 */
import { codecs } from "./codecs"
import { answer, type HelperTask } from "./helpers"

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<{ port: MessagePort }>) => {
  const { port } = event.data
  port.onmessage = async (
    message: MessageEvent<HelperTask & { id: number }>
  ) => {
    const { reply, transfer } = await answer(codecs, message.data)
    port.postMessage(reply, transfer as Transferable[])
  }
}
// The page waits for this before it starts the next helper.
self.postMessage({ type: "ready" })
