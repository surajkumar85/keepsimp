import {
  IconArrowsDiagonalMinimize2,
  IconArrowsMinimize,
  IconArrowsSplit2,
  IconBraces,
  IconCut,
  IconDimensions,
  IconFilePencil,
  IconFileZip,
  IconGif,
  IconHeadphones,
  IconLayersUnion,
  IconMovie,
  IconMusicDown,
  IconPlayerTrackNext,
  IconTransform,
  IconWaveSine,
} from "@tabler/icons-react"
import { cn } from "cn"
import type { Category, Tool } from "@/lib/catalogue"

/** Every tool has a picture of its own, so cards can be told apart at a glance. */
const icons: Record<string, typeof IconBraces> = {
  "video-converter": IconMovie,
  "video-compressor": IconFileZip,
  "video-trimmer": IconCut,
  "audio-extractor": IconMusicDown,
  "audio-converter": IconWaveSine,
  "audio-trimmer": IconPlayerTrackNext,
  "image-compressor": IconArrowsMinimize,
  "image-resizer": IconDimensions,
  "image-converter": IconTransform,
  "animation-converter": IconGif,
  "pdf-merger": IconLayersUnion,
  "pdf-splitter": IconArrowsSplit2,
  "pdf-compressor": IconArrowsDiagonalMinimize2,
  "pdf-editor": IconFilePencil,
  "json-formatter": IconBraces,
}

/**
 * The colour of each kind of tool, as classes. They are written out in full
 * so the stylesheet holds them: the letter colour, a soft fill of the same
 * colour for an icon tile, and what a card takes on under the pointer.
 */
export const categoryTone: Record<
  Exclude<Category, "all">,
  { text: string; tile: string; card: string }
> = {
  video: {
    text: "text-category-video",
    tile: "bg-category-video/12 text-category-video",
    card: "hover:border-category-video/50 hover:bg-category-video/4 focus-within:border-category-video/50",
  },
  audio: {
    text: "text-category-audio",
    tile: "bg-category-audio/12 text-category-audio",
    card: "hover:border-category-audio/50 hover:bg-category-audio/4 focus-within:border-category-audio/50",
  },
  image: {
    text: "text-category-image",
    tile: "bg-category-image/12 text-category-image",
    card: "hover:border-category-image/50 hover:bg-category-image/4 focus-within:border-category-image/50",
  },
  document: {
    text: "text-category-document",
    tile: "bg-category-document/12 text-category-document",
    card: "hover:border-category-document/50 hover:bg-category-document/4 focus-within:border-category-document/50",
  },
  developer: {
    text: "text-category-developer",
    tile: "bg-category-developer/12 text-category-developer",
    card: "hover:border-category-developer/50 hover:bg-category-developer/4 focus-within:border-category-developer/50",
  },
}

/**
 * A tool's own icon on a tile of its category's colour. A tool that is not
 * built yet gets a grey tile, so colour is kept for what can be used.
 */
export function ToolIcon({
  tool,
  size = "md",
  className,
}: {
  tool: Tool
  size?: "sm" | "md"
  className?: string
}) {
  const Icon = icons[tool.id] ?? IconHeadphones
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        size === "md" ? "size-10" : "size-8",
        tool.status === "available"
          ? categoryTone[tool.category].tile
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon
        className={size === "md" ? "size-5" : "size-4.5"}
        stroke={1.7}
        aria-hidden="true"
      />
    </span>
  )
}
