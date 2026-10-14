"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Worker as Tesseract } from "tesseract.js"
import { parseRanges } from "@/lib/pdf-merger/ranges"
import {
  ocrSummary,
  readingOf,
  type OcrOp,
  type TesseractBlock,
} from "@/lib/pdf-editor/ocr"
import { OCR_BASE } from "@/lib/pdf-editor/ocr-files"
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
  "The files that recognise words could not be loaded. Go online once and try again: they are kept on this device for working offline afterwards."

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
  const engine = () =>
    (tesseract.current ??= (async () => {
      const { createWorker, OEM } = await import("tesseract.js")
      return createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: `${OCR_BASE}/worker.min.js`,
        corePath: OCR_BASE,
        langPath: OCR_BASE,
        // The language is kept by the site's offline copy, not a store of Tesseract's own.
        cacheMethod: "none",
        workerBlobURL: false,
        logger: (message) => {
          if (message.status === "recognizing text")
            progress.current(message.progress)
        },
      })
    })())

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
      const loaded = await Promise.race([engine(), promise])
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
    const ops: OcrOp[] = []
    const tally = {
      read: [] as number[],
      words: 0,
      unsure: 0,
      sure: 0,
      hadText: [] as number[],
      blank: [] as number[],
      failed: [] as number[],
    }
    for (const [done, page] of target.entries()) {
      if (stopped.current) break
      setRun({ done, total, page, share: 0, loading: false })
      progress.current = (share) =>
        setRun((now) => (now && now.page === page ? { ...now, share } : now))
      const picture = await editor.ocrPicture(page)
      if (stopped.current) break
      if (!picture) {
        tally.failed.push(page)
        continue
      }
      if (picture.letters > 0 && !alsoText) {
        tally.hadText.push(page)
        continue
      }
      let blocks: TesseractBlock[]
      try {
        const reading = await Promise.race([
          worker.recognize(
            new Blob([picture.png as BlobPart], { type: "image/png" }),
            {},
            { blocks: true, text: false }
          ),
          promise,
        ])
        if (!reading) break
        blocks = (reading.data.blocks ?? []) as unknown as TesseractBlock[]
      } catch {
        // Stopping lets Tesseract go in the middle of a page.
        if (stopped.current) break
        tally.failed.push(page)
        continue
      }
      const reading = readingOf(blocks, picture.scale)
      if (!reading.words) {
        tally.blank.push(page)
        continue
      }
      ops.push({ page, lines: reading.lines })
      tally.read.push(page)
      tally.words += reading.words
      tally.unsure += reading.unsure
      tally.sure += reading.confidence * reading.words
    }
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
          label:
            ops.length === 1
              ? `Recognise text on page ${ops[0].page + 1}`
              : `Recognise text on ${ops.length.toLocaleString("en")} pages`,
          ops,
        })
      : true
    setRun(null)
    if (!laid) return
    setSaid(
      ocrSummary({
        ...tally,
        confidence: tally.words ? Math.round(tally.sure / tally.words) : 0,
        stopped: stopped.current,
      })
    )
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
