/** How the facts of a sound file are said. */

const CODECS: Record<string, string> = {
  mp3: "MP3",
  aac: "AAC",
  opus: "Opus",
  vorbis: "Vorbis",
  flac: "FLAC",
  ac3: "AC-3",
  eac3: "E-AC-3",
  dts: "DTS",
  ulaw: "μ-law",
  alaw: "A-law",
}

/** A codec by its name, as people know it. */
export function codecLabel(codec: string | null) {
  if (!codec) return "No sound"
  if (CODECS[codec]) return CODECS[codec]
  const pcm = /^pcm-([suf])(\d+)/.exec(codec)
  if (pcm)
    return pcm[1] === "f" ? `PCM ${pcm[2]}-bit float` : `PCM ${pcm[2]}-bit`
  return codec.toUpperCase()
}

/** A length in seconds as a clock: 0:07, 3:05, 1:02:03. */
export function timeLabel(seconds: number, tenths = false) {
  const whole = Math.max(0, seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  const secondsText = tenths
    ? (Math.floor(rest * 10) / 10).toFixed(1).padStart(4, "0")
    : String(Math.floor(rest)).padStart(2, "0")
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secondsText}`
    : `${minutes}:${secondsText}`
}

export function rateLabel(rate: number) {
  return `${(rate / 1000).toLocaleString("en", { maximumFractionDigits: 3 })} kHz`
}

export function channelsLabel(channels: number) {
  if (channels === 1) return "Mono"
  if (channels === 2) return "Stereo"
  if (channels === 6) return "5.1 (6 channels)"
  if (channels === 8) return "7.1 (8 channels)"
  return `${channels} channels`
}

/** A bitrate in bits per second, as kbit/s. */
export function bitrateLabel(bitsPerSecond: number) {
  return `${Math.round(bitsPerSecond / 1000)} kbit/s`
}

/** The average bitrate of a file of `bytes` lasting `seconds`; null when it has no length. */
export function averageBitrate(bytes: number, seconds: number) {
  return seconds > 0 ? Math.round((bytes * 8) / seconds) : null
}
