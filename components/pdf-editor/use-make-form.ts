"use client"
import { useCallback, useState } from "react"
import {
  aligned,
  EDGE_NAMES,
  nudged,
  readingOrder,
  sized,
  spread,
  type Axis,
  type Dimension,
  type Edge,
} from "@/lib/pdf-editor/form-layout"
import { parseRanges } from "@/lib/pdf-merger/ranges"
import {
  defaultSpec,
  fitField,
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
  const [chosen, choose] = useState<{ page: number; id: string } | null>(null)
  /** The fields picked to be laid out together, all on one page; the chosen one is among them. */
  const [picked, setPicked] = useState<{ page: number; id: string }[]>([])
  /** Choose one field; it stays among those picked when it already is. */
  const setChosen = useCallback((next: { page: number; id: string } | null) => {
    choose(next)
    setPicked((was) =>
      !next
        ? []
        : was.some((one) => one.page === next.page && one.id === next.id)
          ? was
          : [next]
    )
  }, [])
  /**
   * Pick a field, alone or as one more of several (Shift, Ctrl or ⌘). Fields
   * are laid out together only on one page: a pick on another starts anew.
   */
  const pick = useCallback(
    (page: number, id: string, more: boolean) => {
      const one = { page, id }
      if (!more) {
        choose(one)
        setPicked([one])
        return
      }
      const here = picked.filter((other) => other.page === page)
      const next = here.some((other) => other.id === id)
        ? here.filter((other) => other.id !== id)
        : [...here, one]
      setPicked(next)
      choose(next.at(-1) ?? null)
      // Several fields are picked to be laid out, which the panel does.
      if (next.length > 1) setPanel(true)
    },
    [picked]
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
      setChosen,
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
  /** The picked fields as they are now, on the page they are on. */
  const together = picked
    .map(({ page, id }) => editor.fields[page]?.find((one) => one.id === id))
    .filter((one) => one !== undefined)
  const togetherPage = picked[0]?.page ?? 0
  /** Move the picked fields as one step: lined up, spaced, or of one size. */
  const arrange = async (
    how: { align: Edge } | { spread: Axis } | { size: Dimension }
  ) => {
    const placed = together.map(({ id, box }) => ({ id, box }))
    const size = sizes[togetherPage]
    if (placed.length < 2 || !size) return
    const moved =
      "align" in how
        ? aligned(placed, how.align)
        : "spread" in how
          ? spread(placed, how.spread)
          : sized(placed, chosen?.id ?? placed[0].id, how.size)
    const label =
      "align" in how
        ? EDGE_NAMES[how.align]
        : "spread" in how
          ? how.spread === "across"
            ? "Space evenly across"
            : "Space evenly down"
          : how.size === "width"
            ? "Same width"
            : how.size === "height"
              ? "Same height"
              : "Same size"
    if (!moved.length) {
      setNote("The fields are like that already.")
      return
    }
    setNote("")
    await makeFields(
      label,
      ...moved.map(({ id, box }) => ({
        do: "reshape" as const,
        page: togetherPage,
        id,
        box: fitField(box, size),
      }))
    )
  }
  /** Put a page's fields in another order for the Tab key, as one step. */
  const putInOrder = (page: number, ids: string[]) =>
    makeFields("Change the tab order", { do: "order", page, ids })
  const nudge = (page: number, id: string, by: -1 | 1) => {
    const ids = (editor.fields[page] ?? []).map((one) => one.id)
    const next = nudged(ids, id, by)
    if (next.join() !== ids.join()) void putInOrder(page, next)
  }
  const byRows = (page: number) => {
    const here = editor.fields[page] ?? []
    const next = readingOrder(here.map(({ id, box }) => ({ id, box })))
    if (next.join() === here.map((one) => one.id).join()) {
      setNote("The fields of this page are in reading order already.")
      return
    }
    setNote("")
    void putInOrder(page, next)
  }
  /** Copy the chosen field to the pages typed, such as "2-5" or "all". */
  const copyTo = async (text: string) => {
    if (!chosen) return
    const read = parseRanges(text, sizes.length)
    if ("problem" in read) {
      setNote(read.problem)
      return
    }
    const to = [...new Set(read.pages)].filter((page) => page !== chosen.page)
    if (!to.length) {
      setNote("Name pages other than the field's own.")
      return
    }
    const news = await makeFields(
      to.length === 1
        ? `Copy a field to page ${to[0] + 1}`
        : `Copy a field to ${to.length} pages`,
      { do: "copy", ...chosen, to }
    )
    if (news)
      setNote(
        to.length === 1
          ? `Copied to page ${to[0] + 1}, with a name of its own.`
          : `Copied to ${to.length} pages, each with a name of its own.`
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
    picked,
    pick,
    together,
    togetherPage,
    arrange,
    nudge,
    byRows,
    copyTo,
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
