"use client"

import { useState } from "react"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { ToggleChips } from "@/components/ui/toggle-chips"

/** Live examples for the design reference. */
export function ChoiceChipsDemo() {
  const [format, setFormat] = useState("webp")
  const [widths, setWidths] = useState(["640", "1280"])
  return (
    <div className="space-y-6">
      <ChoiceChips
        label="Output format"
        value={format}
        onValueChange={setFormat}
        options={[
          { value: "webp", label: "WebP" },
          { value: "avif", label: "AVIF" },
          { value: "jpeg", label: "JPEG" },
          { value: "png", label: "PNG" },
          { value: "gif", label: "GIF", disabled: true },
        ]}
        hint="Pill radius, 36px desktop and 44px mobile height. Arrow keys move between options."
      />
      <ToggleChips
        label="Widths (several can be on)"
        value={widths}
        onValueChange={setWidths}
        options={["320", "640", "1280", "1920"].map((value) => ({
          value,
          label: value,
        }))}
        hint="Toggle chips use checkbox semantics and show a tick when on."
      />
    </div>
  )
}
