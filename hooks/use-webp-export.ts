"use client"

import { useSyncExternalStore } from "react"

let capability: boolean | undefined
const subscribe = () => () => {}
const serverSnapshot = () => false
function browserSnapshot() {
  if (capability === undefined) {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    capability = canvas.toDataURL("image/webp").startsWith("data:image/webp")
    canvas.width = canvas.height = 0
  }
  return capability
}

// A stable browser capability with an explicit hydration-safe server snapshot.
export function useWebpExport() {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot)
}
