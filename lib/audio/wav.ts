/**
 * WAV files written and AIFF files read by hand: a WAV of 32-bit floats
 * holds sound the page decoded itself without loss, and an AIFF (which
 * Mediabunny does not read) is turned into the WAV it is equal to, sample
 * for sample, so it goes the same way as every other file.
 */

/** Tags an AIFF can carry in its own chunks. */
export interface AiffTags {
  title?: string
  artist?: string
  comment?: string
  copyright?: string
}

/** A file that is not an AIFF that can be read here. */
export class AiffProblem extends Error {}

/** A WAV header for `frames` frames of the given kind. */
function wavHeader(
  frames: number,
  channels: number,
  rate: number,
  bits: number,
  float: boolean
) {
  const block = channels * (bits / 8)
  const data = frames * block
  const header = new Uint8Array(44)
  const view = new DataView(header.buffer)
  const ascii = (at: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      header[at + index] = value.charCodeAt(index)
  }
  ascii(0, "RIFF")
  view.setUint32(4, 36 + data, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, float ? 3 : 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * block, true)
  view.setUint16(32, block, true)
  view.setUint16(34, bits, true)
  ascii(36, "data")
  view.setUint32(40, data, true)
  return header
}

/** A WAV of 32-bit floats from one array of samples per channel. */
export function wavFromPlanes(planes: readonly Float32Array[], rate: number) {
  const frames = planes[0]?.length ?? 0
  const channels = planes.length
  const out = new Uint8Array(44 + frames * channels * 4)
  out.set(wavHeader(frames, channels, rate, 32, true))
  const view = new DataView(out.buffer)
  let at = 44
  for (let frame = 0; frame < frames; frame++)
    for (let channel = 0; channel < channels; channel++, at += 4)
      view.setFloat32(at, planes[channel][frame], true)
  return out
}

/** An 80-bit IEEE extended number, as AIFF writes its sample rate. */
export function readExtended(bytes: Uint8Array, at: number) {
  const sign = bytes[at] & 0x80 ? -1 : 1
  const exponent = ((bytes[at] & 0x7f) << 8) | bytes[at + 1]
  let mantissa = 0
  for (let index = 0; index < 8; index++)
    mantissa = mantissa * 256 + bytes[at + 2 + index]
  if (exponent === 0 && mantissa === 0) return 0
  return sign * mantissa * 2 ** (exponent - 16383 - 63)
}

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length))

/**
 * The WAV an AIFF (or AIFF-C holding plain samples) is equal to, with the
 * tags of its own chunks.
 */
export function wavFromAiff(bytes: Uint8Array): {
  wav: Uint8Array
  sampleRate: number
  channels: number
  bits: number
  tags: AiffTags
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes.length < 12 ||
    ascii(bytes, 0, 4) !== "FORM" ||
    !/^AIF[FC]$/.test(ascii(bytes, 8, 4))
  )
    throw new AiffProblem("This is not an AIFF file.")
  const compressed = ascii(bytes, 8, 4) === "AIFC"
  let channels = 0
  let frames = 0
  let bits = 0
  let rate = 0
  let kind = "NONE"
  let data: Uint8Array | null = null
  const tags: AiffTags = {}
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = ascii(bytes, at, 4)
    const size = view.getUint32(at + 4)
    const body = at + 8
    const end = Math.min(bytes.length, body + size)
    if (id === "COMM") {
      channels = view.getUint16(body)
      frames = view.getUint32(body + 2)
      bits = view.getUint16(body + 6)
      rate = readExtended(bytes, body + 8)
      if (compressed) kind = ascii(bytes, body + 18, 4)
    } else if (id === "SSND") {
      const offset = view.getUint32(body)
      data = bytes.subarray(body + 8 + offset, end)
    } else if (id === "NAME") tags.title = ascii(bytes, body, end - body)
    else if (id === "AUTH") tags.artist = ascii(bytes, body, end - body)
    else if (id === "ANNO") tags.comment = ascii(bytes, body, end - body)
    else if (id === "(c) ") tags.copyright = ascii(bytes, body, end - body)
    // Chunks are padded to an even length.
    at = body + size + (size % 2)
  }
  if (!channels || !rate || !data)
    throw new AiffProblem("This AIFF file has no sound in it.")
  const float = kind === "fl32" || kind === "FL32"
  const little = kind === "sowt"
  if (!float && !little && kind !== "NONE" && kind !== "twos")
    throw new AiffProblem(
      `This AIFF-C file is compressed (${kind.trim()}), which is not read here.`
    )
  if (float) bits = 32
  if (!float && ![8, 16, 24, 32].includes(bits))
    throw new AiffProblem(`AIFF files of ${bits} bits are not read here.`)
  const width = bits / 8
  const available = Math.floor(data.length / (width * channels))
  frames = Math.min(frames, available)
  const out = new Uint8Array(44 + frames * channels * width)
  out.set(wavHeader(frames, channels, Math.round(rate), bits, float))
  for (let sample = 0; sample < frames * channels; sample++) {
    const from = sample * width
    const to = 44 + from
    if (bits === 8)
      // AIFF's 8-bit samples are signed; WAV's are unsigned.
      out[to] = (data[from] + 128) & 0xff
    else if (little)
      for (let byte = 0; byte < width; byte++)
        out[to + byte] = data[from + byte]
    else
      for (let byte = 0; byte < width; byte++)
        out[to + byte] = data[from + width - 1 - byte]
  }
  return { wav: out, sampleRate: Math.round(rate), channels, bits, tags }
}
