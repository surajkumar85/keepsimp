"use client"

import { useCallback, useState } from "react"
import type { TrustedCertificate } from "@/lib/pdf-editor/trust"

/** Where the certificates a person trusts are kept, on this device only, when they ask for it. */
const KEY = "keepsimp.trusted"

const base64Of = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
const bytesOf = (text: string) =>
  Uint8Array.from(atob(text), (letter) => letter.charCodeAt(0))

/** What was kept, as it was kept; null when nothing was, or it cannot be read. */
function remembered(): TrustedCertificate[] | null {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null")
    if (!Array.isArray(kept)) return null
    return kept.flatMap((one: Record<string, unknown>) =>
      typeof one?.fingerprint === "string" &&
      typeof one.name === "string" &&
      typeof one.issuer === "string" &&
      typeof one.validTo === "string" &&
      typeof one.der === "string"
        ? [
            {
              fingerprint: one.fingerprint,
              name: one.name,
              issuer: one.issuer,
              validTo: one.validTo,
              der: bytesOf(one.der),
            },
          ]
        : []
    )
  } catch {
    return null
  }
}

function keep(list: readonly TrustedCertificate[]) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(list.map((one) => ({ ...one, der: base64Of(one.der) })))
    )
  } catch {
    // The browser has no room, or keeps nothing: the list lasts this visit.
  }
}

function forget() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // There was nothing to forget.
  }
}

/**
 * The certificates the person trusts, against which signatures are
 * checked: added from files they choose, for this visit, or kept on this
 * device while "Remember them on this device" is on.
 */
export function useTrusted() {
  const [kept] = useState(remembered)
  const [list, setList] = useState<TrustedCertificate[]>(kept ?? [])
  const [remember, setRememberNow] = useState(kept !== null)
  /** Why the last file chosen added nothing; "" when it did. */
  const [problem, setProblem] = useState("")
  const [adding, setAdding] = useState(false)

  const change = useCallback(
    (next: TrustedCertificate[]) => {
      setList(next)
      if (remember) keep(next)
    },
    [remember]
  )

  const add = useCallback(
    async (file: File) => {
      setAdding(true)
      setProblem("")
      try {
        // The certificate reader is loaded only when it is first wanted.
        const trust = await import("@/lib/pdf-editor/trust")
        try {
          const read = await trust.readTrusted(
            new Uint8Array(await file.arrayBuffer())
          )
          const fresh = read.filter(
            (one) => !list.some((had) => had.fingerprint === one.fingerprint)
          )
          if (!fresh.length) setProblem("You trust this certificate already.")
          else change([...list, ...fresh])
        } catch (error) {
          setProblem(
            error instanceof trust.TrustProblem
              ? error.message
              : "This file could not be read."
          )
        }
      } catch {
        setProblem("The certificate reader could not be loaded. Try again.")
      } finally {
        setAdding(false)
      }
    },
    [list, change]
  )

  const remove = useCallback(
    (fingerprint: string) =>
      change(list.filter((one) => one.fingerprint !== fingerprint)),
    [list, change]
  )

  const setRemember = useCallback(
    (on: boolean) => {
      setRememberNow(on)
      if (on) keep(list)
      else forget()
    },
    [list]
  )

  return { list, add, remove, remember, setRemember, problem, adding }
}

export type Trusted = ReturnType<typeof useTrusted>
