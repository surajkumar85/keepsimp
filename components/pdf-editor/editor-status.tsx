"use client"

import { useEffect, useState } from "react"
import { IconCheck, IconLoader2 } from "@tabler/icons-react"
import { useSettling } from "./use-settling"

/** How long the file may take with a change before the status says it is on it, in milliseconds. */
const SLOW_AFTER = 150
/** How long "Up to date" stays after a change has gone in. */
const DONE_FOR = 2000

/**
 * A word in the editor's bar about changes on their way to the file:
 * "Applying…" while a slider, a typed number or a move waits for a pause,
 * or the file takes a moment with a change; "Up to date" once it has them
 * all. A change the file takes at once is shown on the page and needs no
 * word here.
 * @param busy The file is making a change.
 */
export function EditorStatus({ busy }: { busy: boolean }) {
  const settling = useSettling()
  const [slow, setSlow] = useState(false)
  if (!busy && slow) setSlow(false)
  useEffect(() => {
    if (!busy) return
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER)
    return () => clearTimeout(timer)
  }, [busy])
  const pending = settling || (busy && slow)
  const [was, setWas] = useState(pending)
  const [done, setDone] = useState(false)
  if (pending !== was) {
    setWas(pending)
    setDone(!pending)
  }
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), DONE_FOR)
    return () => clearTimeout(timer)
  }, [done])
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="editor-status"
      data-state={pending ? "pending" : done ? "done" : "idle"}
      className="flex h-9 shrink-0 items-center gap-1.5 px-1 text-xs whitespace-nowrap text-muted-foreground"
    >
      {pending ? (
        <>
          <IconLoader2
            className="size-4 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="max-xl:sr-only">Applying…</span>
        </>
      ) : done ? (
        <>
          <IconCheck className="size-4 text-primary" aria-hidden="true" />
          <span className="max-xl:sr-only">Up to date</span>
        </>
      ) : null}
    </p>
  )
}
