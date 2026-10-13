"use client"

import { useCallback, useState } from "react"
import type { Size } from "@/lib/image-compressor/geometry"
import {
  cutSize,
  LEAST_SHOWN,
  SHEETS,
  type Edges,
} from "@/lib/pdf-editor/pages"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"
import type { Find } from "./use-find"
import type { Inpage } from "./use-inpage"
import type { Links } from "./use-links"
import type { Pages } from "./use-pages"
import type { Retext } from "./use-retext"

export const CROP_HINT =
  "Drag the edges of the frame inwards, or type how much to cut off. What is cut off is hidden; it stays in the file."

const NOTHING: Edges = { left: 0, top: 0, right: 0, bottom: 0 }

/** Which pages a cut or a new size is for. */
export type CropFor = "page" | "chosen" | "all"

export type SheetName = keyof typeof SHEETS

/**
 * Cutting pages to a part and making them another size: whether that is
 * what the pointer does now, the page the frame lies on, how much the
 * frame cuts off each edge, and which pages it is for.
 */
export function useCrop(
  editor: Editor,
  comments: Comments,
  retext: Retext,
  inpage: Inpage,
  links: Links,
  find: Find,
  pages: Pages,
  /** The page that is being read, counted from 0. */
  reading: () => number,
  /** The tool is in hand from the start. */
  begun = false
) {
  const [wanted, setWanted] = useState(begun)
  const [framed, setFramed] = useState(0)
  const [off, setOff] = useState<Edges>(NOTHING)
  const [chosenFor, setFor] = useState<CropFor>("page")
  const [sheet, setSheet] = useState<SheetName>("A4")
  const count = editor.sizes.length
  // When the list of pages is another, the frame may lie on another page: it starts anew.
  const [laid, setLaid] = useState(editor.layout)
  if (laid !== editor.layout) {
    setLaid(editor.layout)
    setOff(NOTHING)
  }
  // Any other tool that is taken in hand puts this one down.
  const other =
    editor.state.tool !== "select" ||
    comments.tool !== null ||
    retext.on ||
    inpage.on ||
    links.on ||
    find.on
  if (wanted && other) setWanted(false)
  const on = wanted && !other
  const page = Math.min(framed, count - 1)
  const size = editor.sizes[page] as Size
  // Pages can only be chosen in their list: without a choice, the frame's own page is meant.
  const whom: CropFor =
    chosenFor === "chosen" && !pages.chosen.length ? "page" : chosenFor
  const target =
    whom === "all"
      ? Array.from({ length: count }, (_, at) => at)
      : whom === "chosen"
        ? pages.chosen
        : [page]

  const { setTool, deselect, changePages } = editor
  const setCommentTool = comments.setTool
  const setRetext = retext.setOn
  const setInpage = inpage.setOn
  const setLinks = links.setOn
  const setFind = find.setOn
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setCommentTool(null)
        setRetext(false)
        setInpage(false)
        setLinks(false)
        setFind(false)
        setTool("select")
        deselect()
        setFramed(reading())
      }
      setWanted(next)
      setOff(NOTHING)
    },
    [
      setCommentTool,
      setRetext,
      setInpage,
      setLinks,
      setFind,
      setTool,
      deselect,
      reading,
    ]
  )

  /** Put the frame on another page, around all of it. */
  const frame = useCallback((next: number) => {
    setFramed(next)
    setOff(NOTHING)
  }, [])

  /**
   * Cut so much off one edge. Never less than nothing, and never so much
   * that less is left of the page than a page may be.
   */
  const setEdge = useCallback(
    (side: keyof Edges, value: number) =>
      setOff((was) => {
        const across = side === "left" || side === "right"
        const taken = across
          ? was.left + was.right - was[side]
          : was.top + was.bottom - was[side]
        const most = (across ? size.width : size.height) - taken - LEAST_SHOWN
        return { ...was, [side]: Math.max(0, Math.min(most, value)) }
      }),
    [size]
  )

  const cuts = off.left + off.top + off.right + off.bottom > 0
  /** Why the frame cannot be cut to on the pages it is for; "" when it can. */
  const whyNot = target.some((one) => !cutSize(editor.sizes[one] as Size, off))
    ? "Some of these pages are too small for this frame."
    : ""

  /** Cut the pages to the frame. */
  const cut = () => {
    if (!cuts || whyNot) return Promise.resolve()
    const done = changePages({ do: "crop", pages: target, off })
    setOff(NOTHING)
    return done
  }
  /** Show the pages whole again. */
  const whole = () => {
    setOff(NOTHING)
    return changePages({ do: "whole", pages: target })
  }
  /** Make the pages the size of the chosen sheet. */
  const resize = () => {
    setOff(NOTHING)
    return changePages({ do: "size", pages: target, size: SHEETS[sheet] })
  }

  return {
    on,
    setOn,
    page,
    size,
    off,
    cuts,
    whyNot,
    setEdge,
    frame,
    whom,
    setFor,
    target,
    canChoose: pages.chosen.length > 0,
    sheet,
    setSheet,
    cut,
    whole,
    resize,
  }
}

export type Crop = ReturnType<typeof useCrop>
