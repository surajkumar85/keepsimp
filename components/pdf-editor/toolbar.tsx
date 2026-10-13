"use client"

import {
  Fragment,
  useId,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react"
import {
  IconAlignCenter,
  IconArrowsMaximize,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowUpRight,
  IconBan,
  IconBold,
  IconBrush,
  IconBubbleText,
  IconCalendar,
  IconCheckbox,
  IconCircle,
  IconCopy,
  IconDots,
  IconHighlight,
  IconItalic,
  IconLine,
  IconFiles,
  IconMessages,
  IconResize,
  IconNote,
  IconPencil,
  IconCrop,
  IconChevronDown,
  IconChevronUp,
  IconLetterCase,
  IconLink,
  IconLinkPlus,
  IconSpacingHorizontal,
  IconTextScan2,
  IconPhotoEdit,
  IconPhotoPlus,
  IconReplace,
  IconRotate2,
  IconRotateClockwise2,
  IconPilcrow,
  IconPointer,
  IconRectangleFilled,
  IconRubberStamp,
  IconRulerMeasure,
  IconCursorText,
  IconFileUpload,
  IconSignature,
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
  fontKey,
  isComb,
  LARGEST_TEXT,
  LONGEST_STAMP,
  MOST_BOXES,
  SMALLEST_TEXT,
  type Colour,
} from "@/lib/pdf-editor/objects"
import { CHECK_SHAPES, type CheckShape } from "@/lib/pdf-editor/signature"
import {
  cssColour,
  PALETTE,
  sameColour,
  WEIGHTS,
} from "@/lib/pdf-editor/styles"
import type { Tool } from "@/lib/pdf-editor/tools"
import type { Comments } from "./use-comments"
import { mainStyle } from "@/lib/pdf-editor/retext"
import { isOwn, type OwnKey } from "@/lib/pdf-editor/own-font"
import { canListFonts, LocalFontsDialog } from "./local-fonts-dialog"
import { LONGEST_FIND } from "@/lib/pdf-editor/find"
import { ALIGNS, shapeOf, type Align } from "@/lib/pdf-editor/paragraphs"
import { cn } from "cn"
import { CROP_HINT, type Crop, type SheetName } from "./use-crop"
import { FIND_HINT, type Find } from "./use-find"
import { CUT_HINT, INPAGE_HINT, type Inpage } from "./use-inpage"
import { LINKS_HINT, type Links } from "./use-links"
import type { Pages } from "./use-pages"
import { PARAGRAPH_HINT, RETEXT_HINT, type Retext } from "./use-retext"
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
    tool: "check",
    label: "Tick or cross",
    key: "X",
    icon: <IconCheckbox aria-hidden="true" />,
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

const CHECK_LABELS: Record<CheckShape, string> = {
  tick: "Tick",
  cross: "Cross",
  dot: "Dot",
}

/** The tools a page that is opened for signing shows, of those that add things. */
const SIGNING: readonly Tool[] = ["text", "check"]

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

/**
 * A slider whose number is taken when it is let go of, or when the keys
 * that move it pause: dragged from one end to the other it is one change,
 * not one for every place it passed.
 * @param says The number in words, for a screen reader.
 */
function Slide({
  value,
  onSettle,
  says,
  ...props
}: {
  value: number
  onSettle: (value: number) => void
  says: (value: number) => string
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>) {
  /** Where it has been dragged to; null when it shows the number it stands for. */
  const [draft, setDraft] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wait = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const settle = (to: number | null) => {
    wait()
    setDraft(null)
    if (to !== null && to !== value) onSettle(to)
  }
  useEffect(() => wait, [])
  const shown = draft ?? value
  return (
    <input
      {...props}
      type="range"
      value={shown}
      onChange={(event) => {
        const to = Number(event.target.value)
        setDraft(to)
        wait()
        timer.current = setTimeout(() => settle(to), SETTLE_AFTER)
      }}
      onPointerUp={() => settle(draft)}
      onBlur={() => settle(draft)}
      aria-valuetext={says(shown)}
    />
  )
}

/** How long typing in a number has to pause before the number is taken, in milliseconds. */
const SETTLE_AFTER = 500

/**
 * A number that is typed in peace: it is taken when the typing pauses,
 * when the field is left, or on Enter, and not at every key. Taken at
 * every key, "24" is first "2", which is no size at all, and the field
 * fought the hand that typed in it.
 * @param accepts Whether a number within the bounds is one that can be taken.
 */
function NumberField({
  value,
  min,
  max,
  accepts = () => true,
  onSettle,
  onEnter,
  className,
  ...props
}: {
  value: number
  min: number
  max: number
  accepts?: (value: number) => boolean
  onSettle: (value: number) => void
  /** After Enter has taken the number. */
  onEnter?: () => void
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "min" | "max" | "type"
>) {
  /** What is being typed; null when the field shows the number it stands for. */
  const [draft, setDraft] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wait = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  /** Take what is typed. A number beyond the bounds is brought to the nearest that is within them, once typing is over. */
  const settle = (typed: string | null, over: boolean) => {
    wait()
    if (over) setDraft(null)
    if (typed === null || !typed.trim()) return
    const number = Number(typed)
    if (!Number.isFinite(number)) return
    const within = over ? Math.min(max, Math.max(min, number)) : number
    if (within < min || within > max || !accepts(within)) return
    if (within !== value) onSettle(within)
  }
  const latest = useRef({ draft, settle })
  useEffect(() => {
    latest.current = { draft, settle }
  })
  // A press anywhere else takes the number before the press does its own
  // work: a text box started with that press has the size that was typed.
  const typing = draft !== null
  useEffect(() => {
    if (!typing) return
    const press = (event: PointerEvent) => {
      if (event.target !== field.current)
        latest.current.settle(latest.current.draft, true)
    }
    document.addEventListener("pointerdown", press, true)
    return () => document.removeEventListener("pointerdown", press, true)
  }, [typing])
  useEffect(() => wait, [])
  return (
    <input
      {...props}
      ref={field}
      type="number"
      min={min}
      max={max}
      value={draft ?? String(value)}
      onChange={(event) => {
        const typed = event.target.value
        setDraft(typed)
        wait()
        timer.current = setTimeout(() => settle(typed, false), SETTLE_AFTER)
      }}
      onBlur={() => settle(draft, true)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return
        event.preventDefault()
        settle(draft, true)
        onEnter?.()
      }}
      className={cn(
        "h-11 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm",
        className
      )}
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
  check:
    "Press a box of a paper form to mark it. The tool stays in hand for the next box.",
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

/**
 * Fonts of one's own: those that were added, each as a font to choose, and
 * the ways to add one: from a file, or from the fonts on the device where
 * the browser can list them.
 */
function OwnFonts({
  editor,
  value,
  onPick,
  listed = true,
}: {
  editor: Editor
  /** The font that is chosen now. */
  value: string | null
  onPick: (font: OwnKey) => void
  /** Show the fonts that were added as buttons; a list elsewhere shows them when not. */
  listed?: boolean
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [device, setDevice] = useState(false)
  const [can] = useState(canListFonts)
  const add = async (font: Blob, names?: string[]) => {
    const key = await editor.addOwnFont(font, names)
    if (key) onPick(key)
  }
  return (
    <>
      {listed &&
        editor.ownFonts.map((font) => (
          <Button
            key={font.key}
            type="button"
            size="sm"
            variant={value === font.key ? "secondary" : "ghost"}
            aria-pressed={value === font.key}
            title={font.name}
            onClick={() => onPick(font.key as OwnKey)}
            className="h-11 max-w-40 md:h-9"
          >
            <span className="truncate">{font.name}</span>
          </Button>
        ))}
      <input
        ref={picker}
        type="file"
        accept=".ttf,.otf,.ttc,font/ttf,font/otf,font/collection"
        aria-label="Choose a font file of your own"
        className="sr-only"
        onChange={(event) => {
          const [font] = Array.from(event.target.files ?? [])
          event.target.value = ""
          if (font) void add(font)
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        title="Use a font of your own: a TrueType or OpenType file. It stays on your device."
        onClick={() => picker.current?.click()}
        className="h-11 shrink-0 md:h-9"
      >
        <IconFileUpload aria-hidden="true" /> Your own font
      </Button>
      {can && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          title="Choose from the fonts on this device. The browser asks first."
          onClick={() => setDevice(true)}
          className="h-11 shrink-0 md:h-9"
        >
          From this device
        </Button>
      )}
      {can && (
        <LocalFontsDialog
          open={device}
          onClose={() => setDevice(false)}
          onPick={(font, names) => void add(font, names)}
        />
      )}
    </>
  )
}

/** Put the keyboard back in the line that is being typed, after something in the bar was chosen for it. */
const backToLine = () =>
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLInputElement>("[data-testid=editor-retext]")
      ?.focus()
  )

/** The families of the editor's own fonts a whole line can be set in. */
const LINE_FAMILIES = ["sans", "serif", "mono"] as const

/**
 * The look of the line that is being typed: its size, its colour, and
 * whether it stays in the file's own font or is set, whole, in one of the
 * editor's.
 */
function LineLookRow({ editor, retext }: { editor: Editor; retext: Retext }) {
  const typing = retext.typing!
  const style = mainStyle(typing.line)
  const { look } = typing
  const family = LINE_FAMILIES.find((one) => look.font?.startsWith(one))
  const own = isOwn(look.font) ? look.font : null
  const bold = Boolean(look.font?.includes("bold"))
  const italic = Boolean(look.font?.includes("italic"))
  const set = (font: string, heavy = bold, slanted = italic) => {
    retext.setLook({
      font: font
        ? fontKey({
            font: font as (typeof LINE_FAMILIES)[number],
            bold: heavy,
            italic: slanted,
          })
        : "",
    })
    backToLine()
  }
  return (
    <>
      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        Font
        <select
          aria-label="Font of the line"
          value={own ?? family ?? ""}
          onChange={(event) => {
            const font = event.target.value
            if (!isOwn(font)) return set(font)
            retext.setLook({ font })
            backToLine()
          }}
          className="h-11 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
        >
          <option value="">Its own</option>
          {LINE_FAMILIES.map((one) => (
            <option key={one} value={one}>
              {FAMILY_LABELS[one]}
            </option>
          ))}
          {editor.ownFonts.map((font) => (
            <option key={font.key} value={font.key}>
              {font.name}
            </option>
          ))}
        </select>
      </label>
      <OwnFonts
        editor={editor}
        value={null}
        listed={false}
        onPick={(font) => {
          retext.setLook({ font })
          backToLine()
        }}
      />
      {family && (
        <div
          role="group"
          aria-label="Style"
          className="flex shrink-0 items-center"
        >
          <Toggle
            label="Bold"
            pressed={bold}
            onPress={() => set(family, !bold, italic)}
          >
            <IconBold aria-hidden="true" />
          </Toggle>
          <Toggle
            label="Italic"
            pressed={italic}
            onPress={() => set(family, bold, !italic)}
          >
            <IconItalic aria-hidden="true" />
          </Toggle>
        </div>
      )}
      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        Size
        <NumberField
          inputMode="decimal"
          min={SMALLEST_TEXT}
          max={LARGEST_TEXT}
          step="any"
          aria-label="Size of the line"
          value={look.size ?? style?.size ?? 12}
          onSettle={(size) => retext.setLook({ size })}
          // Enter in the size goes back to the words; it does not end them.
          onEnter={backToLine}
          className="w-20"
        />
      </label>
      <Swatches
        label="Colour"
        value={look.colour ?? style?.colour ?? null}
        onPick={(colour) => {
          if (colour) retext.setLook({ colour })
          backToLine()
        }}
      />
      {typing.lines && (
        <div
          role="group"
          aria-label="Alignment of the paragraph"
          className="flex shrink-0 items-center"
        >
          {ALIGNS.map((align) => (
            <Toggle
              key={align}
              label={ALIGN_LABELS[align]}
              pressed={(typing.align ?? shapeOf(typing.lines!).align) === align}
              onPress={() => {
                retext.setAlign(align)
                backToLine()
              }}
            >
              {ALIGN_ICONS[align]}
            </Toggle>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        title={
          typing.lines
            ? "Put the words into the file (Ctrl+Enter, or ⌘ Enter)"
            : "Put the words into the file (Enter)"
        }
        onClick={() => retext.finish()}
        className="shrink-0"
      >
        Done
      </Button>
    </>
  )
}

/**
 * What can be done to a picture of the page that was chosen: turned, cut
 * to a part, shown whole again, exchanged, taken out.
 */
function PictureRow({ inpage }: { inpage: Inpage }) {
  const picker = useRef<HTMLInputElement>(null)
  const { chosen } = inpage
  const hint = (words: string) => (
    <p
      className="line-clamp-2 min-w-40 flex-1 px-1 text-xs leading-4 whitespace-normal text-muted-foreground"
      data-testid="editor-hint"
    >
      {words}
    </p>
  )
  if (!chosen) return hint(INPAGE_HINT)
  if (chosen.cut)
    return (
      <>
        <Button
          type="button"
          variant="outline"
          title="Cut the picture to the part that is framed (Enter)"
          onClick={() => inpage.finishCut()}
          className="shrink-0"
        >
          Done
        </Button>
        <Button
          type="button"
          variant="ghost"
          title="Leave the picture as it is (Escape)"
          onClick={() => inpage.setCutting(false)}
          className="shrink-0"
        >
          Leave it
        </Button>
        {hint(CUT_HINT)}
      </>
    )
  const { picture } = chosen
  return (
    <>
      <div
        role="group"
        aria-label="The picture that is chosen"
        className="flex shrink-0 items-center gap-1"
      >
        <RowAction
          label="Turn it a quarter to the left"
          onPress={() => inpage.turn(-1)}
        >
          <IconRotate2 aria-hidden="true" />
        </RowAction>
        <RowAction
          label="Turn it a quarter to the right"
          onPress={() => inpage.turn(1)}
        >
          <IconRotateClockwise2 aria-hidden="true" />
        </RowAction>
        {picture.upright && (
          <RowAction
            label="Cut it to a part"
            words="Cut to a part"
            onPress={() => inpage.setCutting(true)}
          >
            <IconCrop aria-hidden="true" />
          </RowAction>
        )}
        {picture.cut && (
          <RowAction
            label="Show the whole picture again"
            words="Show it whole"
            onPress={() => inpage.showWhole()}
          >
            <IconArrowsMaximize aria-hidden="true" />
          </RowAction>
        )}
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp"
          aria-label="Choose a picture to put in its place"
          className="sr-only"
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? [])
            event.target.value = ""
            if (file) inpage.replace(file)
          }}
        />
        <RowAction
          label="Put another picture in its place"
          words="Another picture"
          onPress={() => picker.current?.click()}
        >
          <IconReplace aria-hidden="true" />
        </RowAction>
        <RowAction
          label="Take the picture out"
          onPress={() => inpage.takeOut(chosen.page, picture)}
        >
          <IconTrash aria-hidden="true" />
        </RowAction>
      </div>
      {hint(
        `${picture.width.toLocaleString("en")} by ${picture.height.toLocaleString("en")} dots${picture.cut ? ", cut to a part" : ""}. Drag it to move it, drag its corner to change its size; + and − do that from the keyboard, the arrow keys move it.`
      )}
    </>
  )
}

/**
 * Find and replace: what to look for and what to put in its place, the
 * place that is shown with what it will say, and replacing it or all.
 */
function FindRow({ find }: { find: Find }) {
  const ids = useId()
  const field =
    "h-11 w-40 shrink-0 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
  const { shown } = find
  return (
    <>
      <label htmlFor={`${ids}-find`} className="sr-only">
        Find
      </label>
      <input
        id={`${ids}-find`}
        autoFocus
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Find"
        maxLength={LONGEST_FIND}
        value={find.words}
        onChange={(event) => find.setWords(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter") {
            event.preventDefault()
            // The same words again go on to the next place.
            find.step(event.shiftKey ? -1 : 1)
          } else if (event.key === "Escape") {
            event.preventDefault()
            find.setOn(false)
          }
        }}
        className={field}
      />
      <label htmlFor={`${ids}-with`} className="sr-only">
        Replace with
      </label>
      <input
        id={`${ids}-with`}
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Replace with"
        maxLength={LONGEST_FIND}
        value={find.replacement}
        onChange={(event) => find.setReplacement(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter") {
            event.preventDefault()
            if (find.current) void find.replaceOne()
            else void find.search()
          } else if (event.key === "Escape") {
            event.preventDefault()
            find.setOn(false)
          }
        }}
        className={field}
      />
      <div
        role="group"
        aria-label="How to look"
        className="flex shrink-0 items-center"
      >
        <Toggle
          label="Tell capitals from small letters"
          pressed={find.matchCase}
          onPress={() => find.setMatchCase(!find.matchCase)}
        >
          <IconLetterCase aria-hidden="true" />
        </Toggle>
        <Toggle
          label="Whole words only"
          pressed={find.wholeWords}
          onPress={() => find.setWholeWords(!find.wholeWords)}
        >
          <IconSpacingHorizontal aria-hidden="true" />
        </Toggle>
      </div>
      <div
        role="group"
        aria-label="The places that were found"
        className="flex shrink-0 items-center gap-1"
      >
        <RowAction label="The place before" onPress={() => find.step(-1)}>
          <IconChevronUp aria-hidden="true" />
        </RowAction>
        <RowAction label="The next place" onPress={() => find.step(1)}>
          <IconChevronDown aria-hidden="true" />
        </RowAction>
        <Button
          type="button"
          variant="outline"
          disabled={!find.current}
          title="Put the other words in the place that is shown"
          onClick={() => void find.replaceOne()}
          className="shrink-0"
        >
          Replace
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!find.places}
          title="Put the other words in every place, as one step that can be undone"
          onClick={() => void find.replaceAll()}
          className="shrink-0"
        >
          Replace all
        </Button>
      </div>
      <p
        role="status"
        data-testid="editor-find-status"
        className="line-clamp-2 min-w-48 flex-1 px-1 text-xs leading-4 whitespace-normal text-muted-foreground"
      >
        {find.note ? (
          find.note
        ) : find.looking ? (
          "Looking through the file…"
        ) : !find.fresh ? (
          FIND_HINT
        ) : !shown ? (
          find.summary
        ) : (
          <>
            {`${(find.at + 1).toLocaleString("en")} of ${find.summary}: `}
            {shown.before}
            <del className="text-destructive">{shown.was}</del>
            <span className="sr-only"> becomes </span>
            <ins className="font-medium text-foreground no-underline">
              {shown.now}
            </ins>
            {shown.after}
          </>
        )}
      </p>
    </>
  )
}

const SIDE_NAMES = {
  left: "Left",
  top: "Top",
  right: "Right",
  bottom: "Bottom",
}
const FOR_NAMES = {
  page: "This page",
  chosen: "Chosen pages",
  all: "All pages",
}

/**
 * Cutting pages to a part and making them another size: how much is cut
 * off each edge, which pages it is for, and the size of a sheet.
 */
function CropRow({ crop }: { crop: Crop }) {
  const ids = useId()
  const fors = (["page", "chosen", "all"] as const).filter(
    (one) => one !== "chosen" || crop.canChoose
  )
  return (
    <>
      <span className="shrink-0 text-xs text-muted-foreground">
        Cut off, in points
      </span>
      {(["left", "top", "right", "bottom"] as const).map((side) => (
        <label
          key={side}
          className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
        >
          {SIDE_NAMES[side]}
          <NumberField
            inputMode="decimal"
            min={0}
            max={14_400}
            step="any"
            value={Math.round(crop.off[side] * 10) / 10}
            onSettle={(value) => crop.setEdge(side, value)}
            className="w-16"
          />
        </label>
      ))}
      <div
        role="group"
        aria-label="Which pages"
        className="flex shrink-0 items-center gap-1"
      >
        {fors.map((one) => (
          <Button
            key={one}
            type="button"
            size="sm"
            variant={crop.whom === one ? "secondary" : "ghost"}
            aria-pressed={crop.whom === one}
            onClick={() => crop.setFor(one)}
            className="h-11 md:h-9"
          >
            {FOR_NAMES[one]}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        disabled={!crop.cuts || Boolean(crop.whyNot)}
        title={crop.whyNot || "Cut the pages to the frame (Enter on an edge)"}
        onClick={() => void crop.cut()}
        className="h-11 shrink-0 md:h-9"
      >
        <IconCrop aria-hidden="true" /> Crop
      </Button>
      <RowAction
        label="Show the whole page again"
        words="Show whole"
        onPress={() => void crop.whole()}
      >
        <IconArrowsMaximize aria-hidden="true" />
      </RowAction>
      <Rule />
      <label
        htmlFor={`${ids}-sheet`}
        className="shrink-0 text-xs text-muted-foreground"
      >
        Page size
      </label>
      <select
        id={`${ids}-sheet`}
        value={crop.sheet}
        onChange={(event) => crop.setSheet(event.target.value as SheetName)}
        className="h-11 shrink-0 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
      >
        <option value="A4">A4</option>
        <option value="Letter">Letter</option>
      </select>
      <RowAction
        label="Make the pages this size: what is on them is made smaller or larger to fit"
        words="Resize"
        onPress={() => void crop.resize()}
      >
        <IconResize aria-hidden="true" />
      </RowAction>
      <p
        className="line-clamp-2 min-w-40 flex-1 px-1 text-xs leading-4 whitespace-normal text-muted-foreground"
        data-testid="editor-hint"
        role={crop.whyNot ? "status" : undefined}
      >
        {crop.whyNot || CROP_HINT}
      </p>
    </>
  )
}

/**
 * Links: a new one, and for the one that is chosen or being made, where it
 * leads, typed as an address or as a page.
 */
function LinkRow({ links }: { links: Links }) {
  const { chosen } = links
  const ids = useId()
  if (!chosen)
    return (
      <>
        <RowAction
          label="Add a link in the middle of the page"
          words="New link"
          onPress={links.beginHere}
        >
          <IconLinkPlus aria-hidden="true" />
        </RowAction>
        <p
          className="line-clamp-2 min-w-40 flex-1 px-1 text-xs leading-4 whitespace-normal text-muted-foreground"
          data-testid="editor-hint"
        >
          {LINKS_HINT}
        </p>
      </>
    )
  return (
    <>
      <label
        htmlFor={`${ids}-target`}
        className="shrink-0 text-xs text-muted-foreground"
      >
        Leads to
      </label>
      <input
        id={`${ids}-target`}
        // A link that was just drawn waits for where it leads.
        autoFocus={!chosen.link}
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="An address, or a page number"
        value={chosen.typed}
        aria-describedby={links.note ? `${ids}-note` : undefined}
        aria-invalid={links.note ? true : undefined}
        onChange={(event) => links.setTyped(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter") {
            event.preventDefault()
            links.apply()
          } else if (event.key === "Escape") {
            event.preventDefault()
            links.deselect()
          }
        }}
        className="h-11 w-56 shrink-0 rounded-md border bg-background px-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive md:h-9 md:text-sm"
      />
      <Button
        type="button"
        variant="outline"
        onClick={links.apply}
        className="shrink-0"
      >
        {chosen.link ? "Change" : "Add"}
      </Button>
      <RowAction
        label={chosen.link ? "Take the link away" : "Leave it"}
        onPress={() => links.takeAway(chosen.page, chosen.link)}
      >
        <IconTrash aria-hidden="true" />
      </RowAction>
      <p
        id={`${ids}-note`}
        role={links.note ? "alert" : undefined}
        className={cn(
          "line-clamp-2 min-w-40 flex-1 px-1 text-xs leading-4 whitespace-normal",
          links.note ? "text-destructive" : "text-muted-foreground"
        )}
        data-testid="editor-hint"
      >
        {links.note ||
          `A web address, an e-mail address, or a page from 1 to ${links.pages.toLocaleString("en")}. Where a link leads is not checked.`}
      </p>
    </>
  )
}

/** A button of the row under the tools: an icon, with words beside it where they help. */
function RowAction({
  label,
  words,
  onPress,
  children,
}: {
  label: string
  words?: string
  onPress: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={words ? "sm" : "icon"}
      aria-label={label}
      title={label}
      onClick={onPress}
      className={words ? "h-11 shrink-0 md:h-9" : "shrink-0"}
    >
      {children}
      {words}
    </Button>
  )
}

const ALIGN_LABELS: Record<Align, string> = {
  left: "Set the paragraph to the left",
  centre: "Set the paragraph about its middle",
  right: "Set the paragraph to the right",
  justify: "Set the paragraph to both edges",
}
const ALIGN_ICONS: Record<Align, ReactNode> = {
  left: <IconAlignLeft aria-hidden="true" />,
  centre: <IconAlignCenter aria-hidden="true" />,
  right: <IconAlignRight aria-hidden="true" />,
  justify: <IconAlignJustified aria-hidden="true" />,
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
  focus = null,
  onAllTools,
  onSign,
  retext,
  inpage,
  links,
  find,
  pages,
  crop,
}: {
  editor: Editor
  comments: Comments
  /** Changing the words that are already on the page. */
  retext: Retext
  /** Changing the pictures that are already on the page. */
  inpage: Inpage
  /** Adding and changing links. */
  links: Links
  /** Finding and replacing words through the file. */
  find: Find
  /** The list of pages, where they are moved, turned, copied and taken out. */
  pages: Pages
  /** Cutting pages to a part and making them another size. */
  crop: Crop
  /** Which tools come first in the row: those that add things, or those that comment. */
  first?: "things" | "comments"
  /**
   * Only the tools of the job the page was opened for are shown (marking
   * up, or signing and filling in), with a button for the rest. A tool that
   * is in hand is always shown.
   */
  focus?: "comments" | "signing" | null
  onAllTools?: () => void
  /** Open the window a signature is made in. */
  onSign: () => void
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
  /** Things that are placed with one press of a button, not with a tool: a signature, and today's date. */
  const placed = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Sign"
        title="Sign: draw, type or use a picture of your signature (G)"
        aria-keyshortcuts="G"
        onClick={onSign}
        className="shrink-0"
        data-testid="editor-sign"
      >
        <IconSignature aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Add today's date"
        title="Add today's date"
        onClick={() =>
          void editor.addDate(
            new Date().toLocaleDateString(undefined, { dateStyle: "long" })
          )
        }
        className="shrink-0"
      >
        <IconCalendar aria-hidden="true" />
      </Button>
    </>
  )
  const toolButton = ({ tool, label, key, icon }: (typeof TOOLS)[number]) => (
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
  )
  const things = (
    <>
      {placed}
      <Rule />
      {TOOLS.map(({ tool, label, key, icon }) => (
        <Fragment key={tool}>
          <Toggle
            label={label}
            shortcut={key}
            pressed={
              !comments.tool &&
              state.tool === tool &&
              !(
                tool === "select" &&
                (retext.on || inpage.on || links.on || find.on)
              )
            }
            onPress={() => {
              comments.setTool(null)
              retext.setOn(false)
              inpage.setOn(false)
              links.setOn(false)
              find.setOn(false)
              editor.setTool(tool)
            }}
          >
            {icon}
          </Toggle>
          {/* Beside the tool that adds text: the one that changes the text that is there, and the one that changes it everywhere. */}
          {tool === "text" && (
            <>
              <Toggle
                label="Change text"
                shortcut="E"
                pressed={retext.on}
                onPress={() => retext.setOn(!retext.on)}
              >
                <IconCursorText aria-hidden="true" />
              </Toggle>
              <Toggle
                label="Find and replace"
                shortcut="F"
                pressed={find.on}
                onPress={() => find.setOn(!find.on)}
              >
                <IconTextScan2 aria-hidden="true" />
              </Toggle>
            </>
          )}
        </Fragment>
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
      {/* Beside the button that adds a picture: the tool that changes the pictures that are there. */}
      <Toggle
        label="Pictures of the page"
        shortcut="I"
        pressed={inpage.on}
        onPress={() => inpage.setOn(!inpage.on)}
      >
        <IconPhotoEdit aria-hidden="true" />
      </Toggle>
      <Toggle
        label="Links"
        shortcut="J"
        pressed={links.on}
        onPress={() => links.setOn(!links.on)}
      >
        <IconLink aria-hidden="true" />
      </Toggle>
      <Toggle
        label="Crop and page size"
        shortcut="Y"
        pressed={crop.on}
        onPress={() => crop.setOn(!crop.on)}
      >
        <IconCrop aria-hidden="true" />
      </Toggle>
    </>
  )
  // Focused on one job, the other tools are put away, unless one of them is in hand.
  const narrow =
    focus === "comments"
      ? comments.tool !== null || state.tool === "select"
      : focus === "signing"
        ? comments.tool === null &&
          !retext.on &&
          !inpage.on &&
          !links.on &&
          !find.on &&
          !crop.on &&
          (state.tool === "select" || SIGNING.includes(state.tool))
        : false
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
      // A press on a button must not take the keyboard from a box or a line being typed in.
      onMouseDown={(event) => {
        if (
          (typing || retext.typing) &&
          !(event.target as HTMLElement).closest("input, select")
        )
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
            {focus === "signing" ? (
              <>
                {placed}
                {TOOLS.filter(({ tool }) => SIGNING.includes(tool)).map(
                  toolButton
                )}
              </>
            ) : (
              marks
            )}
            <Rule />
            <Toggle
              label="Select"
              shortcut="V"
              pressed={!comments.tool && state.tool === "select"}
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
          variant={pages.on ? "secondary" : "ghost"}
          aria-pressed={pages.on}
          aria-label="Pages"
          title="Pages: move, turn, copy, add and take out (M)"
          onClick={() => pages.setOn(!pages.on)}
          className="h-11 shrink-0 gap-1.5 px-2.5 md:h-9"
          data-testid="pages-toggle"
        >
          <IconFiles aria-hidden="true" />
          <span className="font-mono text-xs">
            {pages.count.toLocaleString("en")}
          </span>
        </Button>
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
        {retext.typing ? (
          <LineLookRow editor={editor} retext={retext} />
        ) : inpage.on ? (
          <PictureRow inpage={inpage} />
        ) : links.on ? (
          <LinkRow links={links} />
        ) : find.on ? (
          <FindRow find={find} />
        ) : crop.on ? (
          <CropRow crop={crop} />
        ) : comments.tool ? (
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
                {retext.on
                  ? retext.note ||
                    (retext.blocks ? PARAGRAPH_HINT : RETEXT_HINT)
                  : HINTS[state.tool]}
              </p>
            )}
            {!acting && parts.length === 0 && retext.on && (
              <Button
                type="button"
                size="sm"
                variant={retext.blocks ? "secondary" : "ghost"}
                aria-pressed={retext.blocks}
                title="On: lines that belong together are changed as one paragraph, which flows again. Off: every line by itself."
                onClick={() => retext.setBlocks(!retext.blocks)}
                className="order-first h-11 shrink-0 md:h-9"
              >
                <IconPilcrow aria-hidden="true" /> Paragraphs
              </Button>
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
                  <OwnFonts
                    editor={editor}
                    value={look.font}
                    onPick={(font) => editor.setLook({ font })}
                  />
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  Size
                  <NumberField
                    inputMode="decimal"
                    min={SMALLEST_TEXT}
                    max={LARGEST_TEXT}
                    step="any"
                    value={look.size}
                    onSettle={(size) => editor.setLook({ size })}
                    className="w-16"
                  />
                </label>
                {has("comb") && (
                  <label
                    className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
                    title="For the row of boxes a form has for a postcode or a number: one letter goes in each. Leave it at 0 for ordinary text."
                  >
                    Boxes
                    <NumberField
                      inputMode="numeric"
                      min={0}
                      max={MOST_BOXES}
                      value={look.comb}
                      aria-label="Boxes to spread the letters over"
                      // One box is no row of boxes: it is ordinary text.
                      accepts={(comb) => comb === 0 || isComb(comb)}
                      onSettle={(comb) => editor.setLook({ comb })}
                      className="w-16"
                    />
                  </label>
                )}
                {/* A font of one's own is one file: it has no bold or italic of the editor's making. */}
                {!isOwn(look.font) && (
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
                )}
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
            {has("shape") && (
              <div
                role="group"
                aria-label="Mark"
                className="flex shrink-0 items-center gap-1"
              >
                {CHECK_SHAPES.map((shape) => (
                  <Button
                    key={shape}
                    type="button"
                    size="sm"
                    variant={look.shape === shape ? "secondary" : "ghost"}
                    aria-pressed={look.shape === shape}
                    onClick={() => editor.setLook({ shape })}
                    className="h-11 md:h-9"
                  >
                    {CHECK_LABELS[shape]}
                  </Button>
                ))}
              </div>
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
                <Slide
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(look.opacity * 100)}
                  onSettle={(solid) => editor.setLook({ opacity: solid / 100 })}
                  says={(solid) => `${solid}% solid`}
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
