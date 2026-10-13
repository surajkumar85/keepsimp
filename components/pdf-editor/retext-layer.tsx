"use client"

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { PageDrawn } from "@/components/pdf-reader/reader-page"
import { screenFamily } from "@/lib/pdf-editor/fonts"
import type { Box, Point } from "@/lib/pdf-editor/geometry"
import {
  asLine,
  blocksOf,
  joinedWords,
  shapeOf,
  wordsOf,
} from "@/lib/pdf-editor/paragraphs"
import { cssColour } from "@/lib/pdf-editor/styles"
import { mainStyle, standIns, type PageLine } from "@/lib/pdf-editor/retext"
import { cn } from "cn"
import type { Editor } from "./use-editor"
import type { Retext, Settling } from "./use-retext"

/** The generic family of one of the editor's fonts, for the browser to type in before that font is loaded. */
const generic = (key: string) =>
  key.startsWith("mono")
    ? "monospace"
    : key.startsWith("serif")
      ? "serif"
      : "sans-serif"

/** How far a press may wander and still be a press, in pixels of the screen. */
const SLACK = 4

/** A line or a paragraph of the page: pressed to change its words, dragged to move it. */
function Spot({
  box,
  label,
  title,
  fixed,
  block,
  scale,
  spot,
  retext,
  onPress,
  onMove,
  onTakeOut,
}: {
  /** What the frame goes by, for the keyboard to find it again when it is made anew. */
  spot: string
  retext: Retext
  box: Box
  label: string
  title: string
  /** Its words cannot be changed. */
  fixed?: boolean
  /** It is a paragraph. */
  block?: boolean
  scale: number
  onPress: () => void
  onMove: (by: Point) => void
  onTakeOut: () => void
}) {
  const from = useRef<Point | null>(null)
  const [moved, setMoved] = useState<Point | null>(null)
  const frame = useRef<HTMLButtonElement>(null)
  const { hold, isHeld } = retext
  // The keyboard was on this line when the page was read again: it is on it still.
  useEffect(() => {
    if (!isHeld(spot)) return
    // Now, and again once the window has done with the frame that went
    // away: it puts the keyboard on itself a moment after losing it.
    const take = () => {
      if (isHeld(spot)) frame.current?.focus({ preventScroll: true })
    }
    take()
    let later = requestAnimationFrame(() => {
      take()
      later = requestAnimationFrame(take)
    })
    return () => cancelAnimationFrame(later)
  }, [isHeld, spot])
  return (
    <button
      ref={frame}
      type="button"
      data-hold
      data-testid={block ? "editor-block" : "editor-line"}
      data-fixed={fixed ? "true" : undefined}
      aria-label={label}
      title={title}
      className={cn(
        // A frame that shows on light paper and on a dark picture alike.
        "absolute cursor-text touch-none rounded-xs ring-1 ring-white/50 outline-1 outline-primary/60 ring-inset hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary",
        fixed ? "outline-dashed" : "outline",
        moved && "cursor-grabbing bg-primary/10"
      )}
      style={{
        left: box.x - 1 + (moved?.x ?? 0),
        top: box.y + (moved?.y ?? 0),
        width: box.width + 2,
        height: box.height,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        // The page under it must not take a press here for one of its own.
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        from.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerMove={(event) => {
        if (!from.current) return
        const by = {
          x: (event.clientX - from.current.x) / scale,
          y: (event.clientY - from.current.y) / scale,
        }
        // A press that hardly moves is a press, not a drag.
        if (moved || Math.hypot(by.x, by.y) * scale > SLACK) setMoved(by)
      }}
      onPointerUp={() => {
        from.current = null
        if (!moved) return
        onMove(moved)
        // The click that ends a drag is not a press; after it, the frame
        // goes back until the page shows it where the file now has it.
        setTimeout(() => setMoved(null))
      }}
      onPointerCancel={() => {
        from.current = null
        setMoved(null)
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        // A drag ends in a click as well; it was a drag.
        if (moved) return
        // The keyboard goes where this press takes it, not back to a line that was left.
        hold(null)
        onPress()
      }}
      onKeyDown={(event) => {
        const far = event.shiftKey ? 10 : 1
        const by: Record<string, [number, number]> = {
          ArrowLeft: [-far, 0],
          ArrowRight: [far, 0],
          ArrowUp: [0, -far],
          ArrowDown: [0, far],
        }
        const taken = event.key === "Delete" || event.key === "Backspace"
        // Tab takes the keyboard elsewhere, and it is not brought back.
        if (event.key === "Tab") hold(null)
        if (!taken && !by[event.key]) return
        event.preventDefault()
        event.stopPropagation()
        if (taken) {
          hold(null)
          onTakeOut()
        } else {
          hold(spot)
          onMove({ x: by[event.key][0], y: by[event.key][1] })
        }
      }}
    />
  )
}

/** The first words of some text, for a name that is not as long as a paragraph. */
const startOf = (text: string) =>
  text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text

/**
 * The lines of a page's own text, each as a place that can be clicked to
 * change its words. The line being changed is a field over it, in a font
 * close to its own; the page shows the real thing once the file has it.
 */
export function LineSpots({
  editor,
  retext,
  page,
  version,
  scale,
}: {
  editor: Editor
  retext: Retext
  /** Counted from 0. */
  page: number
  /** How often the page has been drawn again: its lines are read anew each time. */
  version: number
  /** Screen pixels to a point. */
  scale: number
}) {
  const [read, setRead] = useState<{ of: string; lines: PageLine[] } | null>(
    null
  )
  const key = `${page}/${version}`
  /** The state of the page whose picture is on the screen. */
  const drawn = useContext(PageDrawn)
  const { lines: linesOf } = editor
  useEffect(() => {
    let stale = false
    void linesOf(page, version).then(
      (lines) => !stale && setRead({ of: `${page}/${version}`, lines })
    )
    return () => {
      stale = true
    }
  }, [linesOf, page, version])
  // Lines that were read from the page as it was are not offered for the page as it is.
  const lines = useMemo(() => (read?.of === key ? read.lines : []), [read, key])
  const typing = retext.typing?.page === page ? retext.typing : null
  // Lines that belong together are offered as one, when that is wanted.
  const { blocks, known, inBlock } = useMemo(() => {
    const blocks = retext.blocks ? blocksOf(lines) : []
    return {
      blocks,
      known: wordsOf(lines),
      inBlock: new Set(blocks.flatMap((block) => block.lines)),
    }
  }, [lines, retext.blocks])

  return (
    <>
      {lines.map((line, at) =>
        inBlock.has(at) || (typing && typing.line === line) ? null : (
          <Spot
            // A line that was moved is another line: it starts where the file now has it.
            key={`${key}/${at}`}
            spot={`${page}/line/${at}`}
            retext={retext}
            box={line.box}
            label={`Change the line: ${line.text}`}
            title={
              line.fixed ?? "Change these words, or drag them somewhere else"
            }
            fixed={Boolean(line.fixed)}
            scale={scale}
            onPress={() =>
              retext.setTyping({
                page,
                line,
                text: line.text,
                look: {},
                spot: `${page}/line/${at}`,
              })
            }
            onMove={(by) => retext.change(page, line, line.text, {}, by)}
            onTakeOut={() => retext.change(page, line, "")}
          />
        )
      )}
      {blocks.map((block) => {
        const of = block.lines.map((at) => lines[at])
        if (typing?.lines?.[0] === of[0]) return null
        const whole = asLine(of, known)
        return (
          <Spot
            key={`${key}/block/${block.lines[0]}`}
            spot={`${page}/block/${block.lines[0]}`}
            retext={retext}
            block
            box={block.box}
            label={`Change the paragraph: ${startOf(whole.text)}`}
            title="Change this paragraph, or drag it somewhere else"
            scale={scale}
            onPress={() =>
              retext.setTyping({
                page,
                line: whole,
                text: whole.text,
                look: {},
                lines: of,
                spot: `${page}/block/${block.lines[0]}`,
              })
            }
            onMove={(by) =>
              retext.change(page, whole, whole.text, {}, by, { lines: of })
            }
            onTakeOut={() =>
              retext.change(page, whole, "", {}, undefined, { lines: of })
            }
          />
        )
      })}
      {typing?.lines && <BlockField retext={retext} page={page} />}
      {!typing &&
        retext.settling?.page === page &&
        // Until the page shows them: drawn again since they were sent, or
        // answered with no change at all.
        drawn <= retext.settling.since &&
        !(retext.settling.done && version === retext.settling.since) && (
          <SettlingWords settling={retext.settling} />
        )}
      {typing &&
        !typing.lines &&
        (() => {
          const { line, text, look } = typing
          const style = mainStyle(line)
          const size = look.size ?? style?.size ?? 12
          // The font it will be set in: one of the editor's when that was
          // chosen; else the one that stands closest to its own, to type in.
          const shown = look.font ?? style?.standIn ?? "sans"
          // Phones zoom the whole page in on a field with letters under 16
          // pixels; the field is made larger and scaled back down.
          const grow = Math.max(1, 16 / size)
          const lent = standIns(line, text.trim(), look)
          const height = (line.box.height * size) / (style?.size ?? size)
          const turned = line.along.x !== 1
          return (
            <div
              className="absolute"
              style={{ left: line.box.x - 1, top: line.box.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <input
                autoFocus
                data-testid="editor-retext"
                aria-label="The words of this line"
                aria-describedby={
                  line.fixed || lent.length || turned
                    ? `retext-${page}`
                    : undefined
                }
                value={text}
                readOnly={Boolean(line.fixed)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                onChange={(event) =>
                  retext.setTyping({ ...typing, text: event.target.value })
                }
                onBlur={(event) => {
                  // Choosing a look in the bar does not end the typing.
                  if (
                    (event.relatedTarget as HTMLElement | null)?.closest(
                      "[data-editor-bar]"
                    )
                  )
                    return
                  retext.finish()
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    event.preventDefault()
                    retext.leave()
                  } else if (event.key === "Enter") {
                    event.preventDefault()
                    retext.finish()
                  }
                }}
                className="origin-top-left border-0 bg-white p-0 px-px outline-1 outline-primary select-text"
                style={{
                  width:
                    Math.max(line.box.width, size * 6) * grow + size * 6 * grow,
                  height: height * grow,
                  transform: grow > 1 ? `scale(${1 / grow})` : undefined,
                  fontFamily: `"${screenFamily(shown)}", ${generic(shown)}`,
                  fontWeight: shown.includes("bold") ? 700 : 400,
                  fontStyle: shown.includes("italic") ? "italic" : "normal",
                  fontSize: size * grow,
                  lineHeight: `${height * grow}px`,
                  color: cssColour(look.colour ?? style?.colour ?? [0, 0, 0]),
                }}
              />
              {(line.fixed || lent.length > 0 || turned) && (
                <p
                  id={`retext-${page}`}
                  role="status"
                  className="absolute left-0 w-max max-w-80 rounded-xs bg-foreground px-1 py-0.5 whitespace-normal text-background"
                  style={{
                    top: height + 2,
                    fontSize: Math.max(7, Math.min(10, size * 0.8)),
                    lineHeight: 1.3,
                  }}
                >
                  {line.fixed ??
                    [
                      turned &&
                        "This line is turned on the page; it is typed here straight and written turned.",
                      lent.length > 0 &&
                        `This line's font has no ${lent.map((letter) => `“${letter}”`).join(", ")}: the closest font the editor has will be used for ${lent.length === 1 ? "it" : "them"}.`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                </p>
              )}
            </div>
          )
        })()}
    </>
  )
}

/**
 * The paragraph that is being changed: a field over it, as wide as the
 * paragraph is, in a font close to its own. The words wrap in it about as
 * they will on the page; the page shows the real thing once the file has
 * laid them out.
 */
function BlockField({ retext, page }: { retext: Retext; page: number }) {
  const typing = retext.typing!
  const { line, text, look } = typing
  const lines = typing.lines!
  const field = useRef<HTMLTextAreaElement>(null)
  const style = mainStyle(line)
  const shape = shapeOf(lines)
  const by = look.size && style ? look.size / style.size : 1
  const size = (style?.size ?? 12) * by
  const shown = look.font ?? style?.standIn ?? "sans"
  // Phones zoom the whole page in on a field with letters under 16 pixels;
  // the field is made larger and scaled back down.
  const grow = Math.max(1, 16 / size)
  const lent = standIns(line, text, look)
  const joinedHere = joinedWords(text)
  const align = typing.align ?? shape.align
  /** How tall the field is on the page, in points. */
  const [tall, setTall] = useState(line.box.height)
  // As tall as its words need, and no shorter than the paragraph is.
  useLayoutEffect(() => {
    const area = field.current
    if (!area) return
    area.style.height = "0"
    const high = Math.max(area.scrollHeight, line.box.height * by * grow)
    area.style.height = `${high}px`
    setTall(high / grow)
  }, [text, size, shown, line.box.height, by, grow])
  const says = [
    lent.length > 0 &&
      `This paragraph's font has no ${lent.map((letter) => `“${letter}”`).join(", ")}: the closest font the editor has will be used for ${lent.length === 1 ? "it" : "them"}.`,
    joinedHere.length > 0 &&
      `${joinedHere.length === 1 ? "A word" : "Words"} the file broke at the end of a line ${joinedHere.length === 1 ? "is" : "are"} whole here: ${joinedHere.slice(0, 6).join(", ")}${joinedHere.length > 6 ? " and more" : ""}. Type the hyphen where one belongs.`,
  ].filter(Boolean)
  return (
    <div
      className="absolute"
      style={{ left: shape.left - 1, top: line.box.y, height: tall }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        ref={field}
        autoFocus
        data-testid="editor-retext"
        aria-label="The words of this paragraph"
        aria-describedby={says.length ? `retext-${page}` : undefined}
        value={text}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        onChange={(event) =>
          retext.setTyping({ ...typing, text: event.target.value })
        }
        onBlur={(event) => {
          // Choosing a look in the bar does not end the typing.
          if (
            (event.relatedTarget as HTMLElement | null)?.closest(
              "[data-editor-bar]"
            )
          )
            return
          retext.finish()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Escape") {
            event.preventDefault()
            retext.leave()
          } else if (
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey)
          ) {
            event.preventDefault()
            retext.finish()
          }
        }}
        className="block origin-top-left resize-none overflow-hidden border-0 bg-white p-0 px-px outline-1 outline-primary select-text"
        style={{
          width: (shape.right - shape.left + 2) * grow,
          transform: grow > 1 ? `scale(${1 / grow})` : undefined,
          fontFamily: `"${screenFamily(shown)}", ${generic(shown)}`,
          fontWeight: shown.includes("bold") ? 700 : 400,
          fontStyle: shown.includes("italic") ? "italic" : "normal",
          fontSize: size * grow,
          lineHeight: `${shape.leading * by * grow}px`,
          textAlign:
            align === "centre"
              ? "center"
              : align === "justify"
                ? "justify"
                : align,
          textIndent: shape.indent > 0 ? shape.indent * by * grow : undefined,
          color: cssColour(look.colour ?? style?.colour ?? [0, 0, 0]),
        }}
      />
      {says.length > 0 && (
        <p
          id={`retext-${page}`}
          role="status"
          className="absolute left-0 w-max max-w-80 rounded-xs bg-foreground px-1 py-0.5 whitespace-normal text-background"
          style={{
            top: tall + 2,
            fontSize: Math.max(7, Math.min(10, size * 0.8)),
            lineHeight: 1.3,
          }}
        >
          {says.join(" ")}
        </p>
      )}
    </div>
  )
}

/**
 * Words that were typed and are on their way into the file, shown where
 * they were typed until the page has been drawn again. Without them the
 * page would show the old words once more for a moment, and then the new.
 */
function SettlingWords({ settling }: { settling: Settling }) {
  const { line, text, look, lines } = settling
  const style = mainStyle(line)
  const by = look.size && style ? look.size / style.size : 1
  const size = (style?.size ?? 12) * by
  const shown = look.font ?? style?.standIn ?? "sans"
  const shape = lines ? shapeOf(lines) : null
  const align = settling.align ?? shape?.align ?? "left"
  return (
    <div
      aria-hidden="true"
      data-testid="editor-settling"
      className="pointer-events-none absolute bg-white px-px"
      style={{
        left: (shape?.left ?? line.box.x) - 1,
        top: line.box.y,
        minHeight: line.box.height * by,
        ...(shape
          ? {
              width: shape.right - shape.left + 2,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              lineHeight: `${shape.leading * by}px`,
              textAlign:
                align === "centre"
                  ? "center"
                  : align === "justify"
                    ? "justify"
                    : align,
              textIndent: shape.indent > 0 ? shape.indent * by : undefined,
            }
          : {
              minWidth: line.box.width + 2,
              whiteSpace: "pre",
              lineHeight: `${line.box.height * by}px`,
            }),
        fontFamily: `"${screenFamily(shown)}", ${generic(shown)}`,
        fontWeight: shown.includes("bold") ? 700 : 400,
        fontStyle: shown.includes("italic") ? "italic" : "normal",
        fontSize: size,
        color: cssColour(look.colour ?? style?.colour ?? [0, 0, 0]),
      }}
    >
      {text}
    </div>
  )
}
