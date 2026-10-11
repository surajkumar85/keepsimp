import { describe, expect, it } from "vitest"
import type { Tool } from "./catalogue"
import {
  edgeChoice,
  firstChoice,
  isApple,
  isSearchShortcut,
  moveChoice,
  searchTools,
  shortcutLabel,
} from "./tool-search"

const tool = (
  id: string,
  status: Tool["status"],
  keywords: string[] = []
): Tool => ({
  id,
  name: id,
  description: `${id} tool`,
  category: "image",
  keywords,
  status,
})
const catalogue = [
  tool("planned-a", "planned", ["shared"]),
  tool("ready-a", "available", ["shared"]),
  tool("planned-b", "planned"),
  tool("ready-b", "available", ["shared", "only-b"]),
]
const ids = (list: Tool[]) => list.map((entry) => entry.id)

describe("searchTools", () => {
  it("lists every tool when nothing is typed, working tools first", () => {
    expect(ids(searchTools("", catalogue))).toEqual([
      "ready-a",
      "ready-b",
      "planned-a",
      "planned-b",
    ])
  })

  it("keeps the tools that match, in the same order", () => {
    expect(ids(searchTools("shared", catalogue))).toEqual([
      "ready-a",
      "ready-b",
      "planned-a",
    ])
    expect(ids(searchTools("ONLY-B", catalogue))).toEqual(["ready-b"])
    expect(searchTools("nothing like it", catalogue)).toEqual([])
  })

  it("searches the real catalogue by default", () => {
    const found = searchTools("pdf")
    expect(ids(found)).toContain("pdf-merger")
    expect(ids(found)).toContain("pdf-splitter")
    expect(found.every((entry) => entry.status === "available")).toBe(true)
  })
})

describe("choosing a result with the keyboard", () => {
  const results = searchTools("", catalogue)
  const mixed = [catalogue[0], catalogue[1], catalogue[2], catalogue[3]]

  it("starts at the first tool that can be opened", () => {
    expect(firstChoice(results)).toBe(0)
    expect(firstChoice(mixed)).toBe(1)
    expect(firstChoice([catalogue[0], catalogue[2]])).toBe(-1)
    expect(firstChoice([])).toBe(-1)
  })

  it("moves to the next tool that can be opened, skipping the others", () => {
    expect(moveChoice(mixed, 1, 1)).toBe(3)
    expect(moveChoice(mixed, 3, -1)).toBe(1)
  })

  it("goes round at either end", () => {
    expect(moveChoice(mixed, 3, 1)).toBe(1)
    expect(moveChoice(mixed, 1, -1)).toBe(3)
    expect(moveChoice(results, 1, 1)).toBe(0)
  })

  it("starts from the edge when nothing is chosen yet", () => {
    expect(moveChoice(mixed, -1, 1)).toBe(1)
    expect(moveChoice(mixed, -1, -1)).toBe(3)
  })

  it("stays on the only tool that can be opened", () => {
    expect(moveChoice([catalogue[0], catalogue[1]], 1, 1)).toBe(1)
  })

  it("has nowhere to go when nothing can be opened", () => {
    expect(moveChoice([catalogue[0], catalogue[2]], 0, 1)).toBe(-1)
    expect(moveChoice([], -1, 1)).toBe(-1)
  })

  it("jumps to the first or the last tool that can be opened", () => {
    expect(edgeChoice(mixed, "first")).toBe(1)
    expect(edgeChoice(mixed, "last")).toBe(3)
    expect(edgeChoice(results, "last")).toBe(1)
    expect(edgeChoice([catalogue[0]], "last")).toBe(-1)
  })
})

describe("the shortcut", () => {
  const press = (change: Partial<Parameters<typeof isSearchShortcut>[0]>) => ({
    key: "k",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...change,
  })

  it("is ⌘K on a Mac", () => {
    expect(isSearchShortcut(press({ metaKey: true }), true)).toBe(true)
    expect(isSearchShortcut(press({ metaKey: true, key: "K" }), true)).toBe(
      true
    )
    // Ctrl+K deletes to the end of a line in Mac text editors.
    expect(isSearchShortcut(press({ ctrlKey: true }), true)).toBe(false)
    expect(
      isSearchShortcut(press({ metaKey: true, ctrlKey: true }), true)
    ).toBe(false)
  })

  it("is Ctrl+K everywhere else", () => {
    expect(isSearchShortcut(press({ ctrlKey: true }), false)).toBe(true)
    expect(isSearchShortcut(press({ metaKey: true }), false)).toBe(false)
    expect(
      isSearchShortcut(press({ ctrlKey: true, metaKey: true }), false)
    ).toBe(false)
  })

  it("is not any other key, or the key with more held down", () => {
    expect(isSearchShortcut(press({}), false)).toBe(false)
    expect(isSearchShortcut(press({ ctrlKey: true, key: "j" }), false)).toBe(
      false
    )
    expect(
      isSearchShortcut(press({ ctrlKey: true, shiftKey: true }), false)
    ).toBe(false)
    expect(isSearchShortcut(press({ metaKey: true, altKey: true }), true)).toBe(
      false
    )
  })

  it("is written the way the keyboard shows it", () => {
    expect(shortcutLabel(true)).toBe("⌘K")
    expect(shortcutLabel(false)).toBe("Ctrl K")
  })

  it("knows an Apple device by its description", () => {
    for (const platform of ["MacIntel", "macOS", "iPhone", "iPad"])
      expect(isApple(platform)).toBe(true)
    for (const platform of ["Win32", "Linux x86_64", "Android", ""])
      expect(isApple(platform)).toBe(false)
  })
})
