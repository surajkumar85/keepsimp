/**
 * Which decoded samples are the sound itself. Encoders add samples before
 * and after it: AAC in MP4, Opus and Vorbis say so in their containers,
 * which Mediabunny reads (the priming samples come before time 0, and the
 * length is the track's). An MP3 says so only in the LAME header of its
 * first frame, which is read here: its encoder delay, plus the 529
 * samples every MP3 decoder adds, come first, and its padding last.
 */

/**
 * Samples an MP3 decoder puts before the encoder's own delay, as the
 * reference decoder and FFmpeg do. Apple's (Safari's) puts none: each
 * browser's is measured (`mp3DecoderDelay`), and this is only the default.
 */
export const MP3_DECODER_DELAY = 529

export interface Mp3Gapless {
  /** Samples the encoder put before the sound. */
  delay: number
  /** Samples it put after it. */
  padding: number
  /** MPEG frames of sound, not counting the header frame; null when the header does not say. */
  frames: number | null
  /** Samples in each frame. */
  frameSamples: number
}

/** Where the first MPEG frame starts, after an ID3v2 tag; -1 when there is none in reach. */
function firstFrame(bytes: Uint8Array) {
  let at = 0
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f)
    at = 10 + size + (bytes[5] & 0x10 ? 10 : 0)
  }
  for (; at + 4 <= bytes.length; at++)
    if (bytes[at] === 0xff && (bytes[at + 1] & 0xe0) === 0xe0) return at
  return -1
}

/** The encoder delay and padding an MP3's LAME header gives; null when it has none. */
export function mp3Gapless(bytes: Uint8Array): Mp3Gapless | null {
  const at = firstFrame(bytes)
  if (at < 0) return null
  const version = (bytes[at + 1] >> 3) & 3 // 3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5
  const layer = (bytes[at + 1] >> 1) & 3 // 1: layer III
  const rateIndex = (bytes[at + 2] >> 4) & 15
  const sampleIndex = (bytes[at + 2] >> 2) & 3
  if (version === 1 || layer !== 1 || rateIndex === 15 || sampleIndex === 3)
    return null
  const mono = bytes[at + 3] >> 6 === 3
  const mpeg1 = version === 3
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17
  const tag = at + 4 + sideInfo
  if (tag + 8 > bytes.length) return null
  const name = String.fromCharCode(...bytes.subarray(tag, tag + 4))
  if (name !== "Xing" && name !== "Info") return null
  const flags =
    (bytes[tag + 4] << 24) |
    (bytes[tag + 5] << 16) |
    (bytes[tag + 6] << 8) |
    bytes[tag + 7]
  let next = tag + 8
  let frames: number | null = null
  if (flags & 1) {
    frames =
      ((bytes[next] << 24) |
        (bytes[next + 1] << 16) |
        (bytes[next + 2] << 8) |
        bytes[next + 3]) >>>
      0
    next += 4
  }
  if (flags & 2) next += 4
  if (flags & 4) next += 100
  if (flags & 8) next += 4
  // The LAME extension: a nine-letter version, then the delay and padding 21 bytes in.
  if (next + 24 > bytes.length) return null
  const encoder = String.fromCharCode(...bytes.subarray(next, next + 4))
  if (encoder !== "LAME" && encoder !== "Lavc" && encoder !== "Lavf")
    return null
  const delay = (bytes[next + 21] << 4) | (bytes[next + 22] >> 4)
  const padding = ((bytes[next + 22] & 0x0f) << 8) | bytes[next + 23]
  return { delay, padding, frames, frameSamples: mpeg1 ? 1152 : 576 }
}

/**
 * Which decoded samples to keep, counted from the first decoded one: from
 * `start`, `length` of them (null for to the end).
 */
export function mp3Kept(
  gapless: Mp3Gapless,
  decoderDelay = MP3_DECODER_DELAY
): {
  start: number
  length: number | null
} {
  const start = gapless.delay + decoderDelay
  return {
    start,
    length:
      gapless.frames === null
        ? null
        : Math.max(
            0,
            gapless.frames * gapless.frameSamples -
              gapless.delay -
              gapless.padding
          ),
  }
}

/** Samples LAME puts before the sound; the MP3 encoder used here is LAME. */
export const LAME_DELAY = 576

/** The MP3 bitrates (kbit/s) by index: MPEG-1, then MPEG-2 and 2.5. */
const BITRATES = [
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
]
const SAMPLE_RATES = [44100, 48000, 32000]

/** CRC-16 as LAME and FFmpeg check its header (polynomial 0x8005, reflected). */
export function crc16(bytes: Uint8Array) {
  let crc = 0
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
  }
  return crc
}

/**
 * An MP3 as written, with the LAME extension added to its Xing or Info
 * frame: the encoder's delay and the padding at the end, so that players
 * and decoders that read it play exactly `samples` samples. The seeking
 * table is dropped to make room (a file at one bitrate seeks without it).
 * The file is returned as it was when the frame is too small to hold the
 * extension or the numbers do not fit.
 */
export function lameTagged(
  bytes: Uint8Array,
  samples: number,
  delay = LAME_DELAY
): Uint8Array {
  const at = firstFrame(bytes)
  if (at < 0) return bytes
  const version = (bytes[at + 1] >> 3) & 3
  const rateIndex = (bytes[at + 2] >> 4) & 15
  const sampleIndex = (bytes[at + 2] >> 2) & 3
  if (version === 1 || ((bytes[at + 1] >> 1) & 3) !== 1 || sampleIndex === 3)
    return bytes
  const mpeg1 = version === 3
  const sampleRate =
    SAMPLE_RATES[sampleIndex] / (mpeg1 ? 1 : version === 2 ? 2 : 4)
  const kbits = BITRATES[mpeg1 ? 0 : 1][rateIndex] ?? 0
  const padded = (bytes[at + 2] >> 1) & 1
  const length =
    Math.floor(((mpeg1 ? 144 : 72) * kbits * 1000) / sampleRate) + padded
  const mono = bytes[at + 3] >> 6 === 3
  const tag = at + 4 + (mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17)
  const name = String.fromCharCode(...bytes.subarray(tag, tag + 4))
  if (name !== "Xing" && name !== "Info") return bytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const flags = view.getUint32(tag + 4)
  if (!(flags & 1)) return bytes
  const frames = view.getUint32(tag + 8)
  const frameSamples = mpeg1 ? 1152 : 576
  const padding = frames * frameSamples - delay - samples
  // The frame count, the byte count and the extension's 36 bytes.
  const end = tag + 16 + 36
  if (
    !kbits ||
    end > at + length ||
    padding < 0 ||
    padding > 4095 ||
    delay > 4095
  )
    return bytes
  const out = bytes.slice()
  const write = new DataView(out.buffer)
  out.fill(0, tag + 4, at + length)
  write.setUint32(tag + 4, 3)
  write.setUint32(tag + 8, frames)
  write.setUint32(tag + 12, bytes.length - at)
  const lame = tag + 16
  out.set(
    Array.from("LAME3.100", (letter) => letter.charCodeAt(0)),
    lame
  )
  out[lame + 9] = 0x01 // revision 0, constant bitrate
  out[lame + 20] = Math.min(255, kbits)
  out[lame + 21] = delay >> 4
  out[lame + 22] = ((delay & 15) << 4) | (padding >> 8)
  out[lame + 23] = padding & 255
  write.setUint32(lame + 28, bytes.length - at)
  write.setUint16(lame + 34, crc16(out.subarray(at, lame + 34)))
  return out
}
