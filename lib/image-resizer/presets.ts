export type PresetGroup = "social" | "web" | "screens" | "print" | "icons"

export interface Preset {
  id: string
  group: PresetGroup
  label: string
  width: number
  height: number
  /** Print presets are defined at this density. */
  dpi?: number
  /** Parts of a story that apps cover with their own interface, as fractions of the height. */
  safeArea?: { top: number; bottom: number }
}

export const presetGroups: { id: PresetGroup; label: string }[] = [
  { id: "social", label: "Social" },
  { id: "web", label: "Web" },
  { id: "screens", label: "Screens" },
  { id: "print", label: "Print" },
  { id: "icons", label: "Icons" },
]

/**
 * Social sizes are recommendations gathered from public guides, not guarantees
 * from the platforms, which change their layouts without notice. Where guides
 * disagree, the larger commonly cited size is used.
 */
export const PRESETS_CHECKED = "October 2026"
export const presetSources = [
  {
    title: "Buffer: social media image sizes",
    url: "https://buffer.com/resources/social-media-image-sizes/",
  },
  {
    title: "Hootsuite: social media image sizes guide",
    url: "https://blog.hootsuite.com/social-media-image-sizes-guide/",
  },
  {
    title: "SocialBu: guide to social media image sizes",
    url: "https://socialbu.com/blog/social-media-image-sizes",
  },
]

const STORY_SAFE = { top: 0.14, bottom: 0.2 }
const print = (inchesWide: number, inchesHigh: number) => ({
  width: Math.round(inchesWide * 300),
  height: Math.round(inchesHigh * 300),
  dpi: 300,
})

export const presets: Preset[] = [
  {
    id: "instagram-square",
    group: "social",
    label: "Instagram square",
    width: 1080,
    height: 1080,
  },
  {
    id: "instagram-portrait",
    group: "social",
    label: "Instagram portrait",
    width: 1080,
    height: 1350,
  },
  {
    id: "instagram-story",
    group: "social",
    label: "Story or Reel",
    width: 1080,
    height: 1920,
    safeArea: STORY_SAFE,
  },
  {
    id: "tiktok-cover",
    group: "social",
    label: "TikTok cover",
    width: 1080,
    height: 1920,
    safeArea: STORY_SAFE,
  },
  {
    id: "facebook-post",
    group: "social",
    label: "Facebook post",
    width: 1080,
    height: 1350,
  },
  {
    id: "facebook-cover",
    group: "social",
    label: "Facebook cover",
    width: 851,
    height: 315,
  },
  { id: "x-post", group: "social", label: "X post", width: 1600, height: 900 },
  {
    id: "x-header",
    group: "social",
    label: "X header",
    width: 1500,
    height: 500,
  },
  {
    id: "linkedin-post",
    group: "social",
    label: "LinkedIn post",
    width: 1200,
    height: 627,
  },
  {
    id: "linkedin-banner",
    group: "social",
    label: "LinkedIn banner",
    width: 1584,
    height: 396,
  },
  {
    id: "youtube-thumbnail",
    group: "social",
    label: "YouTube thumbnail",
    width: 1280,
    height: 720,
  },
  {
    id: "youtube-banner",
    group: "social",
    label: "YouTube banner",
    width: 2560,
    height: 1440,
  },
  {
    id: "pinterest-pin",
    group: "social",
    label: "Pinterest pin",
    width: 1000,
    height: 1500,
  },
  {
    id: "profile-photo",
    group: "social",
    label: "Profile photo",
    width: 400,
    height: 400,
  },
  {
    id: "link-preview",
    group: "web",
    label: "Link preview",
    width: 1200,
    height: 630,
  },
  { id: "hero", group: "web", label: "Hero banner", width: 1920, height: 1080 },
  {
    id: "article",
    group: "web",
    label: "Article image",
    width: 1200,
    height: 800,
  },
  {
    id: "card",
    group: "web",
    label: "Card thumbnail",
    width: 640,
    height: 480,
  },
  { id: "avatar", group: "web", label: "Avatar", width: 256, height: 256 },
  { id: "hd", group: "screens", label: "HD 720p", width: 1280, height: 720 },
  {
    id: "full-hd",
    group: "screens",
    label: "Full HD",
    width: 1920,
    height: 1080,
  },
  {
    id: "qhd",
    group: "screens",
    label: "QHD 1440p",
    width: 2560,
    height: 1440,
  },
  { id: "uhd", group: "screens", label: "4K UHD", width: 3840, height: 2160 },
  {
    id: "phone",
    group: "screens",
    label: "Phone wallpaper",
    width: 1170,
    height: 2532,
  },
  { id: "print-4x6", group: "print", label: "4 × 6 in", ...print(4, 6) },
  { id: "print-5x7", group: "print", label: "5 × 7 in", ...print(5, 7) },
  { id: "print-8x10", group: "print", label: "8 × 10 in", ...print(8, 10) },
  {
    id: "print-a4",
    group: "print",
    label: "A4",
    width: 2480,
    height: 3508,
    dpi: 300,
  },
  {
    id: "print-a5",
    group: "print",
    label: "A5",
    width: 1748,
    height: 2480,
    dpi: 300,
  },
  { id: "print-letter", group: "print", label: "US Letter", ...print(8.5, 11) },
  {
    id: "print-passport",
    group: "print",
    label: "2 × 2 in photo",
    ...print(2, 2),
  },
  { id: "favicon", group: "icons", label: "Favicon 32", width: 32, height: 32 },
  {
    id: "apple-touch",
    group: "icons",
    label: "Apple touch 180",
    width: 180,
    height: 180,
  },
  {
    id: "pwa-192",
    group: "icons",
    label: "App icon 192",
    width: 192,
    height: 192,
  },
  {
    id: "pwa-512",
    group: "icons",
    label: "App icon 512",
    width: 512,
    height: 512,
  },
  {
    id: "store-1024",
    group: "icons",
    label: "Store icon 1024",
    width: 1024,
    height: 1024,
  },
]

export function findPreset(id: string | null) {
  return presets.find((preset) => preset.id === id) ?? null
}

export function presetsIn(group: PresetGroup) {
  return presets.filter((preset) => preset.group === group)
}
