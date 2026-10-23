/**
 * The merger's settings in groups, and each group in a few words, for the
 * settings card: a folded group still says what will be done. The password
 * line is shared with the splitter and the compressor, whose locks are the
 * merger's.
 */
import { line, type Groups } from "@/lib/settings-groups"
import type { BookmarkPolicy } from "./outline"
import type { PictureMargin, PicturePage } from "./picture"
import type { SheetChoice } from "./print"
import type { FormsChoice, MergeSettings } from "./settings"

export type MergeGroup =
  | "contents"
  | "fields"
  | "labels"
  | "attachments"
  | "printing"
  | "footer"
  | "details"
  | "password"

/** The settings that put a password on a result. */
export const LOCK_KEYS = [
  "protect",
  "password",
  "ownerPassword",
  "allowPrint",
  "allowCopy",
  "allowChanges",
] as const

export const MERGE_GROUPS: Groups<MergeSettings, MergeGroup> = {
  contents: ["bookmarks", "contents", "cover"],
  fields: ["forms"],
  labels: ["labels"],
  attachments: ["attachments"],
  printing: ["duplex", "sheet", "enlarge"],
  footer: ["footerName", "numbers", "numbersAt", "numbersFrom"],
  details: ["title", "author", "subject", "keywords"],
  password: LOCK_KEYS,
}

/** A line with its first letter made a capital. */
export const capital = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

/** Words listed the way they are said: "a, b or c". */
export function listed(words: readonly string[], last = "and") {
  if (words.length < 2) return words.join("")
  return `${words.slice(0, -1).join(", ")} ${last} ${words.at(-1)}`
}

/** What a password on a result comes to, in a line. */
export function lockSummary(lock: {
  protect: boolean
  password: string
  allowPrint: boolean
  allowCopy: boolean
  allowChanges: boolean
}) {
  if (!lock.protect) return "No password"
  if (!lock.password) return "A password is still to be typed"
  const barred = [
    !lock.allowPrint && "printing",
    !lock.allowCopy && "copying",
    !lock.allowChanges && "changes",
  ].filter((word): word is string => Boolean(word))
  return line(
    "Locked with a password",
    barred.length > 0 && `no ${listed(barred, "or")}`
  )
}

const BOOKMARKS: Record<BookmarkPolicy, string> = {
  nested: "Bookmarks under each file",
  keep: "Every bookmark kept",
  files: "One bookmark per file",
  none: "No bookmarks",
}

const FIELDS: Record<FormsChoice, string> = {
  keep: "Fields kept",
  join: "Fields of the same name joined",
  flatten: "Fields flattened",
  remove: "Fields taken out",
}

const SHEETS: Record<SheetChoice, string> = {
  keep: "Page sizes as they are",
  a4: "Every page on A4",
  letter: "Every page on Letter",
  first: "Every page like the first",
  largest: "Every page like the largest",
}

/** What a group of the merger's settings is, in a line. */
export function mergeSummary(group: MergeGroup, settings: MergeSettings) {
  switch (group) {
    case "contents":
      return line(
        BOOKMARKS[settings.bookmarks],
        settings.contents === "none"
          ? "no contents page"
          : settings.contents === "files"
            ? "contents by file name"
            : "contents by title",
        settings.contents !== "none" && settings.cover && "after a cover"
      )
    case "fields":
      return FIELDS[settings.forms]
    case "labels":
      return settings.labels === "continuous"
        ? "Counted from 1"
        : "Each file's own numbers"
    case "attachments":
      return settings.attachments
        ? "Attached files kept"
        : "Attached files left out"
    case "printing":
      return line(
        SHEETS[settings.sheet],
        settings.sheet !== "keep" &&
          !settings.enlarge &&
          "small pages not enlarged",
        settings.duplex && "double-sided"
      )
    case "footer": {
      const from = settings.numbersFrom
      return (
        capital(
          line(
            settings.footerName && "file names",
            settings.numbers !== "none" &&
              `${settings.numbers === "of" ? "“3 of 12”" : "page"} numbers ${
                settings.numbersAt === "centre"
                  ? "in the centre"
                  : `on the ${settings.numbersAt}`
              }`,
            settings.numbers !== "none" &&
              Number.isInteger(from) &&
              from !== 1 &&
              `from ${from}`
          )
        ) || "No footer"
      )
    }
    case "details": {
      const [title, author, subject, keywords] = [
        settings.title,
        settings.author,
        settings.subject,
        settings.keywords,
      ].map((text) => text.trim())
      return (
        capital(
          line(
            title && `“${title}”`,
            author && `by ${author}`,
            subject && "a subject",
            keywords && "keywords"
          )
        ) || "Nothing added"
      )
    }
    case "password":
      return lockSummary(settings)
  }
}

const PICTURE_PAGES: Record<PicturePage, string> = {
  previous: "Like the page before",
  fit: "Each page fits its picture",
  a4: "On A4",
  letter: "On Letter",
}

/** How pictures become pages, in a line. */
export function pictureSummary(page: PicturePage, margin: PictureMargin) {
  return line(
    PICTURE_PAGES[page],
    page !== "fit" && (margin === "none" ? "no margin" : `${margin} margin`)
  )
}
