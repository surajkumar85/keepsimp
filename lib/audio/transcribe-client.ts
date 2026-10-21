/**
 * Starting and stopping a transcription: each runs in a worker of its own,
 * and stopping ends that worker, so nothing waits on the model. Nothing the
 * worker says after it is stopped counts: a worker ended while its script
 * still loads reports the aborted load as an error.
 */
import type { TranscribeJob, TranscribeMessage } from "./transcribe.worker"

export function startTranscription(
  job: TranscribeJob,
  onMessage: (message: TranscribeMessage) => void
) {
  const worker = new Worker(
    new URL("./transcribe.worker.ts", import.meta.url),
    {
      type: "module",
    }
  )
  let ended = false
  worker.onmessage = (event: MessageEvent<TranscribeMessage>) => {
    if (!ended) onMessage(event.data)
  }
  worker.onerror = () => {
    if (!ended)
      onMessage({
        type: "error",
        message: "The transcription could not run in this browser.",
      })
  }
  worker.postMessage(job)
  return () => {
    ended = true
    worker.terminate()
  }
}
