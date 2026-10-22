/**
 * Asking this browser what it can write, through Mediabunny, which knows
 * each codec's full name and level for a size. Loaded only when asked.
 */
import type { Asker } from "./jobs"
import type { SoundCodec, VideoCodec } from "./settings"

async function video(codec: VideoCodec, width: number, height: number) {
  if (typeof VideoEncoder === "undefined") return false
  try {
    const { canEncodeVideo } = await import("mediabunny")
    return await canEncodeVideo(codec, { width, height })
  } catch {
    return false
  }
}

async function sound(codec: SoundCodec) {
  if (typeof AudioEncoder === "undefined") return false
  try {
    const { canEncodeAudio } = await import("mediabunny")
    return await canEncodeAudio(codec)
  } catch {
    return false
  }
}

export const browserAsker: Asker = { video, sound }
