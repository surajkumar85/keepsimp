import { describe, expect, it } from "vitest"
import {
  actionsFor,
  commonKind,
  fileKind,
  fileKinds,
  kindName,
} from "./file-actions"

const named = (name: string, type = "") => ({ name, type })

describe("the kind of a file", () => {
  it("goes by the name first", () => {
    expect(fileKind(named("clip.MOV"))).toBe("video")
    expect(fileKind(named("song.flac"))).toBe("audio")
    expect(fileKind(named("photo.heic"))).toBe("image")
    expect(fileKind(named("loop.gif", "image/gif"))).toBe("animation")
    expect(fileKind(named("book.pdf"))).toBe("pdf")
    expect(fileKind(named("README.md"))).toBe("markdown")
    expect(fileKind(named("notes.txt"))).toBe("markdown")
    expect(fileKind(named("letter.docx"))).toBe("word")
    expect(fileKind(named("page.htm"))).toBe("html")
    expect(fileKind(named("data.yaml"))).toBe("data")
    // A name that says one thing wins over a type that says another.
    expect(fileKind(named("data.json", "text/plain"))).toBe("data")
  })

  it("goes by the type when the name says nothing", () => {
    expect(fileKind(named("photo", "image/jpeg"))).toBe("image")
    expect(fileKind(named("loop", "image/gif"))).toBe("animation")
    expect(fileKind(named("loop", "image/apng"))).toBe("animation")
    expect(fileKind(named("clip", "video/mp4"))).toBe("video")
    expect(fileKind(named("song", "audio/mpeg"))).toBe("audio")
    expect(fileKind(named("book", "application/pdf"))).toBe("pdf")
    expect(fileKind(named("notes", "text/markdown"))).toBe("markdown")
    expect(fileKind(named("page", "text/html"))).toBe("html")
    expect(fileKind(named("data", "application/json"))).toBe("data")
    expect(fileKind(named("sheet.xlsx", "application/vnd.ms-excel"))).toBe(null)
    expect(fileKind(named("no-extension"))).toBe(null)
  })

  it("takes the kind most of the files share, the first one breaking a tie", () => {
    expect(commonKind([named("a.pdf"), named("b.mp3"), named("c.pdf")])).toBe(
      "pdf"
    )
    expect(commonKind([named("a.mp3"), named("b.pdf")])).toBe("audio")
    expect(commonKind([named("a.zip"), named("b.png")])).toBe("image")
    expect(commonKind([named("a.zip")])).toBe(null)
    expect(commonKind([])).toBe(null)
  })
})

describe("what can be done with it", () => {
  it("names a usable tool page for every kind, with words for each", () => {
    for (const kind of fileKinds) {
      expect(kindName[kind]).toBeTruthy()
      for (const count of [1, 3]) {
        const actions = actionsFor(kind, count)
        expect(actions.length).toBeGreaterThan(0)
        for (const action of actions) {
          expect(action.tool.status).toBe("available")
          expect(action.href).toMatch(
            new RegExp(`^/dashboard/${action.tool.id}/(#[a-z]+)?$`)
          )
          expect(action.label).toMatch(/^[A-Z]/)
        }
        // No job is offered twice.
        expect(new Set(actions.map((action) => action.href)).size).toBe(
          actions.length
        )
      }
    }
  })

  it("puts the jobs that join files first when there are several", () => {
    expect(actionsFor("pdf")[0].tool.id).toBe("pdf-editor")
    expect(actionsFor("pdf", 2)[0].tool.id).toBe("pdf-merger")
    expect(actionsFor("video", 2)[0].tool.id).toBe("merge-videos")
    expect(actionsFor("audio", 2)[0].tool.id).toBe("join-audio")
    expect(actionsFor("markdown", 2)[0].tool.id).toBe("markdown-editor")
  })

  it("opens a tab of the JSON workspace by its fragment", () => {
    expect(actionsFor("data").map((action) => action.href)).toEqual([
      "/dashboard/json-formatter/",
      "/dashboard/json-formatter/#convert",
      "/dashboard/json-formatter/#query",
    ])
  })
})
