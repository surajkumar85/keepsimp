import { cn } from "cn"

/**
 * How far some work is, as the merger draws it: a `primary` bar in a
 * `muted` track with the pill radius. A null value is work whose length
 * is not known yet, shown as a short bar that does not move.
 */
export function Progress({
  value,
  label,
  className,
}: {
  /** From 0 to 1, or null when it cannot be told. */
  value: number | null
  label: string
  className?: string
}) {
  const percent = value === null ? null : Math.round(value * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
        style={{ width: `${Math.max(4, percent ?? 8)}%` }}
      />
    </div>
  )
}
