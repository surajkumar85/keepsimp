import type { Transform } from "./transforms"
import type { Conversion } from "./convert"
import type { TreeRow, JsonDocument } from "./document"
import type { JsonChange } from "./compare"

export type JsonJob =
  | {
      action: "inspect"
      input: string
      expanded?: string[]
      search?: string
      offset?: number
    }
  | {
      action: "transform"
      input: string
      transform: Transform
      indent?: string
      keys?: string
    }
  | {
      action: "query"
      input: string
      query: string
      mode: "jsonpath" | "pointer"
    }
  | { action: "compare"; input: string; other: string }
  | { action: "patch"; input: string; patch: string }
  | { action: "schema"; input: string; schema: string }
  | {
      action: "convert"
      input: string
      format: Conversion
      protectCsv?: boolean
      typeName?: string
    }
  | { action: "table"; input: string }
  | { action: "value"; input: string; pointer: string }
export type JsonResult = {
  output?: string
  extension?: string
  mime?: string
  note?: string
  stats?: Omit<JsonDocument, "root">
  rows?: TreeRow[]
  total?: number
  paths?: string[]
  count?: number
  changes?: JsonChange[]
  patch?: string
  valid?: boolean
  errors?: { path: string; keyword: string; message: string; details: string }[]
  table?: { columns: string[]; rows: string[][]; total: number }
}
export type JsonWorkerResponse =
  | { id: number; result: JsonResult }
  | { id: number; error: string; offset?: number }
