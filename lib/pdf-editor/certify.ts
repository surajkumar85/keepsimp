/**
 * Signing a file with a certificate at download: where the signature
 * shows, what it says, and whether the certificate may sign now. The
 * signature itself is made in `certificate.ts` and written in
 * `mupdf-certify.ts`.
 */
import type { Signer } from "./certificate"
import type { Box } from "./geometry"

/**
 * Where a signature shows: nowhere (it is in the file all the same), in a
 * place for a signature the form has (by its name), or in a box at the
 * foot of a page (counted from 0).
 */
export type SignPlace =
  | { kind: "none" }
  | { kind: "field"; name: string }
  | { kind: "box"; page: number }

export interface CertifyOptions {
  place: SignPlace
  /** Why it is signed, and where: both may be left empty. */
  reason: string
  location: string
}

/** The longest reason or place a signature is given. */
export const LONGEST_SAID = 200

const clean = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/[\p{Cc}\p{Cf}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
    : null

/** Signing choices as they come from the page, or null when they are not such. */
export function readCertifyOptions(value: unknown): CertifyOptions | null {
  if (typeof value !== "object" || value === null) return null
  const options = value as Record<string, unknown>
  const reason = clean(options.reason)
  const location = clean(options.location)
  if (reason === null || location === null) return null
  if (reason.length > LONGEST_SAID || location.length > LONGEST_SAID)
    return null
  const place = options.place as Record<string, unknown> | null
  if (typeof place !== "object" || place === null) return null
  if (place.kind === "none")
    return { place: { kind: "none" }, reason, location }
  if (place.kind === "box") {
    const { page } = place
    if (
      !Number.isInteger(page) ||
      (page as number) < 0 ||
      (page as number) >= 1e5
    )
      return null
    return { place: { kind: "box", page: page as number }, reason, location }
  }
  if (place.kind === "field") {
    const name = clean(place.name)
    if (!name || name.length > LONGEST_SAID) return null
    return { place: { kind: "field", name }, reason, location }
  }
  return null
}

const two = (value: number) => String(value).padStart(2, "0")

/** A moment as a PDF writes one, in the time where it is signed: D:20261014173000+01'00'. */
export function pdfDate(date: Date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? "+" : "-"
  const away = Math.abs(offset)
  return `D:${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}${sign}${two(Math.floor(away / 60))}'${two(away % 60)}'`
}

/** A moment as a visible signature says it: 2026-10-14 17:30 +01:00. */
export function dateSaid(date: Date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? "+" : "-"
  const away = Math.abs(offset)
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())} ${sign}${two(Math.floor(away / 60))}:${two(away % 60)}`
}

/** The day a certificate's date falls on, as it is said: 14 October 2026. */
export const daySaid = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

/** Why a certificate cannot sign at a moment, or "" when it can. */
export function validityProblem(signer: Signer, now: Date) {
  if (now.getTime() < Date.parse(signer.validFrom))
    return `This certificate is not valid until ${daySaid(signer.validFrom)}: a signature made with it now would not hold.`
  if (now.getTime() > Date.parse(signer.validTo))
    return `This certificate expired on ${daySaid(signer.validTo)}: a signature made with it would not hold.`
  return ""
}

/** The lines a visible signature shows. */
export function appearanceLines(
  signer: Pick<Signer, "name">,
  date: Date,
  options: Pick<CertifyOptions, "reason" | "location">
) {
  return [
    `Digitally signed by ${signer.name}`,
    `Date: ${dateSaid(date)}`,
    ...(options.reason ? [`Reason: ${options.reason}`] : []),
    ...(options.location ? [`Location: ${options.location}`] : []),
  ]
}

/** How large a signature's box is, and how far from the edges of the page. */
export const BOX = { width: 220, height: 64, margin: 36 }

/**
 * Where a signature's box goes on a page, as the page is shown: at its
 * foot, on the right, within its margins; smaller on a small page.
 */
export function boxOn(page: { width: number; height: number }): Box {
  const margin = Math.min(BOX.margin, page.width / 10, page.height / 10)
  const width = Math.min(BOX.width, page.width - 2 * margin)
  const height = Math.min(BOX.height, page.height - 2 * margin)
  return {
    x: page.width - margin - width,
    y: page.height - margin - height,
    width,
    height,
  }
}
