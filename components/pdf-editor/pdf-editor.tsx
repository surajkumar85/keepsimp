"use client"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import {
  IconAlertCircle,
  IconBook2,
  IconCircleCheck,
  IconDownload,
  IconEdit,
  IconFileTypePdf,
  IconLock,
  IconPlayerStop,
  IconShieldCheck,
  IconTypography,
  IconX,
} from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import { DropZone } from "@/components/image-compressor/drop-zone"
import { LockFields } from "@/components/pdf/lock-fields"
import { PasswordRow } from "@/components/pdf/password-row"
import { useDeviceLimits } from "@/components/pdf/use-device-limits"
import { usePdfReader } from "@/components/pdf/use-pdf-reader"
import {
  PdfReader,
  type ReaderExtras,
  type Reading,
} from "@/components/pdf-reader/pdf-reader"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { sizeLabel } from "@/lib/image-compressor/formats"
import {
  defaultExtras,
  extrasProblem,
  lockOf,
  type Extras,
} from "@/lib/pdf-compressor/options"
import { countComments, type CommentTool } from "@/lib/pdf-editor/comments"
import { changeCount, unsaved } from "@/lib/pdf-editor/history"
import type { ExportReport } from "@/lib/pdf-editor/mupdf-edit"
import { checkLines, editedName } from "@/lib/pdf-editor/report"
import { PdfClient, type EditState } from "@/lib/pdf-merger/client"
import type { FileFacts } from "@/lib/pdf-merger/files"
import { looksLikePdf, megabytes } from "@/lib/pdf-merger/settings"
import { cn } from "cn"
import { CommentsPanel } from "./comments-panel"
import { PageLayer } from "./page-layer"
import { EditorToolbar } from "./toolbar"
import { useComments } from "./use-comments"
import { useEditor } from "./use-editor"

const INPUT_ID = "editor-file"
const ACCEPT = "application/pdf,.pdf"
const SAMPLE = "keepsimp-handbook.pdf"

/** The file that is open, and how far opening it has come. */
interface OpenFile {
  id: string
  file: File
  status: "reading" | "locked" | "ready" | "failed"
  /** A password was tried and did not open it. */
  wrong: boolean
  /** The password that opened it, which its result keeps unless a new one is set. */
  password?: string
  message: string
  facts: FileFacts | null
  opened: EditState | null
}

interface Result {
  url: string
  name: string
  blob: Blob
  report: ExportReport
  /** What it was made from; anything else makes it out of date. */
  key: string
  password?: string
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

/** What the tool is opened for: every kind of change, or marking up and commenting first. */
export type EditorMode = "edit" | "annotate"

/** The keys that take a comment tool in hand. */
const COMMENT_KEYS: Record<string, CommentTool> = {
  h: "highlight",
  u: "underline",
  s: "strike",
  w: "squiggle",
  p: "pen",
  n: "note",
}

/** What becomes of comments in the download, and what each choice means. */
const COMMENT_CHOICES = [
  {
    value: "keep",
    label: "Keep as comments",
    hint: "Other programs show them as comments too, and they can be answered and removed later.",
  },
  {
    value: "flatten",
    label: "Part of the page",
    hint: "Marks are drawn into the page and can no longer be removed. A note keeps its icon; its words are not shown.",
  },
  {
    value: "remove",
    label: "Leave out",
    hint: "The download has no comments at all, also none of those the file came with.",
  },
] as const

const ANNOTATE_ABILITIES = [
  {
    icon: IconTypography,
    title: "Mark the words themselves",
    text: "Highlight, underline, strike out or squiggle by dragging across text. On a scan, a highlighter pen marks anything.",
  },
  {
    icon: IconEdit,
    title: "Notes and replies",
    text: "Place a note, type what you think, and answer the comments a file already has. Every comment is in one list, page by page.",
  },
  {
    icon: IconShieldCheck,
    title: "Real comments, or part of the page",
    text: "Download with comments that any PDF program shows as comments, with the marks drawn into the page, or with every comment left out.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The file is opened and marked on your device. Its text, links, bookmarks and form fields stay as they were.",
  },
]

const ABILITIES = [
  {
    icon: IconTypography,
    title: "Add text, pictures and shapes",
    text: "Type anywhere on a page, place pictures, and draw boxes, ellipses, lines, arrows and freehand. Everything can be moved, resized, turned and undone.",
  },
  {
    icon: IconEdit,
    title: "What you see is the file",
    text: "Every change is made in the real document and the page is drawn again from it, so the screen shows what you will download.",
  },
  {
    icon: IconShieldCheck,
    title: "Checked before you download",
    text: "The text you added is read back from the result, and pages you did not change are compared with the original.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The file is opened and changed on your device. Links, bookmarks, form fields and tags stay as they were.",
  },
]

/**
 * The editor for one open file: its window, where the file is changed, and
 * the cards behind it, where the result is made and checked.
 */
function Workspace({
  client,
  doc,
  opened,
  reader,
  onClose,
  mode,
}: {
  client: RefObject<PdfClient | null>
  doc: OpenFile
  opened: EditState
  reader: ReturnType<typeof usePdfReader>
  onClose: () => void
  mode: EditorMode
}) {
  const ids = useId()
  const editor = useEditor(client, doc.id, opened)
  const comments = useComments(editor, mode === "annotate" ? "highlight" : null)
  /** The annotator shows the marking tools alone until the others are asked for. */
  const [allTools, setAllTools] = useState(false)
  const commentCount = countComments(editor.comments)
  const [commentsHow, setCommentsHow] =
    useState<(typeof COMMENT_CHOICES)[number]["value"]>("keep")
  const { history } = editor
  /** The page the window opens at; null while it is closed. */
  const [window_, setWindow] = useState<number | null>(0)
  const lastPage = useRef(0)
  /** The page shown on the card while the window is closed. */
  const [previewPage, setPreviewPage] = useState(0)
  const preview = useRef<HTMLCanvasElement>(null)
  const keepEditing = useRef<HTMLButtonElement>(null)
  const [keepEditable, setKeepEditable] = useState(false)
  const [extras, setExtras] = useState<Extras>(defaultExtras)
  const [making, setMaking] = useState(false)
  const [failure, setFailure] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [leaving, setLeaving] = useState(false)
  const cancel = useRef<(() => void) | null>(null)
  const url = useRef<string | null>(null)
  const { name } = doc.file
  const pages = opened.sizes.length

  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current)
    },
    []
  )

  const dirty = unsaved(history)
  // The browser asks before a page with unsaved changes is left.
  useEffect(() => {
    if (!dirty) return
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", ask)
    return () => window.removeEventListener("beforeunload", ask)
  }, [dirty])

  const { onPage: tellEditor, addPicture } = editor
  const onPage = useCallback(
    (page: number) => {
      lastPage.current = page
      tellEditor(page)
    },
    [tellEditor]
  )

  // A picture that is pasted goes onto the page being read.
  const open = window_ !== null
  useEffect(() => {
    if (!open) return
    function paste(event: ClipboardEvent) {
      const [picture] = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/")
      )
      if (!picture) return
      event.preventDefault()
      void addPicture(picture)
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [open, addPicture])

  const closeWindow = useCallback(() => {
    setPreviewPage(lastPage.current)
    setWindow(null)
  }, [])

  const { versions } = editor
  const previewVersion = versions[previewPage]
  // Behind the window, the card shows the page that was being read, as the file now has it.
  useEffect(() => {
    if (open) return
    let stale = false
    void editor
      .settled()
      .then(() => client.current?.thumbnail(doc.id, previewPage, 720))
      .then((bitmap) => {
        if (!bitmap) return
        const canvas = preview.current
        if (!stale && canvas) {
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
          canvas.dataset.drawn = String(previewVersion)
        }
        bitmap.close()
      })
    return () => {
      stale = true
    }
    // `editor.settled` is the same function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client, doc.id, previewPage, previewVersion])
  const reading = useMemo<Reading | null>(
    () =>
      window_ === null
        ? null
        : {
            state: "ready",
            title: name,
            start: window_,
            entries: opened.sizes.map((size, page) => ({
              kind: "page",
              key: `${doc.id}/${page}`,
              file: doc.id,
              page,
              rotation: 0,
              size,
              label: `${name}, page ${page + 1}`,
              version: versions[page],
            })),
            bookmarks: { file: doc.id, items: opened.bookmarks },
          },
    [window_, name, doc.id, opened, versions]
  )

  const problem = extrasProblem(extras)
  /** What a result is made from, at a number of changes; anything else makes it out of date. */
  const keyAt = (position: number) =>
    JSON.stringify([
      position,
      keepEditable,
      commentCount ? commentsHow : "keep",
      extras.protect
        ? [
            extras.password,
            extras.ownerPassword,
            extras.allowPrint,
            extras.allowCopy,
            extras.allowChanges,
          ]
        : null,
    ])
  const key = keyAt(history.position)
  const current = result?.key === key ? result : null

  async function download() {
    const worker = client.current
    if (!worker || making || problem) return
    closeWindow()
    setMaking(true)
    setFailure("")
    try {
      // What was typed or drawn last has to be in the file first.
      await editor.settled()
      const lock = lockOf(extras, () => crypto.randomUUID())
      const job = worker.editExport(doc.id, {
        keepEditable,
        comments: commentsHow,
        lock,
      })
      cancel.current = job.cancel
      const made = await job.promise
      if (!made) return
      if (url.current) URL.revokeObjectURL(url.current)
      const blob = new Blob([made.bytes], { type: "application/pdf" })
      url.current = URL.createObjectURL(blob)
      const next: Result = {
        url: url.current,
        name: editedName(name),
        blob,
        report: made.report,
        // What was typed last went into the file while this was waiting: the
        // result is of the file as it stands now, not as it was when asked for.
        key: keyAt(editor.changesNow()),
        password: lock ? lock.password : doc.password,
      }
      setResult(next)
      editor.saved()
      const link = document.createElement("a")
      link.href = next.url
      link.download = next.name
      link.click()
    } catch (error) {
      setFailure(
        (error as Error).message || "The file could not be written. Try again."
      )
    } finally {
      cancel.current = null
      setMaking(false)
    }
  }

  const onKey = (event: {
    target: EventTarget | null
    key: string
    shiftKey: boolean
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
    preventDefault(): void
  }) => {
    const target = event.target as HTMLElement
    // Fields, the strip of pages and the search keep their own keys.
    if (
      target.closest(
        "input, textarea, select, [contenteditable], aside, [role=search]"
      )
    )
      return false
    // Tab moves through the things on a page as it moves through any controls.
    if (event.key === "Tab") return false
    if (
      (event.key === "Enter" || event.key === " ") &&
      target.closest("button, a")
    )
      return false
    const plain =
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    const letter = event.key.toLowerCase()
    const used = () => {
      event.preventDefault()
      return true
    }
    // The comment tools have keys of their own, and Escape puts one down.
    if (plain && COMMENT_KEYS[letter]) {
      editor.setTool("select")
      editor.deselect()
      comments.setTool(COMMENT_KEYS[letter])
      return used()
    }
    if (event.key === "Escape" && comments.tool) {
      comments.setTool(null)
      return used()
    }
    if (comments.chosen && !editor.state.selection) {
      if (event.key === "Escape") {
        comments.unpick()
        return used()
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        void comments.remove(comments.chosen.page, comments.chosen.comment.id)
        return used()
      }
      if (event.key === "Enter") {
        comments.setTyping(comments.chosen.comment.id)
        comments.setListed(true)
        return used()
      }
    }
    // Any other tool's key puts a comment tool down.
    if (plain && comments.tool && "vtboladckrq".includes(letter))
      comments.setTool(null)
    if (!editor.key(event)) return false
    return used()
  }

  // The keyboard is not always inside the window: Safari does not give it to
  // a button that is pressed, and a thing that is deleted takes it along.
  // Keys pressed with the keyboard nowhere are the editor's all the same.
  const keys = useRef(onKey)
  useEffect(() => {
    keys.current = onKey
  })
  useEffect(() => {
    if (!open) return
    const nowhere = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || target.closest("[data-testid=reader]")) return
      if (target !== document.body && !target.matches("[role=dialog]")) return
      keys.current(event)
    }
    // Ahead of the window's own Escape, which would close it.
    document.addEventListener("keydown", nowhere, true)
    return () => document.removeEventListener("keydown", nowhere, true)
  }, [open])

  const readerExtras: ReaderExtras = {
    name: "editor",
    fixed: true,
    onPage,
    onKey,
    showPage: comments.showPage,
    panel: comments.listed ? (
      <CommentsPanel editor={editor} comments={comments} />
    ) : undefined,
    actions: (
      <>
        <Button
          aria-label="Download the PDF"
          title="Download the PDF"
          onClick={() => void download()}
          data-testid="editor-download"
        >
          <IconDownload aria-hidden="true" />
          <span className="max-lg:sr-only">Download</span>
        </Button>
      </>
    ),
    toolbar: (
      <>
        <EditorToolbar
          editor={editor}
          comments={comments}
          first={mode === "annotate" ? "comments" : "things"}
          focused={mode === "annotate" && !allTools}
          onAllTools={() => setAllTools(true)}
        />
        {editor.problem && (
          <p
            role="alert"
            className="flex items-start gap-2 border-b bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <IconAlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {editor.problem}
          </p>
        )}
        {editor.notice && (
          <p
            role="status"
            className="border-b px-3 py-2 text-sm text-muted-foreground"
          >
            {editor.notice}
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {changeCount(history)}
        </p>
      </>
    ),
    overlay: ({ entry, scale }) =>
      entry.kind === "page" ? (
        <PageLayer
          editor={editor}
          comments={comments}
          page={entry.page}
          size={entry.size}
          scale={scale}
        />
      ) : null,
  }

  const lines = current ? checkLines(current.report) : []
  const notes = [
    doc.facts?.repaired &&
      "This file was damaged and was repaired while it was opened.",
    doc.facts?.signed &&
      "This file carries a digital signature. A changed copy no longer counts as signed.",
    doc.facts?.restricted &&
      "The author of this file asked that it not be changed. The limits are lifted in your copy.",
  ].filter((note): note is string => Boolean(note))

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="pdf-editor"
      data-ready="true"
      data-changes={history.position}
      data-comments={commentCount}
      data-unsaved={dirty || undefined}
      data-busy={editor.busy || undefined}
    >
      <div className="min-w-0 space-y-4 lg:col-span-3">
        <section
          className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
          aria-labelledby={`${ids}-file`}
          data-testid="editor-file"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <IconFileTypePdf className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id={`${ids}-file`}
                className="font-heading text-base font-medium break-all"
              >
                {name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {plural(pages, "page")} · {sizeLabel(doc.file.size)} ·{" "}
                {commentCount > 0 && `${plural(commentCount, "comment")} · `}
                <span data-testid="editor-changes">
                  {changeCount(history)}
                  {dirty && history.saved !== null
                    ? " · changed since the last download"
                    : dirty
                      ? " · not yet downloaded"
                      : ""}
                </span>
              </p>
            </div>
          </div>
          {notes.map((note) => (
            <p
              key={note}
              className="text-sm text-muted-foreground"
              data-testid="editor-note"
            >
              {note}
            </p>
          ))}
          <button
            type="button"
            disabled={making}
            onClick={() => setWindow(previewPage)}
            aria-label={`Open the editor at page ${previewPage + 1}`}
            className="flex w-full justify-center rounded-lg border bg-muted p-3 outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5"
          >
            <canvas
              ref={preview}
              data-testid="editor-preview"
              className="h-auto max-h-96 w-auto max-w-full bg-white shadow-sm"
              style={{
                aspectRatio: `${opened.sizes[previewPage].width} / ${opened.sizes[previewPage].height}`,
              }}
            />
          </button>
          <p className="text-xs text-muted-foreground">
            Page {previewPage + 1} of {pages.toLocaleString("en")}, as the file
            now has it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={keepEditing}
              size="lg"
              disabled={making}
              onClick={() => setWindow(lastPage.current)}
            >
              <IconEdit aria-hidden="true" />
              {history.position ? "Keep editing" : "Open the editor"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={making}
              onClick={() => (dirty ? setLeaving(true) : onClose())}
            >
              <IconX aria-hidden="true" /> Close the file
            </Button>
          </div>
          {leaving && (
            <div
              role="alertdialog"
              aria-labelledby={`${ids}-leaving`}
              className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
            >
              <p id={`${ids}-leaving`} className="text-sm">
                Your changes have not been downloaded. Closing the file throws
                them away.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" onClick={onClose}>
                  Close without downloading
                </Button>
                <Button variant="outline" onClick={() => setLeaving(false)}>
                  Keep the file open
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-2">
        <section
          className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
          aria-labelledby={`${ids}-result`}
          data-testid="result"
        >
          <h2
            id={`${ids}-result`}
            className="font-heading text-base font-medium"
          >
            Download
          </h2>
          <ToggleRow
            label="Keep what you added editable"
            hint="Off, the things you added become part of the page. On, they stay separate, so this editor can move and change them again later; other apps show them as stamps."
            checked={keepEditable}
            onCheckedChange={setKeepEditable}
          />
          {commentCount > 0 && (
            <ChoiceChips
              label="Comments"
              value={commentsHow}
              onValueChange={setCommentsHow}
              options={COMMENT_CHOICES.map(({ value, label }) => ({
                value,
                label,
              }))}
              hint={
                COMMENT_CHOICES.find((choice) => choice.value === commentsHow)!
                  .hint
              }
            />
          )}
          <LockFields
            settings={extras}
            update={(change) =>
              setExtras((before) => ({ ...before, ...change }))
            }
            label="Lock the result with a password"
          />
          {problem && (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-destructive"
            >
              <IconAlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {problem}
            </p>
          )}
          {making ? (
            <div
              className="flex items-center justify-between gap-3"
              data-testid="editor-making"
            >
              <p role="status" className="text-sm text-muted-foreground">
                Writing and checking the file…
              </p>
              <Button variant="outline" onClick={() => cancel.current?.()}>
                <IconPlayerStop aria-hidden="true" /> Cancel
              </Button>
            </div>
          ) : current ? (
            <div className="space-y-3">
              <p className="text-sm" data-testid="result-facts">
                <span className="font-medium">
                  {plural(pages, "page")} · {sizeLabel(current.blob.size)}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · the original is {sizeLabel(doc.file.size)}
                </span>
              </p>
              <ul className="space-y-2 text-sm" data-testid="editor-check">
                {lines.map((line) => (
                  <li
                    key={line.text}
                    data-good={line.good}
                    className={cn(
                      "flex items-start gap-2",
                      !line.good && "text-destructive"
                    )}
                  >
                    {line.good ? (
                      <IconCircleCheck
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <IconAlertCircle
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    {line.text}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <a
                  href={current.url}
                  download={current.name}
                  className={buttonVariants({ size: "lg" })}
                >
                  <IconDownload aria-hidden="true" /> Download again
                </a>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={(event) =>
                    void reader.readResult(
                      current.blob,
                      {
                        title: current.name,
                        subtitle: `${plural(pages, "page")} · ${sizeLabel(current.blob.size)}`,
                        password: current.password,
                        label: (page) => `Page ${page} of ${current.name}`,
                        failure:
                          "The result could not be shown. You can still download it.",
                      },
                      event.currentTarget
                    )
                  }
                >
                  <IconBook2 aria-hidden="true" /> Read the result
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                size="lg"
                disabled={Boolean(problem)}
                onClick={() => void download()}
              >
                <IconDownload aria-hidden="true" /> Download PDF
              </Button>
              {result && (
                <p className="text-xs text-muted-foreground">
                  Something changed since the last download. Download again to
                  include it.
                </p>
              )}
            </div>
          )}
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            The file is changed on your device and is not uploaded.
          </p>
        </section>
      </div>

      <PdfReader
        reading={reading}
        source={reader.source}
        onClose={closeWindow}
        returnTo={keepEditing}
        extras={readerExtras}
      />
      <PdfReader
        reading={reader.reading}
        source={reader.source}
        onClose={reader.close}
        returnTo={reader.opener}
      />
    </div>
  )
}

export function PdfEditor({ mode = "edit" }: { mode?: EditorMode }) {
  const limits = useDeviceLimits()
  const client = useRef<PdfClient | null>(null)
  const counter = useRef(0)
  const reader = usePdfReader(client)
  const { claims, forget } = reader
  const [doc, setDoc] = useState<OpenFile | null>(null)
  const [notice, setNotice] = useState("")
  const live = useRef(doc)
  useEffect(() => {
    live.current = doc
  })

  useEffect(() => {
    const instance = new PdfClient((event) => {
      // A result opened only to be read is not the file being edited.
      if (claims(event)) return
      if (event.id !== live.current?.id) return
      if (event.type === "opened") {
        const { facts } = event
        void instance.editState(event.id).then((opened) =>
          setDoc((was) =>
            was?.id !== event.id
              ? was
              : opened
                ? { ...was, status: "ready", facts, opened }
                : {
                    ...was,
                    status: "failed",
                    message:
                      "This file could not be opened for editing. Try another file.",
                  }
          )
        )
      } else if (event.type === "locked")
        setDoc((was) =>
          was?.id === event.id
            ? { ...was, status: "locked", wrong: event.wrong }
            : was
        )
      else
        setDoc((was) =>
          was?.id === event.id
            ? { ...was, status: "failed", message: event.message }
            : was
        )
    })
    client.current = instance
    return () => {
      instance.dispose()
      client.current = null
    }
  }, [claims])

  const openFile = useCallback(
    async (files: File[]) => {
      // One file is edited at a time; the one that is open stays until it is closed.
      if (live.current) return
      const [file] = files
      if (!file) return
      const pdf = looksLikePdf(
        new Uint8Array(await file.slice(0, 2048).arrayBuffer())
      )
      if (!pdf) {
        setNotice(`${file.name} is not a PDF.`)
        return
      }
      if (file.size > limits.fileBytes) {
        setNotice(
          `${file.name} is larger than ${megabytes(limits.fileBytes)}, the most this device can edit.`
        )
        return
      }
      setNotice(
        files.length > 1
          ? `One file is edited at a time. ${file.name} was opened.`
          : ""
      )
      const id = `edit-${++counter.current}`
      const next: OpenFile = {
        id,
        file,
        status: "reading",
        wrong: false,
        message: "",
        facts: null,
        opened: null,
      }
      live.current = next
      setDoc(next)
      client.current?.open(id, file, { edit: true })
    },
    [limits.fileBytes]
  )

  const closeFile = useCallback(() => {
    const now = live.current
    if (!now) return
    client.current?.close(now.id)
    forget(now.id)
    live.current = null
    setDoc(null)
    setNotice("")
  }, [forget])

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (live.current) return
      const pasted = Array.from(event.clipboardData?.files ?? [])
      if (!pasted.length) return
      event.preventDefault()
      void openFile(pasted)
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [openFile])

  async function loadSample() {
    try {
      const response = await fetch(`/samples/${SAMPLE}`)
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      await openFile([new File([blob], SAMPLE, { type: "application/pdf" })])
    } catch {
      setNotice("The sample could not be loaded. Add a file of your own.")
    }
  }

  if (doc?.status === "ready" && doc.opened)
    return (
      <Workspace
        key={doc.id}
        client={client}
        doc={doc}
        opened={doc.opened}
        reader={reader}
        onClose={closeFile}
        mode={mode}
      />
    )

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="pdf-editor"
      data-state={doc?.status ?? "empty"}
    >
      <div className="space-y-3 lg:col-span-3">
        {doc ? (
          <section
            className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
            data-testid="editor-file"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <IconFileTypePdf className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-base font-medium break-all">
                  {doc.file.name}
                </h2>
                {doc.status === "reading" && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Opening {sizeLabel(doc.file.size)}…
                  </p>
                )}
                {doc.status === "failed" && (
                  <p role="alert" className="text-sm text-destructive">
                    {doc.message}
                  </p>
                )}
                {doc.status === "locked" && (
                  <PasswordRow
                    name={doc.file.name}
                    wrong={doc.wrong}
                    onUnlock={(password) => {
                      setDoc((was) =>
                        was ? { ...was, status: "reading", password } : was
                      )
                      client.current?.open(doc.id, doc.file, {
                        password,
                        edit: true,
                      })
                    }}
                  />
                )}
              </div>
            </div>
            {doc.status !== "reading" && (
              <Button variant="outline" onClick={closeFile}>
                <IconX aria-hidden="true" /> Choose another file
              </Button>
            )}
          </section>
        ) : (
          <DropZone
            onFiles={(files) => void openFile(files)}
            onSample={() => void loadSample()}
            busy={false}
            inputId={INPUT_ID}
            copy={{
              heading:
                mode === "annotate"
                  ? "Drop a PDF to annotate"
                  : "Drop a PDF to edit",
              dropping: "Drop to open this file",
              body:
                mode === "annotate"
                  ? "Highlight, underline and strike out words, place notes and answer comments, then download the result. You can also paste a file with ⌘V or Ctrl+V."
                  : "Add text, pictures, shapes and drawings to any page, mark words and place notes, then download the result. You can also paste a file with ⌘V or Ctrl+V.",
              inputLabel: "Choose a PDF file",
              action: "Choose a file",
              limits: `Stays on your device · up to ${megabytes(limits.fileBytes)}`,
            }}
            formats={["PDF"]}
            accept={ACCEPT}
            icon={IconFileTypePdf}
          />
        )}
        {notice && (
          <p role="alert" className="text-sm text-destructive">
            {notice}
          </p>
        )}
      </div>
      <div className="lg:col-span-2">
        <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="section-title">What you can do</h2>
          <ul className="space-y-3 text-sm">
            {(mode === "annotate" ? ANNOTATE_ABILITIES : ABILITIES).map(
              (item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-medium">{item.title}</span>
                    <span className="text-muted-foreground">{item.text}</span>
                  </span>
                </li>
              )
            )}
          </ul>
          <p className="text-xs text-muted-foreground">
            {mode === "annotate" ? (
              <>
                This is the{" "}
                <Link
                  href="/dashboard/pdf-editor/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  PDF editor
                </Link>
                , opened for marking up. Its other tools (text, pictures,
                shapes, stamps) are behind “All tools”.
              </>
            ) : (
              <>
                Only here to highlight and comment? The{" "}
                <Link
                  href="/dashboard/pdf-annotator/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  PDF annotator
                </Link>{" "}
                opens this editor with just those tools. Changing the words that
                are already in a file, forms and signatures come in later
                versions.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
