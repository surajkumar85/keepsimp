import { describe, expect, it } from "vitest"
import { pictureMarkdown, pictureName, picturesUsed } from "./pictures"
import { easeSaid, readabilityOf, syllables } from "./readability"
import { slidesOf } from "./slides"
import { templates } from "./templates"
import { insertToc, TOC_END, TOC_START, tocFor } from "./toc"

describe("pictures", () => {
  it("names a picture by its file, or as a picture, never twice", () => {
    expect(pictureName([], "image/png")).toBe("pictures/picture-1.png")
    expect(pictureName(["pictures/picture-1.png"], "image/png")).toBe(
      "pictures/picture-2.png"
    )
    expect(pictureName([], "image/jpeg", "My Holiday.JPG")).toBe(
      "pictures/my-holiday.jpg"
    )
    expect(
      pictureName(["pictures/my-holiday.jpg"], "image/jpeg", "My Holiday.JPG")
    ).toBe("pictures/my-holiday-2.jpg")
    expect(pictureName([], "image/x-unknown", "***")).toBe(
      "pictures/picture.png"
    )
  })

  it("writes the picture's words from its name", () => {
    expect(pictureMarkdown("pictures/a.png", "sunset_over-[sea].png")).toBe(
      "![sunset over sea](pictures/a.png)"
    )
    expect(pictureMarkdown("pictures/a.png")).toBe("![](pictures/a.png)")
  })

  it("finds the pictures a text uses", () => {
    expect(
      picturesUsed(
        '![a](pictures/a.png) ![b](./pictures/b.jpg) <img src="pictures/c.gif"> ![d](other/d.png)'
      )
    ).toEqual(new Set(["pictures/a.png", "pictures/b.jpg", "pictures/c.gif"]))
  })
})

describe("readability", () => {
  it("counts syllables by rule", () => {
    expect(syllables("the")).toBe(1)
    expect(syllables("reading")).toBe(2)
    expect(syllables("simple")).toBe(2)
    expect(syllables("yellow")).toBe(2)
    expect(syllables("123")).toBe(0)
    expect(syllables("rhythm")).toBe(1)
    expect(syllables("psst")).toBe(1)
  })

  it("estimates the ease of a text and finds long and passive sentences", () => {
    const easy = readabilityOf("The cat sat. The dog ran. We had fun.")
    expect(easy.sentences).toBe(3)
    expect(easy.words).toBe(9)
    expect(easy.ease).toBeGreaterThan(90)
    expect(easy.said).toBe("Very easy")
    expect(easy.averageSentence).toBe(3)
    const long = `${Array(30).fill("word").join(" ")}. The report was written by the team.`
    const read = readabilityOf(long)
    expect(read.long).toHaveLength(1)
    expect(read.passive).toEqual(["was written"])
    const hard = readabilityOf(
      "Institutional interdependencies necessitate comprehensive organisational reconsideration."
    )
    expect(hard.ease).toBe(0)
    expect(readabilityOf("").said).toBe("Nothing to read yet")
    expect(readabilityOf("123 456").words).toBe(0)
  })

  it("names every band", () => {
    expect([95, 85, 75, 65, 55, 40, 10].map(easeSaid)).toEqual([
      "Very easy",
      "Easy",
      "Fairly easy",
      "Plain English",
      "Fairly hard",
      "Hard",
      "Very hard",
    ])
  })
})

describe("slides", () => {
  it("splits at ---, after front matter and outside code", () => {
    expect(
      slidesOf(
        "---\ntitle: x\n---\n# One\n\n---\n\n## Two\n```\n---\n```\n---\n\n---\nThree"
      )
    ).toEqual(["# One", "## Two\n```\n---\n```", "Three"])
    expect(slidesOf("---\nnever closed\n---")).toEqual([])
    expect(slidesOf("---\nno close")).toEqual(["no close"])
    expect(slidesOf("~~~\n---\n~~~\n")).toEqual(["~~~\n---\n~~~"])
    // A fence of backticks does not close one of tildes.
    expect(slidesOf("~~~\n```\n---\n~~~\n---\nB")).toEqual([
      "~~~\n```\n---\n~~~",
      "B",
    ])
  })
})

describe("templates", () => {
  it("each have a name, a file and some text, dated where they need it", () => {
    const list = templates("2026-10-24")
    expect(new Set(list.map((one) => one.id)).size).toBe(list.length)
    for (const one of list) expect(one.text.trim()).not.toBe("")
    expect(list.find((one) => one.id === "meeting")!.file).toBe(
      "meeting-2026-10-24.md"
    )
    expect(templates()[0].name).toBe("README")
  })
})

describe("table of contents", () => {
  const headings = [
    { level: 1, text: "Title", id: "title", line: 0 },
    { level: 2, text: "Install [now]", id: "install-now", line: 2 },
    { level: 3, text: "Linux", id: "linux", line: 4 },
    { level: 4, text: "Deep", id: "deep", line: 6 },
  ]

  it("lists the second and third levels as links", () => {
    expect(tocFor(headings)).toBe(
      "- [Install \\[now\\]](#install-now)\n  - [Linux](#linux)"
    )
    expect(tocFor([{ level: 3, text: "A", id: "a", line: 0 }])).toBe(
      "- [A](#a)"
    )
  })

  it("is written at the cursor, then again in its own place", () => {
    const first = insertToc("# Title\n", { from: 8, to: 8 }, headings)
    const doc = "# Title\n" + first.insert
    expect(doc).toContain(`${TOC_START}\n\n- [Install`)
    expect(first.anchor).toBe(doc.length)
    const again = insertToc(doc + "\nMore", { from: 0, to: 0 }, [])
    expect(again.insert).toBe(
      `${TOC_START}\n\n_No headings yet._\n\n${TOC_END}`
    )
    expect(again.from).toBe(doc.indexOf(TOC_START))
    expect(insertToc("text", { from: 4, to: 4 }, []).insert).toMatch(/^\n\n/)
  })
})
