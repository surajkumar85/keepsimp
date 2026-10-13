"use client"

import type { MakeFieldOp } from "@/lib/pdf-editor/form-fields"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import type { Size } from "@/lib/image-compressor/geometry"
import type {
  Comment,
  CommentChange,
  LetterLine,
} from "@/lib/pdf-editor/comments"
import { fontUrls, screenFamily } from "@/lib/pdf-editor/fonts"
import { keepOnPage, seenMiddle, type Point } from "@/lib/pdf-editor/geometry"
import { emptyHistory, markSaved, type History } from "@/lib/pdf-editor/history"
import {
  fontKey,
  fontsFor,
  retyped,
  type Colour,
  type EditorObject,
  type TextObject,
} from "@/lib/pdf-editor/objects"
import {
  lookOf,
  partsFor,
  stylesWith,
  withLook,
  type Look,
} from "@/lib/pdf-editor/styles"
import { stepName, type FieldOp, type FormField } from "@/lib/pdf-editor/forms"
import {
  drawnSignature,
  SIGNATURE_SIZE,
  SIGNATURE_TEXT,
  typedSignature,
  type Signature,
  type SignatureSlot,
} from "@/lib/pdf-editor/signature"
import {
  isOwn,
  LARGEST_FONT,
  ownKey,
  readFont,
} from "@/lib/pdf-editor/own-font"
import type { OwnFile } from "@/lib/pdf-editor/draft-store"
import type { Query } from "@/lib/pdf-editor/find"
import type { LinkOp, PageLink } from "@/lib/pdf-editor/links"
import type { DocumentOp } from "@/lib/pdf-editor/document"
import type {
  Applied,
  RedactMark,
  RedactOp,
  Sought,
} from "@/lib/pdf-editor/redact"
import { labelOf, type PageOp } from "@/lib/pdf-editor/pages"
import {
  repeatedChange,
  type RepeatedLine,
  type Watermark,
} from "@/lib/pdf-editor/repeated"
import type { FlowOp } from "@/lib/pdf-editor/paragraphs"
import type { PagePicture, PictureOp } from "@/lib/pdf-editor/page-pictures"
import type { Align } from "@/lib/pdf-editor/paragraphs"
import {
  standIns,
  type LineLook,
  type PageLine,
  type TextOp,
} from "@/lib/pdf-editor/retext"
import { breakLines, combLine } from "@/lib/pdf-editor/text-layout"
import {
  applied,
  defaultStyles,
  drag,
  makeCallout,
  makeText,
  nextThing,
  nudge,
  paste,
  pick,
  press,
  release,
  removeSelected,
  reorder,
  restyle,
  selectAll,
  startState,
  thingAt,
  type Change,
  type EditorState,
  type Moment,
  type PageView,
  type Styles,
  type Tool,
} from "@/lib/pdf-editor/tools"
import {
  EditFailed,
  type EditState,
  type PdfClient,
} from "@/lib/pdf-merger/client"

/** A text box being typed into: the box, and whether it is in the file yet. */
export interface Typing {
  page: number
  object: TextObject
  fresh: boolean
  /** The box as the file has it, for one that was there already. */
  was?: TextObject
}

/** What makes a text box what it is, apart from where its lines break. */
const substance = (object: TextObject) =>
  JSON.stringify({ ...object, lines: null, box: object.box.width })

let measurer: CanvasRenderingContext2D | null | undefined

/** How wide the browser writes some text in one of the editor's fonts, in points at a size in points. */
function measureWith(key: string, size: number) {
  if (measurer === undefined)
    measurer = document.createElement("canvas").getContext("2d")
  return (text: string) => {
    if (!measurer) return text.length * size * 0.5
    measurer.font = `${size}px "${screenFamily(key)}"`
    // The file is written letter by letter, each as wide as the font says.
    measurer.fontKerning = "none"
    return measurer.measureText(text).width
  }
}

/** A text box with its lines broken for its width, in its own font. */
export const laidOut = (object: TextObject, text = object.text): TextObject =>
  retyped(object, {
    text,
    // A row of boxes is one line, with a letter to a box.
    lines: object.comb
      ? [combLine(text, object.comb)]
      : breakLines(
          text,
          object.box.width,
          measureWith(fontKey(object), object.size)
        ),
  })

let made = 0
const newId = () => `k${Date.now().toString(36)}${(made++).toString(36)}`

/** How far from a page's edges the middle of a thing placed for you is kept, in points. */
const PLACED_ROOM = 48

/**
 * Everything the editor's screen needs for one open file: what is on its
 * pages, the tool in hand, and the ways to change the file. Every change
 * goes to the worker, which makes it in the real document and says what the
 * pages hold afterwards.
 */
export function useEditor(
  client: RefObject<PdfClient | null>,
  file: string,
  opened: EditState,
  /** Told of every picture that is placed, for a draft to keep. */
  onPicture?: (name: string, picture: Blob) => void,
  /** Fonts of one's own: those a draft brought with it, and whom to tell of each that is added. */
  own?: {
    fonts?: ReadonlyMap<string, OwnFile>
    onFont?: (key: string, font: OwnFile) => void
  },
  /** The file's name, for what is written on its pages. */
  fileName = ""
) {
  const [objects, setObjects] = useState<EditorObject[][]>(opened.objects)
  /** The comments on each page, as the file has them. */
  const [comments, setComments] = useState<Comment[][]>(opened.comments)
  /** The places of a form on each page, with what each holds in the file. */
  const [fields, setFields] = useState<FormField[][]>(opened.fields)
  const [formNames, setFormNames] = useState(
    opened.formNames ?? opened.fields.flat().map((field) => field.name)
  )
  const [versions, setVersions] = useState<number[]>(() =>
    opened.sizes.map(() => 0)
  )
  const [history, setHistory] = useState<History>(
    opened.history ?? emptyHistory
  )
  const [state, showState] = useState<EditorState>(startState)
  const [styles, showStyles] = useState<Styles>(defaultStyles)
  const [typing, showTyping] = useState<Typing | null>(null)
  const [problem, setProblem] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(0)
  /** The page being read, for what is added without a place of its own. */
  const reading = useRef(0)
  const copied = useRef<EditorObject[]>([])
  /** Changes are made one after another, in the order they were asked for. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  /** Page layers finish their gathered moves before another change is queued. */
  const finishers = useRef(new Set<() => void>()),
    finishing = useRef(false)
  const onFlush = useCallback((finish: () => void) => {
    finishers.current.add(finish)
    return () => {
      finishers.current.delete(finish)
    }
  }, [])
  const fonts = useRef(new Map<string, Promise<void>>())
  /** The fonts of one's own that were added, in the order they were. */
  const [ownFonts, setOwnFonts] = useState<{ key: string; name: string }[]>(
    () => [...(own?.fonts ?? [])].map(([key, { name }]) => ({ key, name }))
  )
  const lettersRead = useRef(new Map<string, Promise<LetterLine[]>>())
  const linesRead = useRef(new Map<string, Promise<PageLine[]>>())
  const picturesRead = useRef(new Map<string, Promise<PagePicture[]>>())
  const linksRead = useRef(new Map<string, Promise<PageLink[]>>())
  /** How many changes are in force this moment, ahead of what has been drawn. */
  const position = useRef((opened.history ?? emptyHistory).position)
  /** What the file last said its pages hold. */
  const truth = useRef(opened.objects)
  /** Changes that have been asked for and not yet answered, oldest first. */
  const pending = useRef<Change[]>([])
  /** Moves by the arrow keys, gathered into one change until the keys rest. */
  const held = useRef<{
    change: Change
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  /**
   * Where things stand this very moment. What is drawn lags behind: a
   * pointer can be pressed, moved and let go before the screen has been
   * drawn once, and a release worked out from what was last drawn would
   * lose the way the pointer went. So everything is worked out from here,
   * and every change is put here first and on the screen after.
   */
  const latest = useRef({ objects, state, styles, typing })
  const setState = useCallback(
    (next: EditorState | ((was: EditorState) => EditorState)) => {
      latest.current.state =
        typeof next === "function" ? next(latest.current.state) : next
      showState(latest.current.state)
    },
    []
  )
  const setStyles = useCallback((next: (was: Styles) => Styles) => {
    latest.current.styles = next(latest.current.styles)
    showStyles(latest.current.styles)
  }, [])
  const setTyping = useCallback(
    (next: Typing | null | ((was: Typing | null) => Typing | null)) => {
      latest.current.typing =
        typeof next === "function" ? next(latest.current.typing) : next
      showTyping(latest.current.typing)
    },
    []
  )
  /** Every page's size as it is shown; the list changes when pages are moved, added or taken out. */
  const [sizes, setSizes] = useState(opened.sizes)
  const [bookmarks, setBookmarks] = useState(opened.bookmarks)
  /** Counts up whenever the list of pages itself changes. */
  const [layout, setLayout] = useState(0)
  /** What the file says of itself, its bookmarks and its own page numbers, as the file has them. */
  const [described, setDescribed] = useState(opened.document)
  /** How many marks for taking something out are waiting to be applied, on all pages together. */
  const [waiting, setWaiting] = useState(opened.waiting)
  const marksRead = useRef(new Map<string, Promise<RedactMark[]>>())

  const view = useCallback(
    (page: number, from = latest.current.objects): PageView => ({
      page,
      size: sizes[page] as Size,
      objects: from[page] ?? [],
    }),
    [sizes]
  )

  /** Load a font for the screen and hand it to the worker, once. */
  const ensureFont = useCallback(
    (key: string) => {
      let loading = fonts.current.get(key)
      // A font of one's own is not on the site: it is there when it was added, or not at all.
      if (!loading && isOwn(key))
        return Promise.reject(new Error("That font has not been added."))
      if (!loading) {
        loading = (async () => {
          const response = await fetch(fontUrls[key])
          if (!response.ok) throw new Error("font")
          const bytes = await response.arrayBuffer()
          const face = new FontFace(screenFamily(key), bytes.slice(0))
          await face.load()
          document.fonts.add(face)
          client.current?.editFont(file, key, bytes)
        })()
        // A font that failed to load is asked for again the next time.
        loading.catch(() => fonts.current.delete(key))
        fonts.current.set(key, loading)
      }
      return loading
    },
    [client, file]
  )

  /** Make a font of one's own ready for the screen, under the key it goes by. */
  const showOwn = useCallback(async (key: string, bytes: ArrayBuffer) => {
    const face = new FontFace(screenFamily(key), bytes)
    await face.load()
    document.fonts.add(face)
  }, [])

  // The fonts a draft brought with it are already with the worker; the screen needs them too.
  const brought = own?.fonts
  useEffect(() => {
    for (const [key, { blob }] of brought ?? [])
      if (!fonts.current.has(key))
        fonts.current.set(
          key,
          blob.arrayBuffer().then((bytes) => showOwn(key, bytes))
        )
  }, [brought, showOwn])

  /**
   * Add a font of one's own from a file: it is read for its name and for
   * whether its maker allows it in documents, shown on the screen, and
   * handed to the worker. Of a file that holds several fonts, the one
   * that goes by one of the names given is taken, or the first.
   * @returns The key it goes by; null when it cannot be used, and the bar says why.
   */
  const tellOwn = own?.onFont
  const addOwnFont = useCallback(
    async (chosen: Blob, names?: readonly string[]) => {
      let bytes: Uint8Array
      try {
        if (chosen.size > LARGEST_FONT) throw new Error("large")
        bytes = new Uint8Array(await chosen.arrayBuffer())
      } catch {
        setProblem("That file could not be read as a font.")
        return null
      }
      const read = readFont(bytes, names)
      if (!read) {
        setProblem(
          "That file is not a font the editor can use. Choose a TrueType or OpenType font (.ttf or .otf)."
        )
        return null
      }
      if (!read.allowed) {
        setProblem(
          `The maker of “${read.name}” does not allow it to be put into documents. Choose another font.`
        )
        return null
      }
      const key = ownKey(read.file)
      if (!fonts.current.has(key)) {
        const loading = showOwn(key, read.file.slice().buffer)
        fonts.current.set(key, loading)
        try {
          await loading
        } catch {
          fonts.current.delete(key)
          setProblem("The browser could not read that font.")
          return null
        }
        client.current?.editFont(
          file,
          key,
          read.file.slice().buffer,
          read.written
        )
        tellOwn?.(key, {
          name: read.name,
          written: read.written,
          blob: new Blob([read.file.slice()], { type: "font/sfnt" }),
        })
      }
      setOwnFonts((was) =>
        was.some((font) => font.key === key)
          ? was
          : [...was, { key, name: read.name }]
      )
      setProblem("")
      return key
    },
    [client, file, showOwn, tellOwn]
  )

  /**
   * Show what the pages hold: what the file last said, and after it the
   * changes that have been asked for since. A change is seen at once this
   * way, and the next one is worked out from where things now are, not from
   * where the file last had them.
   */
  const show = useCallback(() => {
    let next = truth.current
    for (const change of pending.current) next = applied(next, change)
    if (held.current) next = applied(next, held.current.change)
    latest.current.objects = next
    setObjects(next)
  }, [])

  const takeNews = useCallback(
    (news: Awaited<ReturnType<PdfClient["editApply"]>>) => {
      // When the list of pages is another, what is kept of each page is as long as the list.
      const count = news.layout?.sizes.length
      const sized = <T>(pages: T[]) =>
        count === undefined ? pages : pages.slice(0, count)
      const next = [...truth.current]
      for (const { page, objects: now } of news.pages) next[page] = now
      truth.current = sized(next)
      show()
      setComments((was) => {
        const now = [...was]
        for (const { page, comments: here } of news.pages) now[page] = here
        return sized(now)
      })
      setFields((was) => {
        const now = [...was]
        for (const { page, fields: here } of news.pages) now[page] = here
        return sized(now)
      })
      setWaiting(news.waiting)
      if (news.formNames) setFormNames(news.formNames)
      if (news.document) {
        setDescribed(news.document)
        setBookmarks(news.document.bookmarks)
      }
      if (news.layout) {
        setSizes(news.layout.sizes)
        setBookmarks(news.layout.bookmarks)
        setLayout((was) => was + 1)
        // What was selected may be on another page now, or on none.
        setState((was) => ({ ...was, selection: null, gesture: null }))
        setTyping(null)
      }
      setVersions((was) => {
        const drawn = [...was]
        for (const { page } of news.pages) drawn[page] = (drawn[page] ?? 0) + 1
        return drawn
      })
      setHistory(news.history)
      position.current = news.history.position
      setNotice(
        news.lacking.length
          ? `This font has no shape for ${news.lacking.join(" ")}. ${news.lacking.length === 1 ? "It is" : "They are"} left out of the file.`
          : ""
      )
    },
    [show, setState, setTyping]
  )

  /**
   * Ask something of the worker, after whatever was asked before it.
   * @param change What is being asked for, when it is a change: it is shown until the file answers.
   */
  const enqueue = useCallback(
    (
      work: (
        worker: PdfClient
      ) => Promise<Awaited<ReturnType<PdfClient["editApply"]>>>,
      change?: Change
    ) => {
      setBusy((count) => count + 1)
      if (change) {
        pending.current = [...pending.current, change]
        show()
      }
      const answered = () => {
        if (change)
          pending.current = pending.current.filter((one) => one !== change)
      }
      const done = queue.current
        .then(async () => {
          const worker = client.current
          const news = worker ? await work(worker) : null
          answered()
          if (news) takeNews(news)
          else show()
          setProblem("")
        })
        .catch((error: unknown) => {
          // The change was not made: the pages are shown without it again.
          answered()
          show()
          setProblem(
            (error instanceof EditFailed && error.message) ||
              "That change could not be made. Try again."
          )
        })
        .finally(() => setBusy((count) => count - 1))
      queue.current = done
      return done
    },
    [client, takeNews, show]
  )

  /** Send a change to the file. Text boxes have their lines broken afresh first, in their own font. */
  const send = useCallback(
    (change: Change) =>
      enqueue(async (worker) => {
        const ops = []
        for (const op of change.ops) {
          if (op.do !== "add" && op.do !== "change") {
            ops.push(op)
            continue
          }
          // Whatever has letters needs its font in the worker: text, a stamp, the label of a measuring line.
          for (const key of fontsFor(op.object)) await ensureFont(key)
          ops.push(
            op.object.kind === "text"
              ? { ...op, object: laidOut(op.object) }
              : op
          )
        }
        return worker.editApply(file, { label: change.label, ops })
      }, change),
    [enqueue, ensureFont, file]
  )

  /** Moves by the arrow keys that are being gathered go to the file, as one change. */
  const flush = useCallback(() => {
    const waiting = held.current
    if (waiting) {
      clearTimeout(waiting.timer)
      held.current = null
      void send(waiting.change)
    }
    // A finisher sends through this same queue, so it may call flush again.
    if (finishing.current) return
    finishing.current = true
    try {
      for (const finish of finishers.current) finish()
    } finally {
      finishing.current = false
    }
  }, [send])

  useEffect(
    () => () => {
      if (held.current) clearTimeout(held.current.timer)
    },
    []
  )

  /** Make a change to the file. */
  const apply = useCallback(
    (change: Change | null) => {
      if (!change || !change.ops.length) return Promise.resolve()
      flush()
      return send(change)
    },
    [flush, send]
  )

  /**
   * Move what is selected by the arrow keys. A key that is held down sends
   * many moves; they are shown as they come and go to the file together
   * once the keys rest, so that one undo takes the whole way back.
   */
  const nudgeBy = useCallback(
    (dx: number, dy: number) => {
      const { state: now, objects: all } = latest.current
      if (!now.selection) return
      const waiting = held.current
      const ids = (change: Change) =>
        change.ops.map(
          (op) => `${op.page}/${op.do === "change" ? op.object.id : ""}`
        )
      const change = nudge(
        now,
        {
          page: now.selection.page,
          size: sizes[now.selection.page] as Size,
          objects: all[now.selection.page] ?? [],
        },
        dx,
        dy
      )
      if (!change) return
      // Other things than were being moved: what was gathered goes to the
      // file first. It stays on the screen meanwhile, so the new move, worked
      // out from the screen, is still the right one.
      if (waiting && ids(waiting.change).join() !== ids(change).join()) flush()
      else if (waiting) clearTimeout(waiting.timer)
      held.current = { change, timer: setTimeout(flush, 400) }
      show()
    },
    [sizes, flush, show]
  )

  /**
   * Make a change to comments. It is seen when the file has answered.
   * @returns What the pages hold afterwards; null when the change could not be made.
   */
  const comment = useCallback(
    async (change: CommentChange) => {
      flush()
      let news: Awaited<ReturnType<PdfClient["editComment"]>> | null = null
      await enqueue(async (worker) => {
        news = await worker.editComment(file, change)
        return news
      })
      return news as Awaited<ReturnType<PdfClient["editComment"]>> | null
    },
    [flush, enqueue, file]
  )

  /**
   * Fill a field of a form in, or turn a tick box or a round button on or
   * off. It is seen when the file has answered: the page is drawn again
   * from the file, with the field as it now looks.
   */
  const fillField = useCallback(
    (page: number, field: FormField, to: string | boolean) => {
      const op: FieldOp =
        typeof to === "string"
          ? { do: "fill", page, id: field.id, value: to }
          : { do: "turn", page, id: field.id, on: to }
      flush()
      enqueue((worker) =>
        worker.editField(file, { label: stepName(field, op), ops: [op] })
      )
    },
    [flush, enqueue, file]
  )

  /** The letters of a page with their boxes, read once for each state of the page. */
  const letters = useCallback(
    (page: number, version: number) => {
      const key = `${page}/${version}`
      let reading = lettersRead.current.get(key)
      if (!reading) {
        reading = (async () =>
          (await client.current?.lettersOf(file, page)) ?? [])()
        lettersRead.current.set(key, reading)
      }
      return reading
    },
    [client, file]
  )

  /** The lines of a page's own text as they can be changed, read once for each state of the page. */
  const lines = useCallback(
    (page: number, version: number) => {
      const key = `${page}/${version}`
      let reading = linesRead.current.get(key)
      if (!reading) {
        reading = (async () =>
          (await client.current?.linesOf(file, page)) ?? [])()
        linesRead.current.set(key, reading)
      }
      return reading
    },
    [client, file]
  )

  /**
   * Change what a line of a page says; with nothing, the line is taken out.
   * The fonts that stand in for letters the line's own font lacks are made
   * ready first. It is seen when the file has answered.
   */
  const retext = useCallback(
    async (
      page: number,
      line: PageLine,
      text: string,
      look?: LineLook,
      move?: Point
    ) => {
      try {
        if (look?.font) await ensureFont(look.font)
        else if (standIns(line, text).length)
          for (const key of new Set(line.styles.map((style) => style.standIn)))
            await ensureFont(key)
      } catch {
        setProblem("The font could not be loaded. Check your connection.")
        return
      }
      flush()
      return enqueue((worker) =>
        worker.editText(file, {
          label: !text
            ? "Take out text"
            : move && text === line.text && !look
              ? "Move text"
              : "Change text",
          ops: [
            {
              do: "retext",
              page,
              box: line.box,
              was: line.text,
              text,
              ...(look ? { look } : null),
              ...(move ? { move } : null),
            },
          ],
        })
      )
    },
    [ensureFont, flush, enqueue, file]
  )

  /** Every place some words are in the file's own text; null when the file could not be looked through. */
  const find = useCallback(
    async (query: Query) =>
      (await client.current?.editFind(file, query)) ?? null,
    [client, file]
  )

  /**
   * Put other words in the place of some, in many lines and paragraphs, as
   * one step. The fonts that may have to stand in are made ready first.
   * @returns Why each place that was left out could not be changed; null when nothing was tried.
   */
  const replace = useCallback(
    async (ops: (TextOp | FlowOp)[], fonts: readonly string[]) => {
      try {
        for (const key of new Set(fonts)) await ensureFont(key)
      } catch {
        setProblem("The font could not be loaded. Check your connection.")
        return null
      }
      flush()
      let refused: string[] | null = null
      await enqueue(async (worker) => {
        const news = await worker.editReplace(file, {
          label: "Replace text",
          ops,
        })
        refused = news.refused ?? []
        return news
      })
      return refused as string[] | null
    },
    [ensureFont, flush, enqueue, file]
  )

  /** The links of a page, with where they lie and lead, read once for each state of the page. */
  const pageLinks = useCallback(
    (page: number, version: number) => {
      const key = `${page}/${version}`
      let reading = linksRead.current.get(key)
      if (!reading) {
        reading = (async () =>
          (await client.current?.pageLinks(file, page)) ?? [])()
        linksRead.current.set(key, reading)
      }
      return reading
    },
    [client, file]
  )

  /** Add a link to a page, or lead one somewhere else, put it somewhere else or take it away. */
  const changeLink = useCallback(
    (page: number, what: Omit<LinkOp, "do" | "page">, label: string) => {
      flush()
      return enqueue((worker) =>
        worker.editPageLink(file, {
          label,
          ops: [{ do: "link", page, ...what }],
        })
      )
    },
    [flush, enqueue, file]
  )

  /** The marks of a page that are waiting to be applied, read once for each state of the page. */
  const redactMarks = useCallback(
    (page: number, version: number) => {
      const key = `${page}/${version}`
      let reading = marksRead.current.get(key)
      if (!reading) {
        reading = (async () =>
          (await client.current?.redactMarks(file, page)) ?? [])()
        marksRead.current.set(key, reading)
      }
      return reading
    },
    [client, file]
  )

  /** Make or change the PDF's own form fields, after pending gestures finish. */
  const makeFields = useCallback(
    async (label: string, ...ops: MakeFieldOp[]) => {
      flush()
      let made: Awaited<ReturnType<PdfClient["editMakeFields"]>> | null = null
      await enqueue(async (worker) => {
        const news = await worker.editMakeFields(file, { label, ops })
        made = news
        return news
      })
      return made as Awaited<ReturnType<PdfClient["editMakeFields"]>> | null
    },
    [flush, enqueue, file]
  )

  /**
   * Mark places to be taken out for good, take marks away, or apply them
   * all, as one step.
   * @returns What applying did on each page; an empty list for marks alone; null when the step could not be made.
   */
  const changeRedact = useCallback(
    async (label: string, ...ops: RedactOp[]) => {
      flush()
      let applied: Applied[] | null = null
      await enqueue(async (worker) => {
        const news = await worker.editRedact(file, { label, ops })
        applied = news.applied ?? []
        return news
      })
      return applied as Applied[] | null
    },
    [flush, enqueue, file]
  )

  /** Where some words, or things of a kind, are on the pages; null when the file could not be looked through. */
  const findToRedact = useCallback(
    async (sought: Sought) => {
      flush()
      await queue.current
      return (await client.current?.redactFind(file, sought)) ?? null
    },
    [client, file, flush]
  )

  /** Change the file's bookmarks, its details or its own page numbers, as one step. */
  const changeDocument = useCallback(
    (label: string, ...ops: DocumentOp[]) => {
      flush()
      return enqueue((worker) => worker.editDocument(file, { label, ops }))
    },
    [flush, enqueue, file]
  )

  /** Move, take out, copy, turn or add pages, as one step. */
  const changePages = useCallback(
    (op: PageOp) => {
      flush()
      return enqueue((worker) =>
        worker.editPages(file, { label: labelOf(op), ops: [op] })
      )
    },
    [flush, enqueue, file]
  )

  /**
   * Write a line on some pages, or lay a watermark over them: one thing
   * added to each, all in one step.
   * @param pages The pages, counted from 0, in the order they are numbered in.
   */
  const repeat = useCallback(
    (
      what: { line: RepeatedLine } | { mark: Watermark },
      pages: readonly number[]
    ) => {
      setState((was) => ({ ...was, selection: null, gesture: null }))
      return apply(
        repeatedChange(
          what,
          pages,
          sizes,
          {
            date: new Intl.DateTimeFormat("en-GB", {
              dateStyle: "long",
            }).format(new Date()),
            name: fileName,
          },
          newId
        )
      )
    },
    [apply, setState, sizes, fileName]
  )

  /**
   * Hand the worker a picture that is not placed yet, as for a watermark.
   * @returns The name it goes by and its size in pixels; null when it cannot be read, and the bar says so.
   */
  const handPicture = useCallback(
    async (picture: Blob) => {
      const worker = client.current
      if (!worker) return null
      const name = newId()
      setBusy((count) => count + 1)
      try {
        const size = await worker.editPicture(file, name, picture)
        if (!size) {
          setProblem(
            "This picture could not be read. PNG, JPEG, WebP and AVIF can be used."
          )
          return null
        }
        onPicture?.(name, picture)
        return { name, size }
      } finally {
        setBusy((count) => count - 1)
      }
    },
    [client, file, onPicture]
  )

  /**
   * Add every page of another PDF before the page at a place. The file is
   * handed to the worker first, which makes it ready; a locked one wants
   * its password.
   * @returns "locked" or "wrong" when a password is wanted; "failed" when the file cannot be read (the bar says why); "done" otherwise.
   */
  const insertPdf = useCallback(
    async (chosen: Blob, at: number, password?: string) => {
      const worker = client.current
      if (!worker) return "failed" as const
      const name = `pdf-${newId()}`
      setBusy((count) => count + 1)
      try {
        const taken = await worker.editInsert(file, name, chosen, {
          password,
        })
        if ("locked" in taken) return taken.wrong ? "wrong" : "locked"
        if ("failed" in taken) {
          setProblem(taken.failed)
          return "failed" as const
        }
        // What a draft keeps is the file as it was made ready: it needs no password again.
        if (taken.bytes)
          onPicture?.(
            name,
            new Blob([taken.bytes], { type: "application/pdf" })
          )
        await changePages({ do: "insert", at, file: name, count: taken.pages })
        return "done" as const
      } finally {
        setBusy((count) => count - 1)
      }
    },
    [client, file, onPicture, changePages]
  )

  /** The pictures a page already has, with where they are, read once for each state of the page. */
  const pagePictures = useCallback(
    (page: number, version: number) => {
      const key = `${page}/${version}`
      let reading = picturesRead.current.get(key)
      if (!reading) {
        reading = (async () =>
          (await client.current?.pagePictures(file, page)) ?? [])()
        picturesRead.current.set(key, reading)
      }
      return reading
    },
    [client, file]
  )

  /**
   * Change a picture a page already has: put it somewhere else, cut it to
   * a part or show it whole, put another in its place, or take it out. It
   * is seen when the file has answered.
   */
  const changePicture = useCallback(
    (
      page: number,
      picture: PagePicture,
      what: Pick<PictureOp, "by" | "cut" | "picture" | "remove">,
      label: string
    ) => {
      flush()
      return enqueue((worker) =>
        worker.editPagePicture(file, {
          label,
          ops: [
            {
              do: "picture",
              page,
              index: picture.index,
              at: picture.at,
              ...what,
            },
          ],
        })
      )
    },
    [flush, enqueue, file]
  )

  /** Put another picture in the place of one a page already has: it is handed to the worker first, like one that is added. */
  const replacePicture = useCallback(
    async (page: number, picture: PagePicture, chosen: Blob) => {
      const worker = client.current
      if (!worker) return
      const name = newId()
      setBusy((count) => count + 1)
      try {
        if (!(await worker.editPicture(file, name, chosen))) {
          setProblem(
            "This picture could not be read. PNG, JPEG, WebP and AVIF can be used."
          )
          return
        }
        onPicture?.(name, chosen)
        await changePicture(
          page,
          picture,
          { picture: name },
          "Put another picture in its place"
        )
      } finally {
        setBusy((count) => count - 1)
      }
    },
    [client, file, onPicture, changePicture]
  )

  /**
   * Change what a paragraph says, how it looks, how it is set or where it
   * is; with nothing, its lines are taken out. Its words are laid out again
   * by the file, within the width the paragraph has.
   * @param whole The paragraph as one line (`asLine`), for the fonts its new words need.
   * @param lines Its lines, from the top down.
   */
  const reflow = useCallback(
    async (
      page: number,
      whole: PageLine,
      lines: readonly PageLine[],
      text: string,
      more: { look?: LineLook; align?: Align; move?: Point } = {}
    ) => {
      const { look, align, move } = more
      try {
        if (look?.font) await ensureFont(look.font)
        else if (standIns(whole, text).length)
          for (const key of new Set(whole.styles.map((style) => style.standIn)))
            await ensureFont(key)
      } catch {
        setProblem("The font could not be loaded. Check your connection.")
        return
      }
      flush()
      return enqueue((worker) =>
        worker.editText(file, {
          label: !text.trim()
            ? "Take out text"
            : move && text === whole.text && !look && !align
              ? "Move text"
              : "Change text",
          ops: [
            {
              do: "reflow",
              page,
              lines: lines.map((line) => ({ box: line.box, was: line.text })),
              text,
              ...(look ? { look } : null),
              ...(align ? { align } : null),
              ...(move ? { move } : null),
            },
          ],
        })
      )
    },
    [ensureFont, flush, enqueue, file]
  )

  const undo = useCallback(() => {
    flush()
    return enqueue((worker) => worker.editStep(file, true))
  }, [flush, enqueue, file])
  const redo = useCallback(() => {
    flush()
    return enqueue((worker) => worker.editStep(file, false))
  }, [flush, enqueue, file])

  /** Finish typing: the box goes into the file, changes there, or goes away when it is empty. */
  const finishTyping = useCallback(
    (text: string | null) => {
      // Leaving a box can be noticed twice, by the box and by what was pressed; it ends once.
      const now = latest.current.typing
      if (!now) return
      setTyping(null)
      // Typing was called off: a new box never was, an old one stays as it is.
      if (text === null) return
      const words = text.replace(/\s+$/u, "")
      if (!words.trim()) {
        if (!now.fresh)
          void apply({
            label: "Delete text box",
            ops: [{ do: "remove", page: now.page, id: now.object.id }],
          })
        setState((was) => ({ ...was, selection: null }))
        return
      }
      const next = { ...now.object, text: words }
      // Nothing was changed: no step is added to the list of changes.
      if (now.was && substance(next) === substance(now.was)) return
      void apply({
        label: now.fresh ? "Add text box" : "Edit text",
        ops: [
          {
            do: now.fresh ? "add" : "change",
            page: now.page,
            object: next,
          },
        ],
      })
      setState({
        tool: "select",
        gesture: null,
        selection: { page: now.page, ids: [now.object.id] },
      })
    },
    [apply, setState, setTyping]
  )

  /** Take a tool in hand. What was being typed is kept. */
  const setTool = useCallback(
    (tool: Tool) => {
      const now = latest.current.typing
      if (now) finishTyping(now.object.text)
      setState((was) => pick(was, tool))
    },
    [finishTyping, setState]
  )

  /** Start typing in a text box that is already there. */
  const retype = useCallback(
    (page: number, object: TextObject) => {
      void ensureFont(fontKey(object)).then(
        () => setTyping({ page, object, fresh: false, was: object }),
        () => setProblem("The font could not be loaded. Check your connection.")
      )
    },
    [ensureFont, setTyping]
  )

  const pointerDown = useCallback(
    (page: number, moment: Moment) => {
      const { state: now, styles: look, typing: box } = latest.current
      // Pressing anywhere else ends the typing, and does nothing more.
      if (box) {
        finishTyping(box.object.text)
        return
      }
      if (now.tool === "text") {
        const here = view(page)
        const under = thingAt(here, moment.point, moment.reach)
        if (under?.kind === "text") {
          retype(page, under)
          return
        }
        const object = makeText(moment.point, look, newId(), here.size)
        void ensureFont(fontKey(object)).then(
          () => setTyping({ page, object, fresh: true }),
          () =>
            setProblem("The font could not be loaded. Check your connection.")
        )
        return
      }
      setState(press(now, view(page), moment))
    },
    [view, ensureFont, retype, finishTyping, setState, setTyping]
  )

  const pointerMove = useCallback(
    (page: number, moment: Moment) =>
      setState((was) => (was.gesture ? drag(was, view(page), moment) : was)),
    [view, setState]
  )

  const pointerUp = useCallback(
    (page: number, reach: number) => {
      const { state: now, styles: look } = latest.current
      const { gesture } = now
      if (!gesture) return
      if (gesture.kind === "make" && gesture.tool === "callout") {
        // A call-out is typed before it is anything: from what it points
        // at, the pointer went to where its words go.
        const object = makeCallout(
          gesture.from,
          gesture.to,
          look,
          newId(),
          sizes[page] as Size,
          reach
        )
        setState({ tool: "select", selection: null, gesture: null })
        void ensureFont(fontKey(object)).then(
          () => setTyping({ page, object, fresh: true }),
          () =>
            setProblem("The font could not be loaded. Check your connection.")
        )
        return
      }
      const outcome = release(now, view(page), look, reach, newId())
      setState(outcome.state)
      void apply(outcome.change)
    },
    [view, apply, setState, sizes, ensureFont, setTyping]
  )

  const pointerCancel = useCallback(
    () => setState((was) => ({ ...was, gesture: null })),
    [setState]
  )

  /** The page that keys and buttons act on: the one with the selection, or the one being read. */
  const pageInHand = useCallback(
    () => latest.current.state.selection?.page ?? reading.current,
    []
  )

  const selected = useMemo(
    () =>
      state.selection
        ? (objects[state.selection.page] ?? []).filter((object) =>
            state.selection!.ids.includes(object.id)
          )
        : [],
    [state.selection, objects]
  )

  const remove = useCallback(() => {
    const outcome = removeSelected(latest.current.state, view(pageInHand()))
    setState(outcome.state)
    void apply(outcome.change)
  }, [view, pageInHand, apply, setState])

  const copy = useCallback(() => {
    const { state: now, objects: all } = latest.current
    if (!now.selection) return false
    copied.current = (all[now.selection.page] ?? []).filter((object) =>
      now.selection!.ids.includes(object.id)
    )
    return copied.current.length > 0
  }, [])

  const pasteCopied = useCallback(
    (shift = 12) => {
      if (!copied.current.length) return
      const outcome = paste(
        latest.current.state,
        view(pageInHand()),
        copied.current,
        copied.current.map(newId),
        shift
      )
      setState(outcome.state)
      void apply(outcome.change)
    },
    [view, pageInHand, apply, setState]
  )

  const duplicate = useCallback(() => {
    if (copy()) pasteCopied()
  }, [copy, pasteCopied])

  const order = useCallback(
    (to: "front" | "back" | "forward" | "backward") =>
      void apply(reorder(latest.current.state, view(pageInHand()), to)),
    [view, pageInHand, apply]
  )

  /** Change one part of the look: of the selected things, or of what the tool in hand makes next. */
  const setLook = useCallback(
    (look: Look) => {
      const { state: now, typing: box } = latest.current
      setStyles((was) => stylesWith(was, now.tool, look))
      // A box being typed in takes the look itself, and goes to the file when typing ends.
      if (now.selection && !box)
        void apply(
          restyle(now, view(now.selection.page), (object) =>
            withLook(object, look)
          )
        )
      // A box being typed in takes the look at once.
      setTyping((was) => {
        if (!was) return was
        const next = withLook(was.object, look) as TextObject
        if (next !== was.object) void ensureFont(fontKey(next))
        return next === was.object ? was : { ...was, object: next }
      })
    },
    [view, apply, ensureFont, setStyles, setTyping]
  )

  /** The middle of the page being read, where things without a place of their own are put. */
  const middle = useCallback(() => {
    const page = reading.current
    const sheet = sizes[page] as Size
    // Of the part that can be seen: a page is often taller than its window.
    const shown = document.querySelector(
      `[data-testid=editor-layer][data-page="${page + 1}"]`
    )
    const view = shown?.closest("[data-testid=reader-pages]")
    return {
      page,
      at:
        shown && view
          ? seenMiddle(
              shown.getBoundingClientRect(),
              view.getBoundingClientRect(),
              sheet,
              PLACED_ROOM
            )
          : { x: sheet.width / 2, y: sheet.height / 2 },
    }
  }, [sizes])

  /** Place a picture in the middle of the page being read, no larger than most of it. */
  const addPicture = useCallback(
    async (picture: Blob, most?: { width: number; height: number }) => {
      const worker = client.current
      if (!worker) return
      const name = newId()
      setBusy((count) => count + 1)
      try {
        const size = await worker.editPicture(file, name, picture)
        if (!size) {
          setProblem(
            "This picture could not be read. PNG, JPEG, WebP and AVIF can be added."
          )
          return
        }
        onPicture?.(name, picture)
        const { page, at } = middle()
        const sheet = sizes[page]
        // A picture's own size, at 96 pixels to the inch, within 60% of the
        // page; a signature, within the size signatures are placed at.
        const fit = Math.min(
          1,
          (most?.width ?? sheet.width * 0.6) / (size.width * 0.75),
          (most?.height ?? sheet.height * 0.6) / (size.height * 0.75)
        )
        const width = size.width * 0.75 * fit
        const height = size.height * 0.75 * fit
        const id = newId()
        setState({
          tool: "select",
          gesture: null,
          selection: { page, ids: [id] },
        })
        await apply({
          label: "Add picture",
          ops: [
            {
              do: "add",
              page,
              object: {
                id,
                kind: "picture",
                picture: name,
                rotation: 0,
                opacity: 1,
                box: keepOnPage(
                  {
                    x: at.x - width / 2,
                    y: at.y - height / 2,
                    width,
                    height,
                  },
                  sheet,
                  Math.min(width, height)
                ),
              },
            },
          ],
        })
      } finally {
        setBusy((count) => count - 1)
      }
    },
    [client, file, sizes, apply, setState, middle, onPicture]
  )

  /** Put a thing on the page being read, selected, to be dragged into place. */
  const place = useCallback(
    (page: number, object: EditorObject, label: string) => {
      setState({
        tool: "select",
        gesture: null,
        selection: { page, ids: [object.id] },
      })
      return apply({ label, ops: [{ do: "add", page, object }] })
    },
    [apply, setState]
  )

  /**
   * Place a signature in the middle of the page being read: what was drawn
   * as a drawing, what was typed as text in its font, a picture as a picture.
   */
  const addSignature = useCallback(
    async (signature: Signature, slot: SignatureSlot, colour: Colour) => {
      const { page, at } = middle()
      const label = slot === "initials" ? "Add initials" : "Add signature"
      if (signature.kind === "draw")
        return place(
          page,
          drawnSignature(signature.strokes, slot, at, colour, newId()),
          label
        )
      if (signature.kind === "type") {
        try {
          await ensureFont(signature.font)
        } catch {
          setProblem("The font could not be loaded. Check your connection.")
          return
        }
        const width = measureWith(
          signature.font,
          SIGNATURE_TEXT[slot]
        )(signature.text.trim())
        return place(
          page,
          typedSignature(
            signature.text,
            signature.font,
            slot,
            at,
            colour,
            newId(),
            width
          ),
          label
        )
      }
      const picture = await (await fetch(signature.data)).blob()
      return addPicture(picture, SIGNATURE_SIZE[slot])
    },
    [middle, place, ensureFont, addPicture]
  )

  /** Place today's date as a line of text in the middle of the page being read. */
  const addDate = useCallback(
    async (words: string) => {
      const { page, at: centre } = middle()
      // A little under the middle, where a signature that was just placed is not.
      const at = { x: centre.x, y: centre.y + 56 }
      const look = latest.current.styles
      const object = makeText(at, look, newId(), sizes[page] as Size)
      try {
        await ensureFont(fontKey(object))
      } catch {
        setProblem("The font could not be loaded. Check your connection.")
        return
      }
      const width = measureWith(fontKey(object), object.size)(words)
      return place(
        page,
        {
          ...object,
          text: words,
          lines: [words],
          box: { ...object.box, x: at.x - width / 2, width: width + 2 },
        },
        "Add date"
      )
    },
    [middle, place, ensureFont, sizes]
  )

  /**
   * A key was pressed in the editor and not in a field.
   * @returns True when the editor used it.
   */
  const key = useCallback(
    (event: {
      key: string
      shiftKey: boolean
      ctrlKey: boolean
      metaKey: boolean
      altKey: boolean
    }): boolean => {
      const { state: now } = latest.current
      const command = event.ctrlKey || event.metaKey
      const letter = event.key.toLowerCase()
      if (command) {
        if (letter === "z")
          return (void (event.shiftKey ? redo() : undo()), true)
        if (letter === "y") return (void redo(), true)
        if (letter === "c") return copy()
        if (letter === "x") {
          if (!copy()) return false
          remove()
          return true
        }
        if (letter === "v")
          return (void pasteCopied(), copied.current.length > 0)
        if (letter === "d") return (void duplicate(), true)
        if (letter === "a")
          return (void setState(selectAll(now, view(pageInHand()))), true)
        return false
      }
      if (event.altKey) return false
      const page = pageInHand()
      if (event.key === "Escape") {
        if (now.gesture || now.tool !== "select")
          return (void setTool("select"), true)
        if (now.selection)
          return (void setState({ ...now, selection: null }), true)
        return false
      }
      if (now.selection) {
        const step = event.shiftKey ? 10 : 1
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }
        const move = moves[event.key]
        if (move) return (void nudgeBy(...move), true)
        if (event.key === "Delete" || event.key === "Backspace")
          return (void remove(), true)
        if (event.key === "]") return (void order("forward"), true)
        if (event.key === "[") return (void order("backward"), true)
        if (event.key === "Enter") {
          const [only] = (latest.current.objects[page] ?? []).filter((object) =>
            now.selection!.ids.includes(object.id)
          )
          if (only?.kind === "text" && now.selection.ids.length === 1)
            return (void retype(page, only), true)
        }
      }
      if (event.key === "Tab") {
        const next = nextThing(now, view(page), event.shiftKey ? -1 : 1)
        if (!next) return false
        setState({ tool: "select", gesture: null, selection: next })
        return true
      }
      const tools: Record<string, Tool> = {
        v: "select",
        t: "text",
        b: "box",
        o: "ellipse",
        l: "line",
        a: "arrow",
        d: "ink",
        c: "cover",
        x: "check",
        k: "stamp",
        r: "measure",
        q: "callout",
      }
      if (tools[letter] && !event.shiftKey)
        return (void setTool(tools[letter]), true)
      return false
    },
    [
      undo,
      redo,
      copy,
      remove,
      pasteCopied,
      duplicate,
      view,
      pageInHand,
      setTool,
      nudgeBy,
      order,
      retype,
      setState,
    ]
  )

  const select = useCallback(
    (page: number, id: string) =>
      setState({
        tool: "select",
        gesture: null,
        selection: { page, ids: [id] },
      }),
    [setState]
  )
  /** Whether a press is under way that a move of the pointer belongs to. */
  const dragging = useCallback(() => latest.current.state.gesture !== null, [])
  /** Let go of what is selected. */
  const deselect = useCallback(
    () =>
      setState((was) => (was.selection ? { ...was, selection: null } : was)),
    [setState]
  )
  /** The file was written out as it stands. */
  const saved = useCallback(() => setHistory(markSaved), [])
  /** How many changes are in force, as the file last said: ahead of what the screen has drawn. */
  const changesNow = useCallback(() => position.current, [])
  /** Resolves once every change asked for so far has been made. */
  const settled = useCallback(() => {
    flush()
    return queue.current
  }, [flush])
  /** Told which page is being read. */
  const onPage = useCallback((page: number) => {
    reading.current = page
  }, [])

  return {
    sizes,
    bookmarks,
    layout,
    described,
    changeDocument,
    waiting,
    redactMarks,
    changeRedact,
    findToRedact,
    makeFields,
    formNames,
    newId,
    changePages,
    insertPdf,
    repeat,
    handPicture,
    objects,
    comments,
    fields,
    form: opened.form,
    fillField,
    comment,
    letters,
    lines,
    retext,
    reflow,
    find,
    replace,
    pageLinks,
    changeLink,
    middle,
    pagePictures,
    changePicture,
    replacePicture,
    versions,
    history,
    state,
    styles,
    typing,
    setTyping,
    finishTyping,
    retype,
    problem,
    notice,
    busy: busy > 0,
    selected,
    look: lookOf(typing ? [typing.object] : selected, state.tool, styles),
    parts: typing
      ? partsFor([typing.object], state.tool)
      : partsFor(selected, state.tool),
    setTool,
    setLook,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    undo,
    redo,
    remove,
    duplicate,
    order,
    addPicture,
    addSignature,
    addDate,
    loadFont: ensureFont,
    ownFonts,
    addOwnFont,
    key,
    select,
    deselect,
    dragging,
    onPage,
    saved,
    settled,
    onFlush,
    changesNow,
  }
}

export type Editor = ReturnType<typeof useEditor>

/** Where in a page's own points a pointer is, from where it is on the screen. */
export function pagePoint(
  element: Element,
  size: Size,
  client: { clientX: number; clientY: number }
): Point {
  const rect = element.getBoundingClientRect()
  return {
    x: ((client.clientX - rect.left) / rect.width) * size.width,
    y: ((client.clientY - rect.top) / rect.height) * size.height,
  }
}
