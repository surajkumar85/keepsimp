import { describe, expect, it } from "vitest"
import { formatJson } from "./json-tools"

describe("JSON formatting without data changes", () => {
  it("formats nested objects and arrays with two spaces", () => {
    expect(formatJson('{"a":[1,{"b":true}],"empty":{}}')).toBe(
      '{\n  "a": [\n    1,\n    {\n      "b": true\n    }\n  ],\n  "empty": {}\n}'
    )
  })
  it("preserves numbers beyond JavaScript precision and exponent spelling", () => {
    const value = '{"id":9007199254740993,"amount":1.2300e+99,"negative":-0}'
    expect(formatJson(value)).toContain("9007199254740993")
    expect(formatJson(value)).toContain("1.2300e+99")
    expect(formatJson(value, true)).toBe(value)
  })
  it("preserves escaped strings, commas in strings, spaces and duplicate keys", () => {
    const value = '{ "word":"a, b \\" quote", "word":"\\u0061" }'
    expect(formatJson(value, true)).toBe(
      '{"word":"a, b \\" quote","word":"\\u0061"}'
    )
  })
  it.each(["[]", "{}", "null", "true", '"hello"', "42"])(
    "handles a valid root %s",
    (value) => {
      expect(formatJson(value)).toBe(value)
    }
  )
  it.each(["", " \n "])("rejects empty input", (value) =>
    expect(() => formatJson(value)).toThrow("Add some JSON")
  )
  it.each(['{"a":}', "[1,]", "undefined", "{a:1}"])(
    "rejects invalid syntax %s",
    (value) => expect(() => formatJson(value)).toThrow("not valid")
  )
  it("rejects oversized content before trying to parse it", () =>
    expect(() => formatJson(" ".repeat(1_000_001))).toThrow("1 million"))
  it("limits formatting depth to avoid excessive output allocation", () => {
    expect(() => formatJson("[".repeat(101) + "0" + "]".repeat(101))).toThrow(
      "deeply nested"
    )
    expect(() =>
      formatJson("[".repeat(100) + "0" + "]".repeat(100))
    ).not.toThrow()
  })
})
