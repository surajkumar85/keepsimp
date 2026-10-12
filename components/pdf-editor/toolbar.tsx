"use client"

import {
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react"
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowUpRight,
  IconBan,
  IconBold,
  IconBrush,
  IconBubbleText,
  IconCircle,
  IconCopy,
  IconDots,
  IconHighlight,
  IconItalic,
  IconLine,
  IconMessages,
  IconNote,
  IconPencil,
  IconPhotoPlus,
  IconPointer,
  IconRectangleFilled,
  IconRubberStamp,
  IconRulerMeasure,
  IconSquare,
  IconStackBack,
  IconStackFront,
  IconStrikethrough,
  IconTilde,
  IconTrash,
  IconTypography,
  IconUnderline,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  countComments,
  MARK_COLOURS,
  PEN_WEIGHTS,
  type CommentTool,
} from "@/lib/pdf-editor/comments"
import { FAMILY_LABELS } from "@/lib/pdf-editor/fonts"
import {
  canRedo,
  canUndo,
  redoLabel,
  undoLabel,
} from "@/lib/pdf-editor/history"
import {
  LARGEST_SCALE,
  MEASURE_UNITS,
  SMALLEST_SCALE,
} from "@/lib/pdf-editor/measure"
import {
  FONT_FAMILIES,
  LARGEST_TEXT,
  LONGEST_STAMP,
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
import type { Comments } from "./use-comments"
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
  {
    tool: "stamp",
    label: "Stamp",
    key: "K",
    icon: <IconRubberStamp aria-hidden="true" />,
  },
  {
    tool: "callout",
    label: "Call-out",
    key: "Q",
    icon: <IconBubbleText aria-hidden="true" />,
  },
  {
    tool: "measure",
    label: "Measure",
    key: "R",
    icon: <IconRulerMeasure aria-hidden="true" />,
  },
]

/** The words a stamp says most often. Any others can be typed. */
const STAMPS = ["Approved", "Draft", "Final", "Confidential", "Paid", "Void"]

/**
 * A field whose words are taken when it is left or Enter is pressed, not
 * letter by letter: every letter would be a step of its own to undo.
 */
function Settled({
  value,
  onSettle,
  ...props
}: {
  value: string
  onSettle: (value: string) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState(value)
  // What it stands for wins over what was last typed, as after an undo.
  const [held, setHeld] = useState(value)
  if (value !== held) {
    setHeld(value)
    setDraft(value)
  }
  const settle = () => {
    if (draft.trim() && draft !== value) onSettle(draft)
    else setDraft(value)
  }
  return (
    <input
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={settle}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
      className="h-11 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
    />
  )
}

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
  stamp:
    "Click to place the stamp, or drag it out. Choose its words and colour here.",
  callout:
    "Drag from what you want to point at to where the words should go, then type.",
  measure:
    "Drag along what you want to measure. Set the unit, and the scale of a drawing.",
}

const COMMENT_TOOLS: {
  tool: CommentTool
  label: string
  key: string
  icon: ReactNode
}[] = [
  {
    tool: "highlight",
    label: "Highlight",
    key: "H",
    icon: <IconHighlight aria-hidden="true" />,
  },
  {
    tool: "underline",
    label: "Underline",
    key: "U",
    icon: <IconUnderline aria-hidden="true" />,
  },
  {
    tool: "strike",
    label: "Strike out",
    key: "S",
    icon: <IconStrikethrough aria-hidden="true" />,
  },
  {
    tool: "squiggle",
    label: "Squiggle",
    key: "W",
    icon: <IconTilde aria-hidden="true" />,
  },
  {
    tool: "pen",
    label: "Highlighter pen",
    key: "P",
    icon: <IconBrush aria-hidden="true" />,
  },
  {
    tool: "note",
    label: "Note",
    key: "N",
    icon: <IconNote aria-hidden="true" />,
  },
]

const MARK_HINT = "Drag across words to mark them, or press one word."
const COMMENT_HINTS: Record<CommentTool, string> = {
  highlight: MARK_HINT,
  underline: MARK_HINT,
  strike: MARK_HINT,
  squiggle: MARK_HINT,
  pen: "Draw over anything, also where a page is a scan with no words to mark.",
  note: "Press where the note should go, then type it in the list.",
}

/** A row of colours to choose one from. `none` adds "no colour". */
function Swatches({
  label,
  value,
  none,
  onPick,
  palette = PALETTE,
}: {
  label: string
  value: Colour | null
  none?: boolean
  onPick: (colour: Colour | null) => void
  /** The colours offered; those for things the editor adds unless said otherwise. */
  palette?: readonly { name: string; colour: Colour }[]
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
      {palette.map((entry) => (
        <button
          key={entry.name}
          type="button"
          aria-label={`${label}: ${entry.name}`}
          title={entry.name}
          // A colour read back from a file is the one that was chosen, to a few parts in a million.
          aria-pressed={
            sameColour(entry.colour, value) ||
            (value !== null &&
              entry.colour.every(
                (part, at) => Math.abs(part - value[at]) < 0.01
              ))
          }
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
export function EditorToolbar({
  editor,
  comments,
  first = "things",
  focused = false,
  onAllTools,
}: {
  editor: Editor
  comments: Comments
  /** Which tools come first in the row: those that add things, or those that comment. */
  first?: "things" | "comments"
  /**
   * Only the tools of the job the page was opened for are shown, with a
   * button for the rest. A tool that is in hand is always shown.
   */
  focused?: boolean
  onAllTools?: () => void
}) {
  const ids = useId()
  const picker = useRef<HTMLInputElement>(null)
  const { state, parts, look, selected, typing, history } = editor
  const has = (part: (typeof parts)[number]) => parts.includes(part)
  const text = has("font")
  const acting = selected.length > 0 && !typing
  const picked = comments.chosen?.comment
  const count = countComments(editor.comments)
  /** Take a comment tool in hand: nothing the editor added stays selected. */
  const mark = (tool: CommentTool) => {
    editor.setTool("select")
    editor.deselect()
    comments.setTool(comments.tool === tool ? null : tool)
  }
  const things = (
    <>
      {TOOLS.map(({ tool, label, key, icon }) => (
        <Toggle
          key={tool}
          label={label}
          shortcut={key}
          pressed={!comments.tool && state.tool === tool}
          onPress={() => {
            comments.setTool(null)
            editor.setTool(tool)
          }}
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
    </>
  )
  // Focused on marking up, the tools that add things are put away, unless one of them is in hand.
  const narrow = focused && (comments.tool !== null || state.tool === "select")
  const marks = COMMENT_TOOLS.map(({ tool, label, key, icon }) => (
    <Toggle
      key={tool}
      label={label}
      shortcut={key}
      pressed={comments.tool === tool}
      onPress={() => mark(tool)}
    >
      {icon}
    </Toggle>
  ))
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
        {narrow ? (
          <>
            {marks}
            <Rule />
            <Toggle
              label="Select"
              shortcut="V"
              pressed={!comments.tool}
              onPress={() => {
                comments.setTool(null)
                editor.setTool("select")
              }}
            >
              <IconPointer aria-hidden="true" />
            </Toggle>
            <Button
              type="button"
              variant="ghost"
              aria-label="Show all the editor's tools"
              title="Text, pictures, shapes, stamps and more"
              onClick={onAllTools}
              className="h-11 shrink-0 gap-1.5 px-2.5 md:h-9"
              data-testid="all-tools"
            >
              <IconDots aria-hidden="true" />
              <span className="text-xs">All tools</span>
            </Button>
          </>
        ) : (
          <>
            {first === "comments" ? marks : things}
            <Rule />
            {first === "comments" ? things : marks}
          </>
        )}
        <Rule />
        <Button
          type="button"
          variant={comments.listed ? "secondary" : "ghost"}
          aria-pressed={comments.listed}
          aria-label={`Comments: ${count.toLocaleString("en")}`}
          title="Show the comments"
          onClick={() => comments.setListed(!comments.listed)}
          className="h-11 shrink-0 gap-1.5 px-2.5 md:h-9"
          data-testid="comments-toggle"
        >
          <IconMessages aria-hidden="true" />
          <span className="font-mono text-xs">
            {count.toLocaleString("en")}
          </span>
        </Button>
      </div>
      <div
        data-testid="editor-look"
        className="flex h-13 items-center gap-x-4 overflow-x-auto border-t px-2 whitespace-nowrap md:h-11"
      >
        {comments.tool ? (
          <>
            <Swatches
              label="Colour"
              value={comments.styles.colours[comments.tool]}
              palette={MARK_COLOURS}
              onPick={(colour) => colour && comments.setColour(colour)}
            />
            {comments.tool === "pen" && (
              <div
                role="group"
                aria-label="Thickness"
                className="flex shrink-0 items-center gap-1"
              >
                <span className="pr-1 text-xs text-muted-foreground">
                  Thickness
                </span>
                {PEN_WEIGHTS.map((weight) => (
                  <button
                    key={weight}
                    type="button"
                    aria-label={`Thickness: ${weight} points`}
                    title={`${weight} pt`}
                    aria-pressed={comments.styles.weight === weight}
                    onClick={() => comments.setWeight(weight)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted md:size-9"
                  >
                    <span
                      className="block w-5 rounded-full bg-foreground"
                      style={{ height: weight / 2 }}
                    />
                  </button>
                ))}
              </div>
            )}
            <p
              className="line-clamp-2 min-w-40 flex-1 px-1 text-xs leading-4 whitespace-normal text-muted-foreground"
              data-testid="editor-hint"
              role={comments.notice ? "status" : undefined}
            >
              {comments.notice || COMMENT_HINTS[comments.tool]}
            </p>
          </>
        ) : picked ? (
          <>
            <div
              role="group"
              aria-label="The comment that is picked"
              className="flex shrink-0 items-center gap-1"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Delete the comment"
                title="Delete the comment (Delete key)"
                onClick={() =>
                  void comments.remove(comments.chosen!.page, picked.id)
                }
              >
                <IconTrash aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Show it in the list of comments"
                title="Show it in the list of comments"
                onClick={() => comments.setListed(true)}
                className="h-11 shrink-0 px-2.5 md:h-9"
              >
                <IconMessages aria-hidden="true" />
                <span className="text-xs">Comment</span>
              </Button>
            </div>
            {picked.kind !== "other" && (
              <Swatches
                label="Colour"
                value={picked.colour}
                palette={MARK_COLOURS}
                onPick={(colour) => colour && comments.setColour(colour)}
              />
            )}
          </>
        ) : (
          <>
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
            {has("label") && (
              <div
                role="group"
                aria-label="What the stamp says"
                className="flex shrink-0 items-center gap-1"
              >
                {STAMPS.map((words) => (
                  <Button
                    key={words}
                    type="button"
                    size="sm"
                    variant={look.label === words ? "secondary" : "ghost"}
                    aria-pressed={look.label === words}
                    onClick={() => editor.setLook({ label: words })}
                    className="h-11 md:h-9"
                  >
                    {words}
                  </Button>
                ))}
                <label className="flex shrink-0 items-center gap-2 pl-2 text-xs text-muted-foreground">
                  Your own
                  <span className="w-32">
                    <Settled
                      type="text"
                      value={look.label}
                      maxLength={LONGEST_STAMP}
                      autoComplete="off"
                      spellCheck={false}
                      onSettle={(label) => editor.setLook({ label })}
                      style={{ width: "100%" }}
                    />
                  </span>
                </label>
              </div>
            )}
            {has("unit") && (
              <>
                <div
                  role="group"
                  aria-label="Unit"
                  className="flex shrink-0 items-center gap-1"
                >
                  {MEASURE_UNITS.map((unit) => (
                    <Button
                      key={unit}
                      type="button"
                      size="sm"
                      variant={look.unit === unit ? "secondary" : "ghost"}
                      aria-pressed={look.unit === unit}
                      aria-label={`Unit: ${unit}`}
                      onClick={() => editor.setLook({ unit })}
                      className="h-11 md:h-9"
                    >
                      {unit}
                    </Button>
                  ))}
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  Scale 1 to
                  <span className="w-20">
                    <Settled
                      type="number"
                      inputMode="decimal"
                      min={SMALLEST_SCALE}
                      max={LARGEST_SCALE}
                      step="any"
                      value={String(look.scale)}
                      onSettle={(typed) => {
                        const scale = Number(typed)
                        if (scale > 0) editor.setLook({ scale })
                      }}
                      style={{ width: "100%" }}
                    />
                  </span>
                </label>
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
                    editor.setLook({
                      opacity: Number(event.target.value) / 100,
                    })
                  }
                  aria-valuetext={`${Math.round(look.opacity * 100)}% solid`}
                  className="h-11 w-24 accent-primary md:h-9"
                />
              </label>
            )}
          </>
        )}
      </div>
    </div>
  )
}
