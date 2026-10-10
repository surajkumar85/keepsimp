/** Collects bytes for a file being written. */
export class ByteWriter {
  private parts: Uint8Array[] = []
  private size = 0

  get length() {
    return this.size
  }

  bytes(data: ArrayLike<number>) {
    const part = data instanceof Uint8Array ? data : Uint8Array.from(data)
    this.parts.push(part)
    this.size += part.length
    return this
  }

  ascii(text: string) {
    return this.bytes(Array.from(text, (letter) => letter.charCodeAt(0)))
  }

  u8(value: number) {
    return this.bytes([value & 0xff])
  }

  u16le(value: number) {
    return this.bytes([value & 0xff, (value >> 8) & 0xff])
  }

  u24le(value: number) {
    return this.bytes([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff])
  }

  u32le(value: number) {
    return this.bytes([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ])
  }

  u16be(value: number) {
    return this.bytes([(value >> 8) & 0xff, value & 0xff])
  }

  u32be(value: number) {
    return this.bytes([
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ])
  }

  finish() {
    const output = new Uint8Array(this.size)
    let offset = 0
    for (const part of this.parts) {
      output.set(part, offset)
      offset += part.length
    }
    return output
  }
}

export const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

export const u16le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8)

export const u24le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)

export const u32le = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>>
  0

export const u16be = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] << 8) | bytes[offset + 1]

export const u32be = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]) >>>
  0
