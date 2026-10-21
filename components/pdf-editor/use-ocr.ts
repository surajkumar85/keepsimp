"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { parseRanges } from "@/lib/pdf-merger/ranges"
import { ocrSummary } from "@/lib/pdf-editor/ocr"
import { ocrLabel, readPages } from "@/lib/pdf-editor/ocr-run"
import {
  recognise,
  startTesseract,
  type Tesseract,
} from "@/lib/pdf-editor/tesseract"
import {
  OCR_ENGINE_SIZE,
  OCR_LANGUAGES,
  preferredLanguage,
} from "@/lib/pdf-editor/ocr-files"
import type { Comments } from "./use-comments"
import type { Described } from "./use-described"
import type { Editor } from "./use-editor"
import type { MakeForm } from "./use-make-form"
import type { Pages } from "./use-pages"
import type { Repeat } from "./use-repeat"

/** Where a run of recognising is. */
export interface OcrRun {
  /** Pages done, of how many. */
  done: number
  total: number
  /** The page being read, counted from 0. */
  page: number
  /** How far Tesseract is with it, from 0 to 1. */
  share: number
  /** The files that recognise words are still being loaded. */
  loading: boolean
}

/** A run that read nothing. */
const emptyTally = {
  read: [],
  words: 0,
  unsure: 0,
  confidence: 0,
  hadText: [],
  blank: [],
  failed: [],
}

/** Said when the files that recognise words cannot be loaded. */
export const OCR_UNAVAILABLE =
  "What recognises words in the languages chosen could not be loaded. Go online once and try again: it is kept on this device for working offline afterwards."

/**
 * Recognising words on scanned pages (OCR): whether its panel is shown,
 * which pages it is for, reading them one by one with Tesseract on this
 * device, and laying what was read on them as one step. The panel shares
 * its place beside the pages with the other panels, one at a time.
 */
export function useOcr(
  editor: Editor,
  comments: Comments,
  pages: Pages,
  repeat: Repeat,
  described: Described,
  makeForm: MakeForm,
  /** Whether the panel is shown from the start. */
  begun = false
) {
  const [wanted, setWanted] = useState(begun)
  const other =
    comments.listed ||
    pages.on ||
    repeat.on ||
    described.on ||
    (makeForm.on && makeForm.panel)
  if (wanted && other) setWanted(false)
  const on = wanted && !other
  const [range, setRange] = useState("")
  const [alsoText, setAlsoText] = useState(false)
  // The language its user reads, as the browser says, when it is offered.
  const [language, setLanguage] = useState(() =>
    typeof navigator === "undefined"
      ? "eng"
      : preferredLanguage(navigator.languages ?? [navigator.language])
  )
  /** A second language the pages are written in as well; empty for none. */
  const [also, setAlso] = useState("")
  const languages = [...new Set([language, also].filter(Boolean))]
  /** The languages Tesseract was started with. */
  const startedFor = useRef("")
  const [run, setRun] = useState<OcrRun | null>(null)
  const [said, setSaid] = useState<{ text: string; good: boolean } | null>(null)
  const stopped = useRef(false)
  /**
   * Settles when Stop is pressed. A page being read is not waited for:
   * Tesseract let go of in the middle of one does not always say so.
   */
  const stopping = useRef<{ promise: Promise<void>; settle: () => void }>(null)
  const tesseract = useRef<Promise<Tesseract> | null>(null)
  const progress = useRef<(share: number) => void>(() => {})
  // The list of pages as it was when a run began, to tell that it changed.
  const layout = useRef(editor.layout)
  useEffect(() => {
    layout.current = editor.layout
  }, [editor.layout])

  /** Let Tesseract go: its memory is given back, and a page being read is stopped. */
  const letGo = useCallback(() => {
    const was = tesseract.current
    tesseract.current = null
    void was?.then((worker) => worker.terminate()).catch(() => undefined)
  }, [])
  useEffect(() => letGo, [letGo])

  /** Tesseract, loaded from this site the first time it is wanted. */
  const engine = (langs: string) => {
    // Other languages are read by a Tesseract started for them.
    if (startedFor.current !== langs) letGo()
    startedFor.current = langs
    return (tesseract.current ??= startTesseract(langs, (share) =>
      progress.current(share)
    ))
  }

  const setListed = comments.setListed
  const setPages = pages.setOn
  const setRepeat = repeat.setOn
  const setDescribed = described.setOn
  const setForm = makeForm.setOn
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setListed(false)
        setPages(false)
        setRepeat(false)
        setDescribed(false)
        setForm(false)
      }
      setWanted(next)
    },
    [setListed, setPages, setRepeat, setDescribed, setForm]
  )

  const count = editor.sizes.length
  const read = parseRanges(range, count)
  // Each page once, in the order typed.
  const target = "pages" in read ? [...new Set(read.pages)] : []
  const problem = "problem" in read ? read.problem : ""

  /** Read the pages chosen, one after another, and lay what was found on them. */
  const start = async () => {
    if (run || problem || !target.length) return
    stopped.current = false
    let settle = () => {}
    const promise = new Promise<void>((resolve) => (settle = resolve))
    stopping.current = { promise, settle }
    setSaid(null)
    const began = layout.current
    const total = target.length
    setRun({ done: 0, total, page: target[0], share: 0, loading: true })
    let worker: Tesseract
    try {
      const loaded = await Promise.race([engine(languages.join("+")), promise])
      if (!loaded) {
        setRun(null)
        setSaid(ocrSummary({ ...emptyTally, stopped: true }))
        return
      }
      worker = loaded
    } catch {
      tesseract.current = null
      setRun(null)
      setSaid({ text: OCR_UNAVAILABLE, good: false })
      return
    }
    const { ops, tally } = await readPages(target, alsoText, {
      picture: (page) => editor.ocrPicture(page),
      read: (png) =>
        Promise.race([recognise(worker, png), promise.then(() => null)]),
      stopped: () => stopped.current,
      onPage: (done, total, page) => {
        setRun({ done, total, page, share: 0, loading: false })
        progress.current = (share) =>
          setRun((now) => (now && now.page === page ? { ...now, share } : now))
      },
    })
    progress.current = () => {}
    if (layout.current !== began) {
      setRun(null)
      setSaid({
        text: "The pages were changed while they were being read, so nothing was laid on them. Recognise them again.",
        good: false,
      })
      return
    }
    const laid = ops.length
      ? await editor.recognised({
          label: ocrLabel(ops),
          ops,
        })
      : true
    setRun(null)
    if (!laid) return
    setSaid(ocrSummary({ ...tally, stopped: stopped.current }))
  }

  /** Stop reading: the pages read so far are laid. */
  const stop = () => {
    stopped.current = true
    stopping.current?.settle()
    letGo()
  }

  return {
    on,
    setOn: (next: boolean) => {
      // Put down, Tesseract's memory is given back; a run goes on unseen.
      if (!next && !run) letGo()
      setOn(next)
    },
    range,
    setRange: (next: string) => {
      setRange(next)
      setSaid(null)
    },
    alsoText,
    language,
    setLanguage: (next: string) => {
      setLanguage(next)
      if (also === next) setAlso("")
    },
    also,
    setAlso,
    /** What is downloaded the first time these languages are read, at most, in bytes. */
    download:
      OCR_ENGINE_SIZE +
      OCR_LANGUAGES.filter(({ code }) => languages.includes(code)).reduce(
        (sum, { size }) => sum + size,
        0
      ),
    setAlsoText,
    target,
    problem,
    run,
    said,
    start,
    stop,
  }
}

export type Ocr = ReturnType<typeof useOcr>
