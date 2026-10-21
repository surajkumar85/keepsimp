/**
 * Starting and stopping the making of a video: each in a worker of its
 * own, ended to stop it; nothing it says after that counts.
 */
import type { VideoJob, VideoMessage } from "./video.worker"

export function startVideo(
  job: VideoJob,
  onMessage: (message: VideoMessage) => void
) {
  const worker = new Worker(new URL("./video.worker.ts", import.meta.url), {
    type: "module",
  })
  let ended = false
  worker.onmessage = (event: MessageEvent<VideoMessage>) => {
    if (!ended) onMessage(event.data)
  }
  worker.onerror = () => {
    if (!ended)
      onMessage({
        type: "error",
        message: "The video could not be made in this browser.",
      })
  }
  worker.postMessage(job)
  return () => {
    ended = true
    worker.terminate()
  }
}
