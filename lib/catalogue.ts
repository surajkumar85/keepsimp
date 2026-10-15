export const categories = [
  { id: "all", label: "All tools" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "image", label: "Images" },
  { id: "document", label: "Documents" },
  { id: "developer", label: "Developer" },
] as const

export type Category = (typeof categories)[number]["id"]
export type Tool = {
  id: string
  name: string
  description: string
  category: Exclude<Category, "all">
  keywords: readonly string[]
  status: "planned" | "available"
  /**
   * The tool this is a door into, by its id. A door is a page of its own
   * that opens another tool ready for one job: it has an address, a title
   * and an article, and can be found by searching, but it is not listed as
   * a tool beside the one it opens.
   */
  partOf?: string
}

export const tools: readonly Tool[] = [
  {
    id: "video-converter",
    name: "Video converter",
    description: "Find the right format for your next video.",
    category: "video",
    keywords: ["mp4", "webm", "mov", "convert"],
    status: "planned",
  },
  {
    id: "video-compressor",
    name: "Video compressor",
    description: "Smaller files. More room for your ideas.",
    category: "video",
    keywords: ["compress", "size", "reduce"],
    status: "planned",
  },
  {
    id: "video-trimmer",
    name: "Video trimmer",
    description: "Keep the moments that matter.",
    category: "video",
    keywords: ["cut", "clip", "trim"],
    status: "planned",
  },
  {
    id: "audio-editor",
    name: "Audio editor",
    description:
      "Convert sound between formats and take it out of videos, many files at once, on your device.",
    category: "audio",
    keywords: [
      "audio",
      "sound",
      "music",
      "convert",
      "mp3",
      "m4a",
      "aac",
      "opus",
      "flac",
      "wav",
      "aiff",
      "ringtone",
      "extract",
    ],
    status: "available",
  },
  {
    id: "audio-converter",
    name: "Audio converter",
    description:
      "Change audio between MP3, M4A, Opus, FLAC and WAV, many files at once, on your device.",
    partOf: "audio-editor",
    category: "audio",
    keywords: [
      "audio converter",
      "convert",
      "mp3",
      "wav to mp3",
      "flac to mp3",
      "m4a to mp3",
      "mp3 to wav",
      "aiff",
      "opus",
      "m4r",
      "bitrate",
    ],
    status: "available",
  },
  {
    id: "audio-extractor",
    name: "Audio extractor",
    description:
      "Take the sound out of a video, as it is or as MP3, on your device.",
    partOf: "audio-editor",
    category: "audio",
    keywords: [
      "video",
      "extract",
      "extract audio",
      "mp4 to mp3",
      "video to audio",
      "sound",
      "soundtrack",
      "mov",
      "webm",
      "mkv",
    ],
    status: "available",
  },
  {
    id: "audio-trimmer",
    name: "Audio trimmer",
    description: "Get straight to the good part.",
    category: "audio",
    keywords: ["cut", "trim", "sound"],
    status: "planned",
  },
  {
    id: "image-compressor",
    name: "Image compressor",
    description: "Less weight, with the details you love.",
    category: "image",
    keywords: ["compress", "photo", "jpeg", "png", "avif", "heic"],
    status: "available",
  },
  {
    id: "image-resizer",
    name: "Image resizer",
    description: "Make your images fit wherever they go.",
    category: "image",
    keywords: ["resize", "photo", "dimensions", "crop", "batch", "social"],
    status: "available",
  },
  {
    id: "image-converter",
    name: "Image converter",
    description: "From one image format to the next.",
    category: "image",
    keywords: [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "convert",
      "favicon",
      "ico",
      "tiff",
      "bmp",
      "jxl",
    ],
    status: "available",
  },
  {
    id: "animation-converter",
    name: "Animation converter",
    description: "Keep your GIFs and animations moving.",
    category: "image",
    keywords: [
      "gif",
      "animated",
      "apng",
      "webp",
      "frames",
      "loop",
      "trim",
      "speed",
      "reverse",
      "boomerang",
      "caption",
      "text",
      "watermark",
      "filter",
    ],
    status: "available",
  },
  {
    id: "pdf-merger",
    name: "PDF merger",
    description: "Bring separate documents together.",
    category: "document",
    keywords: [
      "pdf",
      "merge",
      "combine",
      "join",
      "pages",
      "reorder",
      "password",
      "bookmarks",
      "organise",
      "rotate",
      "jpg to pdf",
      "image to pdf",
    ],
    status: "available",
  },
  {
    id: "pdf-splitter",
    name: "PDF splitter",
    description: "Cut a PDF into parts, or take out just the pages you need.",
    category: "document",
    keywords: [
      "pdf",
      "split",
      "pages",
      "extract",
      "remove",
      "separate",
      "cut",
      "ranges",
    ],
    status: "available",
  },
  {
    id: "pdf-compressor",
    name: "PDF compressor",
    description: "Make a PDF smaller without making it look worse.",
    category: "document",
    keywords: [
      "pdf",
      "compress",
      "reduce",
      "size",
      "smaller",
      "shrink",
      "optimise",
      "optimize",
      "email",
      "mb",
    ],
    status: "available",
  },
  {
    id: "pdf-editor",
    name: "PDF editor",
    description:
      "Change the words of a PDF, and add text, pictures, shapes and drawings.",
    category: "document",
    keywords: [
      "pdf",
      "edit",
      "edit text",
      "change text",
      "correct",
      "typo",
      "write",
      "type",
      "text",
      "add",
      "picture",
      "image",
      "draw",
      "shapes",
      "annotate",
      "whiteout",
    ],
    status: "available",
  },
  {
    id: "pdf-annotator",
    name: "PDF annotator",
    description: "Highlight, underline and comment on any PDF.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "annotate",
      "highlight",
      "underline",
      "strike",
      "comment",
      "notes",
      "review",
      "markup",
      "mark up",
    ],
    status: "available",
  },
  {
    id: "sign-pdf",
    name: "Sign PDF",
    description:
      "Draw or type your signature, or use a picture of it, and place it on a PDF.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "sign",
      "signature",
      "esign",
      "e-sign",
      "initials",
      "fill",
      "form",
      "date",
      "tick",
    ],
    status: "available",
  },
  {
    id: "fill-pdf-form",
    name: "Fill PDF form",
    description:
      "Fill in the fields of a PDF form, tick its boxes, sign it and download.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "form",
      "forms",
      "fill",
      "fill in",
      "fillable",
      "fields",
      "checkbox",
      "application",
      "tax form",
    ],
    status: "available",
  },
  {
    id: "crop-pdf",
    name: "Crop PDF",
    description:
      "Cut the pages of a PDF to a frame, or make them A4 or Letter size.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "crop",
      "trim",
      "margins",
      "cut",
      "page size",
      "resize",
      "a4",
      "letter",
    ],
    status: "available",
  },
  {
    id: "add-page-numbers",
    name: "Add page numbers",
    description:
      "Number the pages of a PDF, and add headers, footers or Bates numbers.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "page numbers",
      "numbering",
      "number",
      "header",
      "footer",
      "bates",
      "paginate",
    ],
    status: "available",
  },
  {
    id: "watermark-pdf",
    name: "Watermark PDF",
    description:
      "Lay a watermark of words or of a picture over the pages of a PDF.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "watermark",
      "draft",
      "confidential",
      "logo",
      "overlay",
      "mark",
    ],
    status: "available",
  },
  {
    id: "redact-pdf",
    name: "Redact PDF",
    description:
      "Take names, numbers and pictures out of a PDF for good, not just cover them.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "redact",
      "redaction",
      "black out",
      "blackout",
      "censor",
      "sensitive",
      "remove text",
      "sanitize",
      "privacy",
    ],
    status: "available",
  },
  {
    id: "create-pdf-form",
    name: "Create a fillable PDF form",
    description: "Add, move, resize, name and delete the fields of a PDF form.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "fillable",
      "create form",
      "form fields",
      "checkbox",
      "radio",
      "dropdown",
      "date",
      "signature field",
    ],
    status: "available",
  },
  {
    id: "verify-pdf-signature",
    name: "Verify a PDF signature",
    description:
      "Check whether a PDF's digital signatures still hold, who made them, and what changed after.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "verify signature",
      "check signature",
      "digital signature",
      "signature valid",
      "certificate",
      "tampered",
      "changed after signing",
    ],
    status: "available",
  },
  {
    id: "ocr-pdf",
    name: "OCR PDF",
    description:
      "Make a scanned PDF searchable: its words are recognised on your device.",
    partOf: "pdf-editor",
    category: "document",
    keywords: [
      "pdf",
      "ocr",
      "scan",
      "scanned",
      "searchable",
      "recognise text",
      "recognize text",
      "text recognition",
      "image to text",
      "copy text",
    ],
    status: "available",
  },
  {
    id: "color-utility",
    name: "Color utility",
    description:
      "Convert colors, build palettes and gradients, check contrast and explore brand colors.",
    category: "developer",
    keywords: [
      "color",
      "colour",
      "hex",
      "rgb",
      "hsl",
      "hsv",
      "cmyk",
      "oklch",
      "palette",
      "gradient",
      "contrast",
      "wcag",
      "brand",
      "google",
      "meta",
      "anthropic",
      "eyedropper",
    ],
    status: "available",
  },
  {
    id: "json-formatter",
    name: "JSON formatter",
    description: "Format, explore, query, compare and convert JSON locally.",
    category: "developer",
    keywords: [
      "json",
      "format",
      "prettify",
      "data",
      "minify",
      "validate",
      "schema",
      "jsonpath",
      "pointer",
      "compare",
      "diff",
      "patch",
      "repair",
      "yaml",
      "csv",
      "jsonl",
      "typescript",
      "base64",
      "redact",
    ],
    status: "available",
  },
]

/** The tools as they are listed: every tool once, without the doors into it. */
export const listed: readonly Tool[] = tools.filter((tool) => !tool.partOf)

export function parseCategory(value: string | null | undefined): Category {
  return categories.find((category) => category.id === value)?.id ?? "all"
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .trim()
}

export function filterTools(
  query: string,
  category: Category,
  catalogue: readonly Tool[] = tools
): Tool[] {
  const terms = normalize(query).split(/\s+/u).filter(Boolean)
  return catalogue.filter((tool) => {
    if (category !== "all" && tool.category !== category) return false
    const searchable = normalize(
      [tool.name, tool.description, ...tool.keywords].join(" ")
    )
    return terms.every((term) => searchable.includes(term))
  })
}

export function isActivePath(pathname: string, target: string): boolean {
  const path = pathname.replace(/\/+$/u, "") || "/"
  return target === "/"
    ? path === "/"
    : path === target || path.startsWith(`${target}/`)
}
