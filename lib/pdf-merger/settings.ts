import { safeSegment } from "@/lib/image-resizer/naming"
import type { BookmarkPolicy } from "./outline"

const MB = 1024 * 1024

export interface Limits {
  files: number
  /** Largest single file, in bytes. */
  fileBytes: number
  /** Largest sum of all files, in bytes. */
  totalBytes: number
  /** Most pages in one result. */
  pages: number
}

/**
 * Limits, set from the measurements in docs/pdf-merger.md. The engine has
 * 2 GB of memory at most, and a merge needs about twice the size of the files.
 */
export const desktopLimits: Limits = {
  files: 100,
  fileBytes: 300 * MB,
  totalBytes: 500 * MB,
  pages: 5000,
}

/** Phones and small tablets close a page that takes much less memory. */
export const phoneLimits: Limits = {
  files: 100,
  fileBytes: 100 * MB,
  totalBytes: 200 * MB,
  pages: 5000,
}

/**
 * The limits for a device.
 * @param device `memory` in gigabytes where the browser tells (Chromium only); `touch` when a finger is the main pointer.
 */
export function limitsFor(device: { memory?: number; touch: boolean }) {
  return device.touch || (device.memory !== undefined && device.memory < 4)
    ? phoneLimits
    : desktopLimits
}

export const DEFAULT_NAME = "merged"

export interface MergeSettings {
  /** The result's file name, without ".pdf". */
  name: string
  bookmarks: BookmarkPolicy
}

export const defaultSettings: MergeSettings = {
  name: DEFAULT_NAME,
  bookmarks: "nested",
}

/** A safe file name for the result, always ending in ".pdf". */
export function outputName(name: string) {
  const stem = safeSegment(name.trim().replace(/\.pdf$/i, "")).slice(0, 120)
  return `${stem || DEFAULT_NAME}.pdf`
}

/** What a file is called in bookmarks: its name without ".pdf". */
export function entryName(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").trim() || fileName
}

/**
 * True when a file's first bytes say it is a PDF. The marker may sit a little
 * way in: some files start with a byte-order mark or a line of junk.
 */
export function looksLikePdf(head: Uint8Array) {
  const marker = [0x25, 0x50, 0x44, 0x46, 0x2d]
  const last = Math.min(head.length - marker.length, 1024)
  for (let start = 0; start <= last; start++)
    if (marker.every((byte, offset) => head[start + offset] === byte))
      return true
  return false
}

export const megabytes = (bytes: number) =>
  `${Math.round(bytes / MB).toLocaleString("en")} MB`

/**
 * Which of the files being added can be taken, given what is already there.
 * @returns For each new file, null when it is taken or the reason it is not.
 */
export function admit(
  current: readonly { size: number }[],
  incoming: readonly { size: number }[],
  limits: Limits = desktopLimits
): (string | null)[] {
  let count = current.length
  let total = current.reduce((sum, file) => sum + file.size, 0)
  return incoming.map((file) => {
    if (count >= limits.files)
      return `Up to ${limits.files} files can be merged at once.`
    if (file.size > limits.fileBytes)
      return `This file is larger than ${megabytes(limits.fileBytes)}.`
    if (file.size === 0) return "This file is empty."
    if (total + file.size > limits.totalBytes)
      return `Together the files would be larger than ${megabytes(limits.totalBytes)}.`
    count++
    total += file.size
    return null
  })
}

/** How the result's size compares with the files that went in, in words. */
export function describeSize(input: number, output: number) {
  const change = Math.round(((output - input) / input) * 100)
  if (change <= -1) return `${-change}% smaller than the files together`
  if (change >= 1) return `${change}% larger than the files together`
  return "the same size as the files together"
}
