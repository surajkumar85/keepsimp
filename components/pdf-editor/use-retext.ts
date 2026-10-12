"use client"

import { useCallback, useState } from "react"
import type { Point } from "@/lib/pdf-editor/geometry"
import { standIns, type LineLook, type PageLine } from "@/lib/pdf-editor/retext"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"

/** What the bar says while the words of the page are being changed. */
export const RETEXT_HINT =
  "Click a line to change its words; Enter puts them into the file, Escape leaves it. Drag a line to move it. Delete takes it out."

/** A line whose words are being typed. */
export interface Retyping {
  page: number
  line: PageLine
  text: string
  /** Another size, colour or font that was chosen for the line while it is typed. */
  look: LineLook
}

/**
 * Changing the words that are already on a page: whether that is what the
 * pointer does now, the line that is being typed, and what the bar has to
 * say about the last change.
 */
export function useRetext(editor: Editor, comments: Comments) {
  const [wanted, setWanted] = useState(false)
  const [typing, setTyping] = useState<Retyping | null>(null)
  const [note, setNote] = useState("")
  // Any other tool that is taken in hand puts this one down.
  const other = editor.state.tool !== "select" || comments.tool !== null
  if (wanted && other) {
    setWanted(false)
    setTyping(null)
  }
  const on = wanted && !other

  const { setTool, deselect, retext } = editor
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
   * no words, the line is taken out.
   */
  const change = useCallback(
    (
      page: number,
      line: PageLine,
      text: string,
      look: LineLook = {},
      move?: Point
    ) => {
      setTyping(null)
      const words = text.trim()
      const restyle = Object.keys(look).length ? look : undefined
      if (
        words.replace(/\s+/g, " ") === line.text.replace(/\s+/g, " ") &&
        !restyle &&
        !move
      )
        return
      const lent = standIns(line, words, restyle)
      setNote(
        lent.length
          ? `The font of this line has no ${lent.map((letter) => `“${letter}”`).join(", ")}. ${lent.length === 1 ? "It is" : "They are"} set in the closest font the editor has.`
          : ""
      )
      void retext(page, line, words, restyle, move)
    },
    [retext]
  )

  /** Another look for the line that is being typed; it goes into the file with its words. */
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

  /** Put what is being typed into the file, as it stands. */
  const finish = useCallback(() => {
    if (typing && !typing.line.fixed)
      change(typing.page, typing.line, typing.text, typing.look)
    else setTyping(null)
  }, [typing, change])

  return { on, setOn, typing, setTyping, setLook, finish, change, note }
}

export type Retext = ReturnType<typeof useRetext>
