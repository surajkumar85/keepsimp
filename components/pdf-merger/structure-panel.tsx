"use client"

import { Section, ToggleRow } from "@/components/image-batch/controls"
import { ChoiceChips } from "@/components/ui/choice-chips"
import type { BookmarkPolicy } from "@/lib/pdf-merger/outline"
import {
  defaultSettings,
  type ContentsChoice,
  type FormsChoice,
  type LabelsChoice,
  type MergeSettings,
} from "@/lib/pdf-merger/settings"
import {
  MERGE_GROUPS,
  mergeSummary,
  type MergeGroup,
} from "@/lib/pdf-merger/summary"
import { differs, resetOf } from "@/lib/settings-groups"

/**
 * A group's fold: what it is set to, whether it differs from the usual, and
 * the change that puts it back. Folded unless `open`.
 */
export function mergeGroup(
  name: MergeGroup,
  settings: MergeSettings,
  update: (change: Partial<MergeSettings>) => void,
  open = false
) {
  return {
    summary: mergeSummary(name, settings),
    changed: differs(settings, defaultSettings, MERGE_GROUPS[name]),
    onReset: () => update(resetOf(defaultSettings, MERGE_GROUPS[name])),
    defaultOpen: open,
  }
}

const bookmarkHints: Record<BookmarkPolicy, string> = {
  nested:
    "Each file's bookmarks sit under an entry named after the file. One file alone keeps its bookmarks as they are.",
  keep: "Every bookmark, one after another, with no entry for the files.",
  files:
    "One bookmark per file, leading to its first page. The files' own bookmarks are left out.",
  none: "The merged PDF has no bookmarks.",
}
const formHints: Record<FormsChoice, string> = {
  keep: "Every field stays fillable. A field whose name another file already uses gets a number added, so both keep their own entries.",
  join: "Fields with the same name become one: fill it in once and every copy shows it. The entry from the first file is kept.",
  flatten:
    "What is filled in stays on the page, but the fields can no longer be changed.",
  remove: "Fields, and what is filled into them, are taken out.",
}

/** How the result is organised: bookmarks, a contents page, fields, page numbers and attachments. Bookmarks are open; the rest fold. */
export function StructurePanel({
  settings,
  update,
  forms,
  attachments,
}: {
  settings: MergeSettings
  update: (change: Partial<MergeSettings>) => void
  /** Whether any file has fillable fields. */
  forms: boolean
  /** How many files are attached inside the PDFs. */
  attachments: number
}) {
  const group = (name: MergeGroup, open = false) =>
    mergeGroup(name, settings, update, open)
  return (
    <div className="border-t first:border-t-0" data-testid="structure-options">
      <Section title="Bookmarks and contents" {...group("contents", true)}>
        <ChoiceChips
          label="Bookmarks"
          value={settings.bookmarks}
          onValueChange={(bookmarks: BookmarkPolicy) => update({ bookmarks })}
          options={[
            { value: "nested", label: "Under each file" },
            { value: "keep", label: "Keep all" },
            { value: "files", label: "One per file" },
            { value: "none", label: "None" },
          ]}
          hint={bookmarkHints[settings.bookmarks]}
        />
        <ChoiceChips
          label="Contents page"
          value={settings.contents}
          onValueChange={(contents: ContentsChoice) => update({ contents })}
          options={[
            { value: "none", label: "None" },
            { value: "files", label: "File names" },
            { value: "titles", label: "Document titles" },
          ]}
          hint={
            settings.contents === "none"
              ? "A first page that lists every file and the page it starts on, each a link."
              : settings.contents === "files"
                ? "Lists each file by its name. Every line is a link to the file's first page."
                : "Lists each file by the title it carries inside, or by its name when it has none."
          }
        />
        {settings.contents !== "none" && (
          <ToggleRow
            label="The first file is a cover"
            hint="The contents page comes after it, and does not list it."
            checked={settings.cover}
            onCheckedChange={(cover) => update({ cover })}
          />
        )}
      </Section>

      {forms && (
        <Section title="Fillable fields" {...group("fields")}>
          <ChoiceChips
            label="Fields"
            hideLabel
            value={settings.forms}
            onValueChange={(choice: FormsChoice) => update({ forms: choice })}
            options={[
              { value: "keep", label: "Keep" },
              { value: "join", label: "Join same names" },
              { value: "flatten", label: "Flatten" },
              { value: "remove", label: "Remove" },
            ]}
            hint={formHints[settings.forms]}
          />
        </Section>
      )}

      <Section title="Page numbers" {...group("labels")}>
        <ChoiceChips
          label="Page numbers shown by a viewer"
          hideLabel
          value={settings.labels}
          onValueChange={(labels: LabelsChoice) => update({ labels })}
          options={[
            { value: "continuous", label: "Count from 1" },
            { value: "keep", label: "Each file's own" },
          ]}
          hint={
            settings.labels === "continuous"
              ? "A viewer numbers the pages 1, 2, 3 from the first to the last."
              : "A viewer shows each page with the number it had in its own file, such as iv or A-3."
          }
        />
      </Section>

      {attachments > 0 && (
        <Section title="Attachments" {...group("attachments")}>
          <ToggleRow
            label={`Keep ${attachments === 1 ? "the attached file" : `the ${attachments} attached files`}`}
            hint="Files attached inside the PDFs are carried into the result. A name that is taken gets a number added."
            checked={settings.attachments}
            onCheckedChange={(keep) => update({ attachments: keep })}
          />
        </Section>
      )}
    </div>
  )
}
