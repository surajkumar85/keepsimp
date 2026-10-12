"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { canBeKept, fontsOf } from "@/lib/pdf-editor/draft"
import {
  beginDraft,
  clearDraft,
  keepFont,
  keepPicture,
  keepSteps,
  type OwnFile,
} from "@/lib/pdf-editor/draft-store"
import type { History } from "@/lib/pdf-editor/history"
import type { PdfClient } from "@/lib/pdf-merger/client"

/** Where the draft of the open file stands. */
export type DraftStatus =
  /** The switch is off, or nothing has been changed yet. */
  | "none"
  /** The file is larger than a draft is kept of. */
  | "large"
  | "keeping"
  | "kept"
  /** The browser would not keep it. */
  | "failed"

/**
 * Keeps a draft of the open file while the switch is on: the file itself
 * when the first change is made, each picture that is placed, and the list
 * of steps a moment after every change.
 */
export function useDraft({
  client,
  id,
  file,
  history,
  wanted,
  begun,
  pictures,
  fonts,
}: {
  client: RefObject<PdfClient | null>
  id: string
  file: File
  history: History
  wanted: boolean
  /** The file was opened from a draft, which is therefore already begun. */
  begun: boolean
  /** Every picture that was placed, by the name it was given. It is added to as pictures are placed. */
  pictures: Map<string, Blob>
  /** Every font of one's own that was added, by its key. Those the steps are written in are kept. */
  fonts: Map<string, OwnFile>
}) {
  const [kept, setKept] = useState<{ status: DraftStatus; of: History | null }>(
    { status: "none", of: null }
  )
  // Switched off, the draft is thrown away, and nothing is kept any more
  // until it has been kept anew.
  const [was, setWas] = useState(wanted)
  if (was !== wanted) {
    setWas(wanted)
    if (!wanted) setKept({ status: "none", of: null })
  }
  const started = useRef(begun)
  const [taken] = useState(
    () => new Set(begun ? [...pictures.keys(), ...fonts.keys()] : [])
  )
  const stored = useRef(taken)
  const fits = canBeKept(file.size)
  const changed = history.steps.length > 0

  /** One keeping follows another: two at once would clear what the other had just kept. */
  const queue = useRef(Promise.resolve())
  const on = useRef(wanted)

  useEffect(() => {
    on.current = wanted
    // Switched off, the draft was thrown away: one that is kept later is begun afresh.
    if (!wanted) {
      started.current = false
      stored.current.clear()
    }
    if (!wanted || !fits || !changed) return
    let stale = false
    const keep = async () => {
      // A change was made meanwhile: it is kept by the keeping that follows.
      if (stale) return
      setKept((was) => ({ ...was, status: "keeping" }))
      try {
        const draft = await client.current?.editDraft(id)
        if (!draft) return
        if (!started.current) {
          await beginDraft(file)
          started.current = true
          stored.current.clear()
        }
        for (const [name, picture] of pictures)
          if (!stored.current.has(name)) {
            await keepPicture(name, picture)
            stored.current.add(name)
          }
        for (const key of fontsOf(draft.steps)) {
          const font = fonts.get(key)
          if (!font || stored.current.has(key)) continue
          await keepFont(key, font)
          stored.current.add(key)
        }
        await keepSteps({
          name: file.name,
          size: file.size,
          when: Date.now(),
          ...draft,
        })
        if (!stale) setKept({ status: "kept", of: history })
      } catch {
        if (!stale) setKept({ status: "failed", of: null })
      } finally {
        // The switch was turned off while this was under way: nothing of it stays.
        if (!on.current) {
          started.current = false
          stored.current.clear()
          await clearDraft().catch(() => {})
        }
      }
    }
    // A moment after the last change, so that a run of them is kept once.
    const timer = setTimeout(() => {
      queue.current = queue.current.then(keep)
    }, 400)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [client, id, file, history, wanted, fits, changed, pictures, fonts])

  const status: DraftStatus = !wanted
    ? "none"
    : !fits
      ? "large"
      : !changed
        ? "none"
        : // Kept, but of the file as it was a change ago: the keeping of this one is on its way.
          kept.status === "none" ||
            (kept.status === "kept" && kept.of !== history)
          ? "keeping"
          : kept.status
  return {
    status,
    /** What is kept is the file as it now stands: leaving the page loses nothing. */
    current: status === "kept" && kept.of === history,
  }
}
