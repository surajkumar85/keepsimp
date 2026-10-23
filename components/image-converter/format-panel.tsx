"use client"

import { useState } from "react"
import { IconCheck, IconCopy, IconScale } from "@tabler/icons-react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { ToggleChips } from "@/components/ui/toggle-chips"
import { sizeLabel } from "@/lib/image-compressor/formats"
import type { RankedComparison } from "@/lib/image-converter/compare"
import {
  converterChanged,
  converterSummary,
  type ConverterGroup,
} from "@/lib/image-converter/summary"
import { icoSizes } from "@/lib/image-converter/encoders/ico"
import {
  gifColourChoices,
  usesTarget,
  type ConverterSettings,
} from "@/lib/image-converter/settings"
import {
  targetOrder,
  targets,
  type Target,
} from "@/lib/image-converter/targets"

export type Update = (
  change:
    | Partial<ConverterSettings>
    | ((current: ConverterSettings) => ConverterSettings)
) => void

export type ComparisonState =
  | { status: "idle" }
  | { status: "running"; label: string }
  | { status: "done"; rows: RankedComparison[] }
  | { status: "error"; message: string }

/**
 * A group's fold: the format and its quality open at first, the rest under
 * their summaries. A setting that stops the conversion is said even while
 * the format group is folded.
 */
export function groupProps(
  name: ConverterGroup,
  settings: ConverterSettings,
  usual: ConverterSettings,
  onReset: (group: ConverterGroup) => void,
  problem: string | null = null
) {
  return {
    summary: problem ?? converterSummary(name, settings),
    changed: converterChanged(name, settings, usual),
    onReset: () => onReset(name),
    defaultOpen: name === "format" || name === "quality",
  }
}

const options = targetOrder.map((target) => ({
  value: target,
  label: targets[target].label,
}))

export function FormatPanel({
  settings,
  update,
  problem,
  usual,
  onResetGroup,
}: {
  settings: ConverterSettings
  update: Update
  problem: string | null
  /** The usual settings, which "changed" and "Reset" are measured against. */
  usual: ConverterSettings
  onResetGroup: (group: ConverterGroup) => void
}) {
  const group = (name: ConverterGroup) =>
    groupProps(
      name,
      settings,
      usual,
      onResetGroup,
      name === "format" ? problem : null
    )

  return (
    <>
      <Section title="Convert to" {...group("format")}>
        {settings.multi ? (
          <ToggleChips
            label="Formats"
            value={settings.targets}
            onValueChange={(next: Target[]) => update({ targets: next })}
            options={options}
            hint="Every image is saved once in each selected format."
          />
        ) : (
          <ChoiceChips
            label="Format"
            hideLabel
            value={settings.target}
            onValueChange={(target: Target) => update({ target })}
            options={options}
            hint={targets[settings.target].hint}
          />
        )}
        <ToggleRow
          label="Several formats at once"
          hint="For example AVIF and WebP with a JPEG fallback."
          checked={settings.multi}
          onCheckedChange={(multi) => update({ multi })}
        />
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </Section>

      {usesTarget(settings, "ico") && (
        <Section title="Icon" {...group("ico")}>
          <ToggleChips
            label="Icon sizes (px)"
            value={settings.icoSizes.map(String)}
            onValueChange={(values) =>
              update({ icoSizes: values.map(Number).sort((a, b) => a - b) })
            }
            options={icoSizes.map((size) => ({
              value: String(size),
              label: `${size}`,
            }))}
            hint="All sizes go into one .ico file. 16, 32 and 48 cover favicons; 256 is for Windows. Pictures that are not square are centred on a transparent square."
          />
        </Section>
      )}

      {usesTarget(settings, "pdf") && (
        <Section title="PDF" {...group("pdf")}>
          <ChoiceChips
            label="Page size"
            value={settings.pdfPage}
            onValueChange={(pdfPage) => update({ pdfPage })}
            options={[
              { value: "fit", label: "Fit image" },
              { value: "a4", label: "A4" },
              { value: "letter", label: "US Letter" },
            ]}
            hint={
              settings.pdfPage === "fit"
                ? "Each page is exactly the size of its image."
                : "The image is centred on the page and turned to landscape when it is wider than tall."
            }
          />
          {settings.pdfPage === "fit" ? (
            <ChoiceChips
              label="Resolution (DPI)"
              value={String(settings.pdfDpi)}
              onValueChange={(value) => update({ pdfDpi: Number(value) })}
              options={[72, 96, 150, 300].map((dpi) => ({
                value: String(dpi),
                label: `${dpi}`,
              }))}
              hint="A higher resolution makes a physically smaller page from the same pixels."
            />
          ) : (
            <ChoiceChips
              label="Margins"
              value={settings.pdfMargin}
              onValueChange={(pdfMargin) => update({ pdfMargin })}
              options={[
                { value: "none", label: "None" },
                { value: "small", label: "Small" },
                { value: "normal", label: "Normal" },
              ]}
            />
          )}
          <ToggleRow
            label="Combine into one PDF"
            hint="One document with a page for each image, in list order."
            checked={settings.pdfCombine}
            onCheckedChange={(pdfCombine) => update({ pdfCombine })}
          />
        </Section>
      )}

      {usesTarget(settings, "gif") && (
        <Section title="GIF" {...group("gif")}>
          <ChoiceChips
            label="Colours"
            value={String(settings.gifColours)}
            onValueChange={(value) => update({ gifColours: Number(value) })}
            options={gifColourChoices.map((count) => ({
              value: String(count),
              label: `${count}`,
            }))}
            hint="GIF stores at most 256 colours. Fewer colours make a smaller file."
          />
          <ToggleRow
            label="Dithering"
            hint="Blends neighbouring colours to smooth gradients."
            checked={settings.dithering}
            onCheckedChange={(dithering) => update({ dithering })}
          />
        </Section>
      )}
    </>
  )
}

/** What the comparison has found, in a line, for its group while folded. */
function comparisonSaid(comparison: ComparisonState) {
  switch (comparison.status) {
    case "idle":
      return "Compare real file sizes for the selected image"
    case "running":
      return comparison.label
    case "error":
      return comparison.message
    case "done": {
      const smallest = comparison.rows[0]
      return smallest
        ? `${targets[smallest.target].label} is smallest, ${sizeLabel(smallest.bytes)}`
        : "Nothing to compare"
    }
  }
}

/** Which format is smallest, and the picture HTML: things to look at rather than settings. */
export function ComparePanel({
  settings,
  update,
  comparison,
  canCompare,
  onCompare,
  onCancelCompare,
  snippet,
}: {
  settings: ConverterSettings
  update: Update
  comparison: ComparisonState
  /** A readable image is selected. */
  canCompare: boolean
  onCompare: () => void
  onCancelCompare: () => void
  /** `<picture>` markup for the selected image, when several web formats are ready. */
  snippet: string | null
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      toast.success("Copied to the clipboard", {
        description: "The picture HTML for the selected image.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <Section
        title="Which format is smallest?"
        summary={comparisonSaid(comparison)}
        defaultOpen={false}
      >
        <p className="text-sm text-muted-foreground">
          Encode the selected image as JPEG, PNG, WebP, AVIF and JPEG XL with
          your quality setting and compare the real results.
        </p>
        {comparison.status === "running" ? (
          <div className="flex flex-wrap items-center gap-3" role="status">
            <span className="text-sm text-muted-foreground">
              {comparison.label}
            </span>
            <Button variant="outline" onClick={onCancelCompare}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={onCompare} disabled={!canCompare}>
            <IconScale aria-hidden="true" />
            {comparison.status === "done" ? "Compare again" : "Compare formats"}
          </Button>
        )}
        {comparison.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {comparison.message}
          </p>
        )}
        {comparison.status === "done" && (
          <div className="relative overflow-x-auto rounded-lg border">
            <table
              className="w-full text-left text-sm"
              data-testid="comparison"
            >
              <caption className="sr-only">
                File size and detail kept for each format, smallest first
              </caption>
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-2 pl-3 font-medium">
                    Format
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Size
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Detail kept
                  </th>
                  <th scope="col" className="py-2 pr-1">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.target} className="border-t align-top">
                    <th scope="row" className="py-2 pr-2 pl-3 font-medium">
                      {targets[row.target].label}
                      {row.smallest && (
                        <span className="mt-1 block w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Smallest
                        </span>
                      )}
                    </th>
                    <td className="px-2 py-2">
                      <span className="block whitespace-nowrap">
                        {sizeLabel(row.bytes)}
                      </span>
                      <span className="block text-xs whitespace-nowrap text-muted-foreground">
                        {row.ratio < 1
                          ? `${Math.round((1 - row.ratio) * 100)}% smaller`
                          : row.ratio > 1
                            ? `${Math.round((row.ratio - 1) * 100)}% larger`
                            : "same"}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {row.similarity === null
                        ? "—"
                        : row.similarity >= 0.99995
                          ? "100%"
                          : `${(row.similarity * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-1 pr-1 pl-0 text-right">
                      <Button
                        variant="ghost"
                        aria-label={`Use ${targets[row.target].label}`}
                        disabled={
                          !settings.multi && settings.target === row.target
                        }
                        onClick={() =>
                          update({ target: row.target, multi: false })
                        }
                      >
                        Use
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {snippet && (
        <Section title="HTML for the selected image">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Browsers use the first format they support.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-11 md:h-7"
              onClick={() => void copy()}
            >
              {copied ? (
                <IconCheck aria-hidden="true" />
              ) : (
                <IconCopy aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre
            tabIndex={0}
            aria-label="Picture element HTML"
            data-testid="picture-snippet"
            className="max-h-56 overflow-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed"
          >
            {snippet}
          </pre>
          <p className="sr-only" aria-live="polite">
            {copied ? "Copied to the clipboard." : ""}
          </p>
        </Section>
      )}
    </>
  )
}
