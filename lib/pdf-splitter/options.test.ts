import { describe, expect, it } from "vitest"
import { permissionBits } from "@/lib/pdf-merger/settings"
import {
  carriesAttachments,
  defaultOptions,
  limitsReaders,
  lockFor,
  optionsKey,
  optionsProblem,
  type SplitOptions,
} from "./options"

const options = (change: Partial<SplitOptions> = {}): SplitOptions => ({
  ...defaultOptions,
  ...change,
})

describe("optionsProblem", () => {
  it("has nothing to say about the options as they come", () => {
    expect(optionsProblem(defaultOptions)).toBeNull()
  })

  it("asks for a password when the parts are to be locked", () => {
    expect(optionsProblem(options({ protect: true }))).toBe(
      "Enter a password for the parts, or turn the password off."
    )
    expect(
      optionsProblem(options({ protect: true, password: "open sesame" }))
    ).toBeNull()
  })

  it("refuses a password too long for the format", () => {
    expect(
      optionsProblem(options({ protect: true, password: "x".repeat(200) }))
    ).toMatch(/shorter|127|long/i)
  })

  it("does not mind a password that is typed but not used", () => {
    expect(
      optionsProblem(options({ protect: false, password: "x".repeat(200) }))
    ).toBeNull()
  })
})

describe("lockFor", () => {
  const random = () => "random-owner"

  it("locks nothing unless asked", () => {
    expect(lockFor(defaultOptions, random)).toBeNull()
  })

  it("lets the one password open everything when nothing is limited", () => {
    const locked = options({ protect: true, password: "pw" })
    expect(limitsReaders(locked)).toBe(false)
    expect(lockFor(locked, random)).toEqual({
      password: "pw",
      ownerPassword: "pw",
      permissions: permissionBits(locked),
    })
  })

  it("gives limits a second password nobody keeps, unless one is typed", () => {
    const limited = options({ protect: true, password: "pw", allowCopy: false })
    expect(limitsReaders(limited)).toBe(true)
    expect(lockFor(limited, random)?.ownerPassword).toBe("random-owner")
    expect(
      lockFor({ ...limited, ownerPassword: "boss" }, random)?.ownerPassword
    ).toBe("boss")
    expect(lockFor(limited, random)?.permissions).toBe(permissionBits(limited))
  })

  it("does not limit readers of parts that are not locked", () => {
    expect(limitsReaders(options({ allowPrint: false }))).toBe(false)
  })
})

describe("carriesAttachments", () => {
  it("puts attached files in the first part, in every part, or in none", () => {
    expect(
      [true, false].map((first) => carriesAttachments("first", first))
    ).toEqual([true, false])
    expect(
      [true, false].map((first) => carriesAttachments("all", first))
    ).toEqual([true, true])
    expect(
      [true, false].map((first) => carriesAttachments("none", first))
    ).toEqual([false, false])
  })
})

describe("optionsKey", () => {
  it("changes with anything that changes what is written", () => {
    const key = optionsKey(defaultOptions)
    for (const change of [
      { bookmarks: false },
      { labels: false },
      { details: false },
      { attachments: "all" as const },
      { protect: true, password: "pw" },
    ])
      expect(optionsKey(options(change))).not.toBe(key)
    expect(optionsKey(options({ protect: true, password: "a" }))).not.toBe(
      optionsKey(options({ protect: true, password: "b" }))
    )
  })

  it("does not change with a password or limits that are not used", () => {
    expect(
      optionsKey(
        options({ password: "typed", ownerPassword: "too", allowCopy: false })
      )
    ).toBe(optionsKey(defaultOptions))
  })
})
