import { describe, expect, it } from "vitest"
import { allActions, COMMAND, keyAction, shortcutGroups } from "./shortcuts"

const press = (key: string, more: Partial<KeyboardEvent> = {}) =>
  keyAction({
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...more,
  })

describe("the trimmer's keys", () => {
  it("answer to letters either case, with and without shift", () => {
    expect(press(" ")).toBe("play")
    expect(press("K")).toBe("play")
    expect(press("i")).toBe("mark-in")
    expect(press("ArrowLeft")).toBe("back")
    expect(press("ArrowLeft", { shiftKey: true })).toBe("back-more")
    expect(press("S", { shiftKey: true })).toBe("frame")
    expect(press("s")).toBeNull()
    expect(press("Delete")).toBe("cut")
    expect(press("Backspace")).toBe("cut")
  })

  it("undo and redo with Ctrl or ⌘, and nothing with Alt", () => {
    expect(press("z", { ctrlKey: true })).toBe("undo")
    expect(press("z", { metaKey: true })).toBe("undo")
    expect(press("Z", { metaKey: true, shiftKey: true })).toBe("redo")
    expect(press("y", { ctrlKey: true })).toBe("redo")
    expect(press("z")).toBeNull()
    expect(press("i", { altKey: true })).toBeNull()
    expect(press("q")).toBeNull()
  })

  it("are all in the help, once, with every way of pressing them", () => {
    const groups = shortcutGroups()
    const said = groups.flatMap((group) => group.shortcuts)
    expect(said).toHaveLength(allActions().length)
    expect(new Set(said.map((one) => one.does)).size).toBe(said.length)
    const redo = said.find((one) => one.does === "Redo")!
    expect(redo.ways).toEqual([
      [COMMAND, "Shift", "Z"],
      [COMMAND, "Y"],
    ])
    expect(said.find((one) => one.does === "Play or pause")!.ways).toEqual([
      ["Space"],
      ["K"],
    ])
    expect(
      said.find((one) => one.does === "Clear the selection")!.ways
    ).toEqual([["Esc"]])
  })
})
