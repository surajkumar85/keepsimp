"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { bulkConvert, defaults } from "@/lib/color/core"
import { attempt, Copy, download, panel, SaveButton, type Tell } from "./shared"
export function BatchPanel({ tell }: { tell: Tell }) {
  const [text, setText] = useState(
      `${defaults.color}\nrgb(255 0 0)\noklch(0.7 0.1 200)`
    ),
    [format, setFormat] = useState<"hex" | "rgb" | "oklch">("hex"),
    [result, setResult] = useState<ReturnType<typeof bulkConvert> | null>(null),
    [error, setError] = useState("")
  const output =
    result
      ?.map((row) => row.value ?? `Line ${row.line}: ${row.error}`)
      .join("\n") ?? ""
  return (
    <section className={panel}>
      <h2 className="section-title">Convert a list of colors</h2>
      <label className="block space-y-2 text-sm font-medium">
        <span>Colors, one per line</span>
        <textarea
          aria-label="Colors, one per line"
          className="min-h-48 w-full rounded-lg border border-input bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={52000}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(null)
            setError("")
          }}
        />
      </label>
      <ChoiceChips
        label="Batch output format"
        value={format}
        onValueChange={(v) => {
          setFormat(v)
          setResult(null)
          setError("")
        }}
        options={[
          { value: "hex", label: "HEX" },
          { value: "rgb", label: "RGB" },
          { value: "oklch", label: "OKLCH" },
        ]}
      />
      <Button
        onClick={() => {
          const next = attempt(() => bulkConvert(text, format))
          setError(next.error ?? "")
          setResult(next.value ?? null)
          if (next.value)
            tell(
              `Read ${next.value.length} lines. ${next.value.filter((r) => r.error).length} could not be converted.`
            )
        }}
      >
        Convert color list
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
            <pre
              tabIndex={0}
              role="region"
              aria-label="Converted color list"
              className="max-h-80 min-w-0 flex-1 overflow-auto rounded-md font-mono text-sm break-all whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {output}
            </pre>
            <Copy value={output} label="converted color list" tell={tell} />
          </div>
          <SaveButton
            onClick={() =>
              download(output, "text/plain", "keepsimp-colors.txt")
            }
          >
            Download converted list
          </SaveButton>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Up to 100 colors. Invalid lines show their own errors, preserving the
        order. HEX and RGB use the sRGB fallback; OKLCH preserves the wider
        color range.
      </p>
    </section>
  )
}
