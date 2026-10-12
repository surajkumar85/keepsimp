"use client"

import { useId, useRef, useState } from "react"
import {
  chosenOf,
  fillable,
  inOrder,
  isEmpty,
  readDate,
  writeDate,
  type FormField,
} from "@/lib/pdf-editor/forms"
import { cn } from "cn"
import type { Editor } from "./use-editor"

/**
 * A control that lies over a field and is seen through until it is being
 * used: the page under it is the file's own picture of the field, so what
 * is shown at rest is what the file holds.
 */
const CONTROL =
  "absolute inset-0 size-full rounded-none border-0 bg-white p-0 text-black opacity-0 outline-none focus:opacity-100"

/** A field to type in: a line, several lines, a password or a date. */
function Typed({
  editor,
  page,
  field,
}: {
  editor: Editor
  page: number
  field: FormField
}) {
  /** What is being typed; null while the field is not in use. */
  const [draft, setDraft] = useState<string | null>(null)
  /** The field is being left with Escape: what was typed is not kept. */
  const dropped = useRef(false)
  const held = field.date ? readDate(field.value, field.date) : field.value
  // A date the field holds in some other form is typed over as words.
  const dated = Boolean(field.date) && (held !== "" || field.value === "")
  const now = dated ? held : field.value
  const send = () => {
    if (dropped.current || draft === null || draft === now) return
    editor.fillField(
      page,
      field,
      dated && draft ? writeDate(draft, field.date!) : draft
    )
  }
  const common = {
    "aria-label": field.date ? `${field.label} (${field.date})` : field.label,
    "aria-required": field.required || undefined,
    value: draft ?? now,
    onFocus: () => {
      dropped.current = false
      setDraft(now)
    },
    onBlur: () => {
      send()
      setDraft(null)
    },
    className: cn(CONTROL, "px-0.5", field.multiline && "resize-none py-0.5"),
    // In the page's points: the layer is scaled with its page.
    style: {
      fontSize: Math.max(
        6,
        Math.min(12, field.box.height * (field.multiline ? 0.25 : 0.62))
      ),
    },
  }
  /** Escape gives the field back as it was; it must not close the window. */
  const leave = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return false
    event.preventDefault()
    event.stopPropagation()
    dropped.current = true
    event.currentTarget.blur()
    return true
  }
  if (field.multiline)
    return (
      <textarea
        {...common}
        maxLength={field.maxLength || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={leave}
      />
    )
  return (
    <input
      {...common}
      type={dated ? "date" : field.password ? "password" : "text"}
      maxLength={field.maxLength || undefined}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        // Enter puts what was typed into the file and stays in the field.
        if (!leave(event) && event.key === "Enter") send()
      }}
    />
  )
}

/** A drop-down, and one that also takes words that are not on its list. */
function Choice({
  editor,
  page,
  field,
}: {
  editor: Editor
  page: number
  field: FormField
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  if (field.custom)
    return (
      <>
        <input
          aria-label={field.label}
          aria-required={field.required || undefined}
          list={id}
          autoComplete="off"
          value={draft ?? field.value}
          onFocus={() => setDraft(field.value)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== null && draft !== field.value)
              editor.fillField(page, field, draft)
            setDraft(null)
          }}
          className={cn(CONTROL, "px-0.5")}
          style={{ fontSize: Math.min(12, field.box.height * 0.62) }}
        />
        <datalist id={id}>
          {field.options.map((option, at) => (
            <option key={option} value={option}>
              {field.shown[at] ?? option}
            </option>
          ))}
        </datalist>
      </>
    )
  return (
    <select
      aria-label={field.label}
      aria-required={field.required || undefined}
      value={field.value}
      onChange={(event) => editor.fillField(page, field, event.target.value)}
      className={cn(CONTROL, "cursor-pointer")}
      style={{ fontSize: Math.min(12, field.box.height * 0.62) }}
    >
      {/* Nothing chosen is one of the choices, so that a choice can be taken back. */}
      <option value="">{field.options.includes("") ? "" : "Nothing"}</option>
      {field.options
        .filter((option) => option !== "")
        .map((option, at) => (
          <option key={option} value={option}>
            {field.shown[at] ?? option}
          </option>
        ))}
    </select>
  )
}

/** A list with its options in view, of which one or several are chosen. */
function List({
  editor,
  page,
  field,
}: {
  editor: Editor
  page: number
  field: FormField
}) {
  const chosen = chosenOf(field)
  return (
    <select
      aria-label={field.label}
      aria-required={field.required || undefined}
      multiple={field.multiple}
      size={Math.max(2, field.options.length)}
      value={field.multiple ? chosen : (chosen[0] ?? "")}
      onChange={(event) =>
        editor.fillField(
          page,
          field,
          [...event.target.selectedOptions]
            .map((option) => option.value)
            .join("\n")
        )
      }
      className={CONTROL}
      style={{ fontSize: Math.min(12, field.box.height / 5) }}
    >
      {field.options.map((option, at) => (
        <option key={option} value={option}>
          {field.shown[at] ?? option}
        </option>
      ))}
    </select>
  )
}

/**
 * The places of a form on a page, each as a control that lies over it. They
 * come in the order they are gone through with Tab: along a row, then down.
 */
export function FieldSpots({
  editor,
  page,
  idle,
}: {
  editor: Editor
  /** Counted from 0. */
  page: number
  /** Nothing is being drawn, dragged or typed: the fields can be used. */
  idle: boolean
}) {
  const fields = inOrder((editor.fields[page] ?? []).filter(fillable))
  /** Which of its field's round buttons each one is, counted from 1. */
  const turns = new Map<string, number>()
  return fields.map((field) => {
    const empty = isEmpty(field, editor.fields)
    const nth = (turns.get(field.name) ?? 0) + 1
    turns.set(field.name, nth)
    return (
      <div
        key={field.id}
        data-hold
        data-testid="editor-field"
        data-id={field.id}
        data-kind={field.kind}
        data-name={field.name}
        data-value={
          field.kind === "check" || field.kind === "radio"
            ? String(field.on)
            : field.value
        }
        data-missing={(field.required && empty) || undefined}
        className={cn(
          "absolute bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
          idle ? "pointer-events-auto" : "pointer-events-none",
          field.required && empty && "ring-1 ring-destructive"
        )}
        style={{
          left: field.box.x,
          top: field.box.y,
          width: field.box.width,
          height: field.box.height,
        }}
        // The page under it must not take a press here for one of its own.
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {field.kind === "text" ? (
          <Typed editor={editor} page={page} field={field} />
        ) : field.kind === "choice" ? (
          <Choice editor={editor} page={page} field={field} />
        ) : field.kind === "list" ? (
          <List editor={editor} page={page} field={field} />
        ) : (
          <input
            type={field.kind === "check" ? "checkbox" : "radio"}
            // Round buttons of one field are one group to the arrow keys.
            name={field.kind === "radio" ? field.name : undefined}
            aria-label={
              field.kind === "radio"
                ? `${field.label}, choice ${nth}`
                : field.label
            }
            aria-required={
              (field.kind === "check" && field.required) || undefined
            }
            checked={field.on}
            onChange={(event) =>
              editor.fillField(page, field, event.target.checked)
            }
            className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
          />
        )}
      </div>
    )
  })
}
