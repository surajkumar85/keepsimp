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

export function CategoryIcon({
  category,
  className = "size-5",
}: {
  category: Category
  className?: string
}) {
  const Icon = icons[category]
  return <Icon className={className} stroke={1.7} aria-hidden="true" />
}
