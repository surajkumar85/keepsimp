"use client"

import { useId } from "react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import type {
  FooterPlace,
  NumberStyle,
  SheetChoice,
} from "@/lib/pdf-merger/print"
import type { MergeSettings } from "@/lib/pdf-merger/settings"
import { mergeGroup } from "./structure-panel"

const sheetHints: Record<SheetChoice, string> = {
  keep: "Every page keeps the size it has.",
  a4: "Every page is fitted onto A4 (210 × 297 mm) and centred. Wide pages get the sheet on its side.",
  letter:
    "Every page is fitted onto US Letter (8.5 × 11 in) and centred. Wide pages get the sheet on its side.",
  first: "Every page takes the size of the first page of the result.",
  largest: "Every page takes the size of the largest page of the result.",
}

/** Getting the result ready for paper: double-sided printing, one page size, and footers. */
export function PrintPanel({
  settings,
  update,
  arranged,
}: {
  settings: MergeSettings
  update: (change: Partial<MergeSettings>) => void
  /** Pages are in the person's own order, which blank pages for printing would disturb. */
  arranged: boolean
}) {
  const ids = useId()
  return (
    <div className="border-t first:border-t-0" data-testid="print-options">
      <Section title="Printing" {...mergeGroup("printing", settings, update)}>
        {arranged ? (
          <p className="text-xs text-muted-foreground">
            For double-sided printing of your own page order, add blank pages
            where you need them in the Pages view.
          </p>
        ) : (
          <ToggleRow
            label="Double-sided: start every file on a new sheet"
            hint="Adds a blank page after each file that has an odd number of pages, and after an odd number of contents pages."
            checked={settings.duplex}
            onCheckedChange={(duplex) => update({ duplex })}
          />
        )}
        <ChoiceChips
          label="Page size"
          value={settings.sheet}
          onValueChange={(sheet: SheetChoice) => update({ sheet })}
          options={[
            { value: "keep", label: "As they are" },
            { value: "a4", label: "A4" },
            { value: "letter", label: "Letter" },
            { value: "first", label: "Like the first page" },
            { value: "largest", label: "Like the largest" },
          ]}
          hint={sheetHints[settings.sheet]}
        />
        {settings.sheet !== "keep" && (
          <ToggleRow
            label="Enlarge smaller pages"
            hint="When off, a page smaller than the sheet keeps its size and sits in the middle."
            checked={settings.enlarge}
            onCheckedChange={(enlarge) => update({ enlarge })}
          />
        )}
      </Section>

      <Section title="Footer" {...mergeGroup("footer", settings, update)}>
        <ToggleRow
          label="File name on every page"
          hint="Printed small at the foot of each page, with the name of the file the page came from."
          checked={settings.footerName}
          onCheckedChange={(footerName) => update({ footerName })}
        />
        <ChoiceChips
          label="Page numbers"
          value={settings.numbers}
          onValueChange={(numbers: NumberStyle) => update({ numbers })}
          options={[
            { value: "none", label: "None" },
            { value: "number", label: "3" },
            { value: "of", label: "3 of 12" },
          ]}
        />
        {settings.numbers !== "none" && (
          <>
            <ChoiceChips
              label="Number position"
              value={settings.numbersAt}
              onValueChange={(numbersAt: FooterPlace) => update({ numbersAt })}
              options={[
                { value: "left", label: "Left" },
                { value: "centre", label: "Centre" },
                { value: "right", label: "Right" },
              ]}
            />
            <div className="w-32">
              <label
                htmlFor={`${ids}-from`}
                className="mb-2 block text-sm font-medium"
              >
                Start at
              </label>
              <Input
                id={`${ids}-from`}
                type="number"
                inputMode="numeric"
                min={0}
                max={99999}
                value={
                  Number.isNaN(settings.numbersFrom) ? "" : settings.numbersFrom
                }
                onChange={(event) =>
                  update({ numbersFrom: event.target.valueAsNumber })
                }
                className="font-mono"
              />
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Footers are written over the bottom edge of each page as it is; they
          do not move what is already there.
        </p>
      </Section>
    </div>
  )
}
