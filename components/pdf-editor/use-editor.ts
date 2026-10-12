"use client"

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
import type { Point } from "@/lib/pdf-editor/geometry"
import { emptyHistory, markSaved, type History } from "@/lib/pdf-editor/history"
import {
  fontKey,
  retyped,
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
import { breakLines } from "@/lib/pdf-editor/text-layout"
import {
  applied,
  defaultStyles,
  drag,
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
    lines: breakLines(
      text,
      object.box.width,
      measureWith(fontKey(object), object.size)
    ),
  })

let made = 0
const newId = () => `k${Date.now().toString(36)}${(made++).toString(36)}`

/**
 * Everything the editor's screen needs for one open file: what is on its
 * pages, the tool in hand, and the ways to change the file. Every change
 * goes to the worker, which makes it in the real document and says what the
 * pages hold afterwards.
 */
export function useEditor(
  client: RefObject<PdfClient | null>,
  file: string,
  opened: EditState
) {
  const [objects, setObjects] = useState<EditorObject[][]>(opened.objects)
  /** The comments on each page, as the file has them. */
  const [comments, setComments] = useState<Comment[][]>(opened.comments)
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
  const fonts = useRef(new Map<string, Promise<void>>())
  const lettersRead = useRef(new Map<string, Promise<LetterLine[]>>())
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
  const sizes = opened.sizes

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
      const next = [...truth.current]
      for (const { page, objects: now } of news.pages) next[page] = now
      truth.current = next
      show()
      setComments((was) => {
        const now = [...was]
        for (const { page, comments: here } of news.pages) now[page] = here
        return now
      })
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
    [show]
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
          if (
            (op.do === "add" || op.do === "change") &&
            op.object.kind === "text"
          ) {
            await ensureFont(fontKey(op.object))
            ops.push({ ...op, object: laidOut(op.object) })
          } else ops.push(op)
        }
        return worker.editApply(file, { label: change.label, ops })
      }, change),
    [enqueue, ensureFont, file]
  )

  /** Moves by the arrow keys that are being gathered go to the file, as one change. */
  const flush = useCallback(() => {
    const waiting = held.current
    if (!waiting) return
    clearTimeout(waiting.timer)
    held.current = null
    void send(waiting.change)
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
      if (!now.gesture) return
      const outcome = release(now, view(page), look, reach, newId())
      setState(outcome.state)
      void apply(outcome.change)
    },
    [view, apply, setState]
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

  /** Place a picture in the middle of the page being read, no larger than most of it. */
  const addPicture = useCallback(
    async (picture: File) => {
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
        const page = reading.current
        const sheet = sizes[page]
        // A picture's own size, at 96 pixels to the inch, within 60% of the page.
        const fit = Math.min(
          1,
          (sheet.width * 0.6) / (size.width * 0.75),
          (sheet.height * 0.6) / (size.height * 0.75)
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
                box: {
                  x: (sheet.width - width) / 2,
                  y: (sheet.height - height) / 2,
                  width,
                  height,
                },
              },
            },
          ],
        })
      } finally {
        setBusy((count) => count - 1)
      }
    },
    [client, file, sizes, apply, setState]
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
    objects,
    comments,
    comment,
    letters,
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
    key,
    select,
    deselect,
    dragging,
    onPage,
    saved,
    settled,
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
