"use client"

import { useCallback, useState } from "react"
import { parseRanges } from "@/lib/pdf-merger/ranges"
import {
  defaultLine,
  defaultWatermark,
  lineProblem,
  markProblem,
  type RepeatedLine,
  type Spot,
  type Watermark,
} from "@/lib/pdf-editor/repeated"
import type { Comments } from "./use-comments"
import type { Editor } from "./use-editor"
import type { Pages } from "./use-pages"

/** What is put on many pages at once. */
export const REPEAT_KINDS = ["numbers", "words", "bates", "mark"] as const
export type RepeatKind = (typeof REPEAT_KINDS)[number]

/** The ways a page's number is written. */
export const NUMBER_FORMATS = {
  plain: "{page}",
  page: "Page {page}",
  of: "{page} of {pages}",
  "page-of": "Page {page} of {pages}",
} as const
export type NumberFormat = keyof typeof NUMBER_FORMATS

/**
 * Page numbers, headers and footers, numbers that run on, and watermarks:
 * whether their panel is shown, what is set in it, the pages it is for,
 * and adding it to them.
 */
export function useRepeat(
  editor: Editor,
  comments: Comments,
  pages: Pages,
  /** What the panel begins with, and whether it is shown from the start. */
  start: RepeatKind = "numbers",
  begun = false
) {
  const [wanted, setWanted] = useState(begun)
  const [kind, setKind] = useState<RepeatKind>(start)
  const [format, setFormat] = useState<NumberFormat>("plain")
  const [words, setWords] = useState("")
  const [prefix, setPrefix] = useState("")
  const [suffix, setSuffix] = useState("")
  /** What every line shares: where it lies and how it looks, and the numbers it starts at. */
  const [look, setLook] = useState(defaultLine)
  const [mark, setMark] = useState(defaultWatermark)
  /** The name of the picture a watermark is made of, as its file was called. */
  const [pictureName, setPictureName] = useState("")
  const [range, setRange] = useState("")
  const [said, setSaid] = useState("")
  const count = editor.sizes.length
  // The lists of pages and of comments have the same place beside the pages: one at a time.
  const other = comments.listed || pages.on
  if (wanted && other) setWanted(false)
  const on = wanted && !other

  const setListed = comments.setListed
  const setPages = pages.setOn
  const setOn = useCallback(
    (next: boolean, begin?: RepeatKind) => {
      if (next) {
        setListed(false)
        setPages(false)
        if (begin) setKind(begin)
      }
      setWanted(next)
      setSaid("")
    },
    [setListed, setPages]
  )

  const line: RepeatedLine = {
    ...look,
    text:
      kind === "numbers"
        ? NUMBER_FORMATS[format]
        : kind === "bates"
          ? `${prefix}{number}${suffix}`
          : words,
  }
  // Each page once, in the order typed: that is the order they are numbered in.
  const read = parseRanges(range, count)
  const target = "pages" in read ? [...new Set(read.pages)] : []
  const problem =
    ("problem" in read ? read.problem : "") ||
    (kind === "mark" ? markProblem(mark) : lineProblem(line))

  /** Add what is set to the pages it is for. */
  const add = async () => {
    if (problem || !target.length) return
    setSaid("")
    await editor.repeat(kind === "mark" ? { mark } : { line }, target)
    setSaid(
      `Added to ${target.length.toLocaleString("en")} page${target.length === 1 ? "" : "s"}. Each is a thing of its own: select one to move, change or delete it. Undo takes them all away.`
    )
  }

  /** Use a picture for the watermark: it is handed to the worker first. */
  const choosePicture = async (file: File) => {
    const taken = await editor.handPicture(file)
    if (!taken) return
    setMark((was) => ({ ...was, picture: taken }))
    setPictureName(file.name)
  }
  const dropPicture = () => {
    setMark((was) => ({ ...was, picture: undefined }))
    setPictureName("")
  }

  return {
    on,
    setOn,
    kind,
    setKind: (next: RepeatKind) => {
      setKind(next)
      setSaid("")
    },
    format,
    setFormat,
    words,
    setWords,
    prefix,
    setPrefix,
    suffix,
    setSuffix,
    look,
    setLook: (change: Partial<RepeatedLine>) =>
      setLook((was) => ({ ...was, ...change })),
    setSpot: (spot: Spot) => setLook((was) => ({ ...was, spot })),
    mark,
    setMark: (change: Partial<Watermark>) =>
      setMark((was) => ({ ...was, ...change })),
    pictureName,
    choosePicture,
    dropPicture,
    range,
    setRange,
    target,
    problem,
    said,
    add,
  }
}

export type Repeat = ReturnType<typeof useRepeat>
