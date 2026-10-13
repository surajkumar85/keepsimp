"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  COMMENT_NAMES,
  defaultCommentStyles,
  MARK_KINDS,
  PEN_OPACITY,
  selectWords,
  wordsUnder,
  type Comment,
  type CommentStyles,
  type CommentTool,
  type LetterLine,
  type MarkKind,
} from "@/lib/pdf-editor/comments"
import type { Point } from "@/lib/pdf-editor/geometry"
import { thin } from "@/lib/pdf-editor/ink"
import type { Colour } from "@/lib/pdf-editor/objects"
import type { Editor } from "./use-editor"

/** Where the name comments are signed with is kept, on this device only. */
const NAME_KEY = "keepsimp.comment-author"

/** A press that is under way with a tool that makes comments. */
interface Marking {
  page: number
  from: Point
  to: Point
  /** The way a pen went. */
  points: Point[]
}

const isMark = (tool: CommentTool | null): tool is MarkKind =>
  MARK_KINDS.includes(tool as MarkKind)

/** What each tool's step is called in the list of changes. */
const STEP_NAMES: Record<CommentTool, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strike: "Strike out",
  squiggle: "Squiggle",
  note: "Add note",
  pen: "Highlighter",
}

function readName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ""
  } catch {
    return ""
  }
}

/**
 * The comments of the file being edited as the screen needs them: the tool
 * in hand, the comment that is picked, the list beside the pages, and the
 * ways to make and change comments. The comments themselves are the file's;
 * every change goes to the worker and comes back as what the pages hold.
 */
export function useComments(editor: Editor, start: CommentTool | null) {
  const [tool, showTool] = useState<CommentTool | null>(start)
  const [styles, setStyles] = useState<CommentStyles>(defaultCommentStyles)
  const [picked, setPicked] = useState<{ page: number; id: string } | null>(
    null
  )
  const [listed, setListed] = useState(false)
  // When the list of pages is another, the comment that was picked may be on another page, or on none.
  const [laid, setLaid] = useState(editor.layout)
  if (laid !== editor.layout) {
    setLaid(editor.layout)
    setPicked(null)
  }
  /** A comment whose words are to be typed as soon as it is listed. */
  const [typing, setTyping] = useState<string | null>(null)
  const [author, showAuthor] = useState(readName)
  const [marking, showMarking] = useState<Marking | null>(null)
  const [notice, setNotice] = useState("")
  const [showPage, setShowPage] = useState<{ page: number; turn: number }>()
  /** The words each mark lies on, by the comment's number. */
  const [quotes, setQuotes] = useState<Record<string, string>>({})
  /** The letters of pages that have been read, for showing what a drag takes in. */
  const [letters, setLetters] = useState<Record<number, LetterLine[]>>({})
  // Where things stand this moment; what is drawn lags behind a fast pointer.
  const live = useRef({ tool, styles, author, marking })
  const setMarking = useCallback((next: Marking | null) => {
    live.current.marking = next
    showMarking(next)
  }, [])

  const { comments, versions, comment, letters: readLetters, deselect } = editor
  const pages = useRef({ comments, versions })
  useEffect(() => {
    pages.current = { comments, versions }
    live.current.styles = styles
    live.current.author = author
  })

  /** Take a tool that makes comments in hand, or put it down. */
  const setTool = useCallback(
    (next: CommentTool | null) => {
      live.current.tool = next
      showTool(next)
      setMarking(null)
      setNotice("")
      if (next) setPicked(null)
    },
    [setMarking]
  )

  const setAuthor = useCallback((name: string) => {
    showAuthor(name)
    try {
      if (name.trim()) localStorage.setItem(NAME_KEY, name.trim())
      else localStorage.removeItem(NAME_KEY)
    } catch {
      // The name is still used for as long as the page is open.
    }
  }, [])

  const signed = useCallback(
    () => ({ author: live.current.author.trim(), when: Date.now() }),
    []
  )

  /** The letters of a page as it stands, kept for the drag that is under way. */
  const lettersOf = useCallback(
    async (page: number) => {
      const lines = await readLetters(page, pages.current.versions[page] ?? 0)
      setLetters((was) =>
        was[page] === lines ? was : { ...was, [page]: lines }
      )
      return lines
    },
    [readLetters]
  )

  const pointerDown = useCallback(
    (page: number, point: Point) => {
      const now = live.current.tool
      if (!now) return
      setNotice("")
      setMarking({ page, from: point, to: point, points: [point] })
      if (isMark(now)) void lettersOf(page)
    },
    [lettersOf, setMarking]
  )

  const pointerMove = useCallback(
    (point: Point) => {
      const now = live.current.marking
      if (!now) return
      setMarking({
        ...now,
        to: point,
        points:
          live.current.tool === "pen" ? [...now.points, point] : now.points,
      })
    },
    [setMarking]
  )

  const pointerUp = useCallback(async () => {
    const now = live.current.marking
    const kind = live.current.tool
    setMarking(null)
    if (!now || !kind) return
    const { page } = now
    const colour = live.current.styles.colours[kind]
    if (kind === "note") {
      const before = new Set(
        (pages.current.comments[page] ?? []).map((one) => one.id)
      )
      const news = await comment({
        label: STEP_NAMES.note,
        ops: [{ ...signed(), do: "note", page, at: now.to, colour, text: "" }],
      })
      // The note is picked and its words are typed in the list.
      const made = news?.pages
        .find((one) => one.page === page)
        ?.comments.find((one) => !before.has(one.id))
      setTool(null)
      if (made) {
        setPicked({ page, id: made.id })
        setTyping(made.id)
        setListed(true)
      }
      return
    }
    if (kind === "pen") {
      const points = thin(now.points, 0.5)
      await comment({
        label: STEP_NAMES.pen,
        ops: [
          {
            ...signed(),
            do: "pen",
            page,
            // A press without a move leaves a dot.
            strokes: [points.length > 1 ? points : [now.from, now.from]],
            colour,
            weight: live.current.styles.weight,
            opacity: PEN_OPACITY,
          },
        ],
      })
      return
    }
    const quads = selectWords(await lettersOf(page), now.from, now.to)
    if (!quads.length) {
      setNotice(
        "No words there. On a scanned page, mark with the highlighter pen."
      )
      return
    }
    await comment({
      label: STEP_NAMES[kind],
      ops: [{ ...signed(), do: "mark", page, kind, quads, colour, opacity: 1 }],
    })
  }, [comment, lettersOf, setMarking, setTool, signed])

  const pointerCancel = useCallback(() => setMarking(null), [setMarking])
  /** Whether a press with a comment tool is under way. */
  const dragging = useCallback(() => live.current.marking !== null, [])

  /** The comment that is picked, with the page it is on. */
  const chosen = useMemo(() => {
    if (!picked) return null
    const found = (comments[picked.page] ?? []).find(
      (one) => one.id === picked.id
    )
    return found ? { page: picked.page, comment: found } : null
  }, [picked, comments])

  /** Pick a comment, on its page or in the list; with `reveal`, the pages go to it. */
  const pick = useCallback(
    (page: number, id: string, reveal = false) => {
      setPicked({ page, id })
      // One thing is in hand at a time: a comment, or what the editor added.
      deselect()
      if (reveal) setShowPage((was) => ({ page, turn: (was?.turn ?? 0) + 1 }))
    },
    [deselect]
  )
  const unpick = useCallback(() => setPicked((was) => (was ? null : was)), [])

  const remove = useCallback(
    (page: number, id: string, reply = false) => {
      setPicked((was) => (was?.id === id ? null : was))
      return comment({
        label: reply ? "Delete reply" : "Delete comment",
        ops: [{ do: "drop", page, id }],
      })
    },
    [comment]
  )

  const setText = useCallback(
    (page: number, id: string, text: string) =>
      comment({
        label: "Edit comment",
        ops: [{ do: "edit", page, id, when: Date.now(), text }],
      }),
    [comment]
  )

  const reply = useCallback(
    (page: number, to: string, text: string) =>
      comment({
        label: "Reply",
        ops: [{ ...signed(), do: "reply", page, to, text }],
      }),
    [comment, signed]
  )

  const move = useCallback(
    (page: number, id: string, by: Point) =>
      comment({
        label: "Move note",
        ops: [{ do: "edit", page, id, when: Date.now(), move: by }],
      }),
    [comment]
  )

  /** A colour for the picked comment, or for what the tool in hand makes next. */
  const setColour = useCallback(
    (colour: Colour) => {
      const now = live.current.tool
      if (now) {
        setStyles((was) => ({
          ...was,
          colours: { ...was.colours, [now]: colour },
        }))
        return
      }
      if (chosen)
        void comment({
          label: "Change colour",
          ops: [
            {
              do: "edit",
              page: chosen.page,
              id: chosen.comment.id,
              when: Date.now(),
              colour,
            },
          ],
        })
    },
    [chosen, comment]
  )

  const setWeight = useCallback(
    (weight: number) => setStyles((was) => ({ ...was, weight })),
    []
  )

  // The words under each mark, for the list and for those who cannot see the page.
  useEffect(() => {
    let stale = false
    for (const [page, here] of comments.entries()) {
      const marks = (here ?? []).filter((one) => one.quads.length)
      if (!marks.length) continue
      void readLetters(page, versions[page] ?? 0).then((lines) => {
        if (stale) return
        setQuotes((was) => {
          const next = { ...was }
          let changed = false
          for (const mark of marks) {
            const words = wordsUnder(lines, mark.quads)
            if (next[mark.id] !== words) {
              next[mark.id] = words
              changed = true
            }
          }
          return changed ? next : was
        })
      })
    }
    return () => {
      stale = true
    }
  }, [comments, versions, readLetters])

  /** What a drag with a mark tool would take in, as it stands. */
  const preview =
    marking && isMark(tool)
      ? selectWords(letters[marking.page] ?? [], marking.from, marking.to)
      : []

  return {
    tool,
    setTool,
    styles,
    setColour,
    setWeight,
    picked,
    chosen,
    pick,
    unpick,
    listed,
    setListed,
    typing,
    setTyping,
    author,
    setAuthor,
    marking,
    preview,
    notice,
    showPage,
    quotes,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    dragging,
    remove,
    setText,
    reply,
    move,
  }
}

export type Comments = ReturnType<typeof useComments>

/** What a comment is called for someone who cannot see it: its kind, the words it marks, and what it says. */
export function describeComment(comment: Comment, quote: string | undefined) {
  const name =
    comment.kind === "other"
      ? comment.type.replace(/([a-z])([A-Z])/g, "$1 $2")
      : COMMENT_NAMES[comment.kind]
  const about = [
    quote && `on “${quote.slice(0, 80)}”`,
    comment.text.slice(0, 80),
  ]
    .filter(Boolean)
    .join(": ")
  return about ? `${name} ${about}` : name
}
