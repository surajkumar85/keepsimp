"use client"
import { useState } from "react"
import {
  IconBraces,
  IconChevronDown,
  IconChevronRight,
  IconFilter,
  IconGitCompare,
  IconShieldCheck,
  IconTransform,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { WorkspaceTabPanel } from "@/components/ui/workspace-tabs"
import { cn } from "cn"
import { CodeEditor } from "./code-editor"
import type { JsonJob, JsonResult } from "@/lib/json-workspace/protocol"
import type { Transform } from "@/lib/json-workspace/transforms"
import type { Conversion } from "@/lib/json-workspace/convert"

export type Execute = (
  job: JsonJob,
  label: string,
  extension?: string,
  mime?: string
) => Promise<JsonResult | null>
export const transforms: { value: Transform; label: string }[] = [
  { value: "sort-asc", label: "Sort keys A–Z" },
  { value: "sort-desc", label: "Sort keys Z–A" },
  { value: "repair", label: "Preview repair" },
  { value: "stringify", label: "Escape as JSON string" },
  { value: "parse-string", label: "Unwrap JSON string" },
  { value: "flatten", label: "Flatten to JSON Pointers" },
  { value: "redact", label: "Redact property names" },
  { value: "base64-encode", label: "Encode Base64" },
  { value: "base64-decode", label: "Decode Base64 to JSON" },
  { value: "url-encode", label: "URL-encode JSON" },
  { value: "url-decode", label: "URL-decode to JSON" },
]
export const conversions: { value: Conversion; label: string }[] = [
  { value: "json-yaml", label: "JSON → YAML" },
  { value: "yaml-json", label: "YAML → JSON" },
  { value: "json-csv", label: "JSON → CSV" },
  { value: "csv-json", label: "CSV → JSON" },
  { value: "json-lines", label: "JSON → JSON Lines" },
  { value: "lines-json", label: "JSON Lines → JSON" },
  { value: "typescript", label: "JSON → TypeScript" },
  { value: "schema", label: "JSON → JSON Schema" },
]
const panel = "space-y-4 rounded-xl border bg-card p-4"
const schemaExample =
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"project":{"type":"string"},"version":{"type":"integer","minimum":1}},"required":["project","version"]}'
type Props = {
  input: string
  busy: boolean
  execute: Execute
  invalidate: () => void
}
function useScopedResult<T>(input: string, context = "") {
  const [saved, setSaved] = useState<{
    input: string
    context: string
    data: T
  } | null>(null)
  return [
    saved?.input === input && saved.context === context ? saved.data : null,
    (data: T | null | undefined) =>
      setSaved(data == null ? null : { input, context, data }),
  ] as const
}

export function EditPanel({
  input,
  busy,
  execute,
  transform,
  indent,
  setIndent,
  redactKeys,
  setRedactKeys,
}: Props & {
  transform: (action: Transform) => Promise<void>
  indent: string
  setIndent: (value: string) => void
  redactKeys: string
  setRedactKeys: (value: string) => void
}) {
  const [action, setAction] = useState<Transform>("sort-asc")
  const [valid, setValid] = useScopedResult<boolean>(input)
  return (
    <WorkspaceTabPanel value="edit" className={panel}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ChoiceChips
          label="Indentation"
          value={indent}
          onValueChange={setIndent}
          options={[
            { value: "  ", label: "2 spaces" },
            { value: "    ", label: "4 spaces" },
            { value: "\t", label: "Tabs" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !input.trim()}
            onClick={() => void transform("format")}
          >
            <IconBraces aria-hidden="true" />
            Format JSON
          </Button>
          <Button
            variant="outline"
            disabled={busy || !input.trim()}
            onClick={() => void transform("minify")}
          >
            Minify
          </Button>
          <Button
            variant="outline"
            disabled={busy || !input.trim()}
            onClick={async () =>
              setValid(
                !!(await execute({ action: "inspect", input }, "Validation"))
              )
            }
          >
            Validate JSON
          </Button>
        </div>
      </div>
      {valid && (
        <p role="status" className="text-sm text-primary">
          Valid JSON syntax. Use Schema to check a data contract.
        </p>
      )}
      <details className="group border-t pt-3">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring md:min-h-9">
          <IconChevronRight
            className="size-4 group-open:rotate-90"
            aria-hidden="true"
          />
          More transformations
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="json-transform"
              className="mb-2 block text-sm font-medium"
            >
              Transform
            </label>
            <select
              id="json-transform"
              value={action}
              onChange={(event) => setAction(event.target.value as Transform)}
              className="form-select"
            >
              {transforms.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          {action === "redact" && (
            <div>
              <label
                htmlFor="redact-keys"
                className="mb-2 block text-sm font-medium"
              >
                Property names to redact
              </label>
              <Input
                id="redact-keys"
                value={redactKeys}
                onChange={(event) => setRedactKeys(event.target.value)}
              />
            </div>
          )}
        </div>
        <Button
          className="mt-3"
          variant="outline"
          disabled={busy || !input.trim()}
          onClick={() => void transform(action)}
        >
          {transforms.find((item) => item.value === action)?.label}
        </Button>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Sorting changes key order recursively, preserving array order. Repair
          can add or remove content; review its preview. Redaction matches exact
          property names, ignoring case, and does not guarantee every secret is
          removed.
        </p>
      </details>
    </WorkspaceTabPanel>
  )
}
export function ExplorePanel({
  input,
  busy,
  execute,
  inspection,
  expanded,
  setExpanded,
  search,
  setSearch,
  offset,
  setOffset,
  copy,
  checking = false,
}: Props & {
  inspection: JsonResult | null
  expanded: string[]
  setExpanded: (value: string[]) => void
  search: string
  setSearch: (value: string) => void
  offset: number
  setOffset: (value: number) => void
  copy: (text: string, label?: string) => Promise<void>
  /** A change waits to be checked: the tree shown is the last one, dimmed until the new one comes. */
  checking?: boolean
}) {
  const [view, setView] = useState("tree")
  const [table, setTable] = useScopedResult<JsonResult["table"]>(input)
  const [pointer, setPointer] = useState("")
  const [replacement, setReplacement] = useState("")
  async function select(path: string) {
    setPointer(path)
    const result = await execute(
      { action: "value", input, pointer: path },
      "Selected value"
    )
    if (result?.output !== undefined) setReplacement(result.output)
  }
  return (
    <WorkspaceTabPanel value="explore" className={panel}>
      <ChoiceChips
        label="Explore view"
        value={view}
        onValueChange={(value) => {
          setView(value)
          if (value === "table")
            void execute({ action: "table", input }, "Table").then((result) =>
              setTable(result?.table)
            )
        }}
        options={[
          { value: "tree", label: "Tree" },
          { value: "table", label: "Table" },
        ]}
      />
      {view === "tree" ? (
        <>
          <div>
            <label
              htmlFor="json-tree-search"
              className="mb-2 block text-sm font-medium"
            >
              Search keys, values and paths
            </label>
            <Input
              id="json-tree-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setOffset(0)
              }}
              placeholder="Try name, /users or Ada"
            />
          </div>
          <div
            className={cn(
              "max-h-96 overflow-auto rounded-lg border transition-opacity motion-reduce:transition-none",
              checking && "opacity-60"
            )}
            aria-label="JSON tree"
            aria-busy={checking || undefined}
          >
            {inspection?.rows?.map((row, index) => (
              <div
                key={`${row.pointer}-${index}`}
                className="flex min-w-0 items-center gap-1 border-b px-2 py-1.5 last:border-b-0"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!row.children}
                  aria-label={`${expanded.includes(row.pointer) ? "Collapse" : "Expand"} ${row.pointer || "root"}`}
                  onClick={() => {
                    setExpanded(
                      expanded.includes(row.pointer)
                        ? expanded.filter((path) => path !== row.pointer)
                        : [...expanded, row.pointer]
                    )
                    setOffset(0)
                  }}
                >
                  {row.children ? (
                    expanded.includes(row.pointer) ? (
                      <IconChevronDown aria-hidden="true" />
                    ) : (
                      <IconChevronRight aria-hidden="true" />
                    )
                  ) : (
                    <IconBraces
                      className="size-3 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </Button>
                <button
                  className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
                  onClick={() => void select(row.pointer)}
                >
                  <span className="max-w-full font-mono font-medium break-all">
                    {row.label}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {row.type}
                  </span>
                  <span className="max-w-full font-mono text-xs break-all text-muted-foreground">
                    {row.preview}
                  </span>
                  <span className="sr-only">
                    Select {row.pointer || "root"}
                  </span>
                </button>
              </div>
            ))}
            {!inspection?.rows?.length && (
              <p className="p-4 text-sm text-muted-foreground">
                {search
                  ? "No matching values."
                  : "Add valid JSON to explore its structure."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {inspection?.total ?? 0} visible values · up to 100 per page
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 100))}
            >
              Previous values
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + 100 >= (inspection?.total ?? 0)}
              onClick={() => setOffset(offset + 100)}
            >
              Next values
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="json-selected-pointer"
                className="mb-2 block text-sm font-medium"
              >
                Selected JSON Pointer
              </label>
              <Input
                id="json-selected-pointer"
                value={pointer}
                onChange={(event) => setPointer(event.target.value)}
                placeholder="Empty selects the root"
              />
              <Button
                size="sm"
                variant="ghost"
                className="mt-1"
                onClick={() => void copy(pointer, "JSON Pointer")}
              >
                Copy pointer
              </Button>
            </div>
            <div>
              <label
                htmlFor="json-replacement"
                className="mb-2 block text-sm font-medium"
              >
                Replacement JSON value
              </label>
              <Input
                id="json-replacement"
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                placeholder='"A new value"'
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !input.trim()}
              onClick={() => void select(pointer)}
            >
              Read selected value
            </Button>
            <Button
              variant="outline"
              disabled={busy || !input.trim() || !replacement.trim()}
              onClick={() =>
                void execute(
                  {
                    action: "patch",
                    input,
                    patch: `[{"op":"replace","path":${JSON.stringify(pointer)},"value":${replacement}}]`,
                  },
                  "Replacement preview"
                )
              }
            >
              Preview replacement
            </Button>
          </div>
        </>
      ) : (
        <>
          <Button
            variant="outline"
            disabled={busy || !input.trim()}
            onClick={() =>
              void execute({ action: "table", input }, "Table").then((result) =>
                setTable(result?.table)
              )
            }
          >
            Refresh table
          </Button>
          {table ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <caption className="px-3 py-2 text-left text-xs text-muted-foreground">
                  {table.total} rows · first 100 shown. Export CSV from Convert.
                </caption>
                <thead className="border-b bg-muted">
                  <tr>
                    {table.columns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="px-3 py-2 font-medium"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, index) => (
                    <tr key={index} className="border-b last:border-b-0">
                      {row.map((cell, column) => (
                        <td
                          key={column}
                          className="max-w-xs px-3 py-2 break-all"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Refresh the table for your current source. Table view accepts an
              array of objects; use Query to select an inner array first.
            </p>
          )}
        </>
      )}
    </WorkspaceTabPanel>
  )
}
export function QueryPanel({ input, busy, execute, invalidate }: Props) {
  const [mode, setMode] = useState<"jsonpath" | "pointer">("jsonpath")
  const [query, setQuery] = useState("$.users[*].name")
  const [result, setResult] = useScopedResult<JsonResult>(
    input,
    `${mode}:${query}`
  )
  return (
    <WorkspaceTabPanel value="query" className={panel}>
      <ChoiceChips
        label="Query language"
        value={mode}
        onValueChange={(value) => {
          setMode(value)
          invalidate()
          setQuery(value === "pointer" ? "/users/0/id" : "$.users[*].name")
          setResult(null)
        }}
        options={[
          { value: "jsonpath", label: "JSONPath" },
          { value: "pointer", label: "JSON Pointer" },
        ]}
      />
      <div>
        <label htmlFor="json-query" className="mb-2 block text-sm font-medium">
          {mode === "pointer" ? "JSON Pointer" : "JSONPath expression"}
        </label>
        <Input
          id="json-query"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            invalidate()
            setResult(null)
          }}
        />
      </div>
      <Button
        disabled={busy || !input.trim()}
        onClick={async () =>
          setResult(
            await execute(
              { action: "query", input, query, mode },
              "Query result"
            )
          )
        }
      >
        <IconFilter aria-hidden="true" />
        Run query
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">
        JSONPath: $.users[*].name, $..id, $.users[0:2], or $.users[?@.role ==
        &quot;editor&quot;]. JSON Pointer: /users/0/id; ~1 means / and ~0 means
        ~. Values retain exact numeric text. Filters require safe numbers.
      </p>
      {result && (
        <div>
          <p role="status" className="text-sm font-medium">
            {result.count} {result.count === 1 ? "match" : "matches"}
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-xs text-muted-foreground">
            {result.paths?.map((path, index) => (
              <li key={`${path}-${index}`} className="break-all">
                {path || "(root)"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Up to 100 paths shown; output includes every match, up to 10,000.
          </p>
        </div>
      )}
    </WorkspaceTabPanel>
  )
}
export function ComparePanel({
  input,
  busy,
  execute,
  updateSource,
  invalidate,
}: Props & { updateSource: (value: string) => void }) {
  const [other, setOther] = useState("")
  const [result, setResult] = useScopedResult<JsonResult>(input, other)
  const [patch, setPatch] = useState("")
  return (
    <WorkspaceTabPanel value="compare" className={panel}>
      <CodeEditor
        id="json-comparison"
        label="Comparison JSON"
        value={other}
        onChange={(value) => {
          setOther(value)
          invalidate()
          setResult(null)
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !input.trim() || !other.trim()}
          onClick={async () => {
            const comparison = await execute(
              { action: "compare", input, other },
              "JSON Patch"
            )
            setResult(comparison)
            if (comparison) setPatch(comparison.patch ?? "")
          }}
        >
          <IconGitCompare aria-hidden="true" />
          Compare JSON
        </Button>
        <Button
          variant="outline"
          disabled={!other.trim()}
          onClick={() => {
            const previous = input
            updateSource(other)
            setOther(previous)
            setResult(null)
          }}
        >
          Swap documents
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Object key order is ignored; arrays compare by position; numbers compare
        exactly. The patch transforms source into comparison, with at most 500
        changes.
      </p>
      {result && (
        <>
          <p role="status" className="text-sm font-medium">
            {result.changes?.length
              ? `${result.changes.length} ${result.changes.length === 1 ? "difference" : "differences"}`
              : "The documents have the same JSON values."}
          </p>
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                JSON differences from source to comparison
              </caption>
              <thead className="border-b bg-muted">
                <tr>
                  <th scope="col" className="p-3">
                    Change
                  </th>
                  <th scope="col" className="p-3">
                    Path
                  </th>
                  <th scope="col" className="p-3">
                    Before → after
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.changes?.map((change, index) => (
                  <tr key={index} className="border-b last:border-b-0">
                    <td className="p-3">{change.op}</td>
                    <td className="p-3 font-mono text-xs break-all">
                      {change.path || "(root)"}
                    </td>
                    <td className="p-3 font-mono text-xs break-all">
                      {change.before?.slice(0, 300) ?? "(absent)"} →{" "}
                      {change.after?.slice(0, 300) ?? "(removed)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <CodeEditor
        id="json-patch"
        label="JSON Patch operations"
        value={patch}
        onChange={(value) => {
          setPatch(value)
          invalidate()
        }}
        hint='[{"op":"replace","path":"/name","value":"Ada"}]'
      />
      <Button
        variant="outline"
        disabled={busy || !patch.trim() || !input.trim()}
        onClick={() =>
          void execute({ action: "patch", input, patch }, "Patch preview")
        }
      >
        Preview patch
      </Button>
      <p className="text-xs text-muted-foreground">
        Add, remove, replace, move, copy and test are supported. Failures leave
        the source intact. Removing the root is rejected because it would leave
        no JSON document.
      </p>
    </WorkspaceTabPanel>
  )
}
export function SchemaPanel({ input, busy, execute, invalidate }: Props) {
  const [schema, setSchema] = useState("")
  const [result, setResult] = useScopedResult<JsonResult>(input, schema)
  return (
    <WorkspaceTabPanel value="schema" className={panel}>
      <CodeEditor
        id="json-schema"
        label="JSON Schema"
        value={schema}
        onChange={(value) => {
          setSchema(value)
          invalidate()
          setResult(null)
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !schema.trim() || !input.trim()}
          onClick={async () =>
            setResult(
              await execute(
                { action: "schema", input, schema },
                "Schema validation"
              )
            )
          }
        >
          <IconShieldCheck aria-hidden="true" />
          Validate schema
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setSchema(schemaExample)
            invalidate()
            setResult(null)
          }}
        >
          Use schema example
        </Button>
        <Button
          variant="outline"
          disabled={busy || !input.trim()}
          onClick={async () => {
            const inferred = await execute(
              { action: "convert", input, format: "schema" },
              "Inferred schema"
            )
            if (inferred?.output) {
              setSchema(inferred.output)
              setResult(null)
            }
          }}
        >
          Infer schema from source
        </Button>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        Draft-07, 2019-09 and 2020-12 (default). Email, URI and date-time format
        checks. Local $ref/$defs work; remote references are never fetched. No
        coercion, defaults or removed values. Up to 100,000 schema characters;
        operations stop after 20 seconds.
      </p>
      {result && (
        <div>
          <p role="status" className="text-sm font-medium">
            {result.valid
              ? "Your JSON matches the schema."
              : "Your JSON does not match the schema."}
          </p>
          <ul className="mt-3 space-y-2">
            {result.errors?.map((error, index) => (
              <li key={index} className="rounded-lg border p-3 text-sm">
                <span className="font-mono text-xs break-all">
                  {error.path}
                </span>
                <p className="mt-1">
                  {error.message}{" "}
                  <span className="text-muted-foreground">
                    ({error.keyword})
                  </span>
                </p>
                <p className="mt-1 text-xs break-all text-muted-foreground">
                  {error.details}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Up to 100 issues shown.
          </p>
        </div>
      )}
    </WorkspaceTabPanel>
  )
}
export function ConvertPanel({
  input,
  busy,
  execute,
  conversion,
  setConversion,
  invalidate,
}: Props & {
  conversion: Conversion
  setConversion: (value: Conversion) => void
}) {
  const [protect, setProtect] = useState(true)
  const [typeName, setTypeName] = useState("Root")
  return (
    <WorkspaceTabPanel value="convert" className={panel}>
      <div>
        <label
          htmlFor="json-conversion"
          className="mb-2 block text-sm font-medium"
        >
          Conversion
        </label>
        <select
          id="json-conversion"
          value={conversion}
          onChange={(event) => {
            setConversion(event.target.value as Conversion)
            invalidate()
          }}
          className="form-select"
        >
          {conversions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      {conversion === "typescript" && (
        <div>
          <label
            htmlFor="json-type-name"
            className="mb-2 block text-sm font-medium"
          >
            Type name
          </label>
          <Input
            id="json-type-name"
            value={typeName}
            onChange={(event) => {
              setTypeName(event.target.value)
              invalidate()
            }}
          />
        </div>
      )}
      {conversion === "json-csv" && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={protect}
            onChange={(event) => {
              setProtect(event.target.checked)
              invalidate()
            }}
            className="size-4 accent-primary"
          />
          Protect spreadsheet formulas
        </label>
      )}
      <Button
        disabled={busy || !input.trim()}
        onClick={() =>
          void execute(
            {
              action: "convert",
              input,
              format: conversion,
              protectCsv: protect,
              typeName,
            },
            conversions.find((item) => item.value === conversion)!.label
          )
        }
      >
        <IconTransform aria-hidden="true" />
        Convert document
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">
        CSV/table view need an array of objects. CSV imports keep cells as
        strings. YAML aliases, merge keys, custom tags and non-string keys must
        be expanded or converted first. Types/schemas describe one sample and
        need review.
      </p>
    </WorkspaceTabPanel>
  )
}
