"use client"

import { useCallback, useState } from "react"
import type { Point } from "@/lib/pdf-editor/geometry"
import {
  moved,
  scaledAbout,
  turnedAbout,
  type Cut,
  type PagePicture,
} from "@/lib/pdf-editor/page-pictures"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"
import type { Retext } from "./use-retext"

/** What the bar says while the pictures of the page can be changed. */
export const INPAGE_HINT =
  "Click a picture of the page. Drag it to move it, drag its corner to change its size; the bar turns it, cuts it to a part, puts another in its place or takes it out."
export const CUT_HINT =
  "The rest is hidden, not removed from the file. Drag the edges of the frame inwards to what is to show, then Done."

const NO_CUT: Cut = { left: 0, top: 0, right: 0, bottom: 0 }

/** A picture of a page that was chosen. */
export interface ChosenPicture {
  page: number
  picture: PagePicture
  /** How much of it is being cut away at each side, while it is being cut to a part. */
  cut: Cut | null
}

/**
 * Changing the pictures a page already has: whether that is what the
 * pointer does now, the picture that is chosen, and what is done to it.
 */
export function useInpage(editor: Editor, comments: Comments, retext: Retext) {
  const [wanted, setWanted] = useState(false)
  const [chosen, setChosen] = useState<ChosenPicture | null>(null)
  // When the list of pages is another, the picture that was chosen may be on another page, or on none.
  const [laid, setLaid] = useState(editor.layout)
  if (laid !== editor.layout) {
    setLaid(editor.layout)
    setChosen(null)
  }
  // Any other tool that is taken in hand puts this one down.
  const other =
    editor.state.tool !== "select" || comments.tool !== null || retext.on
  if (wanted && other) {
    setWanted(false)
    setChosen(null)
  }
  const on = wanted && !other

  const { setTool, deselect, changePicture, replacePicture } = editor
  const setCommentTool = comments.setTool
  const setRetext = retext.setOn
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setCommentTool(null)
        setRetext(false)
        setTool("select")
        deselect()
      }
      setWanted(next)
      setChosen(null)
    },
    [setCommentTool, setRetext, setTool, deselect]
  )

  const choose = useCallback(
    (page: number, picture: PagePicture) =>
      setChosen({ page, picture, cut: null }),
    []
  )

  /**
   * The pictures of a page were read again: the one that is chosen is
   * where the file now has it, or is no longer there.
   */
  const refresh = useCallback(
    (page: number, pictures: readonly PagePicture[]) =>
      setChosen((was) => {
        if (!was || was.page !== page) return was
        const picture = pictures[was.picture.index]
        if (!picture) return null
        return picture === was.picture ? was : { ...was, picture, cut: null }
      }),
    []
  )

  /** Move a picture by so many points, as the page is shown. */
  const move = useCallback(
    (page: number, picture: PagePicture, by: Point) => {
      if (!by.x && !by.y) return
      void changePicture(page, picture, { by: moved(by) }, "Move a picture")
    },
    [changePicture]
  )

  /** Make a picture larger or smaller, about its top left corner, which stays where it is. */
  const resize = useCallback(
    (page: number, picture: PagePicture, by: number) => {
      if (!(by > 0) || Math.abs(by - 1) < 0.001) return
      void changePicture(
        page,
        picture,
        { by: scaledAbout({ x: picture.box.x, y: picture.box.y }, by) },
        "Resize a picture"
      )
    },
    [changePicture]
  )

  /** Turn the chosen picture by a quarter, about its middle. */
  const turn = useCallback(
    (quarters: number) => {
      if (!chosen) return
      const { box } = chosen.picture
      void changePicture(
        chosen.page,
        chosen.picture,
        {
          by: turnedAbout(
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
            quarters
          ),
        },
        "Turn a picture"
      )
    },
    [chosen, changePicture]
  )

  const takeOut = useCallback(
    (page: number, picture: PagePicture) => {
      setChosen(null)
      void changePicture(page, picture, { remove: true }, "Take out a picture")
    },
    [changePicture]
  )

  /** Begin cutting the chosen picture to a part, or leave that. */
  const setCutting = useCallback(
    (cutting: boolean) =>
      setChosen((was) => was && { ...was, cut: cutting ? NO_CUT : null }),
    []
  )

  const setCut = useCallback(
    (cut: Cut) => setChosen((was) => was && { ...was, cut }),
    []
  )

  /** Cut the chosen picture to the part that was framed. */
  const finishCut = useCallback(() => {
    if (!chosen?.cut) return
    const { page, picture, cut } = chosen
    setChosen({ ...chosen, cut: null })
    if (cut.left || cut.top || cut.right || cut.bottom)
      void changePicture(page, picture, { cut }, "Cut a picture to a part")
  }, [chosen, changePicture])

  /** Show the whole of the chosen picture again. */
  const showWhole = useCallback(() => {
    if (!chosen) return
    void changePicture(
      chosen.page,
      chosen.picture,
      { cut: null },
      "Show a whole picture"
    )
  }, [chosen, changePicture])

  /** Put another picture in the place of the chosen one. */
  const replace = useCallback(
    (file: Blob) => {
      if (!chosen) return
      void replacePicture(chosen.page, chosen.picture, file)
    },
    [chosen, replacePicture]
  )

  return {
    on,
    setOn,
    chosen,
    choose,
    deselect: useCallback(() => setChosen(null), []),
    refresh,
    move,
    resize,
    turn,
    takeOut,
    setCutting,
    setCut,
    finishCut,
    showWhole,
    replace,
  }
}

export type Inpage = ReturnType<typeof useInpage>
