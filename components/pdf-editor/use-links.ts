"use client"

import { useCallback, useState } from "react"
import type { Box } from "@/lib/pdf-editor/geometry"
import {
  sameTarget,
  targetFrom,
  targetText,
  type PageLink,
} from "@/lib/pdf-editor/links"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"
import type { Inpage } from "./use-inpage"
import type { Retext } from "./use-retext"

/** What the bar says while links can be changed. */
export const LINKS_HINT =
  "Drag a box on the page where a link is to be, or choose a link to lead it somewhere else, move it or take it away."

/** How large a link is that is made from the bar, in points. */
const NEW_LINK = { width: 160, height: 24 }

/** A link that is chosen, or one that is being made and is not in the file yet. */
export interface ChosenLink {
  page: number
  /** The link of the file; null for one that is being made. */
  link: PageLink | null
  /** Where the one that is being made is to lie. */
  box: Box
  /** Where it is to lead, as it is typed. */
  typed: string
}

/**
 * Adding and changing links: whether that is what the pointer does now,
 * the link that is chosen or being made, and what is typed for where it
 * leads.
 */
export function useLinks(
  editor: Editor,
  comments: Comments,
  retext: Retext,
  inpage: Inpage
) {
  const [wanted, setWanted] = useState(false)
  const [chosen, setChosen] = useState<ChosenLink | null>(null)
  const [note, setNote] = useState("")
  // Any other tool that is taken in hand puts this one down.
  const other =
    editor.state.tool !== "select" ||
    comments.tool !== null ||
    retext.on ||
    inpage.on
  if (wanted && other) {
    setWanted(false)
    setChosen(null)
  }
  const on = wanted && !other
  const pages = editor.sizes.length

  const { setTool, deselect, changeLink, middle } = editor
  const setCommentTool = comments.setTool
  const setRetext = retext.setOn
  const setInpage = inpage.setOn
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setCommentTool(null)
        setRetext(false)
        setInpage(false)
        setTool("select")
        deselect()
      }
      setWanted(next)
      setChosen(null)
      setNote("")
    },
    [setCommentTool, setRetext, setInpage, setTool, deselect]
  )

  const choose = useCallback((page: number, link: PageLink) => {
    setNote("")
    setChosen({ page, link, box: link.box, typed: targetText(link.to) })
  }, [])

  /** Begin a link where a box was drawn; it is in the file once it leads somewhere. */
  const begin = useCallback((page: number, box: Box) => {
    setNote("")
    setChosen({ page, link: null, box, typed: "" })
  }, [])

  /** Begin a link in the middle of what is seen of the page that is being read. */
  const beginHere = useCallback(() => {
    const { page, at } = middle()
    begin(page, {
      x: Math.max(0, at.x - NEW_LINK.width / 2),
      y: Math.max(0, at.y - NEW_LINK.height / 2),
      ...NEW_LINK,
    })
  }, [middle, begin])

  const setTyped = useCallback((typed: string) => {
    setNote("")
    setChosen((was) => was && { ...was, typed })
  }, [])

  /**
   * The links of a page were read again: the one that is chosen is where
   * the file now has it, or is no longer there.
   */
  const refresh = useCallback(
    (page: number, links: readonly PageLink[]) =>
      setChosen((was) => {
        if (!was?.link || was.page !== page) return was
        const link = links[was.link.index]
        if (!link) return null
        return link === was.link
          ? was
          : { ...was, link, box: link.box, typed: targetText(link.to) }
      }),
    []
  )

  /** Put what was typed into the file: a new link, or another place for the chosen one to lead. */
  const apply = useCallback(() => {
    if (!chosen) return
    const to = targetFrom(chosen.typed, pages)
    if (!to) {
      setNote(
        `Type a web address, an e-mail address, or a page from 1 to ${pages.toLocaleString("en")}.`
      )
      return
    }
    setNote("")
    if (!chosen.link) {
      setChosen(null)
      void changeLink(chosen.page, { box: chosen.box, to }, "Add a link")
    } else if (!sameTarget(chosen.link.to, to))
      void changeLink(
        chosen.page,
        { index: chosen.link.index, at: chosen.link.box, to },
        "Change a link"
      )
  }, [chosen, pages, changeLink])

  /** Put a link somewhere else, or make it another size. One that is being made is only shown there. */
  const place = useCallback(
    (page: number, link: PageLink | null, box: Box) => {
      if (!link) {
        setChosen((was) => was && { ...was, box })
        return
      }
      void changeLink(
        page,
        { index: link.index, at: link.box, box },
        "Move a link"
      )
    },
    [changeLink]
  )

  const takeAway = useCallback(
    (page: number, link: PageLink | null) => {
      setChosen(null)
      setNote("")
      if (link)
        void changeLink(
          page,
          { index: link.index, at: link.box, remove: true },
          "Take away a link"
        )
    },
    [changeLink]
  )

  return {
    on,
    setOn,
    pages,
    chosen,
    choose,
    begin,
    beginHere,
    deselect: useCallback(() => {
      setChosen(null)
      setNote("")
    }, []),
    setTyped,
    refresh,
    apply,
    place,
    takeAway,
    note,
  }
}

export type Links = ReturnType<typeof useLinks>
