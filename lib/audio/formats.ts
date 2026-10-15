/**
 * The kinds of file the audio workspace reads and writes: containers told
 * apart by their first bytes, and the formats a result can be written in.
 */

/** What holds the sound, as told by a file's first bytes. */
export type Container =
  "mp3" | "adts" | "mp4" | "webm" | "ogg" | "flac" | "wav" | "aiff" | "mpegts"

/** The formats a result can be written in; "same" keeps the file's own sound where it can. */
export type OutputFormat =
  "same" | "mp3" | "m4a" | "opus" | "flac" | "wav" | "m4r"
export type WrittenFormat = Exclude<OutputFormat, "same"> | "ogg"

/** How each written format is stored. */
export const writtenFormats: Record<
  WrittenFormat,
  {
    label: string
    extension: string
    mime: string
    container: "mp3" | "mp4" | "ogg" | "flac" | "wav"
    lossless: boolean
  }
> = {
  mp3: {
    label: "MP3",
    extension: "mp3",
    mime: "audio/mpeg",
    container: "mp3",
    lossless: false,
  },
  m4a: {
    label: "M4A (AAC)",
    extension: "m4a",
    mime: "audio/mp4",
    container: "mp4",
    lossless: false,
  },
  opus: {
    label: "Opus",
    extension: "opus",
    mime: "audio/ogg",
    container: "ogg",
    lossless: false,
  },
  ogg: {
    label: "Ogg Vorbis",
    extension: "ogg",
    mime: "audio/ogg",
    container: "ogg",
    lossless: false,
  },
  flac: {
    label: "FLAC",
    extension: "flac",
    mime: "audio/flac",
    container: "flac",
    lossless: true,
  },
  wav: {
    label: "WAV",
    extension: "wav",
    mime: "audio/wav",
    container: "wav",
    lossless: true,
  },
  m4r: {
    label: "M4R (iPhone ringtone)",
    extension: "m4r",
    mime: "audio/mp4",
    container: "mp4",
    lossless: false,
  },
}

/** The choices of format offered, in order. */
export const outputChoices: readonly OutputFormat[] = [
  "same",
  "mp3",
  "m4a",
  "opus",
  "flac",
  "wav",
  "m4r",
]

/** File types the picker offers: sound, and the videos sound can be taken out of. */
export const ACCEPT =
  "audio/*,video/mp4,video/webm,video/quicktime,video/x-matroska,.mp3,.m4a,.m4b,.aac,.opus,.ogg,.oga,.flac,.wav,.aif,.aiff,.aifc,.mp4,.m4v,.mov,.webm,.mkv,.ts"

const text = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length))

/** What a file is, from its first bytes; null when it is none of the kinds read here. */
export function sniffContainer(bytes: Uint8Array): Container | null {
  if (bytes.length < 4) return null
  const head = text(bytes, 0, 4)
  if (head === "fLaC") return "flac"
  if (head === "OggS") return "ogg"
  if (
    (head === "RIFF" || head === "RF64" || head === "BW64") &&
    text(bytes, 8, 4) === "WAVE"
  )
    return "wav"
  if (head === "FORM" && /^AIF[FC]$/.test(text(bytes, 8, 4))) return "aiff"
  if (text(bytes, 4, 4) === "ftyp") return "mp4"
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "webm"
  if (bytes[0] === 0x47 && bytes[188] === 0x47) return "mpegts"
  if (text(bytes, 0, 3) === "ID3") return "mp3"
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    // The layer bits are 00 in an ADTS (AAC) header and never in MPEG audio.
    return (bytes[1] & 0x06) === 0 ? "adts" : "mp3"
  return null
}

export const containerLabels: Record<Container, string> = {
  mp3: "MP3",
  adts: "AAC",
  mp4: "MP4",
  webm: "WebM",
  ogg: "Ogg",
  flac: "FLAC",
  wav: "WAV",
  aiff: "AIFF",
  mpegts: "MPEG-TS",
}
