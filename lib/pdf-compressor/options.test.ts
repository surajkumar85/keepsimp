import { describe, expect, it } from "vitest"
import {
  defaultExtras,
  extrasKey,
  extrasProblem,
  lockOf,
  removalChoices,
  removalOf,
  removesAnything,
} from "./options"

describe("what is taken out", () => {
  it("is nothing unless asked for", () => {
    const removal = removalOf(defaultExtras)
    expect(removesAnything(removal)).toBe(false)
    expect(Object.keys(removal).sort()).toEqual(
      removalChoices.map((choice) => choice.key).sort()
    )
    expect("password" in removal).toBe(false)
  })

  it("is each thing by its own switch, with a word of warning", () => {
    for (const { key, label, hint } of removalChoices) {
      const removal = removalOf({ ...defaultExtras, [key]: true })
      expect(removesAnything(removal)).toBe(true)
      expect(removal[key]).toBe(true)
      expect(label.length).toBeGreaterThan(5)
      expect(hint.length).toBeGreaterThan(20)
    }
  })
})

describe("extrasProblem", () => {
  it("has nothing to say without a password, or with a good one", () => {
    expect(extrasProblem(defaultExtras)).toBeNull()
    expect(
      extrasProblem({ ...defaultExtras, protect: true, password: "secret" })
    ).toBeNull()
  })

  it("asks for a password when the result is to be locked", () => {
    expect(extrasProblem({ ...defaultExtras, protect: true })).toBe(
      "Enter a password for the result, or turn the password off."
    )
  })

  it("wants the second password to differ from the first", () => {
    expect(
      extrasProblem({
        ...defaultExtras,
        protect: true,
        password: "same",
        ownerPassword: "same",
      })
    ).toContain("must differ")
  })
})

describe("lockOf", () => {
  const locked = { ...defaultExtras, protect: true, password: "open" }
  const random = () => "random"

  it("is no lock at all unless asked for", () => {
    expect(lockOf(defaultExtras, random)).toBeNull()
  })

  it("opens everything with the one password when nothing is limited", () => {
    expect(lockOf(locked, random)).toEqual({
      password: "open",
      ownerPassword: "open",
      permissions: -4,
    })
  })

  it("keeps limits from being lifted when no second password is given", () => {
    const lock = lockOf({ ...locked, allowCopy: false }, random)!
    expect(lock.ownerPassword).toBe("random")
    expect(lock.permissions & 16).toBe(0)
    expect(lock.permissions & 4).toBe(4)
    for (const limit of [{ allowPrint: false }, { allowChanges: false }])
      expect(lockOf({ ...locked, ...limit }, random)!.ownerPassword).toBe(
        "random"
      )
  })

  it("uses the second password when there is one", () => {
    expect(
      lockOf({ ...locked, allowPrint: false, ownerPassword: "boss" }, random)!
        .ownerPassword
    ).toBe("boss")
  })
})

describe("extrasKey", () => {
  it("is empty when nothing is asked for, whatever is typed", () => {
    expect(extrasKey(defaultExtras)).toBe("")
    expect(
      extrasKey({ ...defaultExtras, password: "typed", allowCopy: false })
    ).toBe("")
  })

  it("changes with everything that changes the result", () => {
    const keys = new Set([
      extrasKey({ ...defaultExtras, bookmarks: true }),
      extrasKey({ ...defaultExtras, bookmarks: true, tags: true }),
      extrasKey({ ...defaultExtras, protect: true, password: "a" }),
      extrasKey({ ...defaultExtras, protect: true, password: "b" }),
      extrasKey({
        ...defaultExtras,
        protect: true,
        password: "a",
        allowPrint: false,
      }),
      extrasKey({
        ...defaultExtras,
        protect: true,
        password: "a",
        ownerPassword: "c",
      }),
    ])
    expect(keys.size).toBe(6)
    expect(keys.has("")).toBe(false)
  })
})
