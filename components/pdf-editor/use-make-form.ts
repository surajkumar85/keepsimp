"use client"
import { useCallback, useState } from "react"
import {
  defaultSpec,
  initialField,
  KIND_NAMES,
  readFieldSpec,
  type FieldSpec,
  type MakeKind,
} from "@/lib/pdf-editor/form-fields"
import type { Box } from "@/lib/pdf-editor/geometry"
import type { Editor } from "./use-editor"
import type { Comments } from "./use-comments"
import type { Retext } from "./use-retext"
import type { Inpage } from "./use-inpage"
import type { Links } from "./use-links"
import type { Find } from "./use-find"
import type { Crop } from "./use-crop"
import type { Redact } from "./use-redact"
import type { Pages } from "./use-pages"
import type { Repeat } from "./use-repeat"
import type { Described } from "./use-described"

export const FORM_HINT =
  "Add a field, then drag it into place. The arrow keys move it; Alt and arrows resize it. Field settings change its name, hint and requirements. A signature place is only a place, not proof of who signed."
export function useMakeForm(
  editor: Editor,
  comments: Comments,
  retext: Retext,
  inpage: Inpage,
  links: Links,
  find: Find,
  crop: Crop,
  redact: Redact,
  pages: Pages,
  repeat: Repeat,
  described: Described,
  begun = false
) {
  const [wanted, setWanted] = useState(begun),
    [panel, setPanel] = useState(begun)
  const [spec, setSpec] = useState<FieldSpec>(() =>
    defaultSpec("text", editor.formNames)
  )
  const [chosen, setChosen] = useState<{ page: number; id: string } | null>(
    null
  )
  const [fresh, setFresh] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const other =
    editor.state.tool !== "select" ||
    comments.tool !== null ||
    retext.on ||
    inpage.on ||
    links.on ||
    find.on ||
    crop.on ||
    redact.on ||
    pages.on ||
    repeat.on ||
    described.on ||
    comments.listed
  if (wanted && other) {
    setWanted(false)
    setPanel(false)
    setChosen(null)
  }
  const on = wanted && !other
  const field = chosen
    ? editor.fields[chosen.page]?.find((f) => f.id === chosen.id)
    : undefined
  if (chosen && !field) setChosen(null)
  const { setTool, deselect, makeFields, middle, sizes, formNames } = editor
  const clearComments = comments.setTool,
    clearRetext = retext.setOn,
    clearInpage = inpage.setOn,
    clearLinks = links.setOn,
    clearFind = find.setOn,
    clearCrop = crop.setOn,
    clearRedact = redact.setOn,
    clearPages = pages.setOn,
    clearRepeat = repeat.setOn,
    clearDescribed = described.setOn,
    clearList = comments.setListed
  const setOn = useCallback(
    (next: boolean) => {
      if (next) {
        clearComments(null)
        clearRetext(false)
        clearInpage(false)
        clearLinks(false)
        clearFind(false)
        clearCrop(false)
        clearRedact(false)
        clearPages(false)
        clearRepeat(false)
        clearDescribed(false)
        clearList(false)
        setTool("select")
        deselect()
      }
      setWanted(next)
      setPanel(next)
      setNote("")
      if (!next) setChosen(null)
    },
    [
      clearComments,
      clearRetext,
      clearInpage,
      clearLinks,
      clearFind,
      clearCrop,
      clearRedact,
      clearPages,
      clearRepeat,
      clearDescribed,
      clearList,
      setTool,
      deselect,
    ]
  )
  const kind = (next: MakeKind) => {
    setSpec(defaultSpec(next, formNames))
    setNote("")
  }
  const add = async () => {
    const checked = readFieldSpec(spec)
    if (!checked) {
      setNote(
        "Give the field a name without dots, a valid length limit, and unique non-empty choices (one per line). Radio groups need at least two choices."
      )
      setPanel(true)
      return
    }
    const { page, at } = middle(),
      size = sizes[page]
    if (!size) return
    const box = initialField(spec.kind, size, at)
    if (spec.kind === "radio")
      box.height = Math.min(
        size.height,
        Math.max(box.height, spec.options.length * 24)
      )
    const news = await makeFields(
      `Add ${KIND_NAMES[spec.kind].toLowerCase()}`,
      { do: "add", page, box, field: checked }
    )
    if (!news) return
    const made = news.pages
      .find((p) => p.page === page)
      ?.fields.find((f) => f.name === spec.name)
    if (made) {
      setChosen({ page, id: made.id })
      setFresh(made.id)
    }
    setSpec({
      ...spec,
      name: defaultSpec(spec.kind, news.formNames ?? formNames).name,
    })
    setPanel(false)
    setNote(
      "Field added. Drag it or use the arrow keys to put it where it belongs."
    )
  }
  const reshape = useCallback(
    (page: number, id: string, box: Box) =>
      makeFields("Move or resize a field", { do: "reshape", page, id, box }),
    [makeFields]
  )
  const remove = async () => {
    if (!chosen) return
    if (await makeFields("Delete a form field", { do: "delete", ...chosen })) {
      setChosen(null)
      setNote(
        "The field and all its places were deleted. Undo brings them back."
      )
    }
  }
  const save = async (value: {
    name: string
    tooltip: string
    required: boolean
    maxLength: number
  }) => {
    if (
      chosen &&
      (await makeFields("Change form field properties", {
        do: "properties",
        ...chosen,
        ...value,
      }))
    )
      setNote("Field properties saved.")
  }
  return {
    on,
    setOn,
    panel,
    setPanel,
    spec,
    setSpec,
    kind,
    chosen,
    setChosen,
    field,
    fresh,
    setFresh,
    note,
    setNote,
    add,
    reshape,
    remove,
    save,
  }
}
export type MakeForm = ReturnType<typeof useMakeForm>
