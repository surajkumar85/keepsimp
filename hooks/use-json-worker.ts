"use client"
import { useCallback, useEffect, useState } from "react"
import { JsonClient } from "@/lib/json-workspace/client"
import type { JsonJob } from "@/lib/json-workspace/protocol"

export { JsonOperationError } from "@/lib/json-workspace/client"

export function useJsonWorker() {
  const [busy, setBusy] = useState(false)
  const [client] = useState(() => new JsonClient(undefined, setBusy))
  useEffect(() => () => client.stop(), [client])
  const run = useCallback((job: JsonJob) => client.run(job), [client])
  const cancel = useCallback(() => client.stop(), [client])
  return { run, cancel, busy }
}
