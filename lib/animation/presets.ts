import type { AnimationSettings, Target } from "./settings"

/** When the limits below were last checked against their sources. */
export const DESTINATIONS_CHECKED = "October 2026"

/** A place an animation is going, with the format, size and file-size limit it asks for. */
export interface Destination {
  id: string
  label: string
  target: Target
  /** An exact canvas, a longest side that is never exceeded, or no size rule. */
  size:
    | { kind: "exact"; width: number; height: number }
    | { kind: "within"; edge: number }
    | null
  /** Largest file, in bytes. */
  limit: number
  /** Longest clip, in seconds. */
  maxSeconds: number | null
  /** Most frames per second. */
  fps: number | null
  /** Anything else worth knowing, in a sentence. */
  note: string
  source: { label: string; url: string }
  /** False when the limit comes from third-party guides, not the service itself. */
  official: boolean
}

export const destinations: readonly Destination[] = [
  {
    id: "discord-emoji",
    label: "Discord emoji",
    target: "gif",
    size: { kind: "within", edge: 128 },
    // Discord's figure is 256 KiB; 256 KB is a little under it and a round number to show.
    limit: 256_000,
    maxSeconds: null,
    fps: null,
    note: "Animated emoji are shown at up to 128 px and must be under 256 KB.",
    source: {
      label: "Discord developer documentation",
      url: "https://docs.discord.com/developers/resources/emoji",
    },
    official: true,
  },
  {
    id: "discord-sticker",
    label: "Discord sticker",
    target: "apng",
    size: { kind: "exact", width: 320, height: 320 },
    limit: 512_000,
    maxSeconds: null,
    fps: null,
    note: "Animated stickers are APNG, exactly 320 × 320 px, and at most 512 KB.",
    source: {
      label: "Discord support",
      url: "https://support.discord.com/hc/articles/4402687377815",
    },
    official: true,
  },
  {
    id: "slack-emoji",
    label: "Slack emoji",
    target: "gif",
    size: { kind: "within", edge: 128 },
    limit: 128_000,
    maxSeconds: null,
    fps: null,
    note: "Guides give 128 KB and 128 × 128 px for custom emoji. Slack does not publish the figure.",
    source: {
      label: "Compresto guide",
      url: "https://compresto.app/blog/compress-gif-for-slack-emoji-custom-workspace",
    },
    official: false,
  },
  {
    id: "telegram-sticker",
    label: "Telegram video sticker",
    target: "webm",
    size: { kind: "within", edge: 512 },
    limit: 256_000,
    maxSeconds: 3,
    fps: 30,
    note: "Video stickers are WebM (VP9) with one side 512 px, up to 3 seconds and 30 frames a second, and at most 256 KB. A smaller clip is not enlarged here; set the size to 512 if yours is.",
    source: {
      label: "Telegram",
      url: "https://core.telegram.org/stickers/webm-vp9-encoding",
    },
    official: true,
  },
  {
    id: "whatsapp-sticker",
    label: "WhatsApp sticker",
    target: "webp",
    size: { kind: "exact", width: 512, height: 512 },
    limit: 500_000,
    maxSeconds: null,
    fps: null,
    note: "Guides give animated WebP at exactly 512 × 512 px and at most 500 KB. WhatsApp does not publish the figure.",
    source: {
      label: "Moda guide",
      url: "https://moda.app/resources/sizes/whatsapp-sticker",
    },
    official: false,
  },
  {
    id: "github",
    label: "GitHub",
    target: "gif",
    size: null,
    limit: 10_000_000,
    maxSeconds: null,
    fps: null,
    note: "Images and GIFs attached to issues, pull requests and READMEs can be up to 10 MB.",
    source: {
      label: "GitHub documentation",
      url: "https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files",
    },
    official: true,
  },
  {
    id: "x-gif",
    label: "X (Twitter) GIF",
    target: "gif",
    size: { kind: "within", edge: 1280 },
    limit: 15_000_000,
    maxSeconds: null,
    fps: null,
    note: "Animated GIFs can be up to 15 MB and 1280 × 1080 px. X also asks for no more than 350 frames, which this preset does not enforce.",
    source: {
      label: "X developer documentation",
      url: "https://docs.x.com/x-api/media/quickstart/best-practices",
    },
    official: true,
  },
]

/** The settings a destination asks for, laid over the current ones. */
export function applyDestination(
  settings: AnimationSettings,
  destination: Destination
): AnimationSettings {
  const { size } = destination
  return {
    ...settings,
    target: destination.target,
    sizeLimit: destination.limit,
    maxSeconds: destination.maxSeconds,
    fps: destination.fps,
    ...(size?.kind === "exact"
      ? {
          resize: "exact" as const,
          resizeValue: size.width,
          resizeHeight: size.height,
          enlarge: true,
        }
      : size
        ? {
            resize: "longEdge" as const,
            resizeValue: size.edge,
            // A size to stay within, not one to reach.
            enlarge: false,
          }
        : { resize: "original" as const }),
  }
}

/** The destination whose settings are in force, if any; changing one of them by hand leaves it. */
export function matchingDestination(
  settings: AnimationSettings
): Destination | null {
  return (
    destinations.find((destination) => {
      const wanted = applyDestination(settings, destination)
      return (Object.keys(wanted) as (keyof AnimationSettings)[]).every(
        (key) => wanted[key] === settings[key]
      )
    }) ?? null
  )
}
