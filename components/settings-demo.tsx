"use client"

import { useEffect, useState } from "react"
import { Section, SettingsCard } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/components/ui/toast"

const USUAL = { format: "mp4", speed: "1" }

/** A live settings card, a bar and toasts for the design reference. */
export function SettingsDemo() {
  const [settings, setSettings] = useState(USUAL)
  const [applying, setApplying] = useState(false)
  // A change is taken up after a short settle, as the tools do.
  useEffect(() => {
    if (!applying) return
    const timer = setTimeout(() => setApplying(false), 900)
    return () => clearTimeout(timer)
  }, [applying])
  const set = (change: Partial<typeof USUAL>) => {
    setSettings((current) => ({ ...current, ...change }))
    setApplying(true)
  }
  const formatChanged = settings.format !== USUAL.format
  const speedChanged = settings.speed !== USUAL.speed
  return (
    <div className="space-y-6">
      <SettingsCard
        sticky={false}
        state={applying ? "pending" : "done"}
        changed={Number(formatChanged) + Number(speedChanged)}
        onResetAll={() => {
          setSettings(USUAL)
          toast.info("Settings put back to the usual")
        }}
      >
        <Section
          title="Format"
          id="demo-format"
          summary={settings.format.toUpperCase()}
          changed={formatChanged}
          onReset={() => set({ format: USUAL.format })}
        >
          <ChoiceChips
            label="Format"
            hideLabel
            value={settings.format}
            onValueChange={(format) => set({ format })}
            options={[
              { value: "mp4", label: "MP4" },
              { value: "webm", label: "WebM" },
              { value: "mov", label: "MOV" },
            ]}
          />
        </Section>
        <Section
          title="Speed"
          id="demo-speed"
          defaultOpen={false}
          summary={
            settings.speed === "1" ? "Normal speed" : `${settings.speed}× speed`
          }
          changed={speedChanged}
          onReset={() => set({ speed: USUAL.speed })}
        >
          <ChoiceChips
            label="Speed"
            hideLabel
            value={settings.speed}
            onValueChange={(speed) => set({ speed })}
            options={[
              { value: "0.5", label: "0.5×" },
              { value: "1", label: "Normal" },
              { value: "2", label: "2×" },
            ]}
          />
        </Section>
      </SettingsCard>
      <div className="space-y-2">
        <p className="text-sm font-medium">Progress</p>
        <Progress value={0.4} label="Example progress" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            toast.success("Your video is ready", {
              description: "12.4 MB → 3.1 MB",
            })
          }
        >
          Show a toast
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.error("The file could not be read", {
              description: "What went wrong is said beside it.",
            })
          }
        >
          Show an error toast
        </Button>
      </div>
    </div>
  )
}
