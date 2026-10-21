import { describe, expect, it } from "vitest"
import { answer, runJob } from "./jobs"

describe("the JSON worker's jobs", () => {
  it("does every kind of job", () => {
    const input = '{"a":[1,2],"b":{"c":"x"}}'
    expect(runJob({ action: "inspect", input }).stats?.nodes).toBe(6)
    expect(
      runJob({ action: "transform", input, transform: "minify" }).output
    ).toBe(input)
    expect(
      runJob({ action: "query", input, query: "$.a[*]", mode: "jsonpath" })
        .count
    ).toBe(2)
    const compared = runJob({ action: "compare", input, other: '{"a":[1]}' })
    expect(compared.changes!.length).toBeGreaterThan(0)
    expect(compared.output).toBe(compared.patch)
    expect(compared.note).toMatch(/ignore key order/)
    expect(
      runJob({
        action: "patch",
        input,
        patch: '[{"op":"remove","path":"/b"}]',
      }).output
    ).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}')
    expect(
      runJob({ action: "schema", input, schema: '{"type":"object"}' }).valid
    ).toBe(true)
    expect(
      runJob({ action: "convert", input, format: "json-yaml" }).extension
    ).toBe("yaml")
    const table = runJob({
      action: "table",
      input: JSON.stringify(Array.from({ length: 120 }, (_, n) => ({ n }))),
    }).table!
    expect([table.rows.length, table.total]).toEqual([100, 120])
    expect(runJob({ action: "value", input, pointer: "/b/c" }).output).toBe(
      '"x"'
    )
  })

  it("answers with the result, or the problem and where it is", () => {
    expect(
      answer(1, { action: "transform", input: "[]", transform: "minify" })
    ).toEqual({ id: 1, result: { output: "[]" } })
    expect(
      answer(2, { action: "transform", input: "[", transform: "format" })
    ).toMatchObject({ id: 2, offset: 1 })
    const plain = answer(3, {
      action: "query",
      input: "[]",
      query: "nope",
      mode: "jsonpath",
    })
    expect(plain).toMatchObject({ id: 3 })
    expect("offset" in plain).toBe(false)
  })
})
