import { describe, expect, it } from "vitest"
import { draftSize, MOST_DOCUMENTS, MOST_VERSIONS, readDraft } from "./draft"

const doc = (id: string, extra: object = {}) => ({
  id,
  name: null,
  text: "# Hi",
  saved: "",
  pictures: [],
  versions: [],
  ...extra,
})

describe("readDraft", () => {
  it("reads back a draft as it was kept", () => {
    const bytes = new ArrayBuffer(4)
    const draft = {
      version: 1,
      active: "b",
      documents: [
        doc("a"),
        doc("b", {
          name: "notes.md",
          pictures: [{ name: "pictures/a.png", type: "image/png", bytes }],
          versions: [{ at: 1, label: "Saved", text: "x" }],
        }),
      ],
    }
    expect(readDraft(draft)).toEqual(draft)
  })

  it("leaves out what is not a draft, a document, a picture or a version", () => {
    expect(readDraft(null)).toBeNull()
    expect(readDraft([])).toBeNull()
    expect(readDraft({ version: 2, documents: [doc("a")] })).toBeNull()
    expect(readDraft({ version: 1, documents: "x" })).toBeNull()
    expect(readDraft({ version: 1, documents: [1, { id: 2 }] })).toBeNull()
    const read = readDraft({
      version: 1,
      active: "missing",
      documents: [
        doc("a", {
          name: 5,
        }),
        doc("b", {
          pictures: [
            1,
            {
              name: "../evil.png",
              type: "image/png",
              bytes: new ArrayBuffer(1),
            },
            {
              name: "pictures/a.png",
              type: "text/html",
              bytes: new ArrayBuffer(1),
            },
            { name: "pictures/b.png", type: "image/png", bytes: "no" },
          ],
          versions: [
            1,
            { at: Infinity, label: "x", text: "" },
            { at: 1, label: 2 },
          ],
        }),
        doc("c", { pictures: "x", versions: "x", text: 1 }),
        doc("d", { pictures: "x", versions: "x" }),
      ],
    })!
    expect(read.documents.map((one) => one.id)).toEqual(["b", "d"])
    expect(read.active).toBe("b")
    expect(read.documents[0].pictures).toEqual([])
    expect(read.documents[0].versions).toEqual([])
  })

  it("keeps at most so many documents and versions", () => {
    const many = readDraft({
      version: 1,
      active: "0",
      documents: Array.from({ length: MOST_DOCUMENTS + 3 }, (_, index) =>
        doc(String(index), {
          versions: Array.from({ length: MOST_VERSIONS + 2 }, (_, at) => ({
            at,
            label: "v",
            text: "",
          })),
        })
      ),
    })!
    expect(many.documents).toHaveLength(MOST_DOCUMENTS)
    expect(many.documents[0].versions).toHaveLength(MOST_VERSIONS)
    expect(many.documents[0].versions[0].at).toBe(2)
  })

  it("measures what it takes", () => {
    expect(
      draftSize({
        version: 1,
        active: "a",
        documents: [
          {
            ...doc("a"),
            text: "ab",
            saved: "a",
            pictures: [
              {
                name: "pictures/a.png",
                type: "image/png",
                bytes: new ArrayBuffer(10),
              },
            ],
            versions: [{ at: 1, label: "", text: "abcd" }],
          },
        ],
      })
    ).toBe(6 + 8 + 10)
  })
})
