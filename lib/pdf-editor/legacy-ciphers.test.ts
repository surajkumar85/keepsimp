// @vitest-environment node
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import {
  desEncryptBlock,
  rc2Decrypt,
  rc2EncryptBlock,
  tripleDesDecrypt,
} from "./legacy-ciphers"

const hex = (text: string) =>
  Uint8Array.from(Buffer.from(text.replace(/\s/g, ""), "hex"))
const said = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

/** What OpenSSL encrypts some bytes to, with a cipher, key and IV, unpadded. */
function openssl(
  cipher: string,
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array
) {
  return new Uint8Array(
    execFileSync(
      "openssl",
      [
        "enc",
        `-${cipher}`,
        "-e",
        "-nopad",
        "-K",
        said(key),
        "-iv",
        said(iv),
        "-provider",
        "legacy",
        "-provider",
        "default",
      ],
      { input: Buffer.from(data) }
    )
  )
}

const DATA = Uint8Array.from({ length: 64 }, (_, at) => (at * 37 + 11) & 255)
const IV = hex("0102030405060708")

describe("DES", () => {
  it("gives the standard's test vector", () => {
    expect(
      said(desEncryptBlock(hex("0123456789abcdef"), hex("133457799bbcdff1")))
    ).toBe("85e813540f0ab405")
  })

  it("undoes what OpenSSL encrypted with triple DES, with three keys and with two", () => {
    const three = hex("0123456789abcdef fedcba9876543210 89abcdef01234567")
    expect(
      tripleDesDecrypt(openssl("des-ede3-cbc", three, IV, DATA), three, IV)
    ).toEqual(DATA)
    const two = hex("0123456789abcdef fedcba9876543210")
    expect(
      tripleDesDecrypt(openssl("des-ede-cbc", two, IV, DATA), two, IV)
    ).toEqual(DATA)
  })

  it("refuses a key or a length it cannot take", () => {
    expect(() => tripleDesDecrypt(DATA, new Uint8Array(8), IV)).toThrow(
      "16 or 24 bytes"
    )
    expect(() =>
      tripleDesDecrypt(DATA.subarray(0, 7), new Uint8Array(24), IV)
    ).toThrow("not something these ciphers decrypt")
    expect(() =>
      tripleDesDecrypt(DATA, new Uint8Array(24), IV.subarray(0, 4))
    ).toThrow()
  })
})

describe("RC2", () => {
  it.each([
    ["0000000000000000", 63, "0000000000000000", "ebb773f993278eff"],
    ["ffffffffffffffff", 64, "ffffffffffffffff", "278b27e42e2f0d49"],
    ["3000000000000000", 64, "1000000000000001", "30649edf9be7d2c2"],
    ["88", 64, "0000000000000000", "61a8a244adaccc f0".replace(" ", "")],
    ["88bca90e90875a", 64, "0000000000000000", "6ccf4308974c267f"],
    [
      "88bca90e90875a7f0f79c384627bafb2",
      64,
      "0000000000000000",
      "1a807d272bbe5db1",
    ],
    [
      "88bca90e90875a7f0f79c384627bafb2",
      128,
      "0000000000000000",
      "2269552ab0f85ca6",
    ],
  ])(
    "gives RFC 2268's vector for key %s, %i bits",
    (key, bits, plain, cipher) => {
      expect(said(rc2EncryptBlock(hex(plain), hex(key), bits))).toBe(cipher)
      // And undoes it.
      expect(
        said(rc2Decrypt(hex(cipher), hex(key), new Uint8Array(8), bits))
      ).toBe(plain)
    }
  )

  it("undoes what OpenSSL encrypted with 40-bit and 128-bit RC2", () => {
    const short = hex("0102030405")
    expect(
      rc2Decrypt(openssl("rc2-40-cbc", short, IV, DATA), short, IV, 40)
    ).toEqual(DATA)
    const long = hex("00112233445566778899aabbccddeeff")
    expect(
      rc2Decrypt(openssl("rc2-cbc", long, IV, DATA), long, IV, 128)
    ).toEqual(DATA)
  })
})
