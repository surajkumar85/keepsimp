/**
 * Starting and stopping a transcription: each runs in a worker of its own,
 * and stopping ends that worker, so nothing waits on the model.
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
  worker.onmessage = (event: MessageEvent<TranscribeMessage>) =>
    onMessage(event.data)
  worker.onerror = () =>
    onMessage({
      type: "error",
      message: "The transcription could not run in this browser.",
    })
  worker.postMessage(job)
  return () => worker.terminate()
}
