import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  FAMILY_LABELS,
  fontName,
  fontUrl,
  fontUrls,
  screenFamily,
} from "./fonts"
import { FONT_KEYS } from "./objects"

describe("fonts", () => {
  it("has a file on the site for every key", () => {
    expect(fontUrl("sans")).toBe("/fonts/editor/LiberationSans-Regular.ttf")
    expect(fontUrl("serif-bold")).toBe("/fonts/editor/LiberationSerif-Bold.ttf")
    expect(fontUrl("mono-italic")).toBe(
      "/fonts/editor/LiberationMono-Italic.ttf"
    )
    expect(fontUrl("sans-bold-italic")).toBe(
      "/fonts/editor/LiberationSans-BoldItalic.ttf"
    )
    expect(Object.keys(fontUrls)).toEqual([...FONT_KEYS])
    for (const url of Object.values(fontUrls))
      expect(existsSync(`public${url}`), url).toBe(true)
  })

  it("refuses a key it does not know", () => {
    expect(() => fontUrl("comic")).toThrow('There is no font "comic".')
    expect(() => fontUrl("sans-heavy")).toThrow()
    expect(() => fontUrl("sansbold")).toThrow()
  })

  it("names each file for the screen and each family for the panel", () => {
    expect(screenFamily("serif-bold")).toBe("KeepSimp serif-bold")
    expect(fontName("serif-bold")).toBe("LiberationSerif-Bold")
    expect(fontName("mono")).toBe("LiberationMono-Regular")
    expect(Object.keys(FAMILY_LABELS)).toEqual(["sans", "serif", "mono"])
  })
})
