// @vitest-environment node
import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import {
  MARK_KEYS,
  PANEL_KEYS,
  SHORTCUTS,
  shortcutsSaid,
  TOOL_KEYS,
} from "./shortcuts"

const source = (path: string) => readFile(path, "utf8")
const sorted = (keys: Iterable<string>) => [...keys].sort()

describe("the list of keys", () => {
  it("names the keys the editor's code answers to, no more and no fewer", async () => {
    const toolbar = await source("components/pdf-editor/toolbar.tsx")
    // The toolbar's tools and marks, each with its key.
    const keyed = [...toolbar.matchAll(/label: "([^"]+)",\s*key: "([A-Z])"/g)]
    const toolLetters = keyed.slice(0, 12).map((match) => match[2])
    const markLetters = keyed.slice(12).map((match) => match[2])
    expect(sorted(toolLetters)).toEqual(sorted(Object.keys(TOOL_KEYS)))
    expect(sorted(markLetters)).toEqual(sorted(Object.keys(MARK_KEYS)))
    // The tools the editor takes in hand by their letter.
    const editor = await source("components/pdf-editor/use-editor.ts")
    const tools = editor.slice(
      editor.indexOf("const tools: Record<string, Tool>")
    )
    const inHand = [
      ...tools.slice(0, tools.indexOf("}")).matchAll(/^\s+(\w): "/gm),
    ]
    expect(sorted(inHand.map((match) => match[1].toUpperCase()))).toEqual(
      sorted(Object.keys(TOOL_KEYS))
    )
    // The panels and modes, by the letters the window answers to on their own.
    const window = await source("components/pdf-editor/pdf-editor.tsx")
    const panels = new Set(
      [...window.matchAll(/plain && letter === "(\w)"\s*\)/g)].map((match) =>
        match[1].toUpperCase()
      )
    )
    expect(sorted(panels)).toEqual(sorted(Object.keys(PANEL_KEYS)))
    // No letter does two things.
    const all = [TOOL_KEYS, MARK_KEYS, PANEL_KEYS].flatMap(Object.keys)
    expect(new Set(all).size).toBe(all.length)
  })

  it("says every key in the written help", () => {
    const said = shortcutsSaid()
    expect(said).toContain("Tools: V select, T text box,")
    expect(said).toContain("Changes: Ctrl or ⌘ Z undo,")
    for (const group of SHORTCUTS) expect(said).toContain(`${group.title}:`)
    expect(shortcutsSaid([])).toBe("")
  })
})
