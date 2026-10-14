"use client"

import { useState, type RefObject } from "react"
import type { Signer } from "@/lib/pdf-editor/certificate"
import type { CertifyOptions, SignPlace } from "@/lib/pdf-editor/certify"
import type { PdfClient } from "@/lib/pdf-merger/client"

/** What a certificate file was found to be when it was opened. */
interface Opened {
  signer: Signer
  /** Why it cannot sign now, or "". */
  problem: string
  /** The file's empty places for a signature, by name. */
  places: string[]
}

/** Where a signature shows, as the choice is kept: nowhere, a box, or a place by its name. */
export type Where = "none" | "box" | `field:${string}`

/**
 * Signing at download with a certificate: whether it is asked for, the
 * certificate file and its password (kept in this page only while it is
 * open, never stored or sent), who the certificate names, where the
 * signature shows and what it says.
 */
export function useCertify(client: RefObject<PdfClient | null>, id: string) {
  const [on, setOn] = useState(false)
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null
  )
  const [password, setPassword] = useState("")
  const [opened, setOpened] = useState<Opened | null>(null)
  const [unread, setUnread] = useState("")
  const [opening, setOpening] = useState(false)
  const [where, setWhere] = useState<Where>("none")
  const [page, setPage] = useState("1")
  const [reason, setReason] = useState("")
  const [location, setLocation] = useState("")

  /** Read a chosen certificate file; what was opened before no longer counts. */
  const choose = async (chosen: File) => {
    setOpened(null)
    setUnread("")
    setFile({
      name: chosen.name,
      bytes: new Uint8Array(await chosen.arrayBuffer()),
    })
  }

  /** Open the certificate with its password, to see who it names. */
  const open = async () => {
    const worker = client.current
    if (!worker || !file || opening) return
    setOpening(true)
    setUnread("")
    try {
      const answer = await worker.certificate(id, file.bytes.slice(), password)
      if (answer.signer)
        setOpened({
          signer: answer.signer,
          problem: answer.problem,
          places: answer.places,
        })
      else {
        setOpened(null)
        setUnread(answer.problem)
      }
    } finally {
      setOpening(false)
    }
  }

  /** Where the signature shows, as the worker is told. */
  const place = (count: number): SignPlace | null => {
    if (where === "none") return { kind: "none" }
    if (where === "box") {
      const number = Number(page)
      return Number.isInteger(number) && number >= 1 && number <= count
        ? { kind: "box", page: number - 1 }
        : null
    }
    const name = where.slice("field:".length)
    return opened?.places.includes(name) ? { kind: "field", name } : null
  }

  /** What stands in the way of signing, in words; "" when nothing does or signing is off. */
  const problemFor = (count: number, locked: boolean) => {
    if (!on) return ""
    if (locked)
      return "A file locked with a password cannot be signed here. Turn the lock off to sign it."
    if (!file)
      return "Choose your certificate file (.p12 or .pfx) to sign with."
    if (!opened)
      return unread || "Open the certificate with its password to sign with it."
    if (opened.problem) return opened.problem
    if (!place(count))
      return where === "box"
        ? `Type a page from 1 to ${count.toLocaleString("en")} for the signature's box.`
        : "Choose where the signature shows."
    return ""
  }

  /** What the worker is given to sign with at download, or undefined when it is not to sign. */
  const request = (
    count: number
  ):
    | { file: Uint8Array; password: string; options: CertifyOptions }
    | undefined => {
    const shown = place(count)
    if (!on || !file || !opened || opened.problem || !shown) return undefined
    return {
      file: file.bytes.slice(),
      password,
      options: {
        place: shown,
        reason: reason.trim(),
        location: location.trim(),
      },
    }
  }

  return {
    on,
    setOn,
    file,
    choose,
    password,
    setPassword: (next: string) => {
      setPassword(next)
      setOpened(null)
      setUnread("")
    },
    opened,
    unread,
    opening,
    open,
    where,
    setWhere,
    page,
    setPage,
    reason,
    setReason,
    location,
    setLocation,
    problemFor,
    request,
  }
}

export type Certify = ReturnType<typeof useCertify>
