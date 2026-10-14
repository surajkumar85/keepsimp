/**
 * What the signatures a file carries are said to be: whether each holds,
 * who made it, when it says it was made, what it covers, and what was
 * added to the file after it. The signatures are read in
 * `mupdf-signatures.ts` and checked in `signatures.ts`.
 */
import type { Signer } from "./certificate"

/** What was added to a file after a signature, against the file as it was signed. */
export interface Changes {
  /** How many times the file was added to after it (updates, each ending in %%EOF). */
  updates: number
  pagesAdded: number
  pagesRemoved: number
  /** Pages that look otherwise now, counted from 0. */
  pagesChanged: number[]
  commentsAdded: number
  commentsRemoved: number
  /** Fields whose value is not what it was, by name. */
  fieldsChanged: string[]
  /** Signatures added after it, by their fields' names. */
  signaturesAdded: string[]
  /**
   * Whether what the signature itself says (its time, name, reason or
   * place) was written anew after it; what is shown is what was signed.
   */
  detailsChanged: boolean
}

/** How a signature was checked: what it found, or why it was not checked. */
export type Verdict =
  | { checked: true; intact: boolean; signer: Signer | null; problem: string }
  | { checked: false; why: string }

/** A signature a file carries, as it was found and checked. */
export interface FoundSignature {
  /** Its field's name. */
  field: string
  /** The page its field is on, counted from 0, and whether it shows there. */
  page: number | null
  shown: boolean
  /** What kind of signature it is: `ETSI.CAdES.detached`, `adbe.pkcs7.detached`… */
  kind: string
  /** When it says it was signed, as an ISO date; null when it does not say. */
  time: string | null
  /** The name, reason and place it gives; "" for each it does not. */
  name: string
  reason: string
  location: string
  /** Whether it covers every byte of the file. */
  whole: boolean
  verdict: Verdict
  /** What was added after it; null when it covers the whole file. */
  changes: Changes | null
}

/** A moment as a PDF writes one (D:20261014173005+05'30'), as an ISO date; null when it is not one. */
export function readPdfDate(value: string): string | null {
  const found =
    /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(\d{2})?'?(\d{2})?'?)?$/.exec(
      value.trim()
    )
  if (!found) return null
  const [
    ,
    year,
    month = "01",
    day = "01",
    hour = "00",
    minute = "00",
    second = "00",
  ] = found
  const sign = found[7]
  const zone =
    !sign || /z/i.test(sign)
      ? "Z"
      : `${sign}${found[8] ?? "00"}:${found[9] ?? "00"}`
  const date = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`
  )
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const count = (value: number, word: string) =>
  `${value.toLocaleString("en")} ${word}${value === 1 ? "" : "s"}`

/** Pages counted from 0, as they are named: "page 2", "pages 1, 3 and 4". */
function pagesSaid(pages: readonly number[]) {
  const named = pages.slice(0, 8).map((page) => (page + 1).toLocaleString("en"))
  if (pages.length > 8)
    named.push(`${(pages.length - 8).toLocaleString("en")} more`)
  return named.length === 1
    ? `page ${named[0]}`
    : `pages ${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`
}

/** What was added to a file after a signature, in words. */
export function changesSaid(changes: Changes): string {
  const parts: string[] = []
  if (changes.detailsChanged)
    parts.push(
      "what this signature says of itself (its time, name, reason or place) was written anew, and is shown here as it was signed"
    )
  if (changes.signaturesAdded.length)
    parts.push(
      `${changes.signaturesAdded.length === 1 ? "a signature was" : `${changes.signaturesAdded.length} signatures were`} added (${changes.signaturesAdded.map((name) => `“${name}”`).join(", ")})`
    )
  if (changes.fieldsChanged.length)
    parts.push(
      `${changes.fieldsChanged.length === 1 ? "a field was" : `${changes.fieldsChanged.length} fields were`} filled in or changed (${changes.fieldsChanged
        .slice(0, 6)
        .map((name) => `“${name}”`)
        .join(", ")}${changes.fieldsChanged.length > 6 ? " and more" : ""})`
    )
  if (changes.commentsAdded)
    parts.push(`${count(changes.commentsAdded, "comment")} added`)
  if (changes.commentsRemoved)
    parts.push(`${count(changes.commentsRemoved, "comment")} taken away`)
  if (changes.pagesAdded)
    parts.push(`${count(changes.pagesAdded, "page")} added`)
  if (changes.pagesRemoved)
    parts.push(`${count(changes.pagesRemoved, "page")} taken out`)
  if (changes.pagesChanged.length)
    parts.push(
      `${pagesSaid(changes.pagesChanged)} ${changes.pagesChanged.length === 1 ? "looks" : "look"} different`
    )
  const after = `The file was added to ${changes.updates === 1 ? "once" : `${count(changes.updates, "time")}`} after this signature`
  if (!parts.length)
    return `${after}, without changing what any page shows, any field or any comment.`
  return `${after}: ${parts.join("; ")}.`
}

/** A signature's state in a few words, and whether it is good news. */
export function verdictSaid(found: FoundSignature): {
  text: string
  good: boolean
} {
  const { verdict } = found
  if (!verdict.checked) return { text: verdict.why, good: false }
  if (!verdict.intact)
    return {
      text: `This signature does not hold. ${verdict.problem}`,
      good: false,
    }
  return {
    text: found.whole
      ? "This signature holds: nothing in the file has changed since it was signed."
      : "This signature holds over the file as it was signed.",
    good: true,
  }
}

/** Who a signature names, and whether its certificate was valid when it says it was signed. */
export function signerSaid(found: FoundSignature): string[] {
  const { verdict } = found
  if (!verdict.checked || !verdict.signer)
    return found.name ? [`It gives the name ${found.name}.`] : []
  const { signer } = verdict
  const lines = [
    signer.selfSigned
      ? `Signed with the certificate of ${signer.name}, which signed itself: nobody vouches for that name.`
      : `Signed with the certificate of ${signer.name}, issued by ${signer.issuer}.`,
  ]
  if (found.time) {
    const at = Date.parse(found.time)
    if (at < Date.parse(signer.validFrom) || at > Date.parse(signer.validTo))
      lines.push(
        "The certificate was not valid at the time the signature gives. That time is the signer's own and is not proved."
      )
  }
  return lines
}
