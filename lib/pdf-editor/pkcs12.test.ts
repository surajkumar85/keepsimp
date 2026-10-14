// @vitest-environment node
/**
 * Certificate files as OpenSSL, Windows, macOS and Java write them, and
 * some made by hand for the shapes the others do not make.
 */
import { createCipheriv, createHmac, pbkdf2Sync } from "node:crypto"
import * as asn1js from "asn1js"
import { describe, expect, it } from "vitest"
import { CERTIFICATE_PASSWORD, certificateFile } from "@/tests/pdf-certificates"
import { bmpPassword, pkcs12Key, Pkcs12Problem, readPkcs12 } from "./pkcs12"

const WRONG = "That password does not open this certificate file."
const UNREADABLE =
  "This is not a certificate file that can be read (.p12 or .pfx)."
const UNSUPPORTED =
  "This certificate file is locked in a way that cannot be opened here. Export it again with AES or 3DES."

async function problem(file: Uint8Array, password = CERTIFICATE_PASSWORD) {
  try {
    await readPkcs12(file, password)
    return "opened"
  } catch (error) {
    expect(error).toBeInstanceOf(Pkcs12Problem)
    return (error as Error).message
  }
}

describe("readPkcs12", () => {
  it.each([
    ["rsa-aes", CERTIFICATE_PASSWORD, 1, 2],
    ["rsa-legacy", CERTIFICATE_PASSWORD, 1, 2],
    ["windows-3des", CERTIFICATE_PASSWORD, 1, 2],
    ["rc2-128", CERTIFICATE_PASSWORD, 1, 2],
    ["pbes2-3des", CERTIFICATE_PASSWORD, 1, 2],
    ["no-mac", CERTIFICATE_PASSWORD, 1, 2],
    ["unicode", "pässwörd ü", 1, 2],
    ["self-nopass", "", 1, 1],
    ["certificate-only", CERTIFICATE_PASSWORD, 0, 1],
    ["key-only", CERTIFICATE_PASSWORD, 1, 0],
  ])("opens %s", async (name, password, keys, certificates) => {
    const read = await readPkcs12(certificateFile(name), password)
    expect(read.keys).toHaveLength(keys)
    expect(read.certificates).toHaveLength(certificates)
    // A key is PKCS #8, a certificate X.509: both sequences.
    for (const one of [...read.keys, ...read.certificates])
      expect(one[0]).toBe(0x30)
  })

  it("tells a wrong password, by the file's MAC or, without one, by what it decrypts to", async () => {
    for (const name of ["rsa-aes", "rsa-legacy", "unicode", "no-mac"])
      expect(await problem(certificateFile(name), "wrong")).toBe(WRONG)
    expect(await problem(certificateFile("unicode"), "passwörd ü")).toBe(WRONG)
  })

  it("says what it cannot read, or cannot open", async () => {
    expect(await problem(new TextEncoder().encode("not a certificate"))).toBe(
      UNREADABLE
    )
    expect(
      await problem(new Uint8Array(new asn1js.Integer({ value: 3 }).toBER()))
    ).toBe(UNREADABLE)
    // Locked with ARIA, and checked with MD5: real formats this does not open.
    expect(await problem(certificateFile("pbes2-aria"))).toBe(UNSUPPORTED)
    expect(await problem(certificateFile("mac-md5"))).toBe(UNSUPPORTED)
  })
})

// Files put together by hand.
const oid = (value: string) => new asn1js.ObjectIdentifier({ value })
const octet = (bytes: Uint8Array) => new asn1js.OctetString({ valueHex: bytes })
const tagged = (value: asn1js.AsnType) =>
  new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 0 },
    value: [value],
  })
const der = (value: asn1js.AsnType) => new Uint8Array(value.toBER(false))
const KEY = der(
  new asn1js.Sequence({ value: [new asn1js.Integer({ value: 0 })] })
)
const CERT = der(
  new asn1js.Sequence({ value: [new asn1js.Integer({ value: 7 })] })
)

/** A data ContentInfo, its octets in one piece or split into parts. */
function data(bytes: Uint8Array, split = false) {
  const content = split
    ? new asn1js.OctetString({
        isConstructed: true,
        value: [octet(bytes.subarray(0, 3)), octet(bytes.subarray(3))],
      })
    : octet(bytes)
  return new asn1js.Sequence({
    value: [oid("1.2.840.113549.1.7.1"), tagged(content)],
  })
}

const bag = (id: string, value: asn1js.AsnType) =>
  new asn1js.Sequence({ value: [oid(id), tagged(value)] })

/** A PFX of some ContentInfos, with a MAC when one is given. */
function pfx(
  infos: asn1js.AsnType[],
  mac?: (safe: Uint8Array) => asn1js.AsnType,
  split = false
) {
  const safe = der(new asn1js.Sequence({ value: infos }))
  return der(
    new asn1js.Sequence({
      value: [
        new asn1js.Integer({ value: 3 }),
        data(safe, split),
        ...(mac ? [mac(safe)] : []),
      ],
    })
  )
}

const SHA1 = { name: "SHA-1", u: 20, v: 64 }

describe("files made by hand", () => {
  it("takes a key that is not locked, skips what is not a key or an X.509 certificate, and reads octets in parts", async () => {
    const bags = der(
      new asn1js.Sequence({
        value: [
          bag("1.2.840.113549.1.12.10.1.1", asn1js.fromBER(KEY).result),
          // A certificate of another kind (an SDSI one), and a bag of secrets.
          bag(
            "1.2.840.113549.1.12.10.1.3",
            new asn1js.Sequence({
              value: [oid("1.2.840.113549.1.9.22.2"), tagged(octet(CERT))],
            })
          ),
          bag("1.2.840.113549.1.12.10.1.5", octet(new Uint8Array(4))),
        ],
      })
    )
    const file = pfx(
      [
        data(bags, true),
        // Signed data: not something certificates are kept in here.
        new asn1js.Sequence({
          value: [oid("1.2.840.113549.1.7.2"), tagged(octet(CERT))],
        }),
      ],
      undefined,
      true
    )
    expect(await readPkcs12(file, "")).toEqual({
      keys: [KEY],
      certificates: [],
    })
  })

  it("takes a MAC made from an empty password as two zero bytes, as some programs make it", async () => {
    const bags = der(
      new asn1js.Sequence({
        value: [
          bag(
            "1.2.840.113549.1.12.10.1.3",
            new asn1js.Sequence({
              value: [oid("1.2.840.113549.1.9.22.1"), tagged(octet(CERT))],
            })
          ),
        ],
      })
    )
    const salt = new Uint8Array(8).fill(9)
    const mac = (safe: Uint8Array, password: Uint8Array) => async () => {
      const key = await pkcs12Key(password, salt, 1, 3, 20, SHA1)
      const digest = createHmac("sha1", key).update(safe).digest()
      return new asn1js.Sequence({
        value: [
          new asn1js.Sequence({
            value: [
              new asn1js.Sequence({
                value: [oid("1.3.14.3.2.26"), new asn1js.Null()],
              }),
              octet(new Uint8Array(digest)),
            ],
          }),
          octet(salt),
          // The iteration count may be left out: it is one then.
        ],
      })
    }
    const safe = der(new asn1js.Sequence({ value: [data(bags)] }))
    const twoZeros = await mac(safe, new Uint8Array(2))()
    const file = pfx([data(bags)], () => twoZeros)
    expect(await readPkcs12(file, "")).toEqual({
      keys: [],
      certificates: [CERT],
    })
    expect(await problem(file, "x")).toBe(WRONG)
  })

  it("decrypts content given in parts, and refuses a scheme it does not know", async () => {
    const bags = der(
      new asn1js.Sequence({
        value: [
          bag(
            "1.2.840.113549.1.12.10.1.3",
            new asn1js.Sequence({
              value: [oid("1.2.840.113549.1.9.22.1"), tagged(octet(CERT))],
            })
          ),
        ],
      })
    )
    const salt = new Uint8Array(8).fill(3)
    const bmp = bmpPassword("secret")
    const key = await pkcs12Key(bmp, salt, 5, 1, 24, SHA1)
    const iv = await pkcs12Key(bmp, salt, 5, 2, 8, SHA1)
    const cipher = createCipheriv("des-ede3-cbc", key, iv)
    const locked = new Uint8Array(
      Buffer.concat([cipher.update(bags), cipher.final()])
    )
    const encrypted = (algorithm: asn1js.AsnType, parts: boolean) =>
      new asn1js.Sequence({
        value: [
          oid("1.2.840.113549.1.7.6"),
          tagged(
            new asn1js.Sequence({
              value: [
                new asn1js.Integer({ value: 0 }),
                new asn1js.Sequence({
                  value: [
                    oid("1.2.840.113549.1.7.1"),
                    algorithm,
                    parts
                      ? new asn1js.Constructed({
                          idBlock: { tagClass: 3, tagNumber: 0 },
                          value: [
                            octet(locked.subarray(0, 8)),
                            octet(locked.subarray(8)),
                          ],
                        })
                      : new asn1js.Primitive({
                          idBlock: { tagClass: 3, tagNumber: 0 },
                          valueHex: locked,
                        }),
                  ],
                }),
              ],
            })
          ),
        ],
      })
    const tripleDes = new asn1js.Sequence({
      value: [
        oid("1.2.840.113549.1.12.1.3"),
        new asn1js.Sequence({
          value: [octet(salt), new asn1js.Integer({ value: 5 })],
        }),
      ],
    })
    expect(
      await readPkcs12(pfx([encrypted(tripleDes, true)]), "secret")
    ).toEqual({
      keys: [],
      certificates: [CERT],
    })
    // Wrong, the padding gives it away.
    expect(await problem(pfx([encrypted(tripleDes, false)]), "terces")).toMatch(
      /password|not a certificate/
    )
    // PBES2 with a way of making keys other than PBKDF2 (scrypt), and an unknown cipher.
    const scrypt = new asn1js.Sequence({
      value: [
        oid("1.2.840.113549.1.5.13"),
        new asn1js.Sequence({
          value: [
            new asn1js.Sequence({
              value: [oid("1.3.6.1.4.1.11591.4.11"), new asn1js.Sequence()],
            }),
            new asn1js.Sequence({
              value: [
                oid("2.16.840.1.101.3.4.1.42"),
                octet(new Uint8Array(16)),
              ],
            }),
          ],
        }),
      ],
    })
    expect(await problem(pfx([encrypted(scrypt, false)]), "secret")).toBe(
      UNSUPPORTED
    )
    const unknown = new asn1js.Sequence({
      value: [oid("1.2.3.4"), new asn1js.Null()],
    })
    expect(await problem(pfx([encrypted(unknown, false)]), "secret")).toBe(
      UNSUPPORTED
    )
  })

  it("makes the key material of RFC 7292 for a long key, in more than one block", async () => {
    const short = await pkcs12Key(
      bmpPassword("a"),
      new Uint8Array(8),
      1,
      1,
      20,
      SHA1
    )
    const long = await pkcs12Key(
      bmpPassword("a"),
      new Uint8Array(8),
      1,
      1,
      48,
      SHA1
    )
    expect(long.subarray(0, 20)).toEqual(short)
    expect(long).toHaveLength(48)
    expect(bmpPassword("")).toHaveLength(0)
    expect(Array.from(bmpPassword("A"))).toEqual([0, 65, 0, 0])
  })
})

describe("files of the wrong shape", () => {
  const holder = (type: asn1js.AsnType, content: asn1js.AsnType) =>
    der(
      new asn1js.Sequence({
        value: [
          new asn1js.Integer({ value: 3 }),
          new asn1js.Sequence({ value: [type, content] }),
        ],
      })
    )
  const empty = der(new asn1js.Sequence())

  it("refuses what is not where a PFX has it", async () => {
    // Signed rather than plain data: not opened here.
    expect(
      await problem(holder(oid("1.2.840.113549.1.7.2"), tagged(octet(empty))))
    ).toBe(UNSUPPORTED)
    // Not tagged, tagged with nothing, no identifier, and not octets.
    expect(
      await problem(holder(oid("1.2.840.113549.1.7.1"), octet(empty)))
    ).toBe(UNREADABLE)
    expect(
      await problem(
        holder(
          oid("1.2.840.113549.1.7.1"),
          new asn1js.Constructed({
            idBlock: { tagClass: 3, tagNumber: 0 },
            value: [],
          })
        )
      )
    ).toBe(UNREADABLE)
    expect(
      await problem(
        holder(new asn1js.Integer({ value: 1 }), tagged(octet(empty)))
      )
    ).toBe(UNREADABLE)
    expect(
      await problem(
        holder(
          oid("1.2.840.113549.1.7.1"),
          tagged(new asn1js.Integer({ value: 1 }))
        )
      )
    ).toBe(UNREADABLE)
  })

  /** A PFX with one bag of certificates locked with an algorithm, as `locked` encrypts them. */
  function lockedWith(algorithm: asn1js.AsnType, locked: Uint8Array) {
    return pfx([
      new asn1js.Sequence({
        value: [
          oid("1.2.840.113549.1.7.6"),
          tagged(
            new asn1js.Sequence({
              value: [
                new asn1js.Integer({ value: 0 }),
                new asn1js.Sequence({
                  value: [
                    oid("1.2.840.113549.1.7.1"),
                    algorithm,
                    new asn1js.Primitive({
                      idBlock: { tagClass: 3, tagNumber: 0 },
                      valueHex: locked,
                    }),
                  ],
                }),
              ],
            })
          ),
        ],
      }),
    ])
  }
  const bags = der(
    new asn1js.Sequence({
      value: [
        bag(
          "1.2.840.113549.1.12.10.1.3",
          new asn1js.Sequence({
            value: [oid("1.2.840.113549.1.9.22.1"), tagged(octet(CERT))],
          })
        ),
      ],
    })
  )

  it("says a file cannot be read when its locked part is not of a length a cipher takes", async () => {
    const algorithm = new asn1js.Sequence({
      value: [
        oid("1.2.840.113549.1.12.1.3"),
        new asn1js.Sequence({
          value: [octet(new Uint8Array(8)), new asn1js.Integer({ value: 1 })],
        }),
      ],
    })
    expect(await problem(lockedWith(algorithm, new Uint8Array(13)))).toBe(
      UNREADABLE
    )
  })

  it("refuses an iteration count that is not a number", async () => {
    const algorithm = new asn1js.Sequence({
      value: [
        oid("1.2.840.113549.1.12.1.3"),
        new asn1js.Sequence({
          value: [octet(new Uint8Array(8)), octet(new Uint8Array(1))],
        }),
      ],
    })
    expect(await problem(lockedWith(algorithm, new Uint8Array(16)))).toBe(
      UNREADABLE
    )
  })

  it("makes keys with HMAC-SHA1 when PBES2 names no PRF, as the standard says", async () => {
    const salt = new Uint8Array(8).fill(5)
    const iv = new Uint8Array(16).fill(6)
    const key = pbkdf2Sync("secret", salt, 7, 32, "sha1")
    const cipher = createCipheriv("aes-256-cbc", key, iv)
    const locked = new Uint8Array(
      Buffer.concat([cipher.update(bags), cipher.final()])
    )
    const algorithm = new asn1js.Sequence({
      value: [
        oid("1.2.840.113549.1.5.13"),
        new asn1js.Sequence({
          value: [
            new asn1js.Sequence({
              value: [
                oid("1.2.840.113549.1.5.12"),
                new asn1js.Sequence({
                  value: [octet(salt), new asn1js.Integer({ value: 7 })],
                }),
              ],
            }),
            new asn1js.Sequence({
              value: [oid("2.16.840.1.101.3.4.1.42"), octet(iv)],
            }),
          ],
        }),
      ],
    })
    expect(await readPkcs12(lockedWith(algorithm, locked), "secret")).toEqual({
      keys: [],
      certificates: [CERT],
    })
  })
})
