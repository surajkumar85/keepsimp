/**
 * Making a PDF's own form, as the "Create a fillable PDF form" door does:
 * fields are added, reshaped, renamed, deleted, laid out, put in order and
 * copied by the form designer's own steps (`MakeFieldOp`), and fields a
 * page seems to ask for are suggested by the same judge the panel uses.
 */
import type { Box } from "@/lib/pdf-editor/geometry"
import { labelOf, type FormField } from "@/lib/pdf-editor/forms"
import {
  copyName,
  defaultSpec,
  fitField,
  MAKE_KINDS,
  MAX_LENGTH,
  MIN_FIELD,
  MOST_CHOICES,
  nameTaken,
  validName,
  type FieldSpec,
  type MakeFieldOp,
  type MakeKind,
} from "@/lib/pdf-editor/form-fields"
import {
  aligned,
  EDGES,
  readingOrder,
  sized,
  spread,
  type Dimension,
  type Edge,
} from "@/lib/pdf-editor/form-layout"
import { lock, pagesOf, password, plural, type LockInput } from "./pdf"
import type { PdfEngine } from "./pdf-engine"
import { editKit, type EditText, type Session } from "./pdf-kit"
import {
  asTool,
  fileProperty,
  ToolError,
  type AgentTool,
  type JsonSchema,
} from "./registry"

/** A form field with the page it is on. */
interface Placed {
  page: number
  field: FormField
}

/** Every place of every field, by name, in page order. */
export function placesByName(fields: readonly (readonly FormField[])[]) {
  const byName = new Map<string, Placed[]>()
  fields.forEach((list, page) =>
    list.forEach((field) =>
      byName.set(field.name, [
        ...(byName.get(field.name) ?? []),
        { page, field },
      ])
    )
  )
  return byName
}

/** The usual size of a field of a kind, as the designer makes one with a click. */
export const usualSize = (kind: MakeKind) => ({
  width: kind === "check" ? 20 : 180,
  height: kind === "multiline" || kind === "list" || kind === "radio" ? 64 : 24,
})

const boxSchema: Record<string, JsonSchema> = {
  page: { type: "integer", minimum: 1 },
  x: {
    type: "number",
    minimum: 0,
    description: "In points from the page's left edge as it is shown.",
  },
  y: {
    type: "number",
    minimum: 0,
    description: "In points from the page's top edge.",
  },
  width: { type: "number", minimum: MIN_FIELD },
  height: { type: "number", minimum: MIN_FIELD },
}
const settingsSchema: Record<string, JsonSchema> = {
  tooltip: {
    type: "string",
    maxLength: 300,
    description: "What a reader shows when the field is pointed at.",
  },
  required: { type: "boolean" },
  maxLength: {
    type: "integer",
    minimum: 0,
    maximum: MAX_LENGTH,
    description: "For text: the most letters it takes (0 for no limit).",
  },
}

export function pdfFormTools(engine: PdfEngine, text: EditText): AgentTool[] {
  const { editing } = editKit(engine, text)

  /** A form this designer can work on: none with an XFA part, which would ignore what is made. */
  const designable = (session: Session) => {
    if (session.state.form.xfa)
      throw new ToolError(
        `${session.name} is an XFA form: fields made here would be ignored by the programs that read it. Its fields can only be filled.`
      )
  }

  const change = async (
    session: Session,
    label: string,
    ops: MakeFieldOp[]
  ) => {
    const news = await engine.editMakeFields(session.id, { label, ops })
    return news
  }

  const suggest: AgentTool<{
    file: string
    password?: string
    pages?: string
  }> = {
    name: "suggest_pdf_form_fields",
    title: "Suggest form fields",
    description:
      "Reads pages and suggests the fields their drawing seems to ask for: a rule to write on, an empty box, a small square to tick, a run of underscores, each with a name taken from the words beside or above it. It is judged by look and can be wrong: nothing is added. Pass the ones wanted to create_pdf_form_fields (or use its fromSuggestions).",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        pages: {
          type: "string",
          maxLength: 20000,
          description: 'Such as "1-2"; every page by default, at most 50.',
        },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "" },
        async (session) => {
          const pages = input.pages
            ? [...new Set(pagesOf(input.pages, session.pages, "pages"))]
            : Array.from({ length: session.pages }, (_, page) => page)
          if (pages.length > 50)
            throw new ToolError(
              `That is ${pages.length} pages; suggest for at most 50 at a time.`
            )
          const suggestions = []
          for (const page of pages)
            for (const found of await engine.suggestFields(session.id, page))
              suggestions.push({
                page: page + 1,
                kind: found.kind,
                name: found.name,
                box: found.box,
                from: found.from,
              })
          return {
            answerOnly: true,
            said: [
              suggestions.length
                ? `${plural(suggestions.length, "field")} suggested on ${plural(new Set(suggestions.map((one) => one.page)).size, "page")}, judged by look: check them before adding.`
                : "No fields suggested: nothing on these pages looks like a place to write or tick.",
            ],
            data: suggestions,
          }
        }
      ),
  }

  type Wanted = {
    kind: MakeKind
    page: number
    x: number
    y: number
    width?: number
    height?: number
    name?: string
    tooltip?: string
    required?: boolean
    maxLength?: number
    options?: string[]
    multiple?: boolean
  }
  const create: AgentTool<{
    file: string
    password?: string
    fields?: Wanted[]
    fromSuggestions?: string
    lock?: LockInput
  }> = {
    name: "create_pdf_form_fields",
    title: "Make a fillable PDF form",
    description:
      "Adds the PDF's own form fields, as Create a fillable PDF form does: one-line and multiline text, checkboxes, radio groups (one name, a choice for each option), dropdowns, lists (several choices with multiple), dates (written with a fixed ISO date format that viewers may use; nothing is run) and empty signature places (which prove nothing and sign nothing). Names must be unique, without dots. fromSuggestions adds every field suggest_pdf_form_fields finds on those pages. The result can be filled with fill_pdf_form or in any PDF reader.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        fields: {
          type: "array",
          minItems: 1,
          maxItems: 500,
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: [...MAKE_KINDS] },
              ...boxSchema,
              name: { type: "string", minLength: 1, maxLength: 100 },
              ...settingsSchema,
              options: {
                type: "array",
                items: { type: "string", minLength: 1, maxLength: 200 },
                minItems: 1,
                maxItems: MOST_CHOICES,
                description:
                  "For a radio group, a dropdown or a list: its choices.",
              },
              multiple: {
                type: "boolean",
                description: "For a list: several can be chosen.",
              },
            },
            required: ["kind", "page", "x", "y"],
            additionalProperties: false,
          },
        },
        fromSuggestions: {
          type: "string",
          maxLength: 20000,
          description:
            'Pages, such as "1-2", whose suggested fields are all added.',
        },
        lock,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-form" },
        async (session) => {
          designable(session)
          const names = [...placesByName(session.state.fields).keys()]
          const ops: Extract<MakeFieldOp, { do: "add" }>[] = []
          const take = (name: string, unique: boolean) => {
            if (!validName(name))
              throw new ToolError(
                `"${name}" cannot be a field's name: at most 100 letters, without dots.`
              )
            let chosen = name
            for (let n = 2; nameTaken(names, chosen); n++) {
              if (!unique)
                throw new ToolError(
                  `The form already has a field called "${name}".`
                )
              chosen = `${name.slice(0, 90)}_${n}`
            }
            names.push(chosen)
            return chosen
          }
          for (const wanted of input.fields ?? []) {
            const size = session.sizes[wanted.page - 1]
            if (!size)
              throw new ToolError(
                `There are ${session.pages} pages; page ${wanted.page} is not one of them.`
              )
            const spec: FieldSpec = defaultSpec(wanted.kind, names)
            const field: FieldSpec = {
              ...spec,
              name:
                wanted.name === undefined
                  ? take(spec.name, false)
                  : take(wanted.name, false),
              tooltip: wanted.tooltip ?? "",
              required: Boolean(wanted.required),
              maxLength: wanted.maxLength ?? 0,
              ...(wanted.options ? { options: wanted.options } : {}),
              multiple: Boolean(wanted.multiple),
            }
            if (["radio", "choice", "list"].includes(field.kind)) {
              if (new Set(field.options).size !== field.options.length)
                throw new ToolError(
                  `The choices of "${field.name}" must differ.`
                )
              if (field.kind === "radio" && field.options.length < 2)
                throw new ToolError(
                  `A radio group needs two choices or more ("${field.name}").`
                )
            } else if (wanted.options)
              throw new ToolError(
                `A ${wanted.kind} field takes no options ("${field.name}").`
              )
            const usual = usualSize(wanted.kind)
            const box = fitField(
              {
                x: wanted.x,
                y: wanted.y,
                width: wanted.width ?? usual.width,
                height: wanted.height ?? usual.height,
              },
              size
            )
            ops.push({ do: "add", page: wanted.page - 1, box, field })
          }
          let suggested = 0
          if (input.fromSuggestions)
            for (const page of new Set(
              pagesOf(input.fromSuggestions, session.pages, "fromSuggestions")
            ))
              for (const found of await engine.suggestFields(
                session.id,
                page
              )) {
                ops.push({
                  do: "add",
                  page,
                  box: found.box,
                  field: {
                    ...defaultSpec(found.kind, names),
                    name: take(found.name, true),
                  },
                })
                suggested++
              }
          if (!ops.length)
            throw new ToolError(
              input.fromSuggestions
                ? "Nothing was suggested on those pages: no field was added."
                : 'Give "fields" or "fromSuggestions".'
            )
          await change(
            session,
            ops.length === 1 ? "Add a field" : `Add ${ops.length} fields`,
            ops
          )
          const said = [
            `${plural(ops.length, "field")} added${suggested ? `, ${suggested} of them as suggested` : ""}.`,
          ]
          if (ops.some((op) => op.field.kind === "signature"))
            said.push(
              "A signature place is empty: it signs nothing and proves nothing."
            )
          if (ops.some((op) => op.field.kind === "date"))
            said.push(
              "A date is written as 2026-10-22; viewers that run form scripts may format it, and none is run here."
            )
          return {
            said,
            data: {
              names: ops.map((op) => op.field.name),
            },
          }
        }
      ),
  }

  type Edit = {
    name: string
    choice?: number
    x?: number
    y?: number
    width?: number
    height?: number
    rename?: string
    tooltip?: string
    required?: boolean
    maxLength?: number
    delete?: boolean
    copyTo?: string
  }
  const edit: AgentTool<{
    file: string
    password?: string
    changes?: Edit[]
    align?: { names: string[]; edge: Edge }
    space?: { names: string[]; direction: "across" | "down" }
    sameSize?: { names: string[]; like: string; dimension?: Dimension }
    tabOrder?: { page: number; names?: string[] }
    lock?: LockInput
  }> = {
    name: "edit_pdf_form_fields",
    title: "Change a PDF form's fields",
    description:
      "Changes the fields of a PDF's form as the form designer does: moves or resizes a field (one choice of a radio group by its number), renames it, sets its tooltip, whether it must be filled in and its longest text, deletes it (a radio group whole), copies it to other pages as fields of their own (named after it and the page), lines fields of one page up along an edge, spaces three or more evenly, gives them the size of one of them, and sets the order Tab goes through a page's fields (by names, or by rows from the top). Field names come from list_pdf_form_fields.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 500,
          items: {
            type: "object",
            properties: {
              name: { type: "string", minLength: 1, maxLength: 300 },
              choice: {
                type: "integer",
                minimum: 1,
                description:
                  "For a radio group: which choice to move, from 1 in page order.",
              },
              x: boxSchema.x,
              y: boxSchema.y,
              width: boxSchema.width,
              height: boxSchema.height,
              rename: { type: "string", minLength: 1, maxLength: 100 },
              ...settingsSchema,
              delete: { type: "boolean" },
              copyTo: {
                type: "string",
                maxLength: 20000,
                description: 'Pages to copy it to, such as "2-5" or "all".',
              },
            },
            required: ["name"],
            additionalProperties: false,
          },
        },
        align: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 500,
            },
            edge: { type: "string", enum: [...EDGES] },
          },
          required: ["names", "edge"],
          additionalProperties: false,
        },
        space: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 500,
            },
            direction: { type: "string", enum: ["across", "down"] },
          },
          required: ["names", "direction"],
          additionalProperties: false,
        },
        sameSize: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 500,
            },
            like: { type: "string" },
            dimension: { type: "string", enum: ["width", "height", "both"] },
          },
          required: ["names", "like"],
          additionalProperties: false,
        },
        tabOrder: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1 },
            names: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 5000,
              description:
                "The page's fields in the order Tab goes; by rows from the top when left out.",
            },
          },
          required: ["page"],
          additionalProperties: false,
        },
        lock,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-form" },
        async (session) => {
          designable(session)
          const byName = placesByName(session.state.fields)
          const named = (name: string) => {
            const places = byName.get(name)
            if (!places)
              throw new ToolError(
                `The form has no field called "${name}". list_pdf_form_fields gives the names.`
              )
            return places
          }
          const said: string[] = []
          const ops: MakeFieldOp[] = []
          const deleted: MakeFieldOp[] = []
          // Where each field is now: a move and each layout after it start from where the last left it, as on the page.
          const now = new Map<string, Box>()
          for (const list of session.state.fields)
            for (const one of list) now.set(one.id, one.box)
          const moveTo = (page: number, id: string, box: Box) =>
            now.set(id, fitField(box, session.sizes[page]))
          for (const asked of input.changes ?? []) {
            const places = named(asked.name)
            if (places.some((one) => one.field.signed))
              throw new ToolError(
                `"${asked.name}" holds a certificate signature: it cannot be changed here.`
              )
            let did = false
            const place =
              asked.choice === undefined
                ? places[0]
                : (places[asked.choice - 1] ??
                  (() => {
                    throw new ToolError(
                      `"${asked.name}" has ${places.length} ${places.length === 1 ? "place" : "choices"}; there is no choice ${asked.choice}.`
                    )
                  })())
            if (
              places.length > 1 &&
              asked.choice === undefined &&
              [asked.x, asked.y, asked.width, asked.height].some(
                (one) => one !== undefined
              )
            )
              throw new ToolError(
                `"${asked.name}" has ${places.length} places: say which with "choice" to move one.`
              )
            if (
              [asked.x, asked.y, asked.width, asked.height].some(
                (one) => one !== undefined
              )
            ) {
              const was = place.field.box
              moveTo(place.page, place.field.id, {
                x: asked.x ?? was.x,
                y: asked.y ?? was.y,
                width: asked.width ?? was.width,
                height: asked.height ?? was.height,
              })
              did = true
            }
            if (
              [
                asked.rename,
                asked.tooltip,
                asked.required,
                asked.maxLength,
              ].some((one) => one !== undefined)
            ) {
              const parts = place.field.name.split(".")
              const last = asked.rename ?? parts[parts.length - 1]
              if (!validName(last))
                throw new ToolError(
                  `"${last}" cannot be a field's name: at most 100 letters, without dots.`
                )
              const full = [...parts.slice(0, -1), last].join(".")
              if (
                asked.rename &&
                nameTaken([...byName.keys()], full, place.field.name)
              )
                throw new ToolError(
                  `The form already has a field called "${full}".`
                )
              ops.push({
                do: "properties",
                page: place.page,
                id: place.field.id,
                name: last,
                // The label is the field's name made readable when it has no hint: that is no hint to keep.
                tooltip:
                  asked.tooltip ??
                  (place.field.label === labelOf(place.field.name)
                    ? ""
                    : place.field.label),
                required: asked.required ?? place.field.required,
                maxLength: asked.maxLength ?? place.field.maxLength,
              })
              did = true
            }
            if (asked.copyTo) {
              if (place.field.kind === "radio")
                throw new ToolError(
                  `"${asked.name}" is a radio group: its choices belong together and are not copied.`
                )
              const to =
                asked.copyTo.trim().toLowerCase() === "all"
                  ? Array.from(
                      { length: session.pages },
                      (_, page) => page
                    ).filter((page) => page !== place.page)
                  : [
                      ...new Set(
                        pagesOf(asked.copyTo, session.pages, "copyTo")
                      ),
                    ].filter((page) => page !== place.page)
              if (!to.length)
                throw new ToolError(
                  `"${asked.name}" is already on those pages.`
                )
              ops.push({ do: "copy", page: place.page, id: place.field.id, to })
              said.push(
                `${asked.name} copied to ${plural(to.length, "page")} as ${to
                  .slice(0, 3)
                  .map((page) => copyName(asked.name, page, [...byName.keys()]))
                  .join(", ")}${to.length > 3 ? "…" : ""}.`
              )
              did = true
            }
            if (asked.delete) {
              deleted.push({
                do: "delete",
                page: place.page,
                id: place.field.id,
              })
              did = true
            }
            if (!did) throw new ToolError(`${asked.name}: nothing to change.`)
          }
          /** Fields of one page laid out together, as the designer lays them out. */
          const onePage = (names: readonly string[], what: string) => {
            const placed = names.map((name) => {
              const places = named(name)
              if (places.length > 1)
                throw new ToolError(
                  `"${name}" has ${places.length} places; ${what} works on fields with one.`
                )
              return places[0]
            })
            const page = placed[0].page
            if (placed.some((one) => one.page !== page))
              throw new ToolError(`Fields are ${what} on one page at a time.`)
            return {
              page,
              items: placed.map((one) => ({
                id: one.field.id,
                box: now.get(one.field.id)!,
              })),
            }
          }
          const moves = (page: number, moved: { id: string; box: Box }[]) => {
            for (const one of moved) moveTo(page, one.id, one.box)
          }
          if (input.align) {
            const { page, items } = onePage(input.align.names, "lined up")
            moves(page, aligned(items, input.align.edge))
            said.push(
              `${plural(items.length, "field")} lined up along their ${input.align.edge}.`
            )
          }
          if (input.space) {
            const { page, items } = onePage(input.space.names, "spaced")
            moves(page, spread(items, input.space.direction))
            said.push(
              `${plural(items.length, "field")} spaced evenly ${input.space.direction}.`
            )
          }
          if (input.sameSize) {
            if (!input.sameSize.names.includes(input.sameSize.like))
              throw new ToolError(
                `"${input.sameSize.like}" must be one of the names given.`
              )
            const { page, items } = onePage(input.sameSize.names, "sized")
            const model = named(input.sameSize.like)[0].field.id
            moves(page, sized(items, model, input.sameSize.dimension ?? "both"))
            said.push(
              `${plural(items.length, "field")} given the size of ${input.sameSize.like}.`
            )
          }
          if (input.tabOrder) {
            const page = input.tabOrder.page - 1
            if (page >= session.pages)
              throw new ToolError(
                `There are ${session.pages} pages; page ${page + 1} is not one of them.`
              )
            const onIt = session.state.fields[page]
            if (!onIt.length)
              throw new ToolError(`Page ${page + 1} has no fields.`)
            let ids: string[]
            if (input.tabOrder.names) {
              ids = input.tabOrder.names.flatMap((name) => {
                const here = named(name).filter((one) => one.page === page)
                if (!here.length)
                  throw new ToolError(`"${name}" is not on page ${page + 1}.`)
                return here.map((one) => one.field.id)
              })
              const rest = onIt
                .map((field) => field.id)
                .filter((id) => !ids.includes(id))
              ids = [...ids, ...rest]
            } else
              ids = readingOrder(
                onIt.map((field) => ({ id: field.id, box: now.get(field.id)! }))
              )
            ops.push({ do: "order", page, ids })
            said.push(
              `Tab goes through page ${page + 1}'s fields ${input.tabOrder.names ? "in the order given" : "by rows from the top"}.`
            )
          }
          // One move for every field that ends somewhere else, before the other changes.
          const reshaped: MakeFieldOp[] = []
          session.state.fields.forEach((list, page) => {
            for (const one of list) {
              const box = now.get(one.id)!
              if (
                box.x !== one.box.x ||
                box.y !== one.box.y ||
                box.width !== one.box.width ||
                box.height !== one.box.height
              )
                reshaped.push({ do: "reshape", page, id: one.id, box })
            }
          })
          const all = [...reshaped, ...ops, ...deleted]
          if (!all.length)
            throw new ToolError(
              "Give changes, or fields to align, space, size or put in order."
            )
          await change(session, "Change form fields", all)
          const counts = (kind: MakeFieldOp["do"]) =>
            all.filter((op) => op.do === kind).length
          const summary = [
            counts("reshape")
              ? `${plural(counts("reshape"), "field")} moved or resized`
              : "",
            counts("properties")
              ? `${plural(counts("properties"), "field")} renamed or set`
              : "",
            counts("delete")
              ? `${plural(counts("delete"), "field")} deleted`
              : "",
          ].filter(Boolean)
          return {
            said: [
              ...(summary.length ? [`${summary.join(", ")}.`] : []),
              ...said,
            ],
          }
        }
      ),
  }

  return [suggest, create, edit].map((tool) => asTool(tool as AgentTool<never>))
}
