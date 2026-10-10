import Ajv from "ajv"
import Ajv2020 from "ajv/dist/2020"
import Ajv2019 from "ajv/dist/2019"
import addFormats from "ajv-formats"
import {
  parseDocument,
  nativeDocument,
  type JsonNode,
  visitNodes,
} from "./document"

export function validateSchema(input: string, schemaText: string) {
  if (schemaText.length > 100_000)
    throw new Error("Use a schema smaller than 100,000 characters.")
  const document = parseDocument(input),
    schemaDocument = parseDocument(schemaText)
  visitNodes(schemaDocument.root, (node: JsonNode, pointer) => {
    if (
      pointer.endsWith("/$async") &&
      node.type === "boolean" &&
      node.raw === "true"
    )
      throw new Error(
        "Async schemas are not supported. Use a local, synchronous schema."
      )
  })
  const schema = nativeDocument(schemaDocument) as
    Record<string, unknown> | boolean
  if (
    typeof schema !== "boolean" &&
    (!schema || typeof schema !== "object" || Array.isArray(schema))
  )
    throw new Error("A JSON Schema must be an object or a boolean.")
  const draft =
    typeof schema === "object" && typeof schema.$schema === "string"
      ? schema.$schema
      : "https://json-schema.org/draft/2020-12/schema"
  if (
    !/^(https?:\/\/json-schema\.org\/draft-07\/schema#?|https:\/\/json-schema\.org\/draft\/(2019-09|2020-12)\/schema#?)$/u.test(
      draft
    )
  )
    throw new Error("Choose JSON Schema draft-07, 2019-09 or 2020-12.")
  const options = {
    allErrors: true,
    ownProperties: true,
    strictSchema: true,
    strictTypes: false,
    strictTuples: false,
    allowUnionTypes: true,
    validateFormats: true,
  }
  const validator = draft.includes("2020-12")
    ? new Ajv2020(options)
    : draft.includes("2019-09")
      ? new Ajv2019(options)
      : new Ajv(options)
  addFormats(validator)
  try {
    const validate = validator.compile(schema)
    const valid = validate(nativeDocument(document)) as boolean
    return {
      valid,
      errors: (validate.errors ?? []).slice(0, 100).map((error) => ({
        path: error.instancePath || "(root)",
        keyword: error.keyword,
        message: error.message!,
        details: JSON.stringify(error.params),
      })),
    }
  } catch (error) {
    throw new Error(
      `Schema validation could not run: ${(error as Error).message}. References must be inside the pasted schema; no URLs are fetched.`
    )
  }
}
