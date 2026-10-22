/**
 * A ZIP (stored, no compression: video is already compressed) made of the
 * files themselves. Each file is read once, a piece at a time, for its
 * checksum; the archive is the headers and the files' own Blobs put in
 * order, so nothing large is copied or held in memory. ZIP64 records are
 * written for files or archives beyond 4 GB.
 */
import { crc32, dosDateTime } from "@/lib/image-resizer/zip"

export interface BlobEntry {
  name: string
  blob: Blob
}

const MAX_32 = 0xffff_ffff

/** The CRC-32 of a Blob, read a piece at a time. */
export async function crcOf(blob: Blob, signal?: AbortSignal) {
  let crc = 0
  const reader = blob.stream().getReader()
  for (;;) {
    signal?.throwIfAborted()
    const { done, value } = await reader.read()
    if (done) return crc
    crc = crc32(value, crc)
  }
}

/** Little-endian fields, written in order. */
class Fields {
  private bytes: number[] = []
  u16(value: number) {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff)
    return this
  }
  u32(value: number) {
    this.u16(value & 0xffff).u16(Math.floor(value / 0x10000) & 0xffff)
    return this
  }
  u64(value: number) {
    return this.u32(value % 0x1_0000_0000).u32(
      Math.floor(value / 0x1_0000_0000)
    )
  }
  raw(data: Uint8Array) {
    this.bytes.push(...data)
    return this
  }
  done() {
    return Uint8Array.from(this.bytes)
  }
}

/** A ZIP of the entries, in order. `limit` is where ZIP64 records begin: 4 GB, or less in tests. */
export async function zipBlobs(
  entries: BlobEntry[],
  {
    modified = new Date(),
    signal,
    limit = MAX_32,
  }: { modified?: Date; signal?: AbortSignal; limit?: number } = {}
): Promise<Blob> {
  const encoder = new TextEncoder()
  const stamp = dosDateTime(modified)
  const parts: BlobPart[] = []
  const central = new Fields()
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const size = entry.blob.size
    const crc = await crcOf(entry.blob, signal)
    const big = size >= limit
    const local = new Fields()
      .u32(0x04034b50)
      .u16(big ? 45 : 20)
      .u16(0x0800) // UTF-8 names
      .u16(0) // stored
      .u16(stamp.time)
      .u16(stamp.date)
      .u32(crc)
      .u32(big ? MAX_32 : size)
      .u32(big ? MAX_32 : size)
      .u16(name.length)
      .u16(big ? 20 : 0)
      .raw(name)
    if (big) local.u16(0x0001).u16(16).u64(size).u64(size)
    const header = local.done()
    parts.push(header, entry.blob)

    const far = offset >= limit
    const extra = (big ? 16 : 0) + (far ? 8 : 0)
    central
      .u32(0x02014b50)
      .u16(big || far ? 45 : 20)
      .u16(big || far ? 45 : 20)
      .u16(0x0800)
      .u16(0)
      .u16(stamp.time)
      .u16(stamp.date)
      .u32(crc)
      .u32(big ? MAX_32 : size)
      .u32(big ? MAX_32 : size)
      .u16(name.length)
      .u16(extra ? extra + 4 : 0)
      .u16(0) // comment
      .u16(0) // disk
      .u16(0) // internal attributes
      .u32(0) // external attributes
      .u32(far ? MAX_32 : offset)
      .raw(name)
    if (extra) {
      central.u16(0x0001).u16(extra)
      if (big) central.u64(size).u64(size)
      if (far) central.u64(offset)
    }
    offset += header.length + size
  }
  const directory = central.done()
  const end = new Fields()
  const count = entries.length
  const wideEnd =
    count >= 0xffff || offset >= limit || directory.length >= limit
  if (wideEnd) {
    const record = offset + directory.length
    end
      .u32(0x06064b50)
      .u64(44)
      .u16(45)
      .u16(45)
      .u32(0)
      .u32(0)
      .u64(count)
      .u64(count)
      .u64(directory.length)
      .u64(offset)
      .u32(0x07064b50)
      .u32(0)
      .u64(record)
      .u32(1)
  }
  end
    .u32(0x06054b50)
    .u16(0)
    .u16(0)
    .u16(wideEnd ? 0xffff : count)
    .u16(wideEnd ? 0xffff : count)
    .u32(wideEnd ? MAX_32 : directory.length)
    .u32(wideEnd ? MAX_32 : offset)
    .u16(0)
  parts.push(directory, end.done())
  return new Blob(parts, { type: "application/zip" })
}
