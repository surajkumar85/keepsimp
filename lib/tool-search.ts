import { filterTools, tools, type Tool } from "./catalogue"

/**
 * The tools a search in the top bar offers: those that match, working tools
 * first, in the order of the catalogue. With nothing typed, every tool.
 */
export function searchTools(
  query: string,
  catalogue: readonly Tool[] = tools
): Tool[] {
  const found = filterTools(query, "all", catalogue)
  return [
    ...found.filter((tool) => tool.status === "available"),
    ...found.filter((tool) => tool.status !== "available"),
  ]
}

/** Tools that can be opened; the others are listed but cannot be chosen. */
const opens = (tool: Tool) => tool.status === "available"

/** The first result that can be opened, by its place in the list; -1 when none can. */
export const firstChoice = (results: readonly Tool[]) =>
  results.findIndex(opens)

/**
 * The result an arrow key moves to: the next one, in either direction, that
 * can be opened, going round at the ends. Stays put when there is nowhere to go.
 */
export function moveChoice(
  results: readonly Tool[],
  current: number,
  direction: 1 | -1
) {
  const count = results.length
  // With nothing chosen, going up starts from the far end.
  const from = current < 0 && direction === -1 ? count : current
  for (let step = 1; step <= count; step++) {
    const at = (((from + direction * step) % count) + count) % count
    if (opens(results[at])) return at
  }
  return firstChoice(results)
}

/** The first or the last result that can be opened, for Home and End. */
export const edgeChoice = (results: readonly Tool[], edge: "first" | "last") =>
  edge === "first"
    ? firstChoice(results)
    : results.reduce((last, tool, at) => (opens(tool) ? at : last), -1)

/** What a key press must carry to open the search. */
export interface KeyPress {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/**
 * True for the shortcut that opens the search: ⌘K on a Mac, Ctrl+K anywhere
 * else. On a Mac, Ctrl+K is left alone: text editors use it to delete to the
 * end of a line.
 */
export const isSearchShortcut = (press: KeyPress, mac: boolean) =>
  press.key.toLowerCase() === "k" &&
  !press.altKey &&
  !press.shiftKey &&
  (mac ? press.metaKey && !press.ctrlKey : press.ctrlKey && !press.metaKey)

/** The shortcut as it is written on the search button. */
export const shortcutLabel = (mac: boolean) => (mac ? "⌘K" : "Ctrl K")

/** Whether a device's own description says it is an Apple one, where ⌘ is the key for shortcuts. */
export const isApple = (platform: string) =>
  /mac|iphone|ipad|ipod/i.test(platform)
