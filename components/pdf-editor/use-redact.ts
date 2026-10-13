"use client"

import { useCallback, useState } from "react"
import { selectWords } from "@/lib/pdf-editor/comments"
import type { Box, Point } from "@/lib/pdf-editor/geometry"
import {
  PATTERNS,
  quadOf,
  shapeSearch,
  type PatternName,
  type RedactOp,
  type Sought,
} from "@/lib/pdf-editor/redact"
import type { Comments } from "./use-comments"
import type { Crop } from "./use-crop"
import type { Editor } from "./use-editor"
import type { Find } from "./use-find"
import type { Inpage } from "./use-inpage"
import type { Links } from "./use-links"
import type { Retext } from "./use-retext"

export const REDACT_HINT =
  "Drag over what is to go, or mark words and kinds of thing. A mark takes nothing out until the marks are applied; what is applied is gone from the file for good."

/** The size a mark has when it is put on a page with a button, in points. */
const FIRST_MARK = { width: 120, height: 24 }

const many = (count: number, one: string, more = `${one}s`) =>
  `${count.toLocaleString("en")} ${count === 1 ? one : more}`

/**
 * Taking things out for good: whether that is what the pointer does now,
 * the words that are looked for, marking and unmarking, and applying the
 * marks.
 */
export function useRedact(
  editor: Editor,
  comments: Comments,
  retext: Retext,
  inpage: Inpage,
  links: Links,
  find: Find,
  crop: Crop,
  /** The page that is being read, counted from 0. */
  reading: () => number,
  /** The tool is in hand from the start. */
  begun = false
) {
  const [wanted, setWanted] = useState(begun)
  const [words, setWords] = useState("")
  /** The words are a shape: `#` for a figure, `@` for a letter, `?` for any one character, `*` for a run. */
  const [shaped, setShaped] = useState(false)
  /** What a drag over a page marks: the area it draws, or the words between its ends. */
  const [how, setHow] = useState<"area" | "words">("area")
  /** Drawings that a mark only touches are taken out whole. */
  const [whole, setWhole] = useState(false)
  const [said, say] = useState({ text: "", warn: false })
  /** What the tool has to say about what was done last; with `warn`, something that needs looking at. */
  const setNote = useCallback(
    (text: string, warn = false) => say({ text, warn }),
    []
  )
  const note = said.text
  const [looking, setLooking] = useState(false)
  /** The mark that was just put on a page with a button: the keyboard goes to it. */
  const [fresh, setFresh] = useState<{ page: number; id: string } | null>(null)
  // Any other tool that is taken in hand puts this one down.
  const other =
    editor.state.tool !== "select" ||
    comments.tool !== null ||
    retext.on ||
    inpage.on ||
    links.on ||
    find.on ||
    crop.on
  if (wanted && other) setWanted(false)
  const on = wanted && !other

  const { setTool, deselect, changeRedact, findToRedact, newId, letters } =
    editor
  const setCommentTool = comments.setTool
  const setRetext = retext.setOn
  const setInpage = inpage.setOn
  const setLinks = links.setOn
  const setFind = find.setOn
  const setCrop = crop.setOn
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setCommentTool(null)
        setRetext(false)
        setInpage(false)
        setLinks(false)
        setFind(false)
        setCrop(false)
        setTool("select")
        deselect()
      }
      setWanted(next)
      setNote("")
    },
    [
      setCommentTool,
      setRetext,
      setInpage,
      setLinks,
      setFind,
      setCrop,
      setTool,
      deselect,
      setNote,
    ]
  )

  /** Mark an area of a page. */
  const markArea = useCallback(
    (page: number, box: Box) => {
      return changeRedact("Mark a place", {
        do: "mark",
        page,
        id: newId(),
        quads: [quadOf(box)],
      })
    },
    [changeRedact, newId]
  )

  /**
   * Put a mark in the middle of the page that is being read, for those who
   * do not drag: the arrow keys take it where it belongs.
   */
  const addMark = useCallback(async () => {
    setNote("")
    const page = Math.min(reading(), editor.sizes.length - 1)
    const size = editor.sizes[page]
    if (!size) return
    const width = Math.min(FIRST_MARK.width, size.width)
    const height = Math.min(FIRST_MARK.height, size.height)
    const id = newId()
    setFresh({ page, id })
    await changeRedact("Mark a place", {
      do: "mark",
      page,
      id,
      quads: [
        quadOf({
          x: (size.width - width) / 2,
          y: (size.height - height) / 2,
          width,
          height,
        }),
      ],
    })
    setNote(
      "A mark is in the middle of the page. The arrow keys move it; with Alt they make it larger or smaller."
    )
  }, [changeRedact, newId, reading, editor.sizes, setNote])

  /** Put a mark somewhere else, or make it another size. */
  const remark = useCallback(
    (page: number, id: string, box: Box) =>
      // A mark is not changed where it is: it is taken away and put anew, in one step.
      changeRedact(
        "Move a mark",
        { do: "unmark", page, id },
        { do: "mark", page, id, quads: [quadOf(box)] }
      ),
    [changeRedact]
  )

  /** Mark the words between two points of a page, as words are selected. */
  const markBetween = useCallback(
    async (page: number, version: number, from: Point, to: Point) => {
      setNote("")
      const quads = selectWords(await letters(page, version), from, to)
      if (!quads.length) {
        setNote(
          "No words there. On a scanned page, or for a picture, mark an area."
        )
        return
      }
      await changeRedact("Mark words", {
        do: "mark",
        page,
        id: newId(),
        quads,
      })
    },
    [changeRedact, newId, letters, setNote]
  )

  /** Take a mark away again. */
  const unmark = useCallback(
    (page: number, id: string) => {
      return changeRedact("Take a mark away", { do: "unmark", page, id })
    },
    [changeRedact]
  )

  /** Look through the file for some words or for things of a kind, and mark every place. */
  const markAll = async (sought: Sought, named: string) => {
    setLooking(true)
    setNote("")
    try {
      const got = await findToRedact(sought)
      if (!got) {
        setNote("The file could not be looked through.")
        return
      }
      if (!got.found.length) {
        setNote(`No ${named} found in the words of this file.`)
        return
      }
      const ops = got.found.map((place): RedactOp => ({
        do: "mark",
        page: place.page,
        id: newId(),
        quads: [place.quad],
      }))
      const pages = new Set(got.found.map((place) => place.page)).size
      await changeRedact(`Mark ${many(ops.length, "place")}`, ...ops)
      setNote(
        `Marked ${many(ops.length, "place")} on ${many(pages, "page")}${got.more ? ", the first that were found" : ""}. Look them over, then apply.`
      )
    } finally {
      setLooking(false)
    }
  }
  const markWords = async () => {
    const typed = words.trim()
    if (!typed) return
    if (!shaped) return markAll({ words: typed }, `“${typed}”`)
    if (!shapeSearch(typed)) {
      setNote(
        "That shape cannot be looked for: it needs a letter, a figure or a # or @ of its own, and may have two * at most."
      )
      return
    }
    return markAll({ shape: typed }, `place of the shape “${typed}”`)
  }
  const markPattern = (pattern: PatternName) =>
    markAll({ pattern }, PATTERNS[pattern].name.toLowerCase())

  /** Apply every mark: what is under them is taken out of the file. */
  const apply = async () => {
    setNote("")
    const applied = await changeRedact("Apply the marks", {
      do: "apply",
      ...(whole ? { touched: true } : null),
    })
    if (!applied) return
    const places = applied.reduce((sum, page) => sum + page.boxes.length, 0)
    const residue = applied.reduce((sum, page) => sum + page.residue, 0)
    setNote(
      `${many(places, "place")} ${places === 1 ? "was" : "were"} emptied for good.${
        residue
          ? ` Under ${many(residue, "mark")} something is still drawn: a drawing that reaches beyond its mark, such as the rule of a table. If it must go too, undo, turn on “Whole drawings” and apply again, or mark all of it.`
          : ""
      }`,
      residue > 0
    )
  }

  return {
    on,
    setOn,
    words,
    setWords,
    shaped,
    setShaped,
    whole,
    setWhole,
    how,
    setHow,
    note,
    warned: said.warn,
    looking,
    waiting: editor.waiting,
    markArea,
    markBetween,
    addMark,
    remark,
    fresh,
    setFresh,
    unmark,
    markWords,
    markPattern,
    apply,
  }
}

export type Redact = ReturnType<typeof useRedact>
