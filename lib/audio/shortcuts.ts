/**
 * The audio editor's keys, as one list: the editor answers to them through
 * `keyAction`, and the help is made from `shortcutGroups`, so the two
 * cannot disagree.
 */

export type KeyAction =
  | "play"
  | "play-selection"
  | "back"
  | "forward"
  | "back-more"
  | "forward-more"
  | "skip-back"
  | "skip-forward"
  | "start"
  | "end"
  | "mark-in"
  | "mark-out"
  | "select-all"
  | "clear"
  | "cut"
  | "undo"
  | "redo"
  | "zoom-in"
  | "zoom-out"
  | "zoom-fit"
  | "mark"

interface Binding {
  /** `KeyboardEvent.key`, lower case for letters. */
  key: string
  shift?: boolean
  command?: boolean
  action: KeyAction
}

const BINDINGS: Binding[] = [
  { key: " ", action: "play" },
  { key: "k", action: "play" },
  { key: "p", action: "play-selection" },
  { key: "ArrowLeft", action: "back" },
  { key: "ArrowRight", action: "forward" },
  { key: "ArrowLeft", shift: true, action: "back-more" },
  { key: "ArrowRight", shift: true, action: "forward-more" },
  { key: "j", action: "skip-back" },
  { key: "l", action: "skip-forward" },
  { key: "Home", action: "start" },
  { key: "End", action: "end" },
  { key: "i", action: "mark-in" },
  { key: "o", action: "mark-out" },
  { key: "a", command: true, action: "select-all" },
  { key: "Escape", action: "clear" },
  { key: "Delete", action: "cut" },
  { key: "Backspace", action: "cut" },
  { key: "z", command: true, action: "undo" },
  { key: "z", command: true, shift: true, action: "redo" },
  { key: "y", command: true, action: "redo" },
  { key: "+", action: "zoom-in" },
  { key: "=", action: "zoom-in" },
  { key: "-", action: "zoom-out" },
  { key: "0", action: "zoom-fit" },
  { key: "m", action: "mark" },
]

/** How far the keys move the playhead, in seconds. */
export const NUDGE = 0.1
export const NUDGE_MORE = 1
export const SKIP = 5

/** What a key pressed in the editor does; null when it does nothing there. */
export function keyAction(event: {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}): KeyAction | null {
  if (event.altKey) return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const command = event.ctrlKey || event.metaKey
  // "+" is typed with Shift on most keyboards: Shift is not asked of it.
  const shiftMatters = key !== "+"
  const found = BINDINGS.find(
    (binding) =>
      binding.key === key &&
      Boolean(binding.command) === command &&
      (!shiftMatters || Boolean(binding.shift) === event.shiftKey)
  )
  return found?.action ?? null
}

const SAID: Record<KeyAction, string> = {
  play: "Play or pause",
  "play-selection": "Play the selection",
  back: `Move the playhead back ${NUDGE} s`,
  forward: `Move the playhead on ${NUDGE} s`,
  "back-more": `Move the playhead back ${NUDGE_MORE} s`,
  "forward-more": `Move the playhead on ${NUDGE_MORE} s`,
  "skip-back": `Back ${SKIP} s`,
  "skip-forward": `On ${SKIP} s`,
  start: "Go to the start",
  end: "Go to the end",
  "mark-in": "Start the selection at the playhead",
  "mark-out": "End the selection at the playhead",
  "select-all": "Select all of it",
  clear: "Clear the selection",
  cut: "Cut the selection out",
  undo: "Undo",
  redo: "Redo",
  "zoom-in": "Zoom in",
  "zoom-out": "Zoom out",
  "zoom-fit": "Show all of it",
  mark: "Add a marker at the playhead",
}

const NAMES: Record<string, string> = {
  " ": "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
}

/** The command key, as both kinds of keyboard name it. */
export const COMMAND = "Ctrl or ⌘"

/** Each binding as the keys written on a keyboard. */
function keysOf(binding: Binding) {
  const keys: string[] = []
  if (binding.command) keys.push(COMMAND)
  if (binding.shift) keys.push("Shift")
  keys.push(NAMES[binding.key] ?? binding.key.toUpperCase())
  return keys
}

const GROUPS: { title: string; actions: KeyAction[] }[] = [
  {
    title: "Listening",
    actions: [
      "play",
      "play-selection",
      "back",
      "forward",
      "back-more",
      "forward-more",
      "skip-back",
      "skip-forward",
      "start",
      "end",
    ],
  },
  {
    title: "Choosing a part",
    actions: ["mark-in", "mark-out", "select-all", "clear", "mark"],
  },
  { title: "Editing", actions: ["cut", "undo", "redo"] },
  { title: "Zoom", actions: ["zoom-in", "zoom-out", "zoom-fit"] },
]

/** The keys in groups, for the help: every way of pressing each action. */
export function shortcutGroups() {
  return GROUPS.map((group) => ({
    title: group.title,
    shortcuts: group.actions.map((action) => ({
      ways: BINDINGS.filter((binding) => binding.action === action).map(keysOf),
      does: SAID[action],
    })),
  }))
}
