"use client"

import { useState } from "react"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

/** Text to copy, such as a command or settings, with its own Copy button. */
export function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              },
              () => undefined
            )
          }
        >
          {copied ? (
            <IconCheck data-icon="inline-start" aria-hidden="true" />
          ) : (
            <IconCopy data-icon="inline-start" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
          <span className="sr-only"> {label}</span>
        </Button>
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className="overflow-x-auto rounded-lg border bg-muted px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {text}
      </pre>
    </div>
  )
}
