/** Minimal ZIP writer (stored, no compression): images are already compressed. */

const table = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  table[n] = c >>> 0
}

export function crc32(bytes: Uint8Array, seed = 0) {
  let crc = ~seed >>> 0
  for (let i = 0; i < bytes.length; i++)
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return ~crc >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** MS-DOS time and date words used by ZIP headers. */
export function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export function createZip(entries: ZipEntry[], modified = new Date()) {
  const encoder = new TextEncoder()
  const stamp = dosDateTime(modified)
  const records = entries.map((entry) => ({
    name: encoder.encode(entry.name),
    data: entry.data,
    crc: crc32(entry.data),
  }))
  const localSize = records.reduce(
    (total, record) => total + 30 + record.name.length + record.data.length,
    0
  )
  const centralSize = records.reduce(
    (total, record) => total + 46 + record.name.length,
    0
  )
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let offset = 0
  const offsets: number[] = []
  for (const record of records) {
    offsets.push(offset)
    view.setUint32(offset, 0x04034b50, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 0x0800, true) // UTF-8 names
    view.setUint16(offset + 8, 0, true) // stored
    view.setUint16(offset + 10, stamp.time, true)
    view.setUint16(offset + 12, stamp.date, true)
    view.setUint32(offset + 14, record.crc, true)
    view.setUint32(offset + 18, record.data.length, true)
    view.setUint32(offset + 22, record.data.length, true)
    view.setUint16(offset + 26, record.name.length, true)
    view.setUint16(offset + 28, 0, true)
    out.set(record.name, offset + 30)
    out.set(record.data, offset + 30 + record.name.length)
    offset += 30 + record.name.length + record.data.length
  }
  const centralStart = offset
  records.forEach((record, index) => {
    view.setUint32(offset, 0x02014b50, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 20, true)
    view.setUint16(offset + 8, 0x0800, true)
    view.setUint16(offset + 10, 0, true)
    view.setUint16(offset + 12, stamp.time, true)
    view.setUint16(offset + 14, stamp.date, true)
    view.setUint32(offset + 16, record.crc, true)
    view.setUint32(offset + 20, record.data.length, true)
    view.setUint32(offset + 24, record.data.length, true)
    view.setUint16(offset + 28, record.name.length, true)
    view.setUint32(offset + 42, offsets[index], true)
    out.set(record.name, offset + 46)
    offset += 46 + record.name.length
  })
  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 8, records.length, true)
  view.setUint16(offset + 10, records.length, true)
  view.setUint32(offset + 12, centralSize, true)
  view.setUint32(offset + 16, centralStart, true)
  return out
}
