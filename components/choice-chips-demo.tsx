"use client"

import { useState } from "react"
import { ChoiceChips } from "@/components/ui/choice-chips"

/** Live example for the design reference. */
export function ChoiceChipsDemo() {
  const [format, setFormat] = useState("webp")
  return (
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
  )
}
