"use client"

import { useCallback, useState } from "react"
import { standIns, type PageLine } from "@/lib/pdf-editor/retext"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"

/** What the bar says while the words of the page are being changed. */
export const RETEXT_HINT =
  "Click a line to change its words. Enter puts them into the file, Escape leaves it as it was. Delete takes a line out."

/** A line whose words are being typed. */
export interface Retyping {
  page: number
  line: PageLine
  text: string
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

  /** Put new words in a line's place; with none, the line is taken out. */
  const change = useCallback(
    (page: number, line: PageLine, text: string) => {
      setTyping(null)
      const words = text.trim()
      if (words.replace(/\s+/g, " ") === line.text.replace(/\s+/g, " ")) return
      const lent = standIns(line, words)
      setNote(
        lent.length
          ? `The font of this line has no ${lent.map((letter) => `“${letter}”`).join(", ")}. ${lent.length === 1 ? "It is" : "They are"} set in the closest font the editor has.`
          : ""
      )
      void retext(page, line, words)
    },
    [retext]
  )

  return { on, setOn, typing, setTyping, change, note }
}

export type Retext = ReturnType<typeof useRetext>
