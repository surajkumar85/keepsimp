/**
 * What the JSON worker does with each job, as a plain function: the worker
 * answers with it, and the agent tools' tests call it to use the very same
 * code without a worker.
 */
import {
  JsonInputError,
  parseDocument,
  treeRows,
  nodeAt,
  renderJson,
  uniqueDocument,
  limitText,
} from "./document"
import { transformJson } from "./transforms"
import { queryJson } from "./query"
import { compareJson, applyJsonPatch } from "./compare"
import { convertJson, tableData } from "./convert"
import { validateSchema } from "./schema"
import type { JsonJob, JsonResult, JsonWorkerResponse } from "./protocol"

export function runJob(job: JsonJob): JsonResult {
  limitText(job.input)
  let result: JsonResult
  switch (job.action) {
    case "inspect": {
      const document = parseDocument(job.input)
      const { root: _, ...stats } = document
      void _
      result = {
        stats,
        ...treeRows(document, job.expanded, job.search, job.offset),
      }
      break
    }
    case "transform":
      result = {
        output: transformJson(job.input, job.transform, job.indent, job.keys),
      }
      break
    case "query":
      result = queryJson(job.input, job.query, job.mode)
      break
    case "compare": {
      const comparison = compareJson(job.input, job.other)
      result = {
        ...comparison,
        output: comparison.patch,
        note: "Objects ignore key order; arrays compare by position. Patch direction is source → comparison.",
      }
      break
    }
    case "patch":
      result = { output: applyJsonPatch(job.input, job.patch) }
      break
    case "schema":
      result = validateSchema(job.input, job.schema)
      break
    case "convert":
      result = convertJson(job.input, job.format, job.protectCsv, job.typeName)
      break
    case "table": {
      const table = tableData(uniqueDocument(parseDocument(job.input)).root)
      result = {
        table: {
          ...table,
          rows: table.rows.slice(0, 100),
          total: table.rows.length,
        },
      }
      break
    }
    case "value":
      result = {
        output: renderJson(
          nodeAt(uniqueDocument(parseDocument(job.input)).root, job.pointer)
        ),
      }
      break
  }
  if (result.output !== undefined) limitText(result.output)
  return result
}

/** The worker's answer to a job: its result, or its error with where in the input it is. */
export function answer(id: number, job: JsonJob): JsonWorkerResponse {
  try {
    return { id, result: runJob(job) }
  } catch (error) {
    return {
      id,
      error: (error as Error).message,
      ...(error instanceof JsonInputError ? { offset: error.offset } : {}),
    }
  }
}
