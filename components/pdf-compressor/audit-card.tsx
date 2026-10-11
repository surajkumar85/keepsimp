"use client"

import { sizeLabel } from "@/lib/image-compressor/formats"
import {
  auditLabels,
  percentOf,
  type AuditKind,
} from "@/lib/pdf-compressor/audit"
import type { Audit } from "@/lib/pdf-compressor/mupdf-audit"
import { cn } from "cn"

/** The largest part gets the darkest shade; what cannot be told apart is grey. */
const SHADES = [
  "bg-chart-5",
  "bg-chart-4",
  "bg-chart-3",
  "bg-chart-2",
  "bg-chart-1",
]
const REST = "bg-muted-foreground/40"

const shadeOf = (kind: AuditKind, place: number) =>
  kind === "rest" ? REST : SHADES[Math.min(place, SHADES.length - 1)]

/**
 * What a file's bytes are spent on: one bar cut into its parts, the parts
 * listed with their sizes, and the pictures that weigh most.
 */
export function AuditCard({
  title,
  audit,
  testId,
}: {
  title: string
  /** Null while the file is being gone through. */
  audit: Audit | null
  testId: string
}) {
  if (!audit)
    return (
      <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="section-title">{title}</h2>
        <p role="status" className="text-sm text-muted-foreground">
          Looking through the file…
        </p>
      </section>
    )
  const { parts } = audit.breakdown
  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      data-testid={testId}
    >
      <h2 className="section-title">{title}</h2>
      <div
        role="img"
        aria-label={parts
          .map((part) => `${auditLabels[part.kind]} ${percentOf(part.share)}%`)
          .join(", ")}
        className="flex h-3 gap-px overflow-hidden rounded-full bg-muted"
      >
        {parts.map((part, place) => (
          <span
            key={part.kind}
            className={shadeOf(part.kind, place)}
            style={{ width: `${part.share * 100}%` }}
          />
        ))}
      </div>
      <ul className="space-y-1.5 text-sm">
        {parts.map((part, place) => (
          <li
            key={part.kind}
            data-testid="audit-part"
            data-kind={part.kind}
            className="flex items-baseline gap-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 shrink-0 translate-y-px rounded-full",
                shadeOf(part.kind, place)
              )}
            />
            <span className="min-w-0 flex-1">{auditLabels[part.kind]}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {sizeLabel(part.bytes)}
            </span>
            <span className="w-10 shrink-0 text-right font-medium tabular-nums">
              {percentOf(part.share)}%
            </span>
          </li>
        ))}
      </ul>
      {audit.pictures.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-medium">
            {audit.pictureCount === 1
              ? "Its one picture"
              : `The heaviest of its ${audit.pictureCount.toLocaleString("en")} pictures`}
          </h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {audit.pictures.map((picture) => (
              <li
                key={picture.object}
                className="flex flex-wrap justify-between gap-x-3"
              >
                <span>
                  {picture.page ? `Page ${picture.page} · ` : ""}
                  {picture.width.toLocaleString("en")} ×{" "}
                  {picture.height.toLocaleString("en")} pixels
                </span>
                <span className="tabular-nums">{sizeLabel(picture.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
