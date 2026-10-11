"use client"

import { useSyncExternalStore } from "react"
import {
  desktopLimits,
  limitsFor,
  type Limits,
} from "@/lib/pdf-merger/settings"

let found: Limits | null = null

/** Read once: a device does not change its memory or how it is pointed at. */
const read = () =>
  (found ??= limitsFor({
    memory: (navigator as { deviceMemory?: number }).deviceMemory,
    touch: matchMedia("(pointer: coarse)").matches,
  }))
const never = () => () => {}

/**
 * How much this device can take. Phones get smaller limits; which device
 * this is, is only known once the page runs, so the first paint assumes a
 * computer.
 */
export const useDeviceLimits = () =>
  useSyncExternalStore(never, read, () => desktopLimits)
