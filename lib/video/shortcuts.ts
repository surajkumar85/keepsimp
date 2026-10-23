/**
 * The video trimmer's keys, as one list: the trimmer answers to them
 * through `keyAction`, and the help is made from `shortcutGroups`, so the
 * two cannot disagree.
 */

export type KeyAction =
  | "play"
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
  | "clear"
  | "keep"
  | "cut"
  | "undo"
  | "redo"
  | "frame"

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
  { key: "Escape", action: "clear" },
  { key: "Enter", action: "keep" },
  { key: "Delete", action: "cut" },
  { key: "Backspace", action: "cut" },
  { key: "z", command: true, action: "undo" },
  { key: "z", command: true, shift: true, action: "redo" },
  { key: "y", command: true, action: "redo" },
  { key: "s", shift: true, action: "frame" },
]

/** How far the keys move the playhead: a frame, a second, five seconds. */
export const NUDGE_MORE = 1
export const SKIP = 5

/** What a key pressed in the trimmer does; null when it does nothing there. */
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
  const found = BINDINGS.find(
    (binding) =>
      binding.key === key &&
      Boolean(binding.command) === command &&
      Boolean(binding.shift) === event.shiftKey
  )
  return found?.action ?? null
}

const SAID: Record<KeyAction, string> = {
  play: "Play or pause",
  back: "Back one frame",
  forward: "On one frame",
  "back-more": `Back ${NUDGE_MORE} s`,
  "forward-more": `On ${NUDGE_MORE} s`,
  "skip-back": `Back ${SKIP} s`,
  "skip-forward": `On ${SKIP} s`,
  start: "Go to the start",
  end: "Go to the end",
  "mark-in": "Start the selection at the playhead",
  "mark-out": "End the selection at the playhead",
  clear: "Clear the selection",
  keep: "Keep only the selection",
  cut: "Cut the selection out",
  undo: "Undo",
  redo: "Redo",
  frame: "Save the frame at the playhead as a picture",
}

const NAMES: Record<string, string> = {
  " ": "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
}

/** The command key, as both kinds of keyboard name it. */
export const COMMAND = "Ctrl or ⌘"

function keysOf(binding: Binding) {
  const keys: string[] = []
  if (binding.command) keys.push(COMMAND)
  if (binding.shift) keys.push("Shift")
  keys.push(NAMES[binding.key] ?? binding.key.toUpperCase())
  return keys
}

const GROUPS: { title: string; actions: KeyAction[] }[] = [
  {
    title: "Watching",
    actions: [
      "play",
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
  { title: "Choosing a part", actions: ["mark-in", "mark-out", "clear"] },
  { title: "Editing", actions: ["keep", "cut", "undo", "redo", "frame"] },
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

/** Every action has a key, and is in the help once. */
export const allActions = () => Object.keys(SAID) as KeyAction[]
