import {
  defaultSettings,
  permissionBits,
  settingsProblem,
} from "@/lib/pdf-merger/settings"

/** Which parts carry the files attached to the PDF. */
export type AttachmentsChoice = "first" | "all" | "none"

/** What every part keeps of the file it came from, and whether it is locked. */
export interface SplitOptions {
  /** Keep the bookmarks of each part's pages. */
  bookmarks: boolean
  /** Keep the page numbers the file gives its own pages, where it does. */
  labels: boolean
  /** Keep the title, author, subject and keywords. */
  details: boolean
  attachments: AttachmentsChoice
  /** Lock every part with a password. */
  protect: boolean
  password: string
  /** A second password that lifts the limits; empty for none. */
  ownerPassword: string
  allowPrint: boolean
  allowCopy: boolean
  allowChanges: boolean
}

export const defaultOptions: SplitOptions = {
  bookmarks: true,
  labels: true,
  details: true,
  attachments: "first",
  protect: false,
  password: "",
  ownerPassword: "",
  allowPrint: true,
  allowCopy: true,
  allowChanges: true,
}

/** Why the options cannot be used as they stand; null when they can. */
export function optionsProblem(options: SplitOptions) {
  const { protect, password, ownerPassword } = options
  // The rules for passwords are the merger's.
  const problem = settingsProblem({
    ...defaultSettings,
    protect,
    password,
    ownerPassword,
  })
  return problem?.replace("the merged PDF", "the parts") ?? null
}

/** True when the parts would be locked with limits on what a reader may do. */
export const limitsReaders = (options: SplitOptions) =>
  options.protect &&
  !(options.allowPrint && options.allowCopy && options.allowChanges)

/**
 * The lock every part gets; null for none. Without a second password, limits
 * get one from `random` that nobody keeps, so they cannot be lifted; with no
 * limits, the one password opens everything.
 */
export function lockFor(options: SplitOptions, random: () => string) {
  if (!options.protect) return null
  return {
    password: options.password,
    ownerPassword:
      options.ownerPassword ||
      (limitsReaders(options) ? random() : options.password),
    permissions: permissionBits(options),
  }
}

/** Whether a part carries the attached files; `first` says it is the first part written. */
export const carriesAttachments = (choice: AttachmentsChoice, first: boolean) =>
  choice === "all" || (choice === "first" && first)

/**
 * Everything in the options that changes what is written, as one string. A
 * result made with other options is out of date.
 */
export const optionsKey = (options: SplitOptions) =>
  JSON.stringify(
    options.protect
      ? options
      : {
          ...options,
          password: "",
          ownerPassword: "",
          allowPrint: true,
          allowCopy: true,
          allowChanges: true,
        }
  )
