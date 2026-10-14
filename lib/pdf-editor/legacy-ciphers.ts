/**
 * The two old block ciphers certificate files are still locked with, for
 * decrypting only: triple DES (FIPS 46-3, as EDE in CBC) and RC2
 * (RFC 2268, in CBC). Browsers' cryptography has neither. Nothing is
 * encrypted with them here; they open files people already have.
 */

// DES, as FIPS 46-3 lays it out: tables counted from 1, bit 1 the highest.
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35,
  27, 19, 11, 3, 60, 52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38,
  30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
]
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27,
  20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34,
  53, 46, 42, 50, 36, 29, 32,
]
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38,
  30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1,
  59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39,
  31, 23, 15, 7,
]
const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14,
  54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28,
  35, 3, 43, 11, 51, 19, 59, 27, 34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9,
  49, 17, 57, 25,
]
const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16,
  17, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29,
  28, 29, 30, 31, 32, 1,
]
const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32,
  27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
]
const S = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2,
    13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7,
    3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8,
    14, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9,
    3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6,
    10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5,
    10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15,
    0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14,
    5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7,
    13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6,
    3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12,
    9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1,
    13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1,
    10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0,
    5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3,
    7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13,
    15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
  ],
]

/** The bits of some bytes, highest first. */
function bitsOf(bytes: Uint8Array): number[] {
  const bits: number[] = []
  for (const byte of bytes)
    for (let at = 7; at >= 0; at--) bits.push((byte >> at) & 1)
  return bits
}

/** Bits back to bytes, eight to a byte, highest first. */
function bytesOfBits(bits: readonly number[]) {
  const out = new Uint8Array(bits.length / 8)
  bits.forEach((bit, at) => {
    out[at >> 3] |= bit << (7 - (at & 7))
  })
  return out
}

const permute = (bits: readonly number[], table: readonly number[]) =>
  table.map((at) => bits[at - 1])

/** The sixteen round keys of a DES key, each 48 bits. */
function roundKeys(key: Uint8Array) {
  const bits = permute(bitsOf(key), PC1)
  let c = bits.slice(0, 28)
  let d = bits.slice(28)
  return SHIFTS.map((shift) => {
    c = [...c.slice(shift), ...c.slice(0, shift)]
    d = [...d.slice(shift), ...d.slice(0, shift)]
    return permute([...c, ...d], PC2)
  })
}

/** One block of DES, with the round keys in the order they are to be used. */
function desBlock(block: Uint8Array, keys: readonly number[][]) {
  const bits = permute(bitsOf(block), IP)
  let left = bits.slice(0, 32)
  let right = bits.slice(32)
  for (const key of keys) {
    const mixed = permute(right, E).map((bit, at) => bit ^ key[at])
    const out: number[] = []
    for (let box = 0; box < 8; box++) {
      const six = mixed.slice(box * 6, box * 6 + 6)
      const row = (six[0] << 1) | six[5]
      const column = (six[1] << 3) | (six[2] << 2) | (six[3] << 1) | six[4]
      const value = S[box][row * 16 + column]
      out.push((value >> 3) & 1, (value >> 2) & 1, (value >> 1) & 1, value & 1)
    }
    const next = permute(out, P).map((bit, at) => bit ^ left[at])
    left = right
    right = next
  }
  return bytesOfBits(permute([...right, ...left], FP))
}

/** A DES key's round keys for encrypting, and for decrypting. */
function desKeys(key: Uint8Array) {
  const forward = roundKeys(key)
  return { forward, backward: [...forward].reverse() }
}

/** CBC over blocks of eight bytes, with a function that undoes one block. */
function cbcDecrypt(
  data: Uint8Array,
  iv: Uint8Array,
  block: (one: Uint8Array) => Uint8Array
) {
  if (data.length % 8 || iv.length !== 8)
    throw new Error("That is not something these ciphers decrypt.")
  const out = new Uint8Array(data.length)
  let previous = iv
  for (let at = 0; at < data.length; at += 8) {
    const cipher = data.subarray(at, at + 8)
    const plain = block(cipher)
    for (let i = 0; i < 8; i++) out[at + i] = plain[i] ^ previous[i]
    previous = cipher
  }
  return out
}

/**
 * Decrypt triple DES (EDE) in CBC: with a 24-byte key, three keys; with a
 * 16-byte key, the first is used again as the third.
 */
export function tripleDesDecrypt(
  data: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
) {
  if (key.length !== 24 && key.length !== 16)
    throw new Error("A triple DES key is 16 or 24 bytes.")
  const one = desKeys(key.subarray(0, 8))
  const two = desKeys(key.subarray(8, 16))
  const three = key.length === 24 ? desKeys(key.subarray(16, 24)) : one
  return cbcDecrypt(data, iv, (block) =>
    desBlock(
      desBlock(desBlock(block, three.backward), two.forward),
      one.backward
    )
  )
}

/** One block of DES, encrypted: for the test vectors of the standard. */
export const desEncryptBlock = (block: Uint8Array, key: Uint8Array) =>
  desBlock(block, desKeys(key).forward)

// RC2, as RFC 2268 gives it.
/**
 * RFC 2268's table of the bytes of pi, in full: every byte from 0 to 255
 * once, in the order the key schedule uses them.
 */
const PI = [
  217, 120, 249, 196, 25, 221, 181, 237, 40, 233, 253, 121, 74, 160, 216, 157,
  198, 126, 55, 131, 43, 118, 83, 142, 98, 76, 100, 136, 68, 139, 251, 162, 23,
  154, 89, 245, 135, 179, 79, 19, 97, 69, 109, 141, 9, 129, 125, 50, 189, 143,
  64, 235, 134, 183, 123, 11, 240, 149, 33, 34, 92, 107, 78, 130, 84, 214, 101,
  147, 206, 96, 178, 28, 115, 86, 192, 20, 167, 140, 241, 220, 18, 117, 202, 31,
  59, 190, 228, 209, 66, 61, 212, 48, 163, 60, 182, 38, 111, 191, 14, 218, 70,
  105, 7, 87, 39, 242, 29, 155, 188, 148, 67, 3, 248, 17, 199, 246, 144, 239,
  62, 231, 6, 195, 213, 47, 200, 102, 30, 215, 8, 232, 234, 222, 128, 82, 238,
  247, 132, 170, 114, 172, 53, 77, 106, 42, 150, 26, 210, 113, 90, 21, 73, 116,
  75, 159, 208, 94, 4, 24, 164, 236, 194, 224, 65, 110, 15, 81, 203, 204, 36,
  145, 175, 80, 161, 244, 112, 57, 153, 124, 58, 133, 35, 184, 180, 122, 252, 2,
  54, 91, 37, 85, 151, 49, 45, 93, 250, 152, 227, 138, 146, 174, 5, 223, 41, 16,
  103, 108, 186, 201, 211, 0, 230, 207, 225, 158, 168, 44, 99, 22, 1, 63, 88,
  226, 137, 169, 13, 56, 52, 27, 171, 51, 255, 176, 187, 72, 12, 95, 185, 177,
  205, 46, 197, 243, 219, 71, 229, 165, 156, 119, 10, 166, 32, 104, 254, 127,
  193, 173,
]

/** RC2's 64 key words, from a key and how many bits of it are to count. */
function rc2Keys(key: Uint8Array, bits: number) {
  const l = new Uint8Array(128)
  l.set(key)
  const t = key.length
  for (let i = t; i < 128; i++) l[i] = PI[(l[i - 1] + l[i - t]) & 255]
  const t8 = Math.ceil(bits / 8)
  const tm = 255 % 2 ** (8 + bits - 8 * t8)
  l[128 - t8] = PI[l[128 - t8] & tm]
  for (let i = 127 - t8; i >= 0; i--) l[i] = PI[l[i + 1] ^ l[i + t8]]
  return Array.from({ length: 64 }, (_, at) => l[2 * at] | (l[2 * at + 1] << 8))
}

const rotateRight = (word: number, by: number) =>
  ((word >>> by) | (word << (16 - by))) & 0xffff

/** One block of RC2, undone. */
function rc2Block(block: Uint8Array, k: readonly number[]) {
  const r = [0, 1, 2, 3].map((at) => block[2 * at] | (block[2 * at + 1] << 8))
  const s = [1, 2, 3, 5]
  let j = 63
  const mix = () => {
    for (let i = 3; i >= 0; i--) {
      r[i] = rotateRight(r[i], s[i])
      r[i] =
        (r[i] -
          k[j--] -
          (r[(i + 3) % 4] & r[(i + 2) % 4]) -
          (~r[(i + 3) % 4] & r[(i + 1) % 4])) &
        0xffff
    }
  }
  const mash = () => {
    for (let i = 3; i >= 0; i--) r[i] = (r[i] - k[r[(i + 3) % 4] & 63]) & 0xffff
  }
  for (let round = 0; round < 5; round++) mix()
  mash()
  for (let round = 0; round < 6; round++) mix()
  mash()
  for (let round = 0; round < 5; round++) mix()
  const out = new Uint8Array(8)
  r.forEach((word, at) => {
    out[2 * at] = word & 255
    out[2 * at + 1] = word >> 8
  })
  return out
}

/** One block of RC2, encrypted: for the test vectors of RFC 2268. */
export function rc2EncryptBlock(
  block: Uint8Array,
  key: Uint8Array,
  bits: number
) {
  const k = rc2Keys(key, bits)
  const r = [0, 1, 2, 3].map((at) => block[2 * at] | (block[2 * at + 1] << 8))
  const s = [1, 2, 3, 5]
  let j = 0
  const mix = () => {
    for (let i = 0; i < 4; i++) {
      r[i] =
        (r[i] +
          k[j++] +
          (r[(i + 3) % 4] & r[(i + 2) % 4]) +
          (~r[(i + 3) % 4] & r[(i + 1) % 4])) &
        0xffff
      r[i] = ((r[i] << s[i]) | (r[i] >>> (16 - s[i]))) & 0xffff
    }
  }
  const mash = () => {
    for (let i = 0; i < 4; i++) r[i] = (r[i] + k[r[(i + 3) % 4] & 63]) & 0xffff
  }
  for (let round = 0; round < 5; round++) mix()
  mash()
  for (let round = 0; round < 6; round++) mix()
  mash()
  for (let round = 0; round < 5; round++) mix()
  const out = new Uint8Array(8)
  r.forEach((word, at) => {
    out[2 * at] = word & 255
    out[2 * at + 1] = word >> 8
  })
  return out
}

/** Decrypt RC2 in CBC, with a key of which a number of bits count. */
export function rc2Decrypt(
  data: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  bits: number
) {
  const k = rc2Keys(key, bits)
  return cbcDecrypt(data, iv, (block) => rc2Block(block, k))
}
