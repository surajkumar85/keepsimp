"use client"

import { useId } from "react"
import { Section, ToggleRow } from "@/components/image-batch/controls"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Input } from "@/components/ui/input"
import {
  fpsChoices,
  noTrim,
  speedChoices,
  targets,
  type AnimationSettings,
  type LoopChoice,
  type Trim,
} from "@/lib/animation/settings"
import { trimSummary } from "@/lib/animation/summary"
import { fold, FaultNote, type Fault, type Update } from "./format-panel"
import { TrimBar } from "./trim-bar"

const lengthChoices = [3, 6, 10]

/** Trim for the selected animation, then speed, frame rate, direction and looping for all. */
export function TimingPanel({
  settings,
  update,
  fault,
  selected,
  onTrim,
}: {
  settings: AnimationSettings
  update: Update
  fault: Fault | null
  /** The selected animation, once it has been read. */
  selected: {
    name: string
    strip: ImageBitmap | null
    duration: number
    trim: Trim
  } | null
  onTrim: (trim: Trim) => void
}) {
  const ids = useId()
  // Only animated images and sprite sheets carry a loop count.
  const loops =
    targets[settings.target].kind === "animation" ||
    settings.target === "sprite"
  const speed = speedChoices.includes(
    settings.speed as (typeof speedChoices)[number]
  )
    ? String(settings.speed)
    : "custom"
  const fps =
    settings.fps === null
      ? "original"
      : fpsChoices.includes(settings.fps as (typeof fpsChoices)[number])
        ? String(settings.fps)
        : "custom"

  const kept = selected ? trimSummary(selected.trim, selected.duration) : ""

  return (
    <>
      {selected && selected.duration > 0 && (
        // "Keep everything" in the bar puts a trim back, so the group needs no reset of its own.
        <Section
          title="Trim"
          summary={kept}
          changed={kept !== trimSummary(noTrim, selected.duration)}
          defaultOpen={false}
        >
          <p className="text-xs text-muted-foreground">
            Applies to{" "}
            <span className="font-medium text-foreground">{selected.name}</span>{" "}
            only.
          </p>
          <TrimBar
            strip={selected.strip}
            duration={selected.duration}
            value={selected.trim}
            onChange={onTrim}
          />
        </Section>
      )}

      <Section
        title="Speed and frames"
        {...fold("timing", settings, update, fault)}
      >
        <ChoiceChips
          label="Speed"
          value={speed}
          onValueChange={(value) =>
            update({ speed: value === "custom" ? 1.25 : Number(value) })
          }
          options={[
            ...speedChoices.map((choice) => ({
              value: String(choice),
              label: `${choice}×`,
            })),
            { value: "custom", label: "Custom" },
          ]}
        />
        {speed === "custom" && (
          <div className="w-32">
            <label
              htmlFor={`${ids}-speed`}
              className="mb-2 block text-sm font-medium"
            >
              Speed (×)
            </label>
            <Input
              id={`${ids}-speed`}
              type="number"
              inputMode="decimal"
              min={0.1}
              max={10}
              step={0.05}
              value={Number.isNaN(settings.speed) ? "" : settings.speed}
              onChange={(event) =>
                update({ speed: event.target.valueAsNumber })
              }
              className="font-mono"
            />
          </div>
        )}
        <ChoiceChips
          label="Frames per second"
          value={fps}
          onValueChange={(value) =>
            update({
              fps:
                value === "original"
                  ? null
                  : value === "custom"
                    ? 8
                    : Number(value),
            })
          }
          options={[
            { value: "original", label: "Original" },
            ...fpsChoices.map((choice) => ({
              value: String(choice),
              label: String(choice),
            })),
            { value: "custom", label: "Custom" },
          ]}
          hint="A lower frame rate drops frames to make a smaller file. It never adds frames."
        />
        {fps === "custom" && (
          <div className="w-32">
            <label
              htmlFor={`${ids}-fps`}
              className="mb-2 block text-sm font-medium"
            >
              Frames per second
            </label>
            <Input
              id={`${ids}-fps`}
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={
                settings.fps === null || Number.isNaN(settings.fps)
                  ? ""
                  : settings.fps
              }
              onChange={(event) => update({ fps: event.target.valueAsNumber })}
              className="font-mono"
            />
          </div>
        )}
        <FaultNote fault={fault} group="timing" />
      </Section>

      <Section
        title="Length limit"
        {...fold("length", settings, update, fault)}
      >
        <ChoiceChips
          label="Longest result"
          hideLabel
          value={
            settings.maxSeconds === null
              ? "none"
              : lengthChoices.includes(settings.maxSeconds)
                ? String(settings.maxSeconds)
                : "custom"
          }
          onValueChange={(value) =>
            update({
              maxSeconds:
                value === "none"
                  ? null
                  : value === "custom"
                    ? 5
                    : Number(value),
            })
          }
          options={[
            { value: "none", label: "No limit" },
            ...lengthChoices.map((choice) => ({
              value: String(choice),
              label: `${choice} s`,
            })),
            { value: "custom", label: "Custom" },
          ]}
          hint="Every animation is cut to this length, counted from the start of its trim and before any change of speed."
        />
        {settings.maxSeconds !== null &&
          !lengthChoices.includes(settings.maxSeconds) && (
            <div className="w-32">
              <label
                htmlFor={`${ids}-length`}
                className="mb-2 block text-sm font-medium"
              >
                Longest result (s)
              </label>
              <Input
                id={`${ids}-length`}
                type="number"
                inputMode="decimal"
                min={0.1}
                max={600}
                step={0.1}
                value={
                  Number.isNaN(settings.maxSeconds) ? "" : settings.maxSeconds
                }
                onChange={(event) =>
                  update({ maxSeconds: event.target.valueAsNumber })
                }
                className="font-mono"
              />
            </div>
          )}
        <FaultNote fault={fault} group="length" />
      </Section>

      <Section
        title="Direction and looping"
        {...fold("direction", settings, update, fault)}
      >
        <ToggleRow
          label="Reverse"
          hint="Plays from the last frame to the first."
          checked={settings.reverse}
          onCheckedChange={(reverse) => update({ reverse })}
        />
        <ToggleRow
          label="Boomerang"
          hint="Plays forwards, then backwards, for a seamless loop."
          checked={settings.boomerang}
          onCheckedChange={(boomerang) => update({ boomerang })}
        />
        {loops ? (
          <>
            <ChoiceChips
              label="Loop"
              value={settings.loop}
              onValueChange={(loop: LoopChoice) => update({ loop })}
              options={[
                { value: "forever", label: "Forever" },
                { value: "once", label: "Play once" },
                { value: "count", label: "A set number" },
              ]}
            />
            {settings.loop === "count" && (
              <div className="w-32">
                <label
                  htmlFor={`${ids}-plays`}
                  className="mb-2 block text-sm font-medium"
                >
                  Times to play
                </label>
                <Input
                  id={`${ids}-plays`}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={1000}
                  value={
                    Number.isNaN(settings.loopCount) ? "" : settings.loopCount
                  }
                  onChange={(event) =>
                    update({ loopCount: event.target.valueAsNumber })
                  }
                  className="font-mono"
                  aria-describedby={`${ids}-plays-hint`}
                />
                <p
                  id={`${ids}-plays-hint`}
                  className="mt-1 w-64 text-xs text-muted-foreground"
                >
                  A few GIF players count one more or one fewer.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {settings.target === "frames"
              ? "Separate frames do not loop."
              : "A video file has no loop count; the player decides."}
          </p>
        )}
        <FaultNote fault={fault} group="direction" />
      </Section>
    </>
  )
}
