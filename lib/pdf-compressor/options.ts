/**
 * What else is done to a file besides making it smaller: things taken out
 * of it, and a password put on it. Everything here is off unless asked for.
 */
import {
  defaultSettings,
  permissionBits,
  settingsProblem,
} from "@/lib/pdf-merger/settings"

/** Things a file can do without. Each is kept unless its switch is on. */
export interface Removal {
  /** Title, author, the app that made it and when. */
  details: boolean
  /** Files attached to the document. */
  attachments: boolean
  bookmarks: boolean
  /** Notes, highlights and drawings added on top of pages. Links and form fields stay. */
  comments: boolean
  /** Scripts that run when the file is opened or a field is used. */
  scripts: boolean
  /** The structure that lets a screen reader follow the document. */
  tags: boolean
  /** Make what is filled into form fields part of the page, and take the fields away. */
  flatten: boolean
}

export interface Extras extends Removal {
  /** Lock the result with a password. */
  protect: boolean
  password: string
  /** A second password that lifts the limits; empty for none. */
  ownerPassword: string
  allowPrint: boolean
  allowCopy: boolean
  allowChanges: boolean
}

const keepAll: Removal = {
  details: false,
  attachments: false,
  bookmarks: false,
  comments: false,
  scripts: false,
  tags: false,
  flatten: false,
}

export const defaultExtras: Extras = {
  ...keepAll,
  protect: false,
  password: "",
  ownerPassword: "",
  allowPrint: true,
  allowCopy: true,
  allowChanges: true,
}

export const removalChoices: readonly {
  key: keyof Removal
  label: string
  hint: string
}[] = [
  {
    key: "details",
    label: "Title, author and other details",
    hint: "Also which app made the file, and when. For privacy; it saves little.",
  },
  {
    key: "attachments",
    label: "Attached files",
    hint: "Files carried inside the PDF. They are gone for good in the result.",
  },
  {
    key: "bookmarks",
    label: "Bookmarks",
    hint: "The outline a reader jumps around with.",
  },
  {
    key: "comments",
    label: "Notes and highlights",
    hint: "Everything added on top of the pages. Links and form fields stay.",
  },
  {
    key: "scripts",
    label: "Scripts",
    hint: "Code that runs when the file is opened or a field is used. Forms that calculate stop calculating.",
  },
  {
    key: "tags",
    label: "Accessibility tags",
    hint: "Screen readers use them to read the document in order. Leave them in unless you are sure.",
  },
  {
    key: "flatten",
    label: "Flatten form fields",
    hint: "What is filled in stays on the page; the fields can no longer be changed.",
  },
]

/** The things to take out, without the rest. */
export function removalOf(extras: Extras): Removal {
  const { details, attachments, bookmarks, comments, scripts, tags, flatten } =
    extras
  return { details, attachments, bookmarks, comments, scripts, tags, flatten }
}

/** True when anything at all is taken out. */
export const removesAnything = (removal: Removal) =>
  Object.values(removal).some(Boolean)

/** Why the extras cannot be used as they stand; null when they can. */
export function extrasProblem(extras: Extras) {
  const { protect, password, ownerPassword } = extras
  // The rules for passwords are the merger's.
  const problem = settingsProblem({
    ...defaultSettings,
    protect,
    password,
    ownerPassword,
  })
  return problem?.replace("the merged PDF", "the result") ?? null
}

/** True when the result would be locked with limits on what a reader may do. */
const limitsReaders = (extras: Extras) =>
  extras.protect &&
  !(extras.allowPrint && extras.allowCopy && extras.allowChanges)

export interface Lock {
  password: string
  ownerPassword: string
  permissions: number
}

/**
 * The lock the result gets; null for none. Without a second password, limits
 * get one from `random` that nobody keeps, so they cannot be lifted; with no
 * limits, the one password opens everything.
 */
export function lockOf(extras: Extras, random: () => string): Lock | null {
  if (!extras.protect) return null
  return {
    password: extras.password,
    ownerPassword:
      extras.ownerPassword ||
      (limitsReaders(extras) ? random() : extras.password),
    permissions: permissionBits(extras),
  }
}

/**
 * Everything in the extras that changes what is written, as one string;
 * empty when nothing is asked for. A result made with other extras is out
 * of date.
 */
export function extrasKey(extras: Extras) {
  const taken = removalChoices
    .filter((choice) => extras[choice.key])
    .map((choice) => choice.key)
  const lock = extras.protect
    ? [
        extras.password,
        extras.ownerPassword,
        extras.allowPrint,
        extras.allowCopy,
        extras.allowChanges,
      ]
    : []
  return taken.length || lock.length ? JSON.stringify([taken, lock]) : ""
}
