"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  JsonJob,
  JsonResult,
  JsonWorkerResponse,
} from "@/lib/json-workspace/protocol"

export class JsonOperationError extends Error {
  constructor(
    message: string,
    public offset?: number
  ) {
    super(message)
  }
}
export function useJsonWorker() {
  const worker = useRef<Worker | null>(null)
  const sequence = useRef(0)
  const pending = useRef(
    new Map<
      number,
      {
        resolve: (result: JsonResult) => void
        reject: (error: Error) => void
        timeout: ReturnType<typeof setTimeout>
      }
    >()
  )
  const [busy, setBusy] = useState(false)
  const stop = useCallback(
    (reason = "Operation cancelled. Your source is unchanged.") => {
      worker.current?.terminate()
      worker.current = null
      for (const promise of pending.current.values()) {
        clearTimeout(promise.timeout)
        const error = new Error(reason)
        error.name = reason.startsWith("Operation cancelled")
          ? "AbortError"
          : "Error"
        promise.reject(error)
      }
      pending.current.clear()
    },
    []
  )
  const cancel = useCallback(() => {
    stop()
    setBusy(false)
  }, [stop])
  useEffect(() => () => stop(), [stop])
  const run = useCallback(
    (job: JsonJob): Promise<JsonResult> => {
      if (!worker.current) {
        const instance = new Worker(
          new URL("../lib/json-workspace/json.worker.ts", import.meta.url),
          { type: "module" }
        )
        instance.onmessage = (event: MessageEvent<JsonWorkerResponse>) => {
          const response = event.data,
            promise = pending.current.get(response.id)
          if (!promise) return
          clearTimeout(promise.timeout)
          pending.current.delete(response.id)
          if ("error" in response)
            promise.reject(
              new JsonOperationError(response.error, response.offset)
            )
          else promise.resolve(response.result)
          setBusy(pending.current.size > 0)
        }
        instance.onerror = () => {
          stop(
            "The JSON worker could not run. Retry the operation or reload the workspace."
          )
          setBusy(false)
        }
        worker.current = instance
      }
      const id = ++sequence.current
      setBusy(true)
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          stop(
            "This operation took too long. Try a smaller document or a simpler query/schema."
          )
          setBusy(false)
        }, 20_000)
        pending.current.set(id, { resolve, reject, timeout })
        worker.current!.postMessage({ id, job })
      })
    },
    [stop]
  )
  return { run, cancel, busy }
}
