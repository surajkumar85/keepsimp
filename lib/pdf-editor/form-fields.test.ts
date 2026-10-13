import { describe, expect, it } from "vitest"
import {
  DATE_ACTION,
  MAKE_KINDS,
  defaultSpec,
  fitField,
  initialField,
  nameTaken,
  offeredName,
  readFieldBox,
  readFieldSpec,
  readMakeFieldOp,
  validName,
} from "./form-fields"

const box = { x: 10, y: 20, width: 180, height: 24 }
const spec = defaultSpec("text")
describe("checked form creation", () => {
  it("reads each kind without trusting extra values or scripts", () => {
    for (const kind of MAKE_KINDS) {
      const s = defaultSpec(kind)
      expect(readFieldSpec({ ...s, script: "run()" })).toEqual(s)
      expect(offeredName(kind, [s.name])).not.toBe(s.name)
      expect(readFieldSpec(s)!.options).not.toBe(s.options)
      expect(
        initialField(kind, { width: 300, height: 400 }, { x: 100, y: 100 })
          .width
      ).toBe(kind === "check" ? 20 : 180)
    }
    expect(DATE_ACTION).toBe('AFDate_FormatEx("yyyy-mm-dd");')
  })
  it("refuses invalid names, definitions, limits and choices", () => {
    for (const v of [
      null,
      false,
      "field",
      {},
      { ...spec, kind: "unknown" },
      { ...spec, name: "" },
      { ...spec, tooltip: "x".repeat(301) },
      { ...spec, tooltip: "\n" },
      { ...spec, required: 1 },
      { ...spec, maxLength: -1 },
      { ...spec, maxLength: 1.1 },
      { ...spec, maxLength: 100001 },
      { ...spec, multiple: "yes" },
      { ...spec, options: null },
      { ...spec, options: ["x"] },
      { ...defaultSpec("radio"), options: ["x"] },
      { ...defaultSpec("choice"), options: [] },
      { ...defaultSpec("list"), options: ["x", "x"] },
      { ...spec, options: [null] },
      { ...spec, options: [""] },
      { ...spec, options: ["x".repeat(201)] },
      { ...spec, options: ["\n"] },
      { ...spec, options: Array.from({ length: 101 }, (_, i) => String(i)) },
    ])
      expect(readFieldSpec(v)).toBeNull()
    for (const name of [null, "", " spaced ", "a.b", "\n", "x".repeat(101)])
      expect(validName(name)).toBe(false)
    expect(validName("Full name")).toBe(true)
  })
  it("reads only known operations and finite boxes", () => {
    for (const op of [
      { do: "add", page: 0, box, field: spec },
      { do: "reshape", page: 0, id: "f12", box },
      { do: "delete", page: 0, id: "f12" },
      {
        do: "properties",
        page: 0,
        id: "f12",
        name: "Name",
        tooltip: "Full name",
        required: true,
        maxLength: 20,
      },
    ])
      expect(readMakeFieldOp({ ...op, extra: 1 })).toEqual(op)
    for (const v of [
      null,
      "x",
      {},
      { page: -1 },
      { page: 1.1 },
      { do: "delete", page: 0, id: 1 },
      { do: "delete", page: 0, id: "a" },
      { do: "unknown", page: 0, id: "f1" },
      { do: "add", page: 0, box: null, field: spec },
      { do: "add", page: 0, box, field: {} },
      { do: "reshape", page: 0, id: "f1", box: {} },
    ])
      expect(readMakeFieldOp(v)).toBeNull()
    const props = {
      do: "properties",
      page: 0,
      id: "f1",
      name: "Name",
      tooltip: "",
      required: false,
      maxLength: 0,
    }
    for (const update of [
      { name: "" },
      { tooltip: null },
      { required: null },
      { maxLength: -1 },
    ])
      expect(readMakeFieldOp({ ...props, ...update })).toBeNull()
    for (const b of [
      null,
      "x",
      {},
      { ...box, x: NaN },
      { ...box, y: -1 },
      { ...box, x: -1 },
      { ...box, width: 0 },
      { ...box, height: 0 },
      { ...box, width: Infinity },
      { ...box, x: 100001 },
      { ...box, y: "1" },
    ])
      expect(readFieldBox(b)).toBeNull()
    expect(readFieldBox({ ...box, unused: true })).toEqual(box)
  })
  it("offers unique names and keeps moved and resized fields on the page", () => {
    expect(nameTaken(["Name"], "Name")).toBe(true)
    expect(nameTaken(["Name"], "Name", "Name")).toBe(false)
    expect(nameTaken(["Name.child"], "Name")).toBe(true)
    expect(nameTaken(["Name"], "Name.child")).toBe(true)
    expect(nameTaken(["Other"], "Name")).toBe(false)
    expect(
      fitField(
        { x: -20, y: 500, width: 400, height: 1 },
        { width: 300, height: 400 }
      )
    ).toEqual({ x: 0, y: 392, width: 300, height: 8 })
    expect(fitField(box, { width: 300, height: 400 })).toEqual(box)
  })
})
