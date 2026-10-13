"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import {
  foundLine,
  opFor,
  placeAt,
  placesIn,
  preview,
  type Found,
} from "@/lib/pdf-editor/find"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"
import type { Inpage } from "./use-inpage"
import type { Links } from "./use-links"
import type { Retext } from "./use-retext"

/** What the bar says before anything was looked for. */
export const FIND_HINT =
  "Type what to look for and press Enter. Words are found through the whole file, across the line breaks of a paragraph too."

/** What was found, for what was asked. */
interface Result {
  found: Found[]
  more: boolean
  /** What was looked for, to know whether it still is what is typed. */
  of: string
}

/**
 * Find and replace in the words of the file: what is typed, what was
 * found, the place that is shown, and replacing it or all of them.
 */
export function useFind(
  editor: Editor,
  comments: Comments,
  retext: Retext,
  inpage: Inpage,
  links: Links,
  /** Show a page of the file. */
  goTo: (page: number) => void
) {
  const [wanted, setWanted] = useState(false)
  const [words, setWords] = useState("")
  const [replacement, setReplacement] = useState("")
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWords, setWholeWords] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [at, setAt] = useState(0)
  const [note, setNote] = useState("")
  const [looking, setLooking] = useState(false)
  // When the list of pages is another, the places that were found are on other pages: they are looked for anew.
  const [laid, setLaid] = useState(editor.layout)
  if (laid !== editor.layout) {
    setLaid(editor.layout)
    setResult(null)
    setAt(0)
  }
  // Any other tool that is taken in hand puts this one down.
  const other =
    editor.state.tool !== "select" ||
    comments.tool !== null ||
    retext.on ||
    inpage.on ||
    links.on
  if (wanted && other) setWanted(false)
  const on = wanted && !other

  const { setTool, deselect, find, replace } = editor
  const setCommentTool = comments.setTool
  const setRetext = retext.setOn
  const setInpage = inpage.setOn
  const setLinks = links.setOn
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setCommentTool(null)
        setRetext(false)
        setInpage(false)
        setLinks(false)
        setTool("select")
        deselect()
      }
      setWanted(next)
      setNote("")
    },
    [setCommentTool, setRetext, setInpage, setLinks, setTool, deselect]
  )

  /** What a finding is known by: what was looked for, and how. */
  const keyOf = (how: { matchCase: boolean; wholeWords: boolean }) =>
    `${how.matchCase ? "C" : "c"}${how.wholeWords ? "W" : "w"}${words}`
  const key = keyOf({ matchCase, wholeWords })
  /** What was found is for what is typed now. */
  const fresh = result?.of === key
  const found = useMemo(() => (fresh ? result.found : []), [fresh, result])
  const places = placesIn(found)
  const current = useMemo(() => {
    const here = places ? placeAt(found, Math.min(at, places - 1)) : null
    return (
      here && {
        found: found[here.unit],
        span: found[here.unit].spans[here.span],
      }
    )
  }, [found, places, at])

  /** Only the answer to what was asked last is taken. */
  const asked = useRef(0)
  /**
   * Look through the file for what is typed, and show a place of it.
   * @param show Which place to show: counted from 0, and no further than the last.
   * @param how How to look, when that has just been chosen and is not known here yet.
   */
  const search = useCallback(
    async (
      show = 0,
      how: Partial<{ matchCase: boolean; wholeWords: boolean }> = {}
    ) => {
      if (!words.trim()) {
        setResult(null)
        return null
      }
      const mine = ++asked.current
      setLooking(true)
      const asking = { matchCase, wholeWords, ...how }
      const got = await find({ find: words, ...asking })
      if (mine !== asked.current) return null
      setLooking(false)
      if (!got) {
        setResult(null)
        setNote("The words of this file could not be looked through.")
        return null
      }
      setResult({
        ...got,
        of: `${asking.matchCase ? "C" : "c"}${asking.wholeWords ? "W" : "w"}${words}`,
      })
      const count = placesIn(got.found)
      const next = count ? Math.min(show, count - 1) : 0
      setAt(next)
      const place = placeAt(got.found, next)
      if (place) goTo(got.found[place.unit].page)
      return got
    },
    [words, matchCase, wholeWords, find, goTo]
  )

  /** Show the next place, or the one before; after the last comes the first. */
  const step = useCallback(
    (by: number) => {
      if (!fresh) {
        void search()
        return
      }
      if (!places) return
      const next = (Math.min(at, places - 1) + by + places) % places
      setAt(next)
      const place = placeAt(found, next)
      if (place) goTo(found[place.unit].page)
    },
    [fresh, places, at, found, search, goTo]
  )

  /** Put the other words in the place that is shown, and show the next. */
  const replaceOne = useCallback(async () => {
    if (!current) return
    setNote("")
    const refused = await replace(
      [opFor(current.found, [current.span], replacement)],
      current.found.fonts
    )
    if (refused?.length) setNote(refused[0])
    // What follows it is at its number now, unless it was left as it was.
    await search(refused?.length ? at + 1 : at)
  }, [current, replacement, replace, search, at])

  /** Put the other words in every place, as one step. */
  const replaceAll = useCallback(async () => {
    if (!places) return
    setNote("")
    const refused = await replace(
      found.map((one) => opFor(one, one.spans, replacement)),
      found.flatMap((one) => one.fonts)
    )
    const left = await search(0)
    if (!refused) return
    const still = left ? placesIn(left.found) : 0
    const done = places - still
    setNote(
      refused.length
        ? `${done.toLocaleString("en")} of ${places.toLocaleString("en")} places were changed. ${refused.length.toLocaleString("en")} ${refused.length === 1 ? "line or paragraph was" : "lines or paragraphs were"} left as ${refused.length === 1 ? "it was" : "they were"}: ${refused[0]}`
        : `${done.toLocaleString("en")} place${done === 1 ? " was" : "s were"} changed, as one step.`
    )
  }, [places, found, replacement, replace, search])

  return {
    on,
    setOn,
    words,
    setWords: useCallback((next: string) => {
      setWords(next)
      setNote("")
    }, []),
    replacement,
    setReplacement,
    matchCase,
    // Another way of looking is looked with at once.
    setMatchCase: (next: boolean) => {
      setMatchCase(next)
      void search(0, { matchCase: next })
    },
    wholeWords,
    setWholeWords: (next: boolean) => {
      setWholeWords(next)
      void search(0, { wholeWords: next })
    },
    looking,
    /** Whether what was found is for what is typed now. */
    fresh,
    found,
    places,
    /** Which place is shown, from 0. */
    at: places ? Math.min(at, places - 1) : 0,
    current,
    /** What is shown of the place before it is changed. */
    shown: current && preview(current.found.text, current.span, replacement),
    /** How much was found, in words. */
    summary: fresh && result ? foundLine(result.found, result.more) : "",
    search,
    step,
    replaceOne,
    replaceAll,
    note,
  }
}

export type Find = ReturnType<typeof useFind>
