"use client"

import { useCallback, useState } from "react"
import type { Point } from "@/lib/pdf-editor/geometry"
import type { Align } from "@/lib/pdf-editor/paragraphs"
import { standIns, type LineLook, type PageLine } from "@/lib/pdf-editor/retext"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"

/** What the bar says while the words of the page are being changed, line by line. */
export const RETEXT_HINT =
  "Click a line to change its words; Enter puts them into the file, Escape leaves it. Drag a line to move it. Delete takes it out."

/** And with lines that belong together changed as one. */
export const PARAGRAPH_HINT =
  "Click a paragraph or a line and type: a paragraph flows again within its width. Done puts the words into the file (Enter does in a single line), Escape leaves them. Drag to move, Delete takes out."

/** A line or a paragraph whose words are being typed. */
export interface Retyping {
  page: number
  /** The line; for a paragraph, the paragraph as one line (`asLine`). */
  line: PageLine
  text: string
  /** Another size, colour or font that was chosen while it is typed. */
  look: LineLook
  /** The lines of the paragraph, from the top down, when a paragraph is typed. */
  lines?: PageLine[]
  /** Another way of setting the paragraph between its edges, when one was chosen. */
  align?: Align
}

const squeezed = (text: string) => text.replace(/\s+/g, " ").trim()

/**
 * Changing the words that are already on a page: whether that is what the
 * pointer does now, whether lines that belong together are changed as one,
 * the line or paragraph that is being typed, and what the bar has to say
 * about the last change.
 */
export function useRetext(editor: Editor, comments: Comments) {
  const [wanted, setWanted] = useState(false)
  const [blocks, setBlocks] = useState(true)
  const [typing, setTyping] = useState<Retyping | null>(null)
  const [note, setNote] = useState("")
  // Any other tool that is taken in hand puts this one down.
  const other = editor.state.tool !== "select" || comments.tool !== null
  if (wanted && other) {
    setWanted(false)
    setTyping(null)
  }
  const on = wanted && !other

  const { setTool, deselect, retext, reflow } = editor
  const setCommentTool = comments.setTool
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setCommentTool(null)
        setTool("select")
        deselect()
      }
      setWanted(next)
      setTyping(null)
      setNote("")
    },
    [setCommentTool, setTool, deselect]
  )

  /**
   * Put new words in a line's place, give it another look, or move it; with
   * no words, the line is taken out. A paragraph is changed the same way,
   * and can be set another way between its edges.
   * @param block For a paragraph: its lines, and how it is to be set when that is to change.
   */
  const change = useCallback(
    (
      page: number,
      line: PageLine,
      text: string,
      look: LineLook = {},
      move?: Point,
      block?: { lines: PageLine[]; align?: Align }
    ) => {
      setTyping(null)
      const words = block ? text : text.trim()
      const restyle = Object.keys(look).length ? look : undefined
      if (
        squeezed(words) === squeezed(line.text) &&
        !restyle &&
        !move &&
        !block?.align
      )
        return
      const lent = standIns(line, words, restyle)
      setNote(
        lent.length
          ? `The font of this ${block ? "paragraph" : "line"} has no ${lent.map((letter) => `“${letter}”`).join(", ")}. ${lent.length === 1 ? "It is" : "They are"} set in the closest font the editor has.`
          : ""
      )
      if (block)
        void reflow(page, line, block.lines, words, {
          look: restyle,
          align: block.align,
          move,
        })
      else void retext(page, line, words, restyle, move)
    },
    [retext, reflow]
  )

  /** Another look for what is being typed; it goes into the file with its words. */
  const setLook = useCallback(
    (look: LineLook) =>
      setTyping((was) => {
        if (!was) return was
        const next = { ...was.look, ...look }
        // The line's own font again is no font of ours at all.
        if (look.font === "") delete next.font
        return { ...was, look: next }
      }),
    []
  )

  /** Another way of setting the paragraph that is being typed. */
  const setAlign = useCallback(
    (align: Align) =>
      setTyping((was) => (was?.lines ? { ...was, align } : was)),
    []
  )

  /** Put what is being typed into the file, as it stands. */
  const finish = useCallback(() => {
    if (typing && !typing.line.fixed)
      change(
        typing.page,
        typing.line,
        typing.text,
        typing.look,
        undefined,
        typing.lines && { lines: typing.lines, align: typing.align }
      )
    else setTyping(null)
  }, [typing, change])

  return {
    on,
    setOn,
    blocks,
    setBlocks,
    typing,
    setTyping,
    setLook,
    setAlign,
    finish,
    change,
    note,
  }
}

export type Retext = ReturnType<typeof useRetext>
