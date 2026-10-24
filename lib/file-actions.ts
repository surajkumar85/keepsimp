/**
 * What can be done with a file, for the home page: its kind, judged by its
 * name and type (the tool that opens it reads the bytes and has the last
 * word), and the tool pages that take that kind, best first.
 */

import { tools, type Tool } from "@/lib/catalogue"

export type FileKind =
  | "video"
  | "audio"
  | "image"
  | "animation"
  | "pdf"
  | "markdown"
  | "word"
  | "html"
  | "data"

export interface FileAction {
  tool: Tool
  /** What the job does, in a few words. */
  label: string
  /** Where it opens, a fragment included. */
  href: string
}

const extensions: Record<FileKind, readonly string[]> = {
  video: [
    "mp4",
    "m4v",
    "mov",
    "webm",
    "mkv",
    "avi",
    "ogv",
    "3gp",
    "mts",
    "m2ts",
    "wmv",
    "flv",
    "mpg",
    "mpeg",
  ],
  audio: [
    "mp3",
    "m4a",
    "m4b",
    "aac",
    "opus",
    "ogg",
    "oga",
    "flac",
    "wav",
    "aif",
    "aiff",
    "aifc",
  ],
  animation: ["gif", "apng"],
  image: [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "avif",
    "heic",
    "heif",
    "bmp",
    "tif",
    "tiff",
    "jxl",
    "svg",
  ],
  pdf: ["pdf"],
  markdown: ["md", "markdown", "mdown", "mkd", "mdx", "txt"],
  word: ["docx"],
  html: ["html", "htm"],
  data: ["json", "jsonl", "ndjson", "yaml", "yml", "csv"],
}

/** The words for a kind, as in "a video". */
export const kindName: Record<FileKind, string> = {
  video: "video",
  audio: "sound file",
  image: "picture",
  animation: "animation",
  pdf: "PDF",
  markdown: "text file",
  word: "Word file",
  html: "web page",
  data: "data file",
}

/** The kind of a file by its name, then by its type; null when no tool here takes it. */
export function fileKind(file: {
  name: string
  type: string
}): FileKind | null {
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase()
  if (extension)
    for (const [kind, list] of Object.entries(extensions))
      if (list.includes(extension)) return kind as FileKind
  const type = file.type.toLowerCase()
  if (type === "image/gif" || type === "image/apng") return "animation"
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("video/")) return "video"
  if (type.startsWith("audio/")) return "audio"
  if (type === "application/pdf") return "pdf"
  if (type === "text/markdown") return "markdown"
  if (type === "text/html") return "html"
  if (type === "application/json") return "data"
  return null
}

/** The kind shared by most of the files; the first file's kind breaks a tie. */
export function commonKind(
  files: readonly { name: string; type: string }[]
): FileKind | null {
  const counts = new Map<FileKind, number>()
  for (const file of files) {
    const kind = fileKind(file)
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  let best: FileKind | null = null
  for (const [kind, count] of counts)
    if (best === null || count > counts.get(best)!) best = kind
  return best
}

type Plan = readonly (readonly [tool: string, label: string, hash?: string])[]

const one: Record<FileKind, Plan> = {
  video: [
    ["video-editor", "Edit it"],
    ["video-compressor", "Make it smaller"],
    ["video-trimmer", "Trim or split it"],
    ["video-converter", "Convert it to MP4, WebM, MOV or MKV"],
    ["video-to-gif", "Turn it into a GIF"],
    ["audio-extractor", "Take out its sound"],
  ],
  audio: [
    ["audio-editor", "Edit it"],
    ["audio-trimmer", "Trim it"],
    ["audio-converter", "Convert it to MP3, M4A, FLAC or WAV"],
    ["normalize-audio", "Even out its loudness"],
    ["remove-background-noise", "Clean up a voice"],
    ["transcribe-audio", "Write down what is said"],
  ],
  image: [
    ["image-compressor", "Make it smaller"],
    ["image-resizer", "Resize it"],
    ["image-converter", "Convert it to JPEG, PNG, WebP or AVIF"],
  ],
  animation: [
    ["animation-converter", "Convert it to WebP, APNG or MP4"],
    ["image-compressor", "Make it smaller"],
  ],
  pdf: [
    ["pdf-editor", "Edit it"],
    ["sign-pdf", "Sign it"],
    ["pdf-compressor", "Make it smaller"],
    ["pdf-splitter", "Split it into parts"],
    ["fill-pdf-form", "Fill in its form"],
    ["ocr-pdf", "Make a scan searchable"],
  ],
  markdown: [
    ["markdown-editor", "Edit it"],
    ["markdown-to-pdf", "Make a PDF of it"],
    ["markdown-to-word", "Make a Word file of it"],
    ["markdown-to-html", "Make a web page of it"],
  ],
  word: [["word-to-markdown", "Turn it into Markdown"]],
  html: [["html-to-markdown", "Turn it into Markdown"]],
  data: [
    ["json-formatter", "Format and check it"],
    ["json-formatter", "Convert it to YAML, CSV or TypeScript", "convert"],
    ["json-formatter", "Search it with JSONPath", "query"],
  ],
}

/** Jobs that need several files, put first when several are chosen. */
const several: Partial<Record<FileKind, Plan>> = {
  video: [["merge-videos", "Join them into one video"]],
  audio: [["join-audio", "Join them into one file"]],
  pdf: [["pdf-merger", "Merge them into one PDF"]],
  image: [["image-converter", "Convert them all at once"]],
}

const byId = new Map(tools.map((tool) => [tool.id, tool]))

/** The jobs for files of a kind, best first: the jobs that join files lead when there are several. */
export function actionsFor(kind: FileKind, count = 1): FileAction[] {
  const first = count > 1 ? (several[kind] ?? []) : []
  // A job for several files takes the place of the same page's job for one.
  const plan = [
    ...first,
    ...one[kind].filter(
      ([id, , hash]) =>
        !first.some(
          ([other, , otherHash]) => other === id && otherHash === hash
        )
    ),
  ]
  return plan.map(([id, label, hash]) => {
    // The test holds every page named here to the catalogue's usable tools.
    const tool = byId.get(id)!
    return {
      tool,
      label,
      href: `/dashboard/${id}/${hash ? `#${hash}` : ""}`,
    }
  })
}

/** Every kind a tool here takes. */
export const fileKinds = Object.keys(one) as FileKind[]
