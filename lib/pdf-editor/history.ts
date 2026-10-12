/**
 * What the undo list says. The list itself is kept with the file in the
 * worker, a step for every change that was made; this is how it is put
 * into words and how the page knows whether there is unsaved work.
 */

/** Where the file stands in its list of changes. */
export interface History {
  /** What each change was called, oldest first. */
  steps: string[]
  /** How many of them are in force. The rest have been undone and can be done again. */
  position: number
  /** The position the last download was made at; null when nothing was downloaded yet. */
  saved: number | null
}

export const emptyHistory: History = { steps: [], position: 0, saved: null }

export const canUndo = (history: History) => history.position > 0
export const canRedo = (history: History) =>
  history.position < history.steps.length

/** What the undo button would take back, for its label. */
export const undoLabel = (history: History) =>
  canUndo(history) ? `Undo: ${history.steps[history.position - 1]}` : "Undo"

export const redoLabel = (history: History) =>
  canRedo(history) ? `Redo: ${history.steps[history.position]}` : "Redo"

/** True when the file differs from what was opened or last downloaded. */
export const unsaved = (history: History) =>
  history.position !== (history.saved ?? 0)

/** The history once the file has been downloaded as it stands. */
export const markSaved = (history: History): History => ({
  ...history,
  saved: history.position,
})

/** How many changes are in force, in words. */
export function changeCount(history: History) {
  const count = history.position
  return count === 0
    ? "No changes yet"
    : `${count.toLocaleString("en")} change${count === 1 ? "" : "s"}`
}
