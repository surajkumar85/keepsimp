import { describe, expect, it } from "vitest"
import {
  parseDocument,
  renderJson,
  nodeAt,
  pointerSegments,
  position,
  treeRows,
  uniqueDocument,
  nativeDocument,
  toNative,
  JsonInputError,
  MAX_JSON_CHARACTERS,
} from "./document"
import {
  transformJson,
  inferSchema,
  inferTypeScript,
  jsonPointerFromParts,
} from "./transforms"
import { compareJson, applyJsonPatch } from "./compare"
import { queryJson } from "./query"
import { validateSchema } from "./schema"
import { convertJson, tableData } from "./convert"
import { decimalIdentity, safeNativeNumber, integerToken } from "./numbers"

describe("exact decimal boundaries", () => {
  it.each(["0", "-0", "0.1", "1e3", "1.00", "9007199254740991", "1e-100"])(
    "accepts a lossless native decimal %s",
    (raw) => expect(safeNativeNumber(raw)).toBe(true)
  )
  it.each([
    "9007199254740993",
    "1e400",
    "1e-400",
    "0.100000000000000000001",
    "1.0000000000000001",
    "1e" + "0".repeat(1001),
  ])("rejects numeric loss %s", (raw) => {
    expect(safeNativeNumber(raw)).toBe(false)
    expect(parseDocument(raw).unsafeNumbers).toEqual([""])
    expect(() => nativeDocument(parseDocument(raw))).toThrow(
      "safely representable"
    )
  })
  it.each([
    ["1e3", true],
    ["1.0", true],
    ["0.00", true],
    ["-1e-3", false],
    ["10e-1", true],
    ["0.0001", false],
  ] as const)("infers integer values from %s", (raw, integer) => {
    expect(integerToken(raw)).toBe(integer)
    expect(inferSchema(parseDocument(raw).root)).toEqual({
      type: integer ? "integer" : "number",
    })
  })
  it("normalizes equivalent exact decimals without rounding", () => {
    expect(decimalIdentity("-12.300e+2")).toBe(decimalIdentity("-1230"))
    expect(decimalIdentity("-0e99")).toBe("0")
    expect(() => decimalIdentity("1e" + "9".repeat(1001))).toThrow("exponents")
  })
})

describe("bounded transformations", () => {
  it("bounds amplified output before concatenating selected subtrees", () => {
    const source = '["' + "a".repeat(1_300_000) + '"]'
    expect(() => queryJson(source, "$[0,0,0,0]", "jsonpath")).toThrow(
      "result exceeds"
    )
    expect(() =>
      renderJson({
        type: "object",
        entries: [
          {
            key: "long",
            keyRaw: '"long"',
            node: {
              type: "string",
              raw: '"' + "a".repeat(MAX_JSON_CHARACTERS - 7) + '"',
            },
          },
        ],
      })
    ).toThrow("result exceeds")
  })
  it("rejects oversize encoded and repair candidates before library work", () => {
    for (const action of ["repair", "base64-decode", "url-decode"] as const)
      expect(() =>
        transformJson(" ".repeat(MAX_JSON_CHARACTERS + 1), action)
      ).toThrow("5 million")
  })
  it("rejects reserved TypeScript names", () => {
    for (const name of ["class", "interface", "string", "default"])
      expect(() => inferTypeScript(parseDocument("{}").root, name)).toThrow(
        "valid TypeScript"
      )
  })
  it("bounds intermediate copy expansion even if a later operation would remove it", () => {
    const input = '{"a":[' + "0,".repeat(50_000) + "0]}"
    const patch =
      '[{"op":"copy","from":"/a","path":"/b"},{"op":"remove","path":"/b"}]'
    expect(() => applyJsonPatch(input, patch)).toThrow("100,000 values")
    expect(input).toContain('"a"')
  })
  it("reports malformed library JSONPath syntax and permits question marks in keys", () => {
    expect(() => queryJson("{}", "$[", "jsonpath")).toThrow("Invalid JSONPath")
    expect(
      queryJson('{"?":9007199254740993}', "$['?']", "jsonpath").output
    ).toContain("9007199254740993")
    expect(
      queryJson(
        '{"users":[{"name":"Ada"},{"name":"Grace"}]}',
        "$.users[?length(@.name) == 3].name",
        "jsonpath"
      ).output
    ).toContain('"Ada"')
  })
  it.each(["null", "[]", "42", '"schema"'])(
    "rejects a non-schema root %s",
    (schema) =>
      expect(() => validateSchema("{}", schema)).toThrow("object or a boolean")
  )
  it("limits YAML depth and total values before exporting", () => {
    expect(() =>
      convertJson("[".repeat(102) + "0" + "]".repeat(102), "yaml-json")
    ).toThrow("100 levels")
    expect(() =>
      convertJson("[" + "0,".repeat(100_000) + "0]", "yaml-json")
    ).toThrow("100,000 values")
  }, 20_000)
})

describe("strict JSON with exact numeric tokens", () => {
  it.each([
    "null",
    "true",
    "false",
    '"hello"',
    "42",
    "-0",
    "1e400",
    "[]",
    "{}",
  ])("preserves a root value %s", (input) =>
    expect(renderJson(parseDocument(input).root, "")).toBe(input)
  )
  it.each([
    '{"a":}',
    "[1,]",
    "{a:1}",
    "//comment\n{}",
    "[01]",
    "[1.]",
    "true false",
    '"\\xFF"',
  ])("rejects strict syntax %s", (input) =>
    expect(() => parseDocument(input)).toThrow("not valid")
  )
  it("reports a useful offset, line and column", () => {
    try {
      parseDocument('{\n "a":\n}')
    } catch (error) {
      expect(error).toBeInstanceOf(JsonInputError)
      expect(error).toMatchObject({ line: 3, column: 1, offset: 8 })
    }
    expect(position("a\r\nb\rc\nd", 8)).toEqual({ line: 4, column: 2 })
    expect(new JsonInputError("bad")).toMatchObject({
      offset: 0,
      line: 1,
      column: 1,
    })
  })
  it("measures UTF-8 bytes and detects duplicate/unsafe values", () => {
    const input = '{"a":1,"a":9007199254740993,"é":1e400}'
    const result = parseDocument(input)
    expect(result).toMatchObject({
      characters: input.length,
      bytes: input.length + 1,
      duplicates: ["/a"],
      unsafeNumbers: ["/a", "/é"],
      nodes: 4,
      depth: 1,
    })
    expect(renderJson(result.root, "")).toBe(input)
    expect(() => uniqueDocument(result)).toThrow("Duplicate keys")
    expect(() => nativeDocument(result)).toThrow("Duplicate keys")
    expect(() =>
      nativeDocument(parseDocument('{"id":9007199254740993}'))
    ).toThrow("safely representable")
  })
  it("limits characters, depth and node count", () => {
    expect(() => parseDocument(" ".repeat(MAX_JSON_CHARACTERS + 1))).toThrow(
      "5 million"
    )
    expect(() => parseDocument("[[".repeat(51))).toThrow("100 levels")
    expect(() => parseDocument("}".repeat(1000) + "[".repeat(101))).toThrow(
      "100 levels"
    )
    expect(() => parseDocument("[" + "0,".repeat(100_000) + "0]")).toThrow(
      "100,000 values"
    )
    expect(() => parseDocument(" \n ")).toThrow("Add some JSON")
  })
  it("escapes RFC pointers and prevents inherited property reads", () => {
    const root = parseDocument(
      '{"a/b":{"~":[false]},"__proto__":{"polluted":true}}'
    ).root
    expect(renderJson(nodeAt(root, "/a~1b/~0/0"))).toBe("false")
    expect(nodeAt(root, "")).toBe(root)
    expect(pointerSegments("/a~1b/~0/")).toEqual(["a/b", "~", ""])
    expect(jsonPointerFromParts(["a/b", "~", 0])).toBe("/a~1b/~0/0")
    expect(() => pointerSegments("wrong")).toThrow("JSON Pointer")
    expect(() => pointerSegments("/bad~2")).toThrow("JSON Pointer")
    expect(() => nodeAt(root, "/toString")).toThrow("No value")
    expect(() => nodeAt(root, "/a~1b/~0/00")).toThrow("No value")
    expect(() => nodeAt(root, "/a~1b/~0/1")).toThrow("No value")
    expect(() => nodeAt(root, "/a~1b/~0/0/x")).toThrow("No value")
    const native = toNative(root) as Record<string, unknown>
    expect(Object.getPrototypeOf(native)).toBe(null)
    expect(native.__proto__).toEqual({ polluted: true })
    expect({}).not.toHaveProperty("polluted")
  })
  it("only expands chosen containers and searches/paginates safely", () => {
    const doc = parseDocument(
      '{"nested":{"name":"Ada","empty":{}},"list":[1,2],"flag":null}'
    )
    expect(treeRows(doc).rows.map((row) => row.pointer)).toEqual([
      "",
      "/nested",
      "/list",
      "/flag",
    ])
    expect(treeRows(doc, [""]).total).toBe(4)
    expect(treeRows(doc, ["", "/nested"]).rows).toContainEqual(
      expect.objectContaining({ pointer: "/nested/name", preview: '"Ada"' })
    )
    expect(treeRows(doc, [""], "ada").rows).toHaveLength(1)
    expect(treeRows(doc, [], "missing").total).toBe(0)
    expect(treeRows(doc, [""], "", 2).rows).toHaveLength(2)
    expect(
      treeRows(
        parseDocument(
          "[" + Array.from({ length: 150 }, (_, i) => i).join(",") + "]"
        )
      ).rows
    ).toHaveLength(100)
  })
})
describe("transform previews preserve source data", () => {
  const input = '{"z":[{"b":2,"a":9007199254740993}],"a":"é","zero":-0}'
  it("supports indentation, minification and stable recursive sorting", () => {
    expect(transformJson(input, "format", "    ")).toContain('\n    "z"')
    expect(transformJson(input, "format", "\t")).toContain('\n\t"z"')
    expect(transformJson(input, "minify")).toBe(input)
    expect(transformJson(input, "sort-asc", "")).toBe(
      '{"a":"é","z":[{"a":9007199254740993,"b":2}],"zero":-0}'
    )
    expect(transformJson(input, "sort-desc", "")).toBe(
      '{"zero":-0,"z":[{"b":2,"a":9007199254740993}],"a":"é"}'
    )
    expect(transformJson('{"a":1,"a":2}', "sort-asc", "")).toBe('{"a":1,"a":2}')
    expect(() => transformJson(input, "format", "x")).toThrow("Choose")
  })
  it("repairs comments, single quotes, unquoted keys and fences in a preview", () => {
    expect(
      transformJson(
        "```json\n{a: 'Ada', /* hi */ b: 9007199254740993,}\n```",
        "repair",
        ""
      )
    ).toBe('{"a":"Ada","b":9007199254740993}')
    expect(() => transformJson("{} garbage []", "repair")).toThrow()
  })
  it("unwraps escaped JSON without evaluating JavaScript", () => {
    const encoded = transformJson(input, "stringify")
    expect(transformJson(encoded, "parse-string", "")).toBe(input)
    expect(() => transformJson("{}", "parse-string")).toThrow("JSON string")
    expect(() => transformJson('"alert(1)"', "parse-string")).toThrow(
      "not valid"
    )
  })
  it("round trips UTF-8 Base64 and URL encoding", () => {
    for (const [encode, decode] of [
      ["base64-encode", "base64-decode"],
      ["url-encode", "url-decode"],
    ] as const)
      expect(transformJson(transformJson(input, encode), decode, "")).toBe(
        input
      )
    expect(() => transformJson("!!!!", "base64-decode")).toThrow(
      "not valid UTF-8"
    )
    expect(() => transformJson("/w==", "base64-decode")).toThrow(
      "not valid UTF-8"
    )
    expect(() => transformJson("%ZZ", "url-decode")).toThrow("not valid UTF-8")
  })
  it("redacts exact names recursively and exports RFC pointer leaves", () => {
    expect(
      transformJson(
        '{"Token":"abc","items":[{"password":"secret","passwordHint":"public"}],"n":1}',
        "redact",
        ""
      )
    ).toBe(
      '{"Token":"[REDACTED]","items":[{"password":"[REDACTED]","passwordHint":"public"}],"n":1}'
    )
    expect(() => transformJson("{}", "redact", "", " , ")).toThrow(
      "at least one"
    )
    expect(
      transformJson('{"a/b":[9007199254740993,{}],"empty":[]}', "flatten", "")
    ).toBe('{"/a~1b/0":9007199254740993,"/a~1b/1":{},"/empty":[]}')
    expect(transformJson("42", "flatten", "")).toBe('{"":42}')
  })
  it("infers reviewed schemas and TypeScript unions from samples", () => {
    expect(
      inferSchema(
        parseDocument(
          '{"rows":[1,"two",1],"empty":[],"nullable":null,"decimal":1.2}'
        ).root
      )
    ).toMatchObject({
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: { anyOf: [{ type: "integer" }, { type: "string" }] },
        },
        empty: { type: "array" },
        nullable: { type: "null" },
        decimal: { type: "number" },
      },
      additionalProperties: false,
    })
    expect(inferSchema(parseDocument("[true,true]").root)).toEqual({
      type: "array",
      items: { type: "boolean" },
    })
    expect(
      inferTypeScript(
        parseDocument('{"weird-key":[1,"a"],"empty":{},"any":[]}').root,
        "Payload"
      )
    ).toContain('"weird-key": Array<number | string>')
    expect(inferTypeScript(parseDocument("{}").root)).toContain(
      "Record<string, never>"
    )
    expect(inferTypeScript(parseDocument("[]").root)).toContain(
      "Array<unknown>"
    )
    expect(() =>
      inferTypeScript(parseDocument("{}").root, "bad name;")
    ).toThrow("type name")
  })
})
describe("semantic comparison and atomic patch previews", () => {
  it("ignores spacing/key order while preserving exact numeric comparison", () => {
    expect(
      compareJson(
        '{"b":1.0e+3,"a":"\\u0061","zero":-0}',
        '{"zero":0,"a":"a","b":1000}'
      ).changes
    ).toEqual([])
    expect(compareJson("9007199254740993", "9007199254740992").changes).toEqual(
      [
        {
          op: "replace",
          path: "",
          before: "9007199254740993",
          after: "9007199254740992",
        },
      ]
    )
    expect(compareJson("1e400", "10e399").changes).toHaveLength(0)
    expect(compareJson("-0.00100", "-1e-3").changes).toHaveLength(0)
    expect(compareJson("true", "false").changes).toHaveLength(1)
    expect(compareJson("null", '"null"').changes).toHaveLength(1)
    expect(() => compareJson("1e" + "9".repeat(1001), "1")).toThrow("exponents")
  })
  it.each([
    ['{"a":1,"gone":true}', '{"a":2,"new":null}'],
    ["[1,2,3,4]", "[1,5]"],
    ["[1]", "[1,2,3]"],
    ['{"a/b":{"~":[0]}}', '{"a/b":{"~":[9007199254740993]}}'],
    ['{"__proto__":1}', '{"__proto__":{"polluted":true}}'],
    ["{}", "[]"],
    ["42", "null"],
  ])("generates a patch that reproduces %s → %s", (input, other) => {
    const comparison = compareJson(input, other)
    expect(
      compareJson(applyJsonPatch(input, comparison.patch), other).changes
    ).toHaveLength(0)
    expect({}).not.toHaveProperty("polluted")
  })
  it("supports add/remove/replace/copy/move/test with exact values", () => {
    const patch =
      '[{"op":"add","path":"/a/1","value":9007199254740993},{"op":"copy","from":"/a/1","path":"/id"},{"op":"move","from":"/a/0","path":"/a/-"},{"op":"test","path":"/id","value":9007199254740993},{"op":"replace","path":"/name","value":"Lin"},{"op":"remove","path":"/remove"},{"op":"add","path":"/name","value":"Ada"}]'
    expect(
      JSON.parse(
        applyJsonPatch('{"a":[1,2],"name":"old","remove":true}', patch)
      )
    ).toMatchObject({ name: "Ada", a: [9007199254740992, 2, 1] })
    expect(
      applyJsonPatch('{"a":[1]}', '[{"op":"move","from":"/a","path":"/a"}]')
    ).toContain('"a"')
    expect(
      applyJsonPatch(
        "[1,2]",
        '[{"op":"replace","path":"/1","value":3},{"op":"remove","path":"/0"}]'
      )
    ).toBe("[\n  3\n]")
  })
  it.each([
    ["{}", "{}", "array"],
    ["{}", "[1]", "object"],
    ["{}", '[{"op":1,"path":""}]', "string op"],
    ["{}", '[{"op":"add"}]', "string path"],
    ["{}", '[{"op":"add","path":"/a"}]', "value"],
    ["{}", '[{"op":"replace","path":"/missing","value":1}]', "No value"],
    ["{}", '[{"op":"remove","path":"/missing"}]', "No value"],
    ["{}", '[{"op":"remove","path":""}]', "Removing the root"],
    ["[]", '[{"op":"add","path":"/2","value":1}]', "Invalid array"],
    ["[1]", '[{"op":"replace","path":"/-","value":1}]', "Invalid array"],
    ["[1]", '[{"op":"remove","path":"/1"}]', "Invalid array"],
    ['{"a":1}', '[{"op":"add","path":"/a/child","value":1}]', "not an object"],
    ['{"a":{}}', '[{"op":"move","from":"/a","path":"/a/b"}]', "children"],
    ["{}", '[{"op":"unknown","path":""}]', "Unsupported"],
    ['{"a":1}', '[{"op":"test","path":"/a","value":2}]', "test failed"],
    ["1", '[{"op":"test","path":"","value":2}]', "the root"],
  ])("rejects an invalid patch atomically: %s %s", (input, patch, message) =>
    expect(() => applyJsonPatch(input, patch)).toThrow(message)
  )
  it("bounds patch/compare work", () => {
    expect(() =>
      applyJsonPatch(
        "null",
        "[" +
          Array.from(
            { length: 501 },
            () => '{"op":"test","path":"","value":null}'
          ).join(",") +
          "]"
      )
    ).toThrow("500 operations")
    expect(() =>
      compareJson("[" + "0,".repeat(500) + "0]", "[" + "1,".repeat(500) + "1]")
    ).toThrow("500 differences")
  })
})
describe("explicit, precise document conversion", () => {
  it.each([
    '{"nested":[{"id":9007199254740993,"name":"é","yes":true,"none":null}],"empty":{},"list":[],"exponent":1e400}',
    "[]",
    "{}",
    "null",
    '"hello"',
    "1.2300e+99",
  ])("round trips JSON through YAML: %s", (input) => {
    const yaml = convertJson(input, "json-yaml")
    expect(convertJson(yaml.output, "yaml-json").output).toBe(
      renderJson(parseDocument(input).root)
    )
  })
  it("converts familiar YAML, preserving integer and decimal tokens", () => {
    const result = convertJson(
      "name: Ada\nid: 9007199254740993\nhex: 0x10\nfraction: .5\nwhole: 5.\npositive: +2\nlist:\n  - true\n  - null\n",
      "yaml-json"
    )
    expect(result.output).toContain("9007199254740993")
    expect(result.output).toContain('"fraction": 0.5')
    expect(result.output).toContain('"hex": 16')
    expect(convertJson("", "yaml-json").output).toBe("null")
  })
  it.each([
    "a: [",
    "a: 1\na: 2",
    "a: &a [1]\nb: *a",
    "1: value",
    "<<: value",
    "a: .inf",
    "a: !custom value",
  ])("rejects unsupported or invalid YAML %s", (input) =>
    expect(() => convertJson(input, "yaml-json")).toThrow()
  )
  it("exports table rows with nested JSON and spreadsheet formula protection", () => {
    const input =
      '[{"id":9007199254740993,"name":"=1+2","nested":{"x":true}},{"name":"a,b"}]'
    const csv = convertJson(input, "json-csv")
    expect(csv.output).toContain("9007199254740993")
    expect(csv.output).toContain("'=1+2")
    expect(convertJson(input, "json-csv", false).output).not.toContain("'=1+2")
    const table = tableData(parseDocument(input).root)
    expect(table).toEqual({
      columns: ["id", "name", "nested"],
      rows: [
        ["9007199254740993", "=1+2", '{"x":true}'],
        ["", "a,b", ""],
      ],
    })
    const imported = convertJson(
      'id,name\n0001,"a,b"\n9007199254740993,Ada',
      "csv-json"
    )
    expect(JSON.parse(imported.output)).toEqual([
      { id: "0001", name: "a,b" },
      { id: "9007199254740993", name: "Ada" },
    ])
    expect(convertJson('a\n"line 1\nline 2"', "csv-json").output).toContain(
      "line 1\\nline 2"
    )
  })
  it.each(["", "a,a\n1,2", ",b\n1,2", "a,b\n1", 'a\n"unterminated'])(
    "rejects malformed CSV %s",
    (input) => expect(() => convertJson(input, "csv-json")).toThrow()
  )
  it("bounds table columns and refuses incompatible roots", () => {
    expect(() => convertJson("{}", "json-csv")).toThrow("array of objects")
    expect(() => tableData(parseDocument("[1]").root)).toThrow(
      "array of objects"
    )
    const many = JSON.stringify([
      Object.fromEntries(
        Array.from({ length: 201 }, (_, i) => ["column" + i, i])
      ),
    ])
    expect(() => convertJson(many, "json-csv")).toThrow("200 columns")
    expect(() =>
      convertJson(
        Array.from({ length: 201 }, (_, i) => "col" + i).join(",") +
          "\n" +
          "a,".repeat(200) +
          "a",
        "csv-json"
      )
    ).toThrow("200 columns")
  })
  it("round trips JSON Lines without coercion and reports bad records", () => {
    const input = '[{"id":9007199254740993},null,"é"]'
    const lines = convertJson(input, "json-lines")
    expect(lines.output).toBe('{"id":9007199254740993}\nnull\n"é"\n')
    expect(convertJson(lines.output, "lines-json").output).toBe(
      renderJson(parseDocument(input).root)
    )
    expect(convertJson("[]", "json-lines").output).toBe("")
    expect(() => convertJson("{}", "json-lines")).toThrow("array")
    expect(() => convertJson(" \n ", "lines-json")).toThrow("one JSON value")
    expect(() => convertJson("{}\n{bad}", "lines-json")).toThrow("record 2")
  })
  it("exports reviewed types and schemas with correct file metadata", () => {
    expect(
      convertJson('{"id":1}', "typescript", true, "Payload")
    ).toMatchObject({
      extension: "ts",
      mime: "text/plain",
      output: expect.stringContaining("export type Payload"),
    })
    const schema = convertJson('{"id":1}', "schema")
    expect(schema.extension).toBe("schema.json")
    expect(JSON.parse(schema.output)).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      required: ["id"],
    })
    expect(() =>
      convertJson(" ".repeat(MAX_JSON_CHARACTERS + 1), "yaml-json")
    ).toThrow("5 million")
  })
})
describe("querying returns original value tokens", () => {
  const input =
    '{"users":[{"name":"Ada","id":9007199254740993},{"name":"Lin","id":2}],"a/b":{"~":true}}'
  it("selects by wildcard, descendants, slices and pointers without rounding", () => {
    expect(queryJson(input, "$.users[*].id", "jsonpath").output).toContain(
      "9007199254740993"
    )
    expect(queryJson(input, "$..name", "jsonpath")).toMatchObject({
      count: 2,
      paths: ["/users/0/name", "/users/1/name"],
    })
    expect(queryJson(input, "$.users[-1:]", "jsonpath").count).toBe(1)
    expect(queryJson(input, "/a~1b/~0", "pointer").output).toBe("true")
    expect(queryJson(input, "", "pointer").count).toBe(1)
    expect(queryJson(input, "$.nothing", "jsonpath").output).toBe("[]")
  })
  it("supports safe numeric/string filters and rejects ambiguous filters", () => {
    expect(
      queryJson(
        '{"users":[{"id":1,"name":"Ada"},{"id":2,"name":"Lin"}]}',
        "$.users[?@.id > 1].name",
        "jsonpath"
      ).output
    ).toContain('"Lin"')
    expect(() =>
      queryJson(input, '$.users[?@.name == "Ada"]', "jsonpath")
    ).toThrow("safely representable")
    expect(() => queryJson("{}", "x", "jsonpath")).toThrow("Start")
    expect(() => queryJson("{}", "$[?alert(1)]", "jsonpath")).toThrow(
      "Invalid JSONPath"
    )
    expect(() => queryJson("{}", "$".repeat(2001), "jsonpath")).toThrow("2,000")
    expect(() => queryJson(' {"x":1,"x":2}', "$.x", "jsonpath")).toThrow(
      "Duplicate keys"
    )
    expect(() =>
      queryJson("[" + "0,".repeat(10_000) + "0]", "$[*]", "jsonpath")
    ).toThrow("10,000 matches")
  })
})
describe("schema validation is local, explicit and non-mutating", () => {
  it.each([
    "http://json-schema.org/draft-07/schema#",
    "https://json-schema.org/draft/2019-09/schema",
    "https://json-schema.org/draft/2020-12/schema",
  ])("validates %s", (draft) => {
    const schema = JSON.stringify({
      $schema: draft,
      type: "object",
      properties: { email: { type: "string", format: "email" } },
      required: ["email"],
      additionalProperties: false,
    })
    expect(validateSchema('{"email":"ada@example.com"}', schema).valid).toBe(
      true
    )
    const result = validateSchema('{"email":"bad","extra":1}', schema)
    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.keyword)).toContain("format")
  })
  it("uses local definitions and never applies coercion or defaults", () => {
    expect(
      validateSchema(
        '{"age":10}',
        '{"$defs":{"age":{"type":"integer"}},"type":"object","properties":{"age":{"$ref":"#/$defs/age"}}}'
      ).valid
    ).toBe(true)
    expect(validateSchema('"1"', '{"type":"integer"}').valid).toBe(false)
    expect(
      validateSchema(
        "{}",
        '{"type":"object","properties":{"age":{"default":1}},"required":["age"]}'
      ).errors[0].path
    ).toBe("(root)")
    expect(validateSchema("null", "true").valid).toBe(true)
    expect(validateSchema("null", "false").valid).toBe(false)
  })
  it("rejects remote refs, unknown keywords, unsafe numbers and unsupported drafts", () => {
    expect(() =>
      validateSchema("{}", '{"$ref":"https://example.com/schema.json"}')
    ).toThrow("no URLs")
    expect(() => validateSchema("{}", '{"unknownKeyword":true}')).toThrow(
      "unknown keyword"
    )
    expect(() => validateSchema("{}", '{"$schema":"custom"}')).toThrow(
      "draft-07"
    )
    expect(() => validateSchema("{}", '{"$async":true}')).toThrow("Async")
    expect(() =>
      validateSchema("9007199254740993", '{"type":"number"}')
    ).toThrow("safely representable")
    expect(() => validateSchema("{}", " ".repeat(100001))).toThrow("100,000")
  })
})
