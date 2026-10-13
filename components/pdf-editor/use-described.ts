"use client"

import { useCallback, useState } from "react"
import type { Comments } from "./use-comments"
import type { Pages } from "./use-pages"
import type { Repeat } from "./use-repeat"

/**
 * The panel for the file as a whole (its details, its bookmarks, its own
 * page numbers): whether it is shown. It shares its place beside the
 * pages with the other panels, one at a time.
 */
export function useDescribed(comments: Comments, pages: Pages, repeat: Repeat) {
  const [wanted, setWanted] = useState(false)
  const other = comments.listed || pages.on || repeat.on
  if (wanted && other) setWanted(false)
  const on = wanted && !other

  const setListed = comments.setListed
  const setPages = pages.setOn
  const setRepeat = repeat.setOn
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setListed(false)
        setPages(false)
        setRepeat(false)
      }
      setWanted(next)
    },
    [setListed, setPages, setRepeat]
  )
  return { on, setOn }
}

export type Described = ReturnType<typeof useDescribed>
