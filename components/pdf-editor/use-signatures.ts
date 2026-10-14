"use client"

import { useCallback, useEffect, useState, type RefObject } from "react"
import type { FoundSignature } from "@/lib/pdf-editor/signature-report"
import type { PdfClient } from "@/lib/pdf-merger/client"
import type { Comments } from "./use-comments"
import type { Described } from "./use-described"
import type { MakeForm } from "./use-make-form"
import type { Ocr } from "./use-ocr"
import type { Pages } from "./use-pages"
import type { Repeat } from "./use-repeat"
import type { Trusted } from "./use-trusted"

/**
 * The signatures the file came with: read and checked once it is open,
 * and the panel that lists them, which shares its place beside the pages
 * with the other panels, one at a time.
 */
export function useSignatures(
  client: RefObject<PdfClient | null>,
  id: string,
  comments: Comments,
  pages: Pages,
  repeat: Repeat,
  described: Described,
  makeForm: MakeForm,
  ocr: Ocr,
  /** The certificates the person trusts, which each signature is checked against. */
  trusted: Trusted,
  /** Whether the panel is shown from the start. */
  begun = false
) {
  const [wanted, setWanted] = useState(begun)
  const other =
    comments.listed ||
    pages.on ||
    repeat.on ||
    described.on ||
    ocr.on ||
    (makeForm.on && makeForm.panel)
  if (wanted && other) setWanted(false)
  const on = wanted && !other
  const [read, setRead] = useState<{
    id: string
    found: FoundSignature[] | null
  } | null>(null)
  /** Undefined while they are read; null when they could not be. */
  const found = read?.id === id ? read.found : undefined

  // Read again when the certificates trusted change: only the checks are made again.
  const { list } = trusted
  useEffect(() => {
    let live = true
    void client.current
      ?.signatures(
        id,
        list.map((one) => one.der)
      )
      .then((answer) => {
        if (live) setRead({ id, found: answer })
      })
    return () => {
      live = false
    }
  }, [client, id, list])

  const setListed = comments.setListed
  const setPages = pages.setOn
  const setRepeat = repeat.setOn
  const setDescribed = described.setOn
  const setForm = makeForm.setOn
  const setOcr = ocr.setOn
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        setListed(false)
        setPages(false)
        setRepeat(false)
        setDescribed(false)
        setForm(false)
        setOcr(false)
      }
      setWanted(next)
    },
    [setListed, setPages, setRepeat, setDescribed, setForm, setOcr]
  )

  return { on, setOn, found, trusted }
}

export type Signatures = ReturnType<typeof useSignatures>
