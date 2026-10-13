"use client"

import { useCallback, useState } from "react"
import {
  blankSize,
  chosenAfter,
  chosenWith,
  moveTo,
  nudge,
  planOf,
  whyNot,
  type PageOp,
  type Turn,
} from "@/lib/pdf-editor/pages"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"

/**
 * The pages of the file as a list that can be changed: whether the list is
 * shown, which pages are chosen in it, and the changes that can be made to
 * them. Every change is one step of the file, undone like any other.
 */
export function usePages(editor: Editor, comments: Comments) {
  const [wanted, setWanted] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  /** The page that was pressed last: where a press with Shift chooses from. */
  const [anchor, setAnchor] = useState<number | null>(null)
  /** The page the keyboard is on. */
  const [cursor, setCursor] = useState(0)
  const count = editor.sizes.length
  // The list of comments has the same place beside the pages: one at a time.
  if (wanted && comments.listed) setWanted(false)
  const on = wanted && !comments.listed
  // Pages that are no more are not chosen: the list may have been changed by an undo.
  const chosen = picked.filter((page) => page < count)

  const { changePages, sizes } = editor
  const setListed = comments.setListed
  const setOn = useCallback(
    (next: boolean) => {
      if (next) setListed(false)
      setWanted(next)
    },
    [setListed]
  )

  /** Choose pages by pressing one: alone, with the others, or all from the one pressed before. */
  const press = useCallback(
    (page: number, how: "only" | "also" | "through") => {
      setPicked((was) => chosenWith(was, page, how, anchor))
      if (how !== "through" || anchor === null) setAnchor(page)
      setCursor(page)
    },
    [anchor]
  )
  const chooseAll = useCallback(() => {
    setPicked(Array.from({ length: count }, (_, page) => page))
    setAnchor(0)
  }, [count])
  const chooseNone = useCallback(() => setPicked([]), [])

  /** Make a change to the list. The pages that were chosen stay chosen where they are afterwards. */
  const change = useCallback(
    (op: PageOp | null) => {
      const plan = op && planOf(count, op)
      if (!op || !plan) return Promise.resolve()
      const next = chosenAfter(plan, chosen)
      setPicked(next)
      const [first = Math.min(cursor, plan.length - 1)] = next
      setAnchor(next.length ? first : null)
      setCursor(first)
      return changePages(op)
    },
    [count, chosen, cursor, changePages]
  )

  const turn = (by: Turn) =>
    change(chosen.length ? { do: "turn", pages: chosen, by } : null)
  const copy = () =>
    change(chosen.length ? { do: "copy", pages: chosen } : null)
  const remove = () =>
    change(chosen.length ? { do: "delete", pages: chosen } : null)
  const move = (by: -1 | 1) => change(nudge(count, chosen, by))
  const moveToPlace = (place: number) => change(moveTo(count, chosen, place))
  /** Put the chosen pages before the page that is now at a place. */
  const drop = (to: number) =>
    change(chosen.length ? { do: "move", pages: chosen, to } : null)
  /** An empty page after the last chosen one, or at the end; as large as the page before it. */
  const addBlank = () => {
    const at = chosen.length ? chosen[chosen.length - 1] + 1 : count
    return change({ do: "blank", at, size: blankSize(sizes, at) })
  }

  /**
   * Every page of another PDF after the last chosen page, or at the end.
   * @returns "locked" or "wrong" when its password is wanted; "failed" when it cannot be read; "done".
   */
  const addFrom = async (file: Blob, password?: string) => {
    const at = chosen.length ? chosen[chosen.length - 1] + 1 : count
    const how = await editor.insertPdf(file, at, password)
    // The new pages are not known here until the file says how many they are: nothing is chosen.
    if (how === "done") setPicked([])
    return how
  }

  /** Why the chosen pages cannot be taken out; "" when they can. */
  const whyNotRemove = chosen.length
    ? whyNot(count, { do: "delete", pages: chosen })
    : ""

  return {
    on,
    setOn,
    count,
    chosen,
    cursor,
    setCursor,
    press,
    chooseAll,
    chooseNone,
    turn,
    copy,
    remove,
    move,
    moveToPlace,
    drop,
    addBlank,
    addFrom,
    canMove: (by: -1 | 1) => nudge(count, chosen, by) !== null,
    whyNotRemove,
  }
}

export type Pages = ReturnType<typeof usePages>
