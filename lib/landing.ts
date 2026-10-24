/**
 * The home page's groups of tools. Every page in the catalogue belongs to
 * exactly one group (the test holds this), so a new tool or door shows up
 * on the home page as soon as it is given a group.
 */

import { tools, type Tool } from "@/lib/catalogue"

export interface Family {
  id: string
  title: string
  category: Tool["category"]
  /** What can be done there, in a sentence. */
  blurb: string
  /** The tool the group's title opens. */
  lead: string
  /** The group's other pages, in the order they are shown. */
  members: readonly string[]
}

export const families: readonly Family[] = [
  {
    id: "pdf",
    title: "PDF editor",
    category: "document",
    blurb:
      "Change the words already on a page, sign, fill in and make forms, take out private details for good, make scans searchable, then merge, split or compress.",
    lead: "pdf-editor",
    members: [
      "sign-pdf",
      "fill-pdf-form",
      "redact-pdf",
      "ocr-pdf",
      "pdf-merger",
      "pdf-splitter",
      "pdf-compressor",
      "pdf-annotator",
      "create-pdf-form",
      "verify-pdf-signature",
      "crop-pdf",
      "add-page-numbers",
      "watermark-pdf",
    ],
  },
  {
    id: "images",
    title: "Images",
    category: "image",
    blurb:
      "Make pictures lighter, resize and convert them many at a time, and turn animations into GIF, WebP, APNG or video.",
    lead: "image-compressor",
    members: ["image-resizer", "image-converter", "animation-converter"],
  },
  {
    id: "video",
    title: "Video editor",
    category: "video",
    blurb:
      "Convert, compress, trim and crop. Change the speed, add music, words or subtitles, join clips or make a GIF.",
    lead: "video-editor",
    members: [
      "video-compressor",
      "video-trimmer",
      "video-converter",
      "crop-video",
      "add-subtitles-to-video",
      "video-to-gif",
      "merge-videos",
      "change-video-speed",
      "add-music-to-video",
      "add-text-to-video",
      "mute-video",
    ],
  },
  {
    id: "audio",
    title: "Audio editor",
    category: "audio",
    blurb:
      "Cut, convert and join. Set the loudness, clean up a voice, write down speech, make a ringtone, or record your voice.",
    lead: "audio-editor",
    members: [
      "audio-converter",
      "audio-trimmer",
      "transcribe-audio",
      "remove-background-noise",
      "normalize-audio",
      "voice-recorder",
      "audio-extractor",
      "join-audio",
      "split-audio",
      "ringtone-maker",
      "volume-booster",
      "change-audio-speed",
      "edit-audio-tags",
      "audio-to-video",
    ],
  },
  {
    id: "markdown",
    title: "Markdown editor",
    category: "document",
    blurb:
      "Write with a live preview, maths and diagrams. Make a PDF, a Word file or a web page, or bring Word and HTML in.",
    lead: "markdown-editor",
    members: [
      "markdown-to-pdf",
      "markdown-to-word",
      "markdown-to-html",
      "word-to-markdown",
      "html-to-markdown",
      "markdown-table-generator",
    ],
  },
  {
    id: "developer",
    title: "JSON and colour",
    category: "developer",
    blurb:
      "Format, query, compare and convert JSON with every digit kept. Convert colours and check their contrast.",
    lead: "json-formatter",
    members: ["color-utility"],
  },
]

const byId = new Map(tools.map((tool) => [tool.id, tool]))

/** A tool by its id; a group that names a missing tool fails the build. */
export function toolById(id: string): Tool {
  const tool = byId.get(id)
  if (!tool) throw new Error(`There is no tool called ${id}.`)
  return tool
}

/** The group's pages, its lead first. */
export function pagesOf(family: Family): Tool[] {
  return [family.lead, ...family.members].map(toolById)
}
