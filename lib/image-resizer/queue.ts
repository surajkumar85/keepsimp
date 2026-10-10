/** The resizer's view of the shared batch queue. */
import type { OutputFormat } from "@/lib/image-compressor/formats"
import type * as batch from "@/lib/image-batch/queue"

export {
  itemState,
  nextJob,
  queueReducer,
  queueTotals,
  releasedUrls,
  type ItemState,
} from "@/lib/image-batch/queue"
export type QueueOutput = batch.QueueOutput<OutputFormat>
export type QueueItem = batch.QueueItem<OutputFormat>
export type QueueAction = batch.QueueAction<OutputFormat>
