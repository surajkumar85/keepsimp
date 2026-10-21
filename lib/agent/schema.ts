/**
 * Every input is checked against its tool's schema before the tool runs:
 * WebMCP does not check it, and an agent can send anything.
 */
import Ajv, { type ErrorObject } from "ajv"
import type { JsonSchema } from "./registry"

const ajv = new Ajv({ allErrors: true, strict: true })
// Marks the properties that name files; it checks nothing itself.
ajv.addKeyword({ keyword: "x-keepsimp", schemaType: "string" })

const named = (path: string) =>
  path ? `"${path.slice(1).replace(/\//g, ".")}"` : "The input"

/** One error, in words: what is wrong and where. */
export function said(error: ErrorObject): string {
  const where = named(error.instancePath)
  const params = error.params as Record<string, unknown>
  switch (error.keyword) {
    case "required":
      return `"${params.missingProperty}" is needed`
    case "additionalProperties":
      return `${where} has "${params.additionalProperty}", which this tool does not take`
    case "enum":
      return `${where} must be one of ${(params.allowedValues as unknown[])
        .map((value) => JSON.stringify(value))
        .join(", ")}`
    default:
      return `${where} ${error.message}`
  }
}

/** Checks inputs against `schema`: null when one fits, or what is wrong with it. */
export function checker(schema: JsonSchema) {
  const validate = ajv.compile(schema)
  return (input: unknown): string | null => {
    if (validate(input)) return null
    const errors = validate.errors!
    const shown = errors.slice(0, 3).map(said)
    if (errors.length > 3) shown.push(`${errors.length - 3} more`)
    return `${shown.join("; ")}.`
  }
}
