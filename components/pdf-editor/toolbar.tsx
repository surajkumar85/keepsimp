"use client"

import { useId, useRef, type ReactNode } from "react"
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowUpRight,
  IconBan,
  IconBold,
  IconCircle,
  IconCopy,
  IconItalic,
  IconLine,
  IconPencil,
  IconPhotoPlus,
  IconPointer,
  IconRectangleFilled,
  IconSquare,
  IconStackBack,
  IconStackFront,
  IconTrash,
  IconTypography,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { FAMILY_LABELS } from "@/lib/pdf-editor/fonts"
import {
  canRedo,
  canUndo,
  redoLabel,
  undoLabel,
} from "@/lib/pdf-editor/history"
import {
  FONT_FAMILIES,
  LARGEST_TEXT,
  SMALLEST_TEXT,
  type Colour,
} from "@/lib/pdf-editor/objects"
import {
  cssColour,
  PALETTE,
  sameColour,
  WEIGHTS,
} from "@/lib/pdf-editor/styles"
import type { Tool } from "@/lib/pdf-editor/tools"
import type { Editor } from "./use-editor"

const TOOLS: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  {
    tool: "select",
    label: "Select",
    key: "V",
    icon: <IconPointer aria-hidden="true" />,
  },
  {
    tool: "text",
    label: "Text",
    key: "T",
    icon: <IconTypography aria-hidden="true" />,
  },
  {
    tool: "box",
    label: "Box",
    key: "B",
    icon: <IconSquare aria-hidden="true" />,
  },
  {
    tool: "ellipse",
    label: "Ellipse",
    key: "O",
    icon: <IconCircle aria-hidden="true" />,
  },
  {
    tool: "line",
    label: "Line",
    key: "L",
    icon: <IconLine aria-hidden="true" />,
  },
  {
    tool: "arrow",
    label: "Arrow",
    key: "A",
    icon: <IconArrowUpRight aria-hidden="true" />,
  },
  {
    tool: "ink",
    label: "Draw",
    key: "D",
    icon: <IconPencil aria-hidden="true" />,
  },
  {
    tool: "cover",
    label: "Cover",
    key: "C",
    icon: <IconRectangleFilled aria-hidden="true" />,
  },
]

/** What the bar says about the tool in hand, so that each tool explains itself once. */
const HINTS: Record<Tool, string> = {
  select:
    "Click a thing to select it; drag to move it. Shift adds to the selection.",
  text: "Click where the text should start, type, and click away when done.",
  box: "Drag out a box, or click for one of a usual size.",
  ellipse: "Drag out an ellipse, or click for one of a usual size.",
  line: "Drag from where the line starts to where it ends.",
  arrow: "Drag from the tail of the arrow to its point.",
  ink: "Draw with the mouse, a pen or a finger.",
  cover:
    "Drag a box over something to hide it. What is under it stays in the file.",
}

/** A row of colours to choose one from. `none` adds "no colour". */
function Swatches({
  label,
  value,
  none,
  onPick,
}: {
  label: string
  value: Colour | null
  none?: boolean
  onPick: (colour: Colour | null) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1"
    >
      <span className="pr-1 text-xs text-muted-foreground">{label}</span>
      {none && (
        <button
          type="button"
          aria-label={`${label}: none`}
          title="None"
          aria-pressed={value === null}
          onClick={() => onPick(null)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted md:size-9"
        >
          <IconBan
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        </button>
      )}
      {PALETTE.map((entry) => (
        <button
          key={entry.name}
          type="button"
          aria-label={`${label}: ${entry.name}`}
          title={entry.name}
          aria-pressed={sameColour(entry.colour, value)}
          onClick={() => onPick(entry.colour)}
          className="group flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-9"
        >
          <span
            className="block size-6 rounded-full border border-foreground/25 group-aria-pressed:ring-2 group-aria-pressed:ring-primary group-aria-pressed:ring-offset-2 group-aria-pressed:ring-offset-background md:size-5"
            style={{ backgroundColor: cssColour(entry.colour) }}
          />
        </button>
      ))}
    </div>
  )
}

function Toggle({
  label,
  pressed,
  onPress,
  children,
  shortcut,
}: {
  label: string
  pressed: boolean
  onPress: () => void
  children: ReactNode
  shortcut?: string
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="icon"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      onClick={onPress}
      className="shrink-0"
    >
      {children}
    </Button>
  )
}

/** A thin line between groups of a bar. */
const Rule = () => (
  <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />
)

/**
 * The editor's two rows: the tools, and under them what can be done with
 * what is selected and how it looks, or the look of what the tool in hand
 * will make. Each is one line that scrolls sideways where it does not fit,
 * so the pages under them never jump.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  const ids = useId()
  const picker = useRef<HTMLInputElement>(null)
  const { state, parts, look, selected, typing, history } = editor
  const has = (part: (typeof parts)[number]) => parts.includes(part)
  const text = has("font")
  const acting = selected.length > 0 && !typing
  return (
    <div
      data-editor-bar
      className="border-b bg-background"
      // A press on a button must not take the keyboard from a box being typed in.
      onMouseDown={(event) => {
        if (typing && !(event.target as HTMLElement).closest("input"))
          event.preventDefault()
      }}
    >
      <div
        role="toolbar"
        aria-label="Tools"
        className="flex items-center gap-1 overflow-x-auto p-2"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={undoLabel(history)}
          title={`${undoLabel(history)} (Ctrl or ⌘ Z)`}
          disabled={!canUndo(history)}
          onClick={() => void editor.undo()}
          className="shrink-0"
          data-testid="editor-undo"
        >
          <IconArrowBackUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={redoLabel(history)}
          title={`${redoLabel(history)} (Ctrl or ⌘ Shift Z)`}
          disabled={!canRedo(history)}
          onClick={() => void editor.redo()}
          className="shrink-0"
          data-testid="editor-redo"
        >
          <IconArrowForwardUp aria-hidden="true" />
        </Button>
        <Rule />
        {TOOLS.map(({ tool, label, key, icon }) => (
          <Toggle
            key={tool}
            label={label}
            shortcut={key}
            pressed={state.tool === tool}
            onPress={() => editor.setTool(tool)}
          >
            {icon}
          </Toggle>
        ))}
        <input
          ref={picker}
          id={`${ids}-picture`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp"
          aria-label="Choose a picture to add"
          className="sr-only"
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? [])
            event.target.value = ""
            if (file) void editor.addPicture(file)
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add a picture"
          title="Add a picture"
          onClick={() => picker.current?.click()}
          className="shrink-0"
        >
          <IconPhotoPlus aria-hidden="true" />
        </Button>
      </div>
      <div
        data-testid="editor-look"
        className="flex h-13 items-center gap-x-4 overflow-x-auto border-t px-2 whitespace-nowrap md:h-11"
      >
        {!acting && parts.length === 0 && (
          <p
            // Two lines on a phone, so that the row never has to be scrolled to read it.
            className="line-clamp-2 min-w-0 flex-1 px-1 text-xs leading-4 whitespace-normal text-muted-foreground"
            data-testid="editor-hint"
          >
            {HINTS[state.tool]}
          </p>
        )}
        {acting && (
          <div
            role="group"
            aria-label="What is selected"
            className="flex shrink-0 items-center gap-1"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete"
              title="Delete (Delete key)"
              onClick={editor.remove}
            >
              <IconTrash aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Duplicate"
              title="Duplicate (Ctrl or ⌘ D)"
              onClick={editor.duplicate}
            >
              <IconCopy aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Bring to the front"
              title="Bring to the front"
              onClick={() => editor.order("front")}
            >
              <IconStackFront aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Send to the back"
              title="Send to the back"
              onClick={() => editor.order("back")}
            >
              <IconStackBack aria-hidden="true" />
            </Button>
          </div>
        )}
        {text && (
          <>
            <div
              role="group"
              aria-label="Font"
              className="flex shrink-0 items-center gap-1"
            >
              {FONT_FAMILIES.map((family) => (
                <Button
                  key={family}
                  type="button"
                  size="sm"
                  variant={look.font === family ? "secondary" : "ghost"}
                  aria-pressed={look.font === family}
                  onClick={() => editor.setLook({ font: family })}
                  className="h-11 md:h-9"
                >
                  {FAMILY_LABELS[family]}
                </Button>
              ))}
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              Size
              <input
                type="number"
                inputMode="decimal"
                min={SMALLEST_TEXT}
                max={LARGEST_TEXT}
                value={look.size}
                onChange={(event) => {
                  const size = Number(event.target.value)
                  if (size >= SMALLEST_TEXT && size <= LARGEST_TEXT)
                    editor.setLook({ size })
                }}
                className="h-11 w-16 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
              />
            </label>
            <div
              role="group"
              aria-label="Style"
              className="flex shrink-0 items-center"
            >
              <Toggle
                label="Bold"
                pressed={look.bold}
                onPress={() => editor.setLook({ bold: !look.bold })}
              >
                <IconBold aria-hidden="true" />
              </Toggle>
              <Toggle
                label="Italic"
                pressed={look.italic}
                onPress={() => editor.setLook({ italic: !look.italic })}
              >
                <IconItalic aria-hidden="true" />
              </Toggle>
            </div>
            <div
              role="group"
              aria-label="Alignment"
              className="flex shrink-0 items-center"
            >
              <Toggle
                label="Align left"
                pressed={look.align === "left"}
                onPress={() => editor.setLook({ align: "left" })}
              >
                <IconAlignLeft aria-hidden="true" />
              </Toggle>
              <Toggle
                label="Align centre"
                pressed={look.align === "centre"}
                onPress={() => editor.setLook({ align: "centre" })}
              >
                <IconAlignCenter aria-hidden="true" />
              </Toggle>
              <Toggle
                label="Align right"
                pressed={look.align === "right"}
                onPress={() => editor.setLook({ align: "right" })}
              >
                <IconAlignRight aria-hidden="true" />
              </Toggle>
            </div>
          </>
        )}
        {has("stroke") && (
          <Swatches
            label={has("fill") ? "Edge" : "Colour"}
            value={look.stroke}
            none={has("fill")}
            onPick={(stroke) => editor.setLook({ stroke })}
          />
        )}
        {has("fill") && (
          <Swatches
            label={has("stroke") ? "Inside" : "Colour"}
            value={look.fill}
            none={has("stroke")}
            onPick={(fill) => editor.setLook({ fill })}
          />
        )}
        {has("weight") && (
          <div
            role="group"
            aria-label="Thickness"
            className="flex shrink-0 items-center gap-1"
          >
            <span className="pr-1 text-xs text-muted-foreground">
              Thickness
            </span>
            {WEIGHTS.map((weight) => (
              <button
                key={weight}
                type="button"
                aria-label={`Thickness: ${weight} point${weight === 1 ? "" : "s"}`}
                title={`${weight} pt`}
                aria-pressed={look.weight === weight}
                onClick={() => editor.setLook({ weight })}
                className="flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted md:size-9"
              >
                <span
                  className="block w-5 rounded-full bg-foreground"
                  style={{ height: Math.max(1, weight) }}
                />
              </button>
            ))}
          </div>
        )}
        {has("opacity") && (
          <label className="flex shrink-0 items-center gap-2 pr-2 text-xs text-muted-foreground">
            See-through
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={Math.round(look.opacity * 100)}
              onChange={(event) =>
                editor.setLook({ opacity: Number(event.target.value) / 100 })
              }
              aria-valuetext={`${Math.round(look.opacity * 100)}% solid`}
              className="h-11 w-24 accent-primary md:h-9"
            />
          </label>
        )}
      </div>
    </div>
  )
}
