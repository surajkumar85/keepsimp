import { describe, expect, it } from "vitest"
import { keyAction, shortcutGroups, type KeyAction } from "./shortcuts"

const press = (key: string, extra: Partial<Record<string, boolean>> = {}) =>
  keyAction({
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  })

describe("keyAction", () => {
  it("answers to the keys, with and without Shift and the command key", () => {
    expect(press(" ")).toBe("play")
    expect(press("K")).toBe("play")
    expect(press("ArrowLeft")).toBe("back")
    expect(press("ArrowLeft", { shiftKey: true })).toBe("back-more")
    expect(press("z", { metaKey: true })).toBe("undo")
    expect(press("z", { ctrlKey: true, shiftKey: true })).toBe("redo")
    expect(press("Z", { ctrlKey: true, shiftKey: true })).toBe("redo")
    expect(press("+", { shiftKey: true })).toBe("zoom-in")
    expect(press("+")).toBe("zoom-in")
  })

  it("leaves other keys, and the same keys with Alt or the command key, alone", () => {
    expect(press("q")).toBeNull()
    expect(press(" ", { altKey: true })).toBeNull()
    expect(press("k", { ctrlKey: true })).toBeNull()
    expect(press("a")).toBeNull()
  })
})

describe("shortcutGroups", () => {
  it("lists every action once, with every way of pressing it", () => {
    const groups = shortcutGroups()
    const listed = groups.flatMap((group) => group.shortcuts)
    expect(new Set(listed.map((one) => one.does)).size).toBe(listed.length)
    for (const one of listed) expect(one.ways.length).toBeGreaterThan(0)
    const redo = listed.find((one) => one.does === "Redo")!
    expect(redo.ways).toEqual([
      ["Ctrl or ⌘", "Shift", "Z"],
      ["Ctrl or ⌘", "Y"],
    ])
    expect(listed.find((one) => one.does === "Play or pause")!.ways).toEqual([
      ["Space"],
      ["K"],
    ])
    // Each action the editor answers to is in the help.
    const actions: KeyAction[] = [
      "play",
      "play-selection",
      "back",
      "forward",
      "back-more",
      "forward-more",
      "skip-back",
      "skip-forward",
      "start",
      "end",
      "mark-in",
      "mark-out",
      "select-all",
      "clear",
      "cut",
      "undo",
      "redo",
      "zoom-in",
      "zoom-out",
      "zoom-fit",
      "mark",
    ]
    expect(listed).toHaveLength(actions.length)
  })
})
