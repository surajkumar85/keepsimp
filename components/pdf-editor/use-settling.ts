"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

/**
 * Changes that are on the screen and wait for a pause before they go to
 * the file: a slider being dragged, a number being typed, a thing moved
 * with the arrow keys. The editor's status says "Applying…" while any
 * waits, so a press never seems to have done nothing.
 */
const waiting = new Set<symbol>()
const listeners = new Set<() => void>()

function hold(key: symbol, on: boolean) {
  if (on === waiting.has(key)) return
  if (on) waiting.add(key)
  else waiting.delete(key)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Say that a change of this control waits to go to the file, or no longer
 * does. What waits when the control goes away waits no more.
 */
export function useHolding() {
  const [key] = useState(() => Symbol("waiting"))
  useEffect(() => () => hold(key, false), [key])
  return useCallback((on: boolean) => hold(key, on), [key])
}

/** Whether any change waits to go to the file. */
export function useSettling() {
  return useSyncExternalStore(
    subscribe,
    () => waiting.size > 0,
    () => false
  )
}
