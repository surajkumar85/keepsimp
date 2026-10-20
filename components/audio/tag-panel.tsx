"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { IconPhoto, IconRestore, IconTrash } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  COVER_TYPES,
  LONG_FIELDS,
  NUMBER_FIELDS,
  shared,
  TAG_LABELS,
  tagProblem,
  type Cover,
  type TagField,
  type TagValues,
} from "@/lib/audio/tags"

export interface TagRow {
  id: string
  name: string
  /** Its tags as they will be written. */
  values: TagValues
  /** Its cover as it will be written. */
  cover: Cover | null
  /** Whether anything was changed. */
  changed: boolean
}

/** Genres offered as you type; any other can be written. */
const GENRES = [
  "Alternative",
  "Audiobook",
  "Blues",
  "Classical",
  "Country",
  "Dance",
  "Electronic",
  "Folk",
  "Hip-Hop",
  "Jazz",
  "Latin",
  "Metal",
  "Podcast",
  "Pop",
  "R&B",
  "Reggae",
  "Rock",
  "Soundtrack",
  "Speech",
  "World",
]

const COMMIT_MS = 400

const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"

/** A picture's bytes, shown. */
function CoverPreview({ cover }: { cover: Cover }) {
  const url = useMemo(
    () =>
      URL.createObjectURL(
        new Blob([cover.data as BlobPart], { type: cover.mimeType })
      ),
    [cover]
  )
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a picture made on the device
    <img
      src={url}
      alt="The cover"
      className="size-24 shrink-0 rounded-md border object-cover"
    />
  )
}

/** The fields, for the files they change; what is typed is written after a pause. */
function Fields({
  rows,
  onChange,
}: {
  rows: TagRow[]
  onChange: (fields: Partial<Record<TagField, string>>) => void
}) {
  const ids = useId()
  const [draft, setDraft] = useState<Partial<Record<TagField, string>>>({})
  const pending = useRef<Partial<Record<TagField, string>>>({})
  const timer = useRef<number | undefined>(undefined)
  const many = rows.length > 1
  const valid = (fields: Partial<Record<TagField, string>>) =>
    Object.fromEntries(
      Object.entries(fields).filter(
        ([field, value]) => tagProblem({ fields: { [field]: value } }) === null
      )
    ) as Partial<Record<TagField, string>>
  const commit = () => {
    window.clearTimeout(timer.current)
    const fields = valid(pending.current)
    pending.current = {}
    if (Object.keys(fields).length) onChange(fields)
  }
  // What was typed and not yet written is written when the panel goes.
  const latest = useRef(commit)
  useEffect(() => {
    latest.current = commit
  })
  useEffect(() => () => latest.current(), [])

  const set = (field: TagField, value: string) => {
    setDraft((had) => ({ ...had, [field]: value }))
    pending.current = { ...pending.current, [field]: value }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(commit, COMMIT_MS)
  }
  const shown = (field: TagField) =>
    draft[field] ??
    (many
      ? (shared(
          rows.map((row) => row.values),
          field
        ) ?? "")
      : (rows[0].values[field] ?? ""))
  const mixed = (field: TagField) =>
    many &&
    draft[field] === undefined &&
    shared(
      rows.map((row) => row.values),
      field
    ) === null

  const field = (name: TagField, className = "") => {
    const id = `${ids}-${name}`
    const value = shown(name)
    const problem =
      draft[name] !== undefined
        ? tagProblem({ fields: { [name]: draft[name] } })
        : null
    const common = {
      id,
      value,
      placeholder: mixed(name) ? "Different in each file" : undefined,
      "aria-invalid": problem ? true : undefined,
      "aria-describedby": problem ? `${id}-problem` : undefined,
      onBlur: commit,
    }
    return (
      <div className={className}>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
          {TAG_LABELS[name]}
        </label>
        {LONG_FIELDS.includes(name) ? (
          <textarea
            {...common}
            rows={name === "lyrics" ? 5 : 2}
            className={fieldClass}
            onChange={(event) => set(name, event.target.value)}
          />
        ) : (
          <Input
            {...common}
            inputMode={NUMBER_FIELDS.includes(name) ? "numeric" : undefined}
            autoComplete="off"
            list={name === "genre" ? `${ids}-genres` : undefined}
            onChange={(event) => set(name, event.target.value)}
          />
        )}
        {problem && (
          <p id={`${id}-problem`} className="mt-1 text-xs text-destructive">
            {problem}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="tag-fields">
      {field("title", "sm:col-span-2")}
      {field("artist")}
      {field("album")}
      {field("albumArtist")}
      {field("genre")}
      <datalist id={`${ids}-genres`}>
        {GENRES.map((genre) => (
          <option key={genre} value={genre} />
        ))}
      </datalist>
      {field("year")}
      <div className="grid grid-cols-2 gap-3">
        {field("track")}
        {field("tracks")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field("disc")}
        {field("discs")}
      </div>
      {field("comment", "sm:col-span-2")}
      {field("lyrics", "sm:col-span-2")}
    </div>
  )
}

/** A file's tags, or every file's at once, edited and written into the results. */
export function TagPanel({
  rows,
  selectedId,
  keepTags,
  inPlace,
  onKeepTags,
  onChange,
  onReset,
}: {
  rows: TagRow[]
  selectedId: string
  keepTags: boolean
  /** Whether the selected file's tags go in without its sound being written again. */
  inPlace: boolean
  onKeepTags: () => void
  onChange: (
    ids: string[],
    change: { fields?: Partial<Record<TagField, string>>; cover?: Cover | null }
  ) => void
  onReset: (ids: string[]) => void
}) {
  const ids = useId()
  const [scope, setScope] = useState<"one" | "all">("one")
  const [coverProblem, setCoverProblem] = useState<string | null>(null)
  // Fields start again from the files when their tags are put back.
  const [version, setVersion] = useState(0)
  const picker = useRef<HTMLInputElement>(null)
  const all = scope === "all" && rows.length > 1
  const chosen = all ? rows : rows.filter((row) => row.id === selectedId)
  if (!chosen.length) return null
  const targets = chosen.map((row) => row.id)
  const covers = chosen.map((row) => row.cover)
  const sameCover = covers.every((cover) => cover === covers[0])
  const cover = sameCover ? covers[0] : null

  async function choose(file: File) {
    const data = new Uint8Array(await file.arrayBuffer())
    const picked = { data, mimeType: file.type }
    const problem = (COVER_TYPES as readonly string[]).includes(file.type)
      ? tagProblem({ fields: {}, cover: picked })
      : "Choose a JPEG or PNG picture for the cover."
    setCoverProblem(problem)
    if (!problem) onChange(targets, { cover: picked })
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="tag-panel"
    >
      <h2 id={`${ids}-title`} className="section-title">
        Tags
      </h2>
      {!keepTags ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Results are written without tags, as Keep the title, artist and
            cover is off.
          </p>
          <Button type="button" variant="outline" onClick={onKeepTags}>
            Keep tags
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="tag-said">
            {inPlace
              ? "Only the tags are written: the sound stays byte for byte as it is, and every tag you do not change is kept."
              : "The tags go into the file as it is written with the other settings."}
          </p>
          {rows.length > 1 && (
            <ChoiceChips
              label="Change the tags of"
              value={scope}
              onValueChange={setScope}
              options={[
                { value: "one", label: "This file" },
                { value: "all", label: `All ${rows.length} files` },
              ]}
              hint={
                all
                  ? "What you type goes into every file; a field left as it is stays as each file has it."
                  : undefined
              }
            />
          )}
          <Fields
            key={`${version}:${scope}:${targets.join(",")}`}
            rows={chosen}
            onChange={(fields) => onChange(targets, { fields })}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">Cover</p>
            <div className="flex flex-wrap items-center gap-3">
              {cover ? (
                <CoverPreview cover={cover} />
              ) : (
                <div className="flex size-24 shrink-0 items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground">
                  {sameCover ? "No cover" : "Different in each file"}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => picker.current?.click()}
                >
                  <IconPhoto data-icon="inline-start" aria-hidden="true" />
                  {cover ? "Choose another picture" : "Choose a picture"}
                </Button>
                {covers.some(Boolean) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onChange(targets, { cover: null })}
                  >
                    <IconTrash data-icon="inline-start" aria-hidden="true" />
                    Take the picture away
                  </Button>
                )}
              </div>
              <input
                ref={picker}
                type="file"
                accept={COVER_TYPES.join(",")}
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose a cover picture"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (file) void choose(file)
                }}
              />
            </div>
            {coverProblem && (
              <p className="text-xs text-destructive" role="alert">
                {coverProblem}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              A JPEG or PNG, smaller than 16 MB. Taking it away takes every
              picture the file holds.
            </p>
          </div>
          {chosen.some((row) => row.changed) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onReset(targets)
                setVersion((had) => had + 1)
              }}
            >
              <IconRestore data-icon="inline-start" aria-hidden="true" />
              {all ? "Put every file's tags back" : "Put the file's tags back"}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
