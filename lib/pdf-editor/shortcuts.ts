/**
 * The PDF editor's keys, as one list: the sheet that `?` opens and the
 * written help are made from it, and a test holds it to the keys the
 * editor's code answers to.
 */

/** One shortcut: the keys pressed together, and what they do. */
export interface Shortcut {
  /** Each key as it is written on a keyboard; "Ctrl or ⌘" for the command key. */
  keys: string[]
  does: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

/** The command key, as both kinds of keyboard name it. */
export const COMMAND = "Ctrl or ⌘"

/**
 * The keys of the tools that are taken in hand, and of the panels and
 * modes, by the letter pressed on its own. Kept apart so that a test can
 * hold them to the editor's code.
 */
export const TOOL_KEYS: Record<string, string> = {
  V: "Select",
  T: "Text box",
  B: "Box",
  O: "Ellipse",
  L: "Line",
  A: "Arrow",
  D: "Draw",
  C: "Cover (hides, does not remove)",
  X: "Tick or cross",
  K: "Stamp",
  Q: "Call-out",
  R: "Measure",
}

export const MARK_KEYS: Record<string, string> = {
  H: "Highlight words",
  U: "Underline words",
  S: "Strike out words",
  W: "Squiggle under words",
  P: "Highlighter pen",
  N: "Note",
}

export const PANEL_KEYS: Record<string, string> = {
  E: "Change the words that are there",
  I: "Change the pictures that are there",
  J: "Links",
  F: "Find and replace",
  M: "Pages: move, turn, copy, add, take out",
  Z: "Numbers, headers and watermarks",
  Y: "Crop and page size",
  G: "Sign",
}

const letters = (keys: Record<string, string>): Shortcut[] =>
  Object.entries(keys).map(([key, does]) => ({ keys: [key], does }))

export const SHORTCUTS: ShortcutGroup[] = [
  { title: "Tools", shortcuts: letters(TOOL_KEYS) },
  { title: "Mark up and comment", shortcuts: letters(MARK_KEYS) },
  { title: "Panels and modes", shortcuts: letters(PANEL_KEYS) },
  {
    title: "Changes",
    shortcuts: [
      { keys: [COMMAND, "Z"], does: "Undo" },
      { keys: [COMMAND, "Shift", "Z"], does: "Redo" },
      { keys: [COMMAND, "Y"], does: "Redo" },
      { keys: [COMMAND, "C"], does: "Copy what is selected" },
      { keys: [COMMAND, "X"], does: "Cut what is selected" },
      { keys: [COMMAND, "V"], does: "Paste" },
      { keys: [COMMAND, "D"], does: "Duplicate what is selected" },
      { keys: [COMMAND, "A"], does: "Select everything added to the page" },
    ],
  },
  {
    title: "What is selected",
    shortcuts: [
      { keys: ["Arrows"], does: "Move by one point" },
      { keys: ["Shift", "Arrows"], does: "Move by ten points" },
      { keys: ["Delete"], does: "Delete" },
      { keys: ["]"], does: "Bring forward" },
      { keys: ["["], does: "Send backward" },
      { keys: ["Enter"], does: "Type in a text box, or open a comment" },
      { keys: ["Tab"], does: "Select the next thing on the page" },
      { keys: ["Shift", "Tab"], does: "Select the one before" },
      { keys: ["Escape"], does: "Put the tool down, or select nothing" },
    ],
  },
  {
    title: "Form fields",
    shortcuts: [
      { keys: ["Arrows"], does: "Move the field by one point" },
      { keys: ["Shift", "Arrows"], does: "Move it by ten points" },
      { keys: ["Alt", "Arrows"], does: "Make it larger or smaller" },
      { keys: ["Shift", "Enter"], does: "Pick one more field" },
    ],
  },
  {
    title: "Reading",
    shortcuts: [
      { keys: [COMMAND, "F"], does: "Search the file" },
      { keys: ["+"], does: "Zoom in" },
      { keys: ["−"], does: "Zoom out" },
      { keys: ["← →"], does: "Turn the page, when it fits the width" },
      { keys: ["?"], does: "Show these keys" },
    ],
  },
]

/** The keys as a sentence, for the written help: "Tools: V select, T text box, …". */
export function shortcutsSaid(groups: readonly ShortcutGroup[] = SHORTCUTS) {
  return groups
    .map(
      (group) =>
        `${group.title}: ${group.shortcuts
          .map(
            (one) =>
              `${one.keys.join(" ")} ${one.does[0].toLowerCase()}${one.does.slice(1)}`
          )
          .join(", ")}.`
    )
    .join(" ")
}
