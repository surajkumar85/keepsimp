/**
 * What every part keeps, and its password, in groups and in a few words
 * each, for the settings card: a folded group still says what will be done.
 */
import {
  capital,
  listed,
  lockSummary,
  LOCK_KEYS,
} from "@/lib/pdf-merger/summary"
import { line, type Groups } from "@/lib/settings-groups"
import type { AttachmentsChoice, SplitOptions } from "./options"

export type SplitGroup = "keeps" | "password"

export const SPLIT_GROUPS: Groups<SplitOptions, SplitGroup> = {
  keeps: ["bookmarks", "labels", "details", "attachments"],
  password: LOCK_KEYS,
}

const ATTACHMENTS: Record<AttachmentsChoice, string> = {
  first: "attached files in the first part",
  all: "attached files in every part",
  none: "no attached files",
}

/** What a group of the splitter's options is, in a line. */
export function splitSummary(group: SplitGroup, options: SplitOptions) {
  if (group === "password") return lockSummary(options)
  const kept = [
    options.bookmarks && "bookmarks",
    options.labels && "page numbers",
    options.details && "details",
  ].filter((word): word is string => Boolean(word))
  return line(
    kept.length
      ? capital(listed(kept))
      : "No bookmarks, page numbers or details",
    ATTACHMENTS[options.attachments]
  )
}
