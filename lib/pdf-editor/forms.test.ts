import { describe, expect, it } from "vitest"
import {
  accepts,
  chosenOf,
  dateFormat,
  fillable,
  formLine,
  inOrder,
  labelOf,
  listRows,
  LONGEST_VALUE,
  readDate,
  readFieldOp,
  stepName,
  unfilled,
  writeDate,
  type FormField,
} from "./forms"

const field = (change: Partial<FormField> = {}): FormField => ({
  id: "f1",
  kind: "text",
  name: "name",
  label: "Name",
  box: { x: 0, y: 0, width: 100, height: 20 },
  value: "",
  on: false,
  options: [],
  shown: [],
  required: false,
  readOnly: false,
  multiline: false,
  password: false,
  comb: false,
  maxLength: 0,
  multiple: false,
  custom: false,
  date: null,
  ...change,
})

describe("what a field is called", () => {
  it("uses the hint its file gives", () => {
    expect(labelOf("f1", "  Your full name ")).toBe("Your full name")
  })

  it("makes a name readable when there is no hint", () => {
    expect(labelOf("person.first_name")).toBe("First name")
    expect(labelOf("form1[0].Page1[0].DateOfBirth[0]")).toBe("Date Of Birth")
    expect(labelOf("total-due")).toBe("Total due")
    expect(labelOf("x")).toBe("X")
  })

  it("has a word for a field without a name", () => {
    expect(labelOf("")).toBe("Field")
    expect(labelOf("a.[0]")).toBe("A")
    expect(labelOf("__")).toBe("Field")
  })
})

describe("dates", () => {
  it("reads the way a field writes dates from its script, without running it", () => {
    expect(dateFormat('AFDate_FormatEx("dd/mm/yyyy");')).toBe("dd/mm/yyyy")
    expect(dateFormat("AFDate_FormatEx( 'mmm d, yyyy' )")).toBe("mmm d, yyyy")
    expect(dateFormat("AFDate_Format(2);")).toBe("mm/dd/yy")
    expect(dateFormat("AFDate_Format( 11 )")).toBe("mmmm d, yyyy")
  })

  it("leaves alone what is not a whole date", () => {
    expect(dateFormat("")).toBeNull()
    expect(dateFormat("AFNumber_Format(2, 0, 0, 0, '', true);")).toBeNull()
    // No day, no year, a time of day, a number with no format.
    expect(dateFormat('AFDate_FormatEx("mm/yy")')).toBeNull()
    expect(dateFormat("AFDate_Format(0)")).toBeNull()
    expect(dateFormat('AFDate_FormatEx("dd/mm/yyyy HH:MM")')).toBeNull()
    expect(dateFormat("AFDate_Format(99)")).toBeNull()
  })

  it("writes a day the way a field does", () => {
    expect(writeDate("2026-10-02", "dd/mm/yyyy")).toBe("02/10/2026")
    expect(writeDate("2026-10-02", "m/d/yy")).toBe("10/2/26")
    expect(writeDate("2026-03-09", "mmm d, yyyy")).toBe("Mar 9, 2026")
    expect(writeDate("2026-03-09", "d mmmm yyyy")).toBe("9 March 2026")
    expect(writeDate("0987-03-09", "yyyy-mm-dd")).toBe("0987-03-09")
  })

  it("writes nothing for what is not a day", () => {
    expect(writeDate("", "dd/mm/yyyy")).toBe("")
    expect(writeDate("2026-02-30", "dd/mm/yyyy")).toBe("")
    expect(writeDate("02/10/2026", "dd/mm/yyyy")).toBe("")
  })

  it("reads back what it wrote", () => {
    for (const format of [
      "dd/mm/yyyy",
      "m/d/yy",
      "mmm d, yyyy",
      "d mmmm yyyy",
      "yyyy-mm-dd",
      "dd.mm.yy",
    ])
      expect(readDate(writeDate("2026-10-02", format), format)).toBe(
        "2026-10-02"
      )
    expect(readDate(" 2 october 2026 ", "d mmmm yyyy")).toBe("2026-10-02")
  })

  it("reads nothing from what is not a date in that form", () => {
    expect(readDate("", "dd/mm/yyyy")).toBe("")
    expect(readDate("tomorrow", "dd/mm/yyyy")).toBe("")
    expect(readDate("31/02/2026", "dd/mm/yyyy")).toBe("")
    expect(readDate("2 Octember 2026", "d mmmm yyyy")).toBe("")
    expect(readDate("2 Octo 2026", "d mmm yyyy")).toBe("")
  })
})

describe("the order fields are gone through", () => {
  const at = (id: string, x: number, y: number, height = 20) => ({
    id,
    box: { x, y, width: 50, height },
  })

  it("goes along a row, then down", () => {
    const fields = [
      at("d", 200, 100),
      at("a", 10, 12),
      at("c", 10, 104),
      at("b", 200, 8),
    ]
    expect(inOrder(fields).map((one) => one.id)).toEqual(["a", "b", "c", "d"])
    // The list it was given is left as it was.
    expect(fields[0].id).toBe("d")
  })

  it("starts a row for a field whose middle is under the row's first", () => {
    const fields = [at("a", 100, 0), at("b", 0, 15), at("c", 50, 5, 4)]
    expect(inOrder(fields).map((one) => one.id)).toEqual(["c", "a", "b"])
    expect(inOrder([])).toEqual([])
  })
})

describe("what a field takes", () => {
  it("keeps a line a line, and breaks only where a field has lines", () => {
    expect(accepts(field(), "one\r\ntwo\nthree")).toBe("one two three")
    expect(accepts(field({ multiline: true }), "one\r\ntwo\rthree")).toBe(
      "one\ntwo\nthree"
    )
  })

  it("takes no more letters than a field has room for, counted as letters", () => {
    expect(accepts(field({ maxLength: 3 }), "abcdef")).toBe("abc")
    expect(accepts(field({ maxLength: 2 }), "😀😀😀")).toBe("😀😀")
    expect(accepts(field({ maxLength: 9 }), "abc")).toBe("abc")
  })

  it("takes from a drop-down what it offers, or anything when it says so", () => {
    const choice = field({ kind: "choice", options: ["Red", "Blue"] })
    expect(accepts(choice, "Blue")).toBe("Blue")
    expect(accepts(choice, "")).toBe("")
    expect(accepts(choice, "Green")).toBeNull()
    expect(accepts({ ...choice, custom: true }, "Green\nish")).toBe("Green ish")
  })

  it("takes one option of a list, or several when the list does", () => {
    const list = field({ kind: "list", options: ["A", "B", "C"] })
    expect(accepts(list, "B")).toBe("B")
    expect(accepts(list, "B\nC")).toBe("B")
    expect(accepts(list, "")).toBe("")
    expect(accepts(list, "D")).toBeNull()
    expect(accepts({ ...list, multiple: true }, "C\nA\nC\n")).toBe("C\nA")
    expect(chosenOf({ ...list, value: "C\nA" })).toEqual(["C", "A"])
    expect(chosenOf(list)).toEqual([])
  })

  it("takes nothing where nothing is to be filled in", () => {
    expect(accepts(field({ readOnly: true }), "a")).toBeNull()
    expect(accepts(field({ kind: "signature" }), "a")).toBeNull()
    expect(accepts(field({ kind: "button" }), "a")).toBeNull()
    expect(accepts(field({ kind: "check" }), "a")).toBeNull()
    expect(fillable(field())).toBe(true)
    expect(fillable(field({ kind: "check" }))).toBe(true)
  })
})

describe("a change as it arrives", () => {
  it("reads filling in and turning on", () => {
    expect(
      readFieldOp({ do: "fill", page: 2, id: "f14", value: "Ada", more: 1 })
    ).toEqual({ do: "fill", page: 2, id: "f14", value: "Ada" })
    expect(readFieldOp({ do: "turn", page: 0, id: "f3", on: false })).toEqual({
      do: "turn",
      page: 0,
      id: "f3",
      on: false,
    })
  })

  it("refuses what is not a change to a field", () => {
    for (const value of [
      null,
      "fill",
      { do: "fill", page: -1, id: "f1", value: "" },
      { do: "fill", page: 1.5, id: "f1", value: "" },
      { do: "fill", page: 0, id: "c1", value: "" },
      { do: "fill", page: 0, id: 1, value: "" },
      { do: "fill", page: 0, id: "f1", value: 3 },
      { do: "fill", page: 0, id: "f1", value: "a".repeat(LONGEST_VALUE + 1) },
      { do: "turn", page: 0, id: "f1", on: "yes" },
      { do: "remove", page: 0, id: "f1" },
    ])
      expect(readFieldOp(value)).toBeNull()
  })
})

describe("what a step is called", () => {
  const fill = (value: string) =>
    ({ do: "fill", page: 0, id: "f1", value }) as const
  const turn = (on: boolean) => ({ do: "turn", page: 0, id: "f1", on }) as const

  it("names the field and what was done to it", () => {
    expect(stepName(field(), fill("Ada"))).toBe("Fill in Name")
    expect(stepName(field(), fill(""))).toBe("Clear Name")
    expect(stepName(field({ kind: "choice" }), fill("Red"))).toBe("Choose Name")
    expect(stepName(field({ kind: "list" }), fill(""))).toBe("Clear Name")
    expect(stepName(field({ kind: "check" }), turn(true))).toBe("Tick Name")
    expect(stepName(field({ kind: "check" }), turn(false))).toBe("Clear Name")
    expect(stepName(field({ kind: "radio" }), turn(true))).toBe("Choose Name")
  })
})

describe("what is still missing", () => {
  const must = (change: Partial<FormField>) =>
    field({ required: true, ...change })

  it("lists the fields that must be filled in and are empty, in order", () => {
    const pages = [
      [
        must({
          id: "f2",
          name: "b",
          label: "B",
          box: { x: 0, y: 50, width: 9, height: 9 },
        }),
        must({ id: "f1", name: "a", label: "A" }),
        must({ id: "f3", name: "c", label: "C", value: "filled" }),
        field({ id: "f4", name: "d" }),
        must({ id: "f5", name: "e", readOnly: true }),
        must({ id: "f6", name: "sig", kind: "signature" }),
      ],
      [
        must({ id: "f7", name: "agree", label: "Agree", kind: "check" }),
        must({ id: "f8", name: "ok", kind: "check", on: true }),
        must({ id: "f9", name: "blank", label: "Blank", value: "  " }),
      ],
    ]
    expect(unfilled(pages)).toEqual([
      { page: 0, id: "f1", label: "A" },
      { page: 0, id: "f2", label: "B" },
      { page: 1, id: "f7", label: "Agree" },
      { page: 1, id: "f9", label: "Blank" },
    ])
  })

  it("counts round buttons of one name, and a field shown twice, once", () => {
    const radio = (id: string, name: string, on = false) =>
      must({ id, name, label: name, kind: "radio", on })
    const pages = [
      [radio("f1", "colour"), radio("f2", "colour"), radio("f3", "size")],
      [radio("f4", "size", true), must({ id: "f5", name: "n", label: "N" })],
      [must({ id: "f6", name: "n", label: "N" })],
    ]
    expect(unfilled(pages)).toEqual([
      { page: 0, id: "f1", label: "colour" },
      { page: 1, id: "f5", label: "N" },
    ])
  })

  it("says how much there is to fill in and what is missing", () => {
    expect(formLine([[]])).toBe("")
    expect(formLine([[field({ kind: "button" })]])).toBe("")
    expect(formLine([[field()]])).toBe("1 field to fill in.")
    // Round buttons of one name, and a field shown twice, are one field.
    expect(
      formLine([
        [
          field({ kind: "radio", name: "r" }),
          field({ kind: "radio", name: "r" }),
        ],
        [field({ name: "r2" }), field({ name: "r2" })],
      ])
    ).toBe("2 fields to fill in.")
    expect(
      formLine([[field(), must({ name: "b" })], [must({ name: "c" })]])
    ).toBe("3 fields to fill in. 2 that must be filled in are still empty.")
    expect(formLine([[field(), must({ name: "b" })]])).toBe(
      "2 fields to fill in. 1 that must be filled in is still empty."
    )
  })
})

describe("how a list is drawn", () => {
  const options = ["A", "B", "C", "D", "E", "F"]

  it("gives every option a line when they fit", () => {
    const { size, line, rows } = listRows(
      { options: ["A", "B", "C"], value: "B" },
      60
    )
    expect(line).toBe(14)
    expect(size).toBeCloseTo(11.48)
    expect(rows).toEqual([
      { text: "A", top: 1, chosen: false },
      { text: "B", top: 15, chosen: true },
      { text: "C", top: 29, chosen: false },
    ])
  })

  it("makes the lines smaller before it leaves any out", () => {
    const { line, rows } = listRows({ options, value: "" }, 62)
    expect(line).toBe(10)
    expect(rows).toHaveLength(6)
  })

  it("starts at the first chosen one when not all fit", () => {
    const tight = listRows({ options, value: "E\nB" }, 26)
    expect(tight.line).toBe(8)
    expect(tight.rows.map((row) => row.text)).toEqual(["B", "C", "D"])
    expect(tight.rows.map((row) => row.chosen)).toEqual([true, false, false])
    // The last ones are shown to the end of the list, not past it.
    expect(
      listRows({ options, value: "F" }, 26).rows.map((row) => row.text)
    ).toEqual(["D", "E", "F"])
    expect(
      listRows({ options, value: "" }, 26).rows.map((row) => row.text)
    ).toEqual(["A", "B", "C"])
  })

  it("draws a list with nothing in it, and one too low for a line", () => {
    expect(listRows({ options: [], value: "" }, 40)).toMatchObject({
      line: 14,
      rows: [],
    })
    expect(listRows({ options, value: "" }, 4).rows).toHaveLength(1)
  })
})
