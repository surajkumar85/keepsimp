/**
 * The editor's download card in groups, and each group in a few words: a
 * folded group still says what the download will do. Pure, so the card
 * and its tests share it.
 */
import { line } from "@/lib/settings-groups"
import type { Clean } from "./redact"

/** What is chosen for a download, as the card holds it. */
export interface DownloadChoices {
  /** The file carries a signature that changes can be written after. */
  signed: boolean
  signedHow: "keep" | "anew"
  keepEditable: boolean
  comments: "keep" | "flatten" | "remove"
  /** How many comments the file has; with none, the choice is not offered. */
  commentCount: number
  fields: "keep" | "flatten"
  /** How many form fields the file has; with none, the choice is not offered. */
  fieldCount: number
  clean: Clean
  /** Lock the result with a password. */
  protect: boolean
  /** Sign with a certificate. */
  certify: boolean
  /** Who the opened certificate names; empty while none is open. */
  signer: string
}

export type DownloadGroup =
  "signature" | "added" | "leave" | "certificate" | "password"

/** What a download is made with when nothing is chosen. */
export const USUAL_DOWNLOAD = {
  signedHow: "keep",
  keepEditable: false,
  comments: "keep",
  fields: "keep",
  protect: false,
  certify: false,
} as const

/** Written after a signed file, nothing else is chosen: only the signature and the certificate are offered. */
export const writtenAfter = (choices: DownloadChoices) =>
  choices.signed && choices.signedHow === "keep"

/** The groups the card shows, in their order. */
export function downloadGroups(choices: DownloadChoices): DownloadGroup[] {
  const after = writtenAfter(choices)
  return [
    ...(choices.signed ? (["signature"] as const) : []),
    ...(after ? [] : (["added", "leave"] as const)),
    "certificate",
    ...(after ? [] : (["password"] as const)),
  ]
}

const COMMENTS: Record<DownloadChoices["comments"], string> = {
  keep: "comments kept",
  flatten: "comments drawn in",
  remove: "comments left out",
}

const FIELDS: Record<DownloadChoices["fields"], string> = {
  keep: "fields kept",
  flatten: "fields drawn in",
}

const CLEAN: Record<keyof Clean, string> = {
  details: "details",
  attachments: "attached files",
  scripts: "scripts",
}

/** Words in a list: "a", "a and b", "a, b and c". */
function listed(words: string[]) {
  return words.length > 1
    ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
    : words.join("")
}

/** What a group of the download's choices is, in a line. */
export function downloadSummary(
  group: DownloadGroup,
  choices: DownloadChoices
): string {
  switch (group) {
    case "signature":
      return choices.signedHow === "keep"
        ? "Kept valid · changes written after it"
        : "Written anew · the signature will not hold"
    case "added":
      return line(
        choices.keepEditable ? "Kept editable" : "Part of the page",
        choices.commentCount > 0 && COMMENTS[choices.comments],
        choices.fieldCount > 0 && FIELDS[choices.fields]
      )
    case "leave": {
      const out = (Object.keys(CLEAN) as (keyof Clean)[])
        .filter((key) => choices.clean[key])
        .map((key) => CLEAN[key])
      if (!out.length) return "Nothing left out"
      const said = listed(out)
      return `${said[0].toUpperCase()}${said.slice(1)} left out`
    }
    case "certificate":
      return !choices.certify
        ? "Not signed with a certificate"
        : choices.signer
          ? `Signed with the certificate of ${choices.signer}`
          : "Choose a certificate to sign with"
    case "password":
      return choices.protect ? "Locked with a password" : "No password"
  }
}

/** Whether a group differs from what a download is made with when nothing is chosen. */
export function downloadChanged(
  group: DownloadGroup,
  choices: DownloadChoices
): boolean {
  switch (group) {
    case "signature":
      return choices.signedHow !== USUAL_DOWNLOAD.signedHow
    case "added":
      return (
        choices.keepEditable !== USUAL_DOWNLOAD.keepEditable ||
        (choices.commentCount > 0 &&
          choices.comments !== USUAL_DOWNLOAD.comments) ||
        (choices.fieldCount > 0 && choices.fields !== USUAL_DOWNLOAD.fields)
      )
    case "leave":
      return Object.values(choices.clean).some(Boolean)
    case "certificate":
      return choices.certify !== USUAL_DOWNLOAD.certify
    case "password":
      return choices.protect !== USUAL_DOWNLOAD.protect
  }
}
