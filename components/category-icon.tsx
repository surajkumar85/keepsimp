import {
  IconCode,
  IconFileText,
  IconLayoutGrid,
  IconMusic,
  IconPhoto,
  IconVideo,
} from "@tabler/icons-react"
import type { Category } from "@/lib/catalogue"

const icons = {
  all: IconLayoutGrid,
  video: IconVideo,
  audio: IconMusic,
  image: IconPhoto,
  document: IconFileText,
  developer: IconCode,
}

/** Each kind of tool has a colour of its own; "all" takes the brand's. */
const tones: Record<Category, string> = {
  all: "text-primary",
  video: "text-category-video",
  audio: "text-category-audio",
  image: "text-category-image",
  document: "text-category-document",
  developer: "text-category-developer",
}

export function CategoryIcon({
  category,
  className = "size-5",
  colourful,
}: {
  category: Category
  className?: string
  /** Draw the icon in the category's colour. */
  colourful?: boolean
}) {
  const Icon = icons[category]
  return (
    <Icon
      className={colourful ? `${className} ${tones[category]}` : className}
      stroke={1.7}
      aria-hidden="true"
    />
  )
}
