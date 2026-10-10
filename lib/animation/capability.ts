"use client"

/** Whether this browser can write each video format, so the page offers only what works. */
export async function videoEncodeSupport(): Promise<{
  mp4: boolean
  webm: boolean
}> {
  if (typeof VideoEncoder === "undefined") return { mp4: false, webm: false }
  const can = async (codec: string) => {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: 640,
        height: 480,
        bitrate: 1_000_000,
        framerate: 30,
      })
      return support.supported === true
    } catch {
      return false
    }
  }
  return {
    // H.264 for MP4; VP9, or the older VP8, for WebM.
    mp4: await can("avc1.42001f"),
    webm: (await can("vp09.00.10.08")) || (await can("vp8")),
  }
}
