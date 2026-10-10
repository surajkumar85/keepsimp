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
    id: "audio-extractor",
    name: "Audio extractor",
    description: "Give your video's soundtrack a life of its own.",
    category: "audio",
    keywords: ["video", "extract", "sound", "mp3"],
    status: "planned",
  },
  {
    id: "audio-converter",
    name: "Audio converter",
    description: "A fresh format for your favorite sounds.",
    category: "audio",
    keywords: ["wav", "mp3", "flac", "convert"],
    status: "planned",
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
    keywords: ["pdf", "merge", "combine"],
    status: "planned",
  },
  {
    id: "pdf-splitter",
    name: "PDF splitter",
    description: "Take just the pages you need.",
    category: "document",
    keywords: ["pdf", "split", "pages"],
    status: "planned",
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
