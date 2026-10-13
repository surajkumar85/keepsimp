"use client"
import { useId, useState } from "react"
import { IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  MAX_LENGTH,
  MAKE_KINDS,
  KIND_NAMES,
  validName,
  type MakeKind,
} from "@/lib/pdf-editor/form-fields"
import type { FormField } from "@/lib/pdf-editor/forms"
import type { Editor } from "./use-editor"
import type { MakeForm } from "./use-make-form"
const SELECT =
  "h-11 w-full rounded-md border border-input bg-background px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
function Properties({
  makeForm,
  field,
  busy,
}: {
  makeForm: MakeForm
  field: FormField
  busy: boolean
}) {
  const ids = useId(),
    [name, setName] = useState(field.name.split(".").at(-1)!),
    [tooltip, setTooltip] = useState(field.label),
    [required, setRequired] = useState(field.required),
    [limit, setLimit] = useState(String(field.maxLength))
  if (field.signed)
    return (
      <p className="text-sm text-muted-foreground">
        This certificate-signature field is filled and cannot be changed here.
      </p>
    )
  const valid =
    validName(name) &&
    Number.isInteger(Number(limit)) &&
    Number(limit) >= 0 &&
    Number(limit) <= MAX_LENGTH
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void makeForm.save({
          name,
          tooltip,
          required,
          maxLength: Number(limit),
        })
      }}
    >
      <h3 className="font-heading text-sm font-medium">Selected field</h3>
      <label className="block space-y-1 text-xs" htmlFor={`${ids}-name`}>
        <span>Field name</span>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!validName(name) || undefined}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Names must be unique. No dots or control characters; a nested field
        keeps its parent.
      </p>
      <label className="block space-y-1 text-xs" htmlFor={`${ids}-hint`}>
        <span>Field tooltip</span>
        <Input
          id={`${ids}-hint`}
          value={tooltip}
          maxLength={300}
          onChange={(e) => setTooltip(e.target.value)}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="size-4 accent-primary"
        />
        Required field
      </label>
      {field.kind === "text" && (
        <label className="block space-y-1 text-xs" htmlFor={`${ids}-limit`}>
          <span>Maximum characters (0 means unlimited)</span>
          <Input
            id={`${ids}-limit`}
            type="number"
            min={0}
            max={MAX_LENGTH}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !valid}>
          Save field properties
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void makeForm.remove()}
        >
          Delete field
        </Button>
      </div>
      {field.kind === "radio" && (
        <p className="text-xs text-muted-foreground">
          A name, tooltip or requirement belongs to the whole group. Delete
          removes every choice; moving or resizing affects this choice only.
        </p>
      )}
    </form>
  )
}
export function FormDesignPanel({
  makeForm,
  editor,
}: {
  makeForm: MakeForm
  editor: Editor
}) {
  const ids = useId(),
    spec = makeForm.spec,
    choices = ["radio", "choice", "list"].includes(spec.kind),
    text = ["text", "multiline", "date"].includes(spec.kind)
  const update = (v: Partial<typeof spec>) =>
    makeForm.setSpec({ ...spec, ...v })
  return (
    <aside
      aria-labelledby={`${ids}-title`}
      data-testid="form-design-panel"
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[60%] flex-col border-t bg-popover shadow-lg md:static md:max-h-none md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none"
    >
      <div className="flex items-center justify-between border-b p-2">
        <h2 id={`${ids}-title`} className="font-heading text-sm font-medium">
          Form field settings
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close form field settings"
          onClick={() => makeForm.setPanel(false)}
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-3">
        {editor.form.xfa && (
          <p role="alert" className="text-sm text-destructive">
            XFA forms cannot be changed here. Use a PDF with ordinary fields.
          </p>
        )}
        {makeForm.field && (
          <Properties
            key={`${makeForm.field.id}/${makeForm.field.name}/${makeForm.field.required}/${makeForm.field.maxLength}/${makeForm.field.label}`}
            makeForm={makeForm}
            field={makeForm.field}
            busy={editor.busy || editor.form.xfa}
          />
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void makeForm.add()
          }}
        >
          <h3 className="font-heading text-sm font-medium">New field</h3>
          <label className="block space-y-1 text-xs" htmlFor={`${ids}-kind`}>
            <span>New field type</span>
            <select
              id={`${ids}-kind`}
              className={SELECT}
              value={spec.kind}
              onChange={(e) => makeForm.kind(e.target.value as MakeKind)}
            >
              {MAKE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_NAMES[kind]}
                </option>
              ))}
            </select>
          </label>
          <label
            className="block space-y-1 text-xs"
            htmlFor={`${ids}-new-name`}
          >
            <span>New field name</span>
            <Input
              id={`${ids}-new-name`}
              value={spec.name}
              maxLength={100}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <label
            className="block space-y-1 text-xs"
            htmlFor={`${ids}-new-hint`}
          >
            <span>New field tooltip</span>
            <Input
              id={`${ids}-new-hint`}
              value={spec.tooltip}
              maxLength={300}
              onChange={(e) => update({ tooltip: e.target.value })}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
            <input
              type="checkbox"
              checked={spec.required}
              onChange={(e) => update({ required: e.target.checked })}
              className="size-4 accent-primary"
            />
            Make new field required
          </label>
          {text && (
            <label
              className="block space-y-1 text-xs"
              htmlFor={`${ids}-new-length`}
            >
              <span>New field maximum characters</span>
              <Input
                id={`${ids}-new-length`}
                type="number"
                min={0}
                max={MAX_LENGTH}
                value={spec.maxLength}
                onChange={(e) => update({ maxLength: Number(e.target.value) })}
              />
            </label>
          )}
          {choices && (
            <label
              className="block space-y-1 text-xs"
              htmlFor={`${ids}-choices`}
            >
              <span>Choices, one per line</span>
              <textarea
                id={`${ids}-choices`}
                rows={3}
                value={spec.options.join("\n")}
                onChange={(e) =>
                  update({ options: e.target.value.split("\n") })
                }
                className="w-full rounded-md border border-input bg-background p-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              />
            </label>
          )}
          {spec.kind === "list" && (
            <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
              <input
                type="checkbox"
                checked={spec.multiple}
                onChange={(e) => update({ multiple: e.target.checked })}
                className="size-4 accent-primary"
              />
              Allow several choices
            </label>
          )}
          {spec.kind === "date" && (
            <p className="text-xs text-muted-foreground">
              Written as yyyy-mm-dd. Other viewers may format it; KeepSimp reads
              the fixed format action as text and never runs scripts.
            </p>
          )}
          {spec.kind === "signature" && (
            <p className="text-xs text-muted-foreground">
              An empty signature place. It makes no certificate and proves
              nothing about who signed.
            </p>
          )}
          <Button
            type="submit"
            disabled={editor.busy || editor.form.xfa}
            className="w-full"
          >
            Add field to page
          </Button>
        </form>
        <section className="space-y-1">
          <h3 className="font-heading text-sm font-medium">
            Fields in this file
          </h3>
          {editor.fields
            .flatMap((fields, page) =>
              fields.map((field) => (
                <Button
                  key={`${page}/${field.id}`}
                  variant="ghost"
                  className="h-auto min-h-11 w-full justify-start text-left whitespace-normal md:min-h-9"
                  aria-pressed={
                    makeForm.chosen?.id === field.id &&
                    makeForm.chosen.page === page
                  }
                  onClick={() => makeForm.setChosen({ page, id: field.id })}
                >
                  {field.label} · page {page + 1}
                </Button>
              ))
            )
            .slice(0, 200)}
          {!editor.fields.flat().length && (
            <p className="text-xs text-muted-foreground">
              No fields yet. Add one above.
            </p>
          )}
        </section>
      </div>
    </aside>
  )
}
