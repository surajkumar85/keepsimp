/// <reference lib="webworker" />
import { answer } from "./jobs"
import type { JsonJob } from "./protocol"
declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<{ id: number; job: JsonJob }>) => {
  self.postMessage(answer(event.data.id, event.data.job))
}
