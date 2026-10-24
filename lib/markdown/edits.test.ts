import { describe, expect, it } from "vitest"
import {
  insertCodeBlock,
  insertLink,
  insertRule,
  insertTable,
  linesOf,
  toggleLines,
  toggleMark,
  type Edit,
} from "./edits"

/** The text after an edit, with the selection marked as [ and ]. */
function after(doc: string, edit: Edit) {
  const text = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
  const [a, b] = [edit.anchor, edit.head].sort((x, y) => x - y)
  return text.slice(0, a) + "[" + text.slice(a, b) + "]" + text.slice(b)
}

describe("toggleMark", () => {
  it("wraps a selection, and a placeholder where nothing is selected", () => {
    expect(
      after(
        "make it bold",
        toggleMark("make it bold", { from: 8, to: 12 }, "bold")
      )
    ).toBe("make it **[bold]**")
    expect(after("", toggleMark("", { from: 0, to: 0 }, "italic"))).toBe(
      "_[italic text]_"
    )
    expect(after("x", toggleMark("x", { from: 1, to: 1 }, "code"))).toBe(
      "x`[code]`"
    )
    expect(after("old", toggleMark("old", { from: 0, to: 3 }, "strike"))).toBe(
      "~~[old]~~"
    )
  })

  it("takes marks away from inside or just outside the selection", () => {
    expect(
      after("a **b** c", toggleMark("a **b** c", { from: 4, to: 5 }, "bold"))
    ).toBe("a [b] c")
    expect(
      after("a **b** c", toggleMark("a **b** c", { from: 2, to: 7 }, "bold"))
    ).toBe("a [b] c")
  })

  it("reads nothing before the start of the text", () => {
    expect(after("*x**", toggleMark("*x**", { from: 1, to: 2 }, "bold"))).toBe(
      "***[x]****"
    )
  })
})

describe("insertLink", () => {
  it("makes the selection the words of a link and selects its address", () => {
    expect(after("see docs", insertLink("see docs", { from: 4, to: 8 }))).toBe(
      "see [docs]([https://])"
    )
  })

  it("selects the words of a new link", () => {
    expect(after("", insertLink("", { from: 0, to: 0 }))).toBe(
      "[[link text]](https://)"
    )
  })

  it("makes a selected address the link's target", () => {
    expect(
      after(
        "https://example.com",
        insertLink("https://example.com", { from: 0, to: 19 })
      )
    ).toBe("[[]](https://example.com)")
  })
})

describe("toggleLines", () => {
  it("finds the whole lines a selection touches", () => {
    expect(linesOf("ab\ncd\nef", { from: 4, to: 4 })).toEqual({
      from: 3,
      to: 5,
    })
    expect(linesOf("ab\ncd\nef", { from: 1, to: 3 })).toEqual({
      from: 0,
      to: 2,
    })
    expect(linesOf("ab\ncd", { from: 4, to: 5 })).toEqual({ from: 3, to: 5 })
  })

  it("makes lines headings, and plain again", () => {
    const doc = "Title\nbody"
    expect(after(doc, toggleLines(doc, { from: 2, to: 2 }, "h2"))).toBe(
      "## Title[]\nbody"
    )
    const titled = "## Title"
    expect(after(titled, toggleLines(titled, { from: 3, to: 3 }, "h2"))).toBe(
      "Title[]"
    )
    expect(after(titled, toggleLines(titled, { from: 3, to: 3 }, "h1"))).toBe(
      "# Title[]"
    )
  })

  it("numbers list items, keeps indentation and blank lines", () => {
    const doc = "a\n\n  b\nc"
    expect(
      after(doc, toggleLines(doc, { from: 0, to: doc.length }, "number"))
    ).toBe("[1. a\n\n  2. b\n3. c]")
  })

  it("turns one kind of list into another, and a task list back", () => {
    const doc = "- a\n- b"
    expect(after(doc, toggleLines(doc, { from: 0, to: 7 }, "task"))).toBe(
      "[- [ ] a\n- [ ] b]"
    )
    const tasks = "- [x] a\n- [ ] b"
    expect(after(tasks, toggleLines(tasks, { from: 0, to: 15 }, "task"))).toBe(
      "[a\nb]"
    )
    expect(
      after(tasks, toggleLines(tasks, { from: 0, to: 15 }, "bullet"))
    ).toBe("[- a\n- b]")
    const bullets = "* a\n+ b"
    expect(
      after(bullets, toggleLines(bullets, { from: 0, to: 7 }, "bullet"))
    ).toBe("[a\nb]")
  })

  it("lays a quote over what is there, and takes it away", () => {
    const doc = "- a"
    expect(after(doc, toggleLines(doc, { from: 0, to: 0 }, "quote"))).toBe(
      "> - a[]"
    )
    const quoted = ">a\n> b"
    expect(
      after(quoted, toggleLines(quoted, { from: 0, to: 6 }, "quote"))
    ).toBe("[a\nb]")
  })

  it("adds a mark to an empty line", () => {
    expect(after("", toggleLines("", { from: 0, to: 0 }, "bullet"))).toBe("[]")
    expect(after("  ", toggleLines("  ", { from: 0, to: 0 }, "h3"))).toBe(
      "  []"
    )
  })
})

describe("blocks", () => {
  it("sets a code block apart by blank lines", () => {
    expect(after("a", insertCodeBlock("a", { from: 1, to: 1 }))).toBe(
      "a\n\n```\n[]\n```"
    )
    expect(after("a\n", insertCodeBlock("a\n", { from: 2, to: 2 }))).toBe(
      "a\n\n```\n[]\n```"
    )
    expect(after("a\n\nb", insertCodeBlock("a\n\nb", { from: 3, to: 4 }))).toBe(
      "a\n\n```\n[b]\n```"
    )
  })

  it("does not add blank lines where they are already", () => {
    expect(after("", insertRule("", { from: 0, to: 0 }))).toBe("---[]")
    expect(
      after("a\n\n\n\nb", insertRule("a\n\n\n\nb", { from: 3, to: 3 }))
    ).toBe("a\n\n---[]\n\nb")
    expect(after("\nb", insertRule("\nb", { from: 1, to: 1 }))).toBe(
      "\n---[]\n\nb"
    )
    expect(after("ab", insertRule("ab", { from: 1, to: 1 }))).toBe(
      "a\n\n---[]\n\nb"
    )
  })

  it("adds only the line break a block needs after it", () => {
    expect(after("a\nb", insertRule("a\nb", { from: 1, to: 1 }))).toBe(
      "a\n\n---[]\n\nb"
    )
  })

  it("inserts a table with its first heading selected", () => {
    expect(after("", insertTable("", { from: 0, to: 0 }))).toBe(
      [
        "| [Column 1] | Column 2 | Column 3 |",
        "| -------- | -------- | -------- |",
        "|          |          |          |",
        "|          |          |          |",
      ].join("\n")
    )
  })
})
