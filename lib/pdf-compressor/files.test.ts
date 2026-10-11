import { describe, expect, it } from "vitest"
import type { FileFacts } from "@/lib/pdf-merger/files"
import { desktopLimits } from "@/lib/pdf-merger/settings"
import {
  admitFiles,
  compressReducer,
  noFiles,
  refusalNotice,
  type CompressState,
} from "./files"

const item = (id: string) => ({
  id,
  file: new Blob(["x"]),
  name: `${id}.pdf`,
  size: 10,
})
const facts = { pages: 3 } as FileFacts
const withFiles = (...ids: string[]) =>
  compressReducer(noFiles, { type: "add", items: ids.map(item) })
const fileOf = (state: CompressState, id: string) =>
  state.files.find((file) => file.id === id)!

describe("compressReducer", () => {
  it("adds files as being read, and shows the first", () => {
    const state = withFiles("a", "b")
    expect(state.files.map((file) => file.status)).toEqual([
      "reading",
      "reading",
    ])
    expect(state.active).toBe("a")
    // More files do not change which one is shown.
    expect(
      compressReducer(state, { type: "add", items: [item("c")] }).active
    ).toBe("a")
    expect(compressReducer(noFiles, { type: "add", items: [] })).toEqual(
      noFiles
    )
  })

  it("takes in what was found out about a file", () => {
    let state = withFiles("a", "b")
    state = compressReducer(state, { type: "opened", id: "a", facts })
    expect(fileOf(state, "a")).toMatchObject({ status: "ready", facts })
    expect(fileOf(state, "b").status).toBe("reading")
    state = compressReducer(state, { type: "audit", id: "a", audit: null })
    expect(fileOf(state, "a").audit).toBeNull()
    state = compressReducer(state, {
      type: "failed",
      id: "b",
      message: "Unreadable.",
    })
    expect(fileOf(state, "b")).toMatchObject({
      status: "error",
      error: "Unreadable.",
    })
  })

  it("keeps a password only once it has opened the file", () => {
    let state = withFiles("a")
    state = compressReducer(state, { type: "locked", id: "a", wrong: false })
    expect(fileOf(state, "a")).toMatchObject({
      status: "locked",
      wrongPassword: false,
    })
    state = compressReducer(state, {
      type: "unlocking",
      id: "a",
      password: "guess",
    })
    expect(fileOf(state, "a")).toMatchObject({
      status: "reading",
      password: "guess",
    })
    state = compressReducer(state, { type: "locked", id: "a", wrong: true })
    expect(fileOf(state, "a")).toMatchObject({
      wrongPassword: true,
      password: undefined,
    })
    state = compressReducer(state, {
      type: "unlocking",
      id: "a",
      password: "right",
    })
    state = compressReducer(state, { type: "opened", id: "a", facts })
    expect(fileOf(state, "a")).toMatchObject({
      status: "ready",
      password: "right",
      wrongPassword: false,
    })
  })

  it("shows a neighbour when the file shown is removed", () => {
    const state = withFiles("a", "b", "c")
    expect(compressReducer(state, { type: "remove", id: "a" })).toMatchObject({
      active: "b",
    })
    const last = compressReducer(state, { type: "activate", id: "c" })
    expect(compressReducer(last, { type: "remove", id: "c" }).active).toBe("b")
    // Removing another file changes nothing about which is shown.
    expect(compressReducer(last, { type: "remove", id: "a" }).active).toBe("c")
    expect(compressReducer(state, { type: "remove", id: "nobody" })).toBe(state)
    expect(
      compressReducer(withFiles("a"), { type: "remove", id: "a" })
    ).toEqual(noFiles)
  })

  it("shows the file that is asked for, if it is there", () => {
    const state = withFiles("a", "b")
    expect(compressReducer(state, { type: "activate", id: "b" }).active).toBe(
      "b"
    )
    expect(compressReducer(state, { type: "activate", id: "x" })).toBe(state)
    expect(compressReducer(state, { type: "clear" })).toEqual(noFiles)
  })
})

describe("admitFiles", () => {
  const pdf = (name: string, size = 1000) => ({ name, size, pdf: true })
  const limits = {
    ...desktopLimits,
    files: 3,
    fileBytes: 5000,
    totalBytes: 8000,
  }

  it("takes PDFs that fit", () => {
    expect(admitFiles([], [pdf("a.pdf"), pdf("b.pdf")], limits)).toEqual([
      null,
      null,
    ])
  })

  it("refuses what is empty, not a PDF, or too large", () => {
    const verdicts = admitFiles(
      [],
      [
        pdf("empty.pdf", 0),
        { name: "holiday.mov", size: 10, pdf: false },
        { name: "report.docx", size: 10, pdf: false },
        pdf("huge.pdf", 6000),
      ],
      limits
    )
    expect(verdicts).toEqual([
      "empty.pdf is empty.",
      "holiday.mov is not a PDF.",
      "report.docx is not a PDF. Save or export it as a PDF first, then add that.",
      "huge.pdf is larger than 0 MB.",
    ])
  })

  it("stops at the most files, and at the most they may weigh together", () => {
    expect(
      admitFiles(
        [{ size: 1 }, { size: 1 }],
        [pdf("c.pdf"), pdf("d.pdf")],
        limits
      )
    ).toEqual([
      null,
      "d.pdf was left out: up to 3 files can be compressed at once.",
    ])
    expect(
      admitFiles(
        [{ size: 4000 }],
        [pdf("b.pdf", 3000), pdf("c.pdf", 3000)],
        limits
      )
    ).toEqual([
      null,
      "c.pdf was left out: together the files would be larger than 0 MB.",
    ])
  })
})

describe("refusalNotice", () => {
  it("gives each reason, or a count when there are many", () => {
    expect(refusalNotice([null, null])).toBe("")
    expect(refusalNotice([null, "A.", "B."])).toBe("A. B.")
    expect(refusalNotice(["A.", "B.", "C.", "D."])).toBe(
      "4 files were left out: they are not PDFs, or are too large."
    )
  })
})
