import { describe, expect, it } from "vitest"
import { runJob } from "@/lib/json-workspace/jobs"
import { Agent } from "./agent"
import { INLINE_CHARACTERS, wordsMade, wordsOf } from "./text"
import { FileStore } from "./files"
import { jsonTools } from "./json"

/** The tools with the JSON worker's own jobs, run here without a worker. */
const agent = () => new Agent(jsonTools((job) => Promise.resolve(runJob(job))))

const call = (made: Agent, name: string, input: unknown) =>
  made.call(name, input, { caller: "page" })

describe("words as text or a file", () => {
  it("takes one or the other, within a size", async () => {
    const files = new FileStore()
    const ref = files.add(new Blob(["abc"]), "a.txt")
    const how = { what: "the JSON", most: 2 }
    await expect(wordsOf({}, files, how)).rejects.toThrow(
      'Give the JSON either as "text" or as "file".'
    )
    await expect(
      wordsOf({ text: "x", file: ref.id }, files, how)
    ).rejects.toThrow(/either/)
    expect(await wordsOf({ text: "x" }, files, how)).toEqual({
      words: "x",
      from: null,
    })
    await expect(wordsOf({ file: ref.id }, files, how)).rejects.toThrow(
      "a.txt is 3 bytes; the JSON can be at most 2."
    )
    expect(
      await wordsOf({ file: ref.id }, files, { ...how, most: 10 })
    ).toEqual({ words: "abc", from: "a.txt" })
  })

  it("gives short answers back in the result, the rest as a file", async () => {
    const files = new FileStore()
    const how = { suffix: "-x", extension: "json", type: "application/json" }
    expect(wordsMade(files, "[]", { from: null, ...how })).toEqual({
      inline: "[]",
    })
    const fromFile = wordsMade(files, "[]", { from: "a.json", ...how })
    expect(fromFile.file?.name).toBe("a-x.json")
    expect(fromFile.inline).toBe("[]")
    const long = wordsMade(files, "x".repeat(INLINE_CHARACTERS + 1), {
      from: null,
      ...how,
    })
    expect(long.inline).toBeUndefined()
    expect(long.file?.name).toBe("x.json")
  })
})

describe("the JSON tools", () => {
  it("formats, minifies and sorts, keeping every digit", async () => {
    const tools = agent()
    const text = '{"b":1.000000000000000000001,"a":[1,2]}'
    const pretty = await call(tools, "format_json", { text })
    expect(pretty.summary).toBe("Formatted.")
    expect((pretty.data as { output: string }).output).toContain(
      "1.000000000000000000001"
    )
    const minified = await call(tools, "format_json", {
      text: '{ "a" : 1 }',
      style: "minify",
    })
    expect(minified.summary).toBe("Minified: 11 characters became 7.")
    const sorted = await call(tools, "format_json", {
      text,
      style: "sort-keys",
      indent: "tab",
    })
    expect((sorted.data as { output: string }).output).toBe(
      '{\n\t"a": [\n\t\t1,\n\t\t2\n\t],\n\t"b": 1.000000000000000000001\n}'
    )
    const down = await call(tools, "format_json", {
      text,
      style: "sort-keys-descending",
      indent: "4",
    })
    expect(down.summary).toBe("Formatted with the keys sorted.")
    expect((down.data as { output: string }).output.indexOf('"b"')).toBe(6)
    await expect(
      call(tools, "format_json", { text: "{", style: "pretty" })
    ).rejects.toThrow()
  })

  it("writes a file when the JSON came as one", async () => {
    const tools = agent()
    const ref = tools.files.add(new Blob(['{"a":1}']), "data.json")
    const result = await call(tools, "format_json", { file: ref.id })
    expect(result.files).toEqual([
      expect.objectContaining({ name: "data-formatted.json" }),
    ])
    expect(result.summary).toBe("Formatted. Written to data-formatted.json.")
    const held = tools.files.get(result.files![0].id)
    expect(await held.blob.text()).toBe('{\n  "a": 1\n}')
    expect(held.origin).toBe("made")
    const minified = await call(tools, "format_json", {
      file: ref.id,
      style: "minify",
    })
    expect(minified.files![0].name).toBe("data-min.json")
  })

  it("hands a long answer back only as a file", async () => {
    const text = JSON.stringify(Array.from({ length: 20_000 }, (_, n) => n))
    const result = await call(agent(), "format_json", { text })
    expect(result.data).toEqual({})
    expect(result.files![0].name).toBe("formatted.json")
  })

  it("repairs, and says a repair is a guess", async () => {
    const result = await call(agent(), "repair_json", {
      text: "{a: 'b', c: [1,2,],}",
      indent: "2",
    })
    expect(JSON.parse((result.data as { output: string }).output)).toEqual({
      a: "b",
      c: [1, 2],
    })
    expect(result.summary).toMatch(/guess/)
    const plain = await call(agent(), "repair_json", { text: "[1,]" })
    expect((plain.data as { output: string }).output).toContain("1")
  })

  it("transforms, encoding to text and hiding secrets", async () => {
    const tools = agent()
    const encoded = await call(tools, "transform_json", {
      text: '{"a":1}',
      action: "base64-encode",
    })
    expect((encoded.data as { output: string }).output).toBe("eyJhIjoxfQ==")
    const ref = tools.files.add(new Blob(['{"a":1}']), "x.json")
    const fromFile = await call(tools, "transform_json", {
      file: ref.id,
      action: "url-encode",
    })
    expect(fromFile.files![0].name).toBe("x-url-encode.txt")
    const redacted = await call(tools, "transform_json", {
      text: '{"pin":"1234","name":"x"}',
      action: "redact",
      keys: ["pin"],
    })
    expect((redacted.data as { output: string }).output).not.toContain("1234")
    const flat = await call(tools, "transform_json", {
      file: ref.id,
      action: "flatten",
    })
    expect(flat.files![0].name).toBe("x-flatten.json")
    expect(flat.summary).toMatch(/^Done: flatten\./)
  })

  it("queries by JSONPath or pointer, guessing which from the query", async () => {
    const tools = agent()
    const text = '{"items":[{"n":1},{"n":2},{"n":3}]}'
    const path = await call(tools, "query_json", {
      text,
      query: "$.items[?@.n > 1].n",
    })
    expect(path.summary).toBe("Found 2 values.")
    expect(path.data).toMatchObject({
      count: 2,
      paths: ["/items/1/n", "/items/2/n"],
    })
    const pointer = await call(tools, "query_json", {
      text,
      query: "/items/0/n",
    })
    expect(pointer.summary).toBe("Found 1 value.")
    const forced = await call(tools, "query_json", {
      text,
      query: "/items/1",
      mode: "pointer",
    })
    expect((forced.data as { output: string }).output).toContain('"n": 2')
  })

  it("validates against a schema given as text or a file", async () => {
    const tools = agent()
    const schema = '{"type":"object","required":["id"]}'
    const good = await call(tools, "validate_json", {
      text: '{"id":1}',
      schema,
    })
    expect(good).toEqual({
      summary: "Valid against the schema.",
      data: { valid: true, errors: [] },
    })
    const ref = tools.files.add(new Blob([schema]), "schema.json")
    const bad = await call(tools, "validate_json", {
      text: "{}",
      schemaFile: ref.id,
    })
    expect(bad.summary).toBe("Not valid: 1 error.")
    const many = await call(tools, "validate_json", {
      text: "[1,2]",
      schema: '{"items":{"type":"string"}}',
    })
    expect(many.summary).toBe("Not valid: 2 errors.")
    const hundred = await call(tools, "validate_json", {
      text: JSON.stringify(Array.from({ length: 150 }, (_, n) => n)),
      schema: '{"items":{"type":"string"}}',
    })
    expect(hundred.summary).toBe(
      "Not valid: 100 errors shown (there may be more)."
    )
  })

  it("compares, and patches", async () => {
    const tools = agent()
    const same = await call(tools, "compare_json", {
      text: '{"a":1,"b":2}',
      otherText: '{"b":2,"a":1}',
    })
    expect(same.summary).toBe("The two are the same.")
    const other = tools.files.add(new Blob(['{"a":2}']), "b.json")
    const one = await call(tools, "compare_json", {
      text: '{"a":1}',
      otherFile: other.id,
    })
    expect(one.summary).toMatch(/^1 difference\./)
    const two = await call(tools, "compare_json", {
      text: '{"a":1,"c":1}',
      otherText: '{"a":2}',
    })
    expect(two.summary).toMatch(/^2 differences\./)
    const patch = (two.data as { output: string }).output
    const patched = await call(tools, "patch_json", {
      text: '{"a":1,"c":1}',
      patch,
    })
    expect(JSON.parse((patched.data as { output: string }).output)).toEqual({
      a: 2,
    })
    const patchFile = tools.files.add(new Blob([patch]), "p.json")
    const fromFile = await call(tools, "patch_json", {
      text: '{"a":1,"c":1}',
      patchFile: patchFile.id,
    })
    expect(fromFile.summary).toBe("Patched: every operation applied.")
  })

  it("converts, with the file kind of the result", async () => {
    const tools = agent()
    const ref = tools.files.add(new Blob(['[{"a":"=1"}]']), "rows.json")
    const csv = await call(tools, "convert_json", {
      file: ref.id,
      to: "json-csv",
    })
    expect(csv.files![0]).toMatchObject({
      name: "rows-json-csv.csv",
      type: "text/csv",
    })
    expect(csv.summary).toMatch(
      /^Converted\. .+ Written to rows-json-csv\.csv\.$/
    )
    const types = await call(tools, "convert_json", {
      text: '{"a":1}',
      to: "typescript",
      typeName: "Thing",
      protectCsv: false,
    })
    expect((types.data as { output: string }).output).toContain("Thing")
    const yaml = await call(tools, "convert_json", {
      text: '{"a":1}',
      to: "json-yaml",
    })
    expect(yaml.summary).toMatch(/^Converted\. Quoted keys/)
  })
})

describe("looking through JSON as the page's tree and table", () => {
  const doc = '{"a":1,"a":2,"b":{"c":[1,2]},"big":12345678901234567890}'

  it("describes the document and lists its top level", async () => {
    const result = await call(agent(), "inspect_json", { text: doc })
    expect(result.summary).toBe(
      "Valid JSON: 8 values, 3 deep, 56 bytes. 1 duplicate key. 1 number is kept exactly here but cannot be held exactly by JavaScript. Values 1 to 5 of 5 listed."
    )
    const data = result.data as {
      duplicates: string[]
      unsafeNumbers: string[]
      rows: { pointer: string; preview: string }[]
    }
    expect(data.duplicates).toEqual(["/a"])
    expect(data.unsafeNumbers).toEqual(["/big"])
    // The number keeps every digit.
    expect(data.rows.at(-1)).toMatchObject({
      pointer: "/big",
      preview: "12345678901234567890",
    })
    const many = await call(agent(), "inspect_json", {
      text: '{"a":1,"a":2,"a":3,"n":[9007199254740993,9007199254740995]}',
    })
    expect(many.summary).toMatch(
      / 2 duplicate keys\. 2 numbers are kept exactly here /
    )
    const one = await call(agent(), "inspect_json", { text: "1" })
    expect(one.summary).toBe(
      "Valid JSON: 1 value, 0 deep, 1 byte. Values 1 to 1 of 1 listed."
    )
  })

  it("opens the containers asked for, and pages", async () => {
    const opened = await call(agent(), "inspect_json", {
      text: doc,
      expand: ["/b"],
    })
    expect(
      (opened.data as { rows: { pointer: string }[] }).rows.map(
        (row) => row.pointer
      )
    ).toEqual(["", "/a", "/a", "/b", "/b/c", "/big"])
    const past = await call(agent(), "inspect_json", { text: doc, offset: 50 })
    expect(past.summary).toMatch(
      /None listed after the first 50; there are 5\.$/
    )
  })

  it("searches keys, paths and values", async () => {
    const found = await call(agent(), "inspect_json", {
      text: doc,
      search: "C",
    })
    expect(found.summary).toMatch(/3 matches; 1 to 3 listed\.$/)
    expect(
      (found.data as { rows: { pointer: string }[] }).rows.map(
        (row) => row.pointer
      )
    ).toEqual(["/b/c", "/b/c/0", "/b/c/1"])
    const single = await call(agent(), "inspect_json", {
      text: doc,
      search: "big",
    })
    expect(single.summary).toMatch(/1 match; 1 to 1 listed\.$/)
    const later = await call(agent(), "inspect_json", {
      text: doc,
      search: "c",
      offset: 3,
    })
    expect(later.summary).toMatch(/3 matches; none listed\.$/)
    const none = await call(agent(), "inspect_json", {
      text: doc,
      search: "zzz",
    })
    expect(none.summary).toMatch(/ 0 matches\.$/)
    await expect(
      call(agent(), "inspect_json", { text: doc, search: "a", expand: ["/b"] })
    ).rejects.toThrow(/not both/)
    await expect(
      call(agent(), "inspect_json", { text: "{a:1}" })
    ).rejects.toThrow()
  })

  it("lays an array of objects out as a table", async () => {
    const small = await call(agent(), "json_table", {
      text: '[{"a":1,"b":{"x":"y"}},{"a":"two"}]',
    })
    expect(small.summary).toBe("2 rows and 2 columns.")
    expect(small.data).toEqual({
      columns: ["a", "b"],
      rows: [
        ["1", '{"x":"y"}'],
        ["two", ""],
      ],
      total: 2,
    })
    const long = await call(agent(), "json_table", {
      text: JSON.stringify(Array.from({ length: 150 }, (_, n) => ({ n }))),
    })
    expect(long.summary).toBe(
      "150 rows and 1 column; the first 100 rows are given."
    )
    expect((long.data as { rows: unknown[] }).rows).toHaveLength(100)
    await expect(
      call(agent(), "json_table", { text: "[1, 2]" })
    ).rejects.toThrow(/array of objects/)
  })
})
