/**
 * The Markdown editor's keys, listed once: the editor's key map and its
 * help are both made from this list. "Mod" is Cmd on a Mac and Ctrl
 * elsewhere, as CodeMirror reads it. They follow GitHub's editor where it
 * has a key for the job.
 */

export type MarkdownCommand =
  | "bold"
  | "italic"
  | "code"
  | "strike"
  | "link"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "bullet"
  | "number"
  | "task"
  | "codeBlock"
  | "save"
  | "open"
  | "find"

export interface Shortcut {
  command: MarkdownCommand
  /** As CodeMirror reads it: "Mod-b". */
  key: string
  /** What it does, in words. */
  label: string
}

export const SHORTCUTS: readonly Shortcut[] = [
  { command: "bold", key: "Mod-b", label: "Bold" },
  { command: "italic", key: "Mod-i", label: "Italic" },
  { command: "code", key: "Mod-e", label: "Code in a line" },
  { command: "strike", key: "Mod-Shift-x", label: "Strikethrough" },
  { command: "link", key: "Mod-k", label: "Link" },
  { command: "h1", key: "Mod-Alt-1", label: "Heading 1" },
  { command: "h2", key: "Mod-Alt-2", label: "Heading 2" },
  { command: "h3", key: "Mod-Alt-3", label: "Heading 3" },
  { command: "quote", key: "Mod-Shift-.", label: "Quote" },
  { command: "bullet", key: "Mod-Shift-8", label: "Bulleted list" },
  { command: "number", key: "Mod-Shift-7", label: "Numbered list" },
  { command: "task", key: "Mod-Shift-9", label: "Task list" },
  { command: "codeBlock", key: "Mod-Alt-c", label: "Block of code" },
  { command: "find", key: "Mod-f", label: "Find and replace" },
  { command: "open", key: "Mod-o", label: "Open a file" },
  { command: "save", key: "Mod-s", label: "Save" },
]

/** The key of a command, if it has one. */
export const keyOf = (command: MarkdownCommand) =>
  SHORTCUTS.find((one) => one.command === command)?.key

/** A key as it is shown on this device: "⌘B" on a Mac, "Ctrl+B" elsewhere. */
export function keyLabel(key: string, mac: boolean) {
  const parts = key.split("-")
  const last = parts.pop()!
  const names: Record<string, string> = mac
    ? { Mod: "⌘", Shift: "⇧", Alt: "⌥" }
    : { Mod: "Ctrl", Shift: "Shift", Alt: "Alt" }
  const shown = [...parts.map((part) => names[part]), last.toUpperCase()]
  return mac ? shown.join("") : shown.join("+")
}

/** The same key as `aria-keyshortcuts` writes it: "Control+B" or "Meta+B". */
export function ariaKeys(key: string, mac: boolean) {
  return key
    .split("-")
    .map((part) =>
      part === "Mod"
        ? mac
          ? "Meta"
          : "Control"
        : part.length === 1
          ? part.toUpperCase()
          : part
    )
    .join("+")
}
