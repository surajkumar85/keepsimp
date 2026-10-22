/**
 * Kinds of video file, told apart by their first bytes rather than their
 * names, and the kinds the workspace writes.
 */

/** What a file is, from its bytes. */
export type Container =
  "mp4" | "mov" | "webm" | "mkv" | "ts" | "ogg" | "avi" | "flv" | "wmv" | "mpeg"

/** The kinds the workspace writes. */
export type OutContainer = "mp4" | "webm" | "mov" | "mkv"

/** Kinds this browser engine can open (Mediabunny's readers). */
export const READABLE: readonly Container[] = [
  "mp4",
  "mov",
  "webm",
  "mkv",
  "ts",
  "ogg",
]

export const containerLabels: Record<Container, string> = {
  mp4: "MP4",
  mov: "MOV",
  webm: "WebM",
  mkv: "MKV",
  ts: "MPEG-TS",
  ogg: "Ogg",
  avi: "AVI",
  flv: "FLV",
  wmv: "WMV",
  mpeg: "MPEG",
}

export const outputInfo: Record<
  OutContainer,
  { label: string; extension: string; mime: string }
> = {
  mp4: { label: "MP4", extension: "mp4", mime: "video/mp4" },
  webm: { label: "WebM", extension: "webm", mime: "video/webm" },
  mov: { label: "MOV", extension: "mov", mime: "video/quicktime" },
  mkv: { label: "MKV", extension: "mkv", mime: "video/x-matroska" },
}

/** For the file picker; the bytes decide in the end. */
export const ACCEPT =
  "video/*,.mp4,.m4v,.mov,.webm,.mkv,.ts,.mts,.m2ts,.ogv,.3gp,.avi,.flv,.wmv,.mpg,.mpeg"

/** How many bytes `sniffContainer` needs to see. */
export const SNIFF_BYTES = 4096

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length))

const QUICKTIME_ATOMS = ["moov", "mdat", "wide", "free", "skip", "pnot"]

/** The kind of a file from its first bytes, or null when it is not a video file read here or named here. */
export function sniffContainer(bytes: Uint8Array): Container | null {
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp")
    return ascii(bytes, 8, 4) === "qt  " ? "mov" : "mp4"
  if (bytes.length >= 8 && QUICKTIME_ATOMS.includes(ascii(bytes, 4, 4)))
    return "mov"
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    // The DocType is near the start of the EBML header.
    const head = ascii(bytes, 0, Math.min(bytes.length, 64))
    return head.includes("webm") ? "webm" : "mkv"
  }
  if (
    bytes.length >= 377 &&
    bytes[0] === 0x47 &&
    bytes[188] === 0x47 &&
    bytes[376] === 0x47
  )
    return "ts"
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "OggS") return "ogg"
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "AVI "
  )
    return "avi"
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === "FLV") return "flv"
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x30 &&
    bytes[1] === 0x26 &&
    bytes[2] === 0xb2 &&
    bytes[3] === 0x75
  )
    return "wmv"
  if (
    bytes.length >= 4 &&
    bytes[0] === 0 &&
    bytes[1] === 0 &&
    bytes[2] === 1 &&
    (bytes[3] === 0xba || bytes[3] === 0xb3)
  )
    return "mpeg"
  return null
}

/** Why a file cannot be opened, or null when it can be tried. */
export function containerProblem(container: Container | null): string | null {
  if (container === null)
    return "This is not a video file read here. Choose an MP4, MOV, WebM, MKV or MPEG-TS file."
  if (READABLE.includes(container)) return null
  return `${containerLabels[container]} files are not read here. Open it in a desktop player or converter that saves MP4, then convert that.`
}

/** The kind a "same as the file" result is written in. */
export function sameContainer(container: Container): OutContainer {
  return container === "webm" || container === "mov" || container === "mkv"
    ? container
    : // MPEG-TS and Ogg are read but not written: MP4 holds what they hold.
      "mp4"
}
