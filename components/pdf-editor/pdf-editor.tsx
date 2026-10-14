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
  IconPencil,
  IconFileTypePdf,
  IconCrop,
  IconDroplet,
  IconEraser,
  IconEye,
  IconLock,
  IconNumber123,
  IconPlayerStop,
  IconShieldCheck,
  IconTextRecognition,
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
import { draftLine, fontsOf } from "@/lib/pdf-editor/draft"
import {
  clearDraft,
  draftsWanted,
  loadDraft,
  wantDrafts,
  type KeptDraft,
  type OwnFile,
} from "@/lib/pdf-editor/draft-store"
import { fontUrls } from "@/lib/pdf-editor/fonts"
import { changeCount, unsaved } from "@/lib/pdf-editor/history"
import type { ExportReport } from "@/lib/pdf-editor/mupdf-edit"
import { formLine, unfilled } from "@/lib/pdf-editor/forms"
import { isInsert } from "@/lib/pdf-editor/pages"
import { CLEAN_NOTHING, type Clean } from "@/lib/pdf-editor/redact"
import { checkLines, editedName, partName } from "@/lib/pdf-editor/report"
import { PdfClient, type EditState } from "@/lib/pdf-merger/client"
import type { FileFacts } from "@/lib/pdf-merger/files"
import { looksLikePdf, megabytes } from "@/lib/pdf-merger/settings"
import { cn } from "cn"
import { CommentsPanel } from "./comments-panel"
import { PagesPanel } from "./pages-panel"
import { DocumentPanel } from "./document-panel"
import { OcrPanel } from "./ocr-panel"
import { RepeatPanel } from "./repeat-panel"
import { useCrop } from "./use-crop"
import { useDescribed } from "./use-described"
import { FormDesignPanel } from "./form-design-panel"
import { FORM_HINT, useMakeForm } from "./use-make-form"
import { REDACT_HINT, useRedact } from "./use-redact"
import { useOcr } from "./use-ocr"
import { useRepeat } from "./use-repeat"
import { usePages } from "./use-pages"
import { PageLayer } from "./page-layer"
import { SignatureDialog } from "./signature-dialog"
import { EditorToolbar } from "./toolbar"
import { useComments } from "./use-comments"
import { useDraft, type DraftStatus } from "./use-draft"
import { useEditor } from "./use-editor"
import { useFind } from "./use-find"
import { useInpage } from "./use-inpage"
import { useLinks } from "./use-links"
import { useRetext } from "./use-retext"

const INPUT_ID = "editor-file"
const ACCEPT = "application/pdf,.pdf"
const SAMPLE = "keepsimp-handbook.pdf"
/** A form with fields of every kind, for the page that fills forms in. */
const FORM_SAMPLE = "keepsimp-form.pdf"
/** A scan as it comes, with no words of its own, for the page that recognises them. */
const SCAN_SAMPLE = "keepsimp-scanned-letter.pdf"

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
  /** The draft the file is opened from, to be taken up once it is open. */
  draft?: KeptDraft
  /** There was a draft, and it could not be taken up: the file is as it came. */
  draftFailed?: boolean
}

/** What the switch that keeps drafts says, and what it says of the open file. */
const DRAFT_HINT =
  "Off, nothing is kept: closing the tab loses changes that were not downloaded. On, the file and your changes are kept in this browser until you close the file or throw the draft away. Nothing is sent anywhere."
const DRAFT_SAYS: Record<DraftStatus, string> = {
  none: "",
  keeping: "Keeping a draft…",
  kept: "A draft of this file is kept on this device.",
  large: "This file is over 50 MB, which is more than a draft is kept of.",
  failed:
    "The draft could not be kept: this browser has no room for it, or keeps nothing.",
}

/**
 * Hand a draft's fonts and pictures to the worker and take its steps up.
 * @returns Where the file then stands; null when the draft could not be taken up.
 */
async function takeUpDraft(client: PdfClient, id: string, kept: KeptDraft) {
  try {
    for (const key of fontsOf(kept.draft.steps)) {
      // A font of one's own came with the draft; the editor's are on the site.
      const own = kept.fonts.get(key)
      if (own) {
        client.editFont(id, key, await own.blob.arrayBuffer(), own.written)
        continue
      }
      const response = await fetch(fontUrls[key])
      if (!response.ok) return null
      client.editFont(id, key, await response.arrayBuffer())
    }
    for (const [name, picture] of kept.pictures) {
      // Another PDF whose pages were added is kept as it was made ready.
      if (isInsert(name)) {
        const taken = await client.editInsert(id, name, picture, {
          ready: true,
        })
        if (!("pages" in taken)) return null
      } else if (!(await client.editPicture(id, name, picture))) return null
    }
    return await client.editTakeUp(id, kept.draft.steps, kept.draft.position)
  } catch {
    return null
  }
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
export type EditorMode =
  | "edit"
  | "annotate"
  | "sign"
  | "fill"
  | "crop"
  | "numbers"
  | "watermark"
  | "redact"
  | "create-form"
  | "ocr"

/** The doors that open the editor for a job on the pages themselves. */
const PAGE_JOBS: readonly EditorMode[] = ["crop", "numbers", "watermark"]

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

/** What becomes of a form's fields in the download, and what each choice means. */
const FIELD_CHOICES = [
  {
    value: "keep",
    label: "Keep as fields",
    hint: "The form can be filled in again, here or in another program, and what you filled in can be changed.",
  },
  {
    value: "flatten",
    label: "Part of the page",
    hint: "What the fields hold is drawn into the page. Nothing can be filled in or changed afterwards.",
  },
] as const

/** What becomes of a signature the file carries, and what each choice means. */
const SIGNED_CHOICES = [
  {
    value: "keep",
    label: "Keep it valid",
    hint: "Your changes are written after the signed part, which stays as it is, so the signature still holds. Fields stay fields, comments stay comments, and other things you added stay stamps. A program that checks the signature will say that the file was added to after it was signed.",
  },
  {
    value: "anew",
    label: "Write the file anew",
    hint: "The file is written again from the start, with the choices below. The signature in it will no longer hold.",
  },
] as const

const FILL_ABILITIES = [
  {
    icon: IconEdit,
    title: "Fill in the form's own fields",
    text: "Type into text fields, tick boxes, choose from lists and pick dates. Tab goes from field to field, and fields that must be filled in are marked until they are.",
  },
  {
    icon: IconTypography,
    title: "Forms without fields too",
    text: "On a form that is only a picture of one, type anywhere, place ticks and crosses, add today's date and sign.",
  },
  {
    icon: IconShieldCheck,
    title: "Kept as a form, or made final",
    text: "Download the form with its fields, so it can be filled in again, or with everything drawn into the page so nothing can be changed.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The form is opened and filled in on your device. A form's scripts are never run, so check any totals it would work out.",
  },
]

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

const CROP_ABILITIES = [
  {
    icon: IconCrop,
    title: "Cut pages to a frame",
    text: "Drag the edges of a frame over the page, move them with the arrow keys, or type how many points to cut off each edge. One page, the pages you choose, or all of them.",
  },
  {
    icon: IconEdit,
    title: "Make pages one size",
    text: "A4 or Letter: what is on a page is made smaller or larger to fit and put in the middle, with its links and notes.",
  },
  {
    icon: IconShieldCheck,
    title: "It says what cropping is",
    text: "Cropping hides what is outside the frame and leaves it in the file, where it can be shown again. The page says so, and so does the download.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The file is opened and cropped on your device, with no account and no limit on pages.",
  },
]

const NUMBER_ABILITIES = [
  {
    icon: IconNumber123,
    title: "Number the pages",
    text: "1, Page 1, 1 of 12 or Page 1 of 12, at the top or the foot, left, middle or right, starting at any number, on all pages or on the ones you name.",
  },
  {
    icon: IconTypography,
    title: "Headers, footers and Bates numbers",
    text: "A line of your own with the date, the file's name or the page number in it, or a number that runs on from page to page with a fixed count of figures.",
  },
  {
    icon: IconEdit,
    title: "Each one can still be changed",
    text: "Every number is a piece of text on its page: select one to move it, restyle it or delete it. One undo takes them all away.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The file is opened and numbered on your device, with no account and no limit on pages.",
  },
]

const WATERMARK_ABILITIES = [
  {
    icon: IconDroplet,
    title: "Words or a picture",
    text: "DRAFT, Confidential, a name, or a logo of your own, laid over the middle of each page, from corner to corner or level.",
  },
  {
    icon: IconEdit,
    title: "As faint and as large as you like",
    text: "Set how solid it is and how much of the page it takes, in grey, red, blue or black, on all pages or on the ones you name.",
  },
  {
    icon: IconShieldCheck,
    title: "Honest about what it is",
    text: "A watermark is laid over the page; the page under it is not changed. On download it becomes part of the page, unless you keep it editable.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The file is opened and marked on your device, with no account and no limit on pages.",
  },
]

const REDACT_ABILITIES = [
  {
    icon: IconEraser,
    title: "Taken out, not covered",
    text: "What is under a mark leaves the file: the letters, the pixels of pictures and the drawings. A black box stands where it was, and nothing is under it to copy or to find.",
  },
  {
    icon: IconEdit,
    title: "Mark by hand or by search",
    text: "Drag over an area or over words, or mark every place a name is written, every e-mail address, phone number or card number, or a shape of your own such as ###-##-####.",
  },
  {
    icon: IconShieldCheck,
    title: "Looked at again afterwards",
    text: "After applying, each place is read back and looked at. A mark that is not applied yet takes nothing out, and the download says so before you send the file.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The file is opened and changed on your device. What you take out is never sent anywhere, and neither is the rest.",
  },
]

const OCR_ABILITIES = [
  {
    icon: IconTextRecognition,
    title: "Scans you can search",
    text: "The words of scanned pages are recognised and laid unseen over them, each where it is seen. Search, select and copy them, or find and redact names and numbers.",
  },
  {
    icon: IconEye,
    title: "The pages look the same",
    text: "Nothing is drawn: the picture of each page is left as it was. Pages that already have text are left alone unless you ask for them too.",
  },
  {
    icon: IconShieldCheck,
    title: "Read back before download",
    text: "How sure the reading was is said for every run, and the words laid are read back from the file before you download it. Undo takes them all away.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The words are read on your device. English is loaded from this site the first time (about 4 MB) and kept for working offline.",
  },
]

/** What a download can leave out besides: things that tell more than the pages do. */
const CLEAN_CHOICES: readonly {
  key: keyof Clean
  label: string
  hint: string
}[] = [
  {
    key: "details",
    label: "Title, author and other details",
    hint: "Also which app made the file, and when. They are not on any page, and anyone who has the file can read them.",
  },
  {
    key: "attachments",
    label: "Attached files",
    hint: "Files carried inside the PDF or pinned to a page.",
  },
  {
    key: "scripts",
    label: "Scripts",
    hint: "Code that runs when the file is opened or a field is used. A form that works out totals stops doing so.",
  },
]

const CREATE_FORM_ABILITIES = [
  {
    icon: IconEdit,
    title: "Make fields others can fill in",
    text: "Add text, multiline text, checkboxes, radio groups, dropdowns, lists, dates and empty signature places. Fields stay part of the PDF's own form.",
  },
  {
    icon: IconCrop,
    title: "Put each field where it belongs",
    text: "Drag a field, pull a handle to resize, or use the arrow keys. Field settings change its name, tooltip, requirement and text length limit.",
  },
  {
    icon: IconFileTypePdf,
    title: "Fill it in again",
    text: "Download with fields kept as fields, then open the result in Fill PDF form or another PDF reader. Dates use yyyy-mm-dd; a signature place proves nothing about who signed.",
  },
  {
    icon: IconLock,
    title: "Your file stays on your device",
    text: "Nothing is uploaded. Undo and redo work for every change; a draft is kept only when you ask.",
  },
]

const SIGN_ABILITIES = [
  {
    icon: IconEdit,
    title: "Draw, type or use a picture",
    text: "Sign with a mouse, a pen or a finger, type your name in a hand of your choice, or use a photo of your signature: the paper is taken out and only the ink is placed.",
  },
  {
    icon: IconTypography,
    title: "Fill in the rest",
    text: "Type into the blanks of a form, tick and cross its boxes, and add today's date with one press.",
  },
  {
    icon: IconShieldCheck,
    title: "Remembered only if you ask",
    text: "Your signature can be kept in this browser for the next time, and forgotten again. It is never sent anywhere.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "The file is opened and signed on your device. A signature made here is like ink on paper; it is not a certificate that proves who signed.",
  },
]

/** The words of the page before a file is opened, for each thing the editor is opened for. */
const DOORS: Record<EditorMode, { heading: string; body: string }> = {
  ocr: {
    heading: "Drop a scanned PDF to make it searchable",
    body: "Its words are recognised on your device and laid unseen over the pages, so you can search, select, copy and redact them. The pages look just as they did. You can also paste a file with ⌘V or Ctrl+V.",
  },
  "create-form": {
    heading: "Drop a PDF to make a fillable form",
    body: "Add text fields, checkboxes, radio groups, dropdowns, lists, dates and empty signature places. Move, resize and name them, then download a form others can fill in. Everything stays on your device.",
  },
  edit: {
    heading: "Drop a PDF to edit",
    body: "Change the words that are there, add text, pictures, shapes and drawings, mark words, place notes and sign, then download the result. You can also paste a file with ⌘V or Ctrl+V.",
  },
  annotate: {
    heading: "Drop a PDF to annotate",
    body: "Highlight, underline and strike out words, place notes and answer comments, then download the result. You can also paste a file with ⌘V or Ctrl+V.",
  },
  fill: {
    heading: "Drop a PDF form to fill in",
    body: "Type into its fields, tick its boxes, choose from its lists, sign it, and download the result. Forms without fields can be typed on too. You can also paste a file with ⌘V or Ctrl+V.",
  },
  sign: {
    heading: "Drop a PDF to sign",
    body: "Draw your signature, type it or use a picture of it, place it where it belongs, fill in what else the page asks for, and download the result. You can also paste a file with ⌘V or Ctrl+V.",
  },
  crop: {
    heading: "Drop a PDF to crop",
    body: "Cut its pages to a frame, one page or all of them, or make them A4 or Letter size, then download the result. You can also paste a file with ⌘V or Ctrl+V.",
  },
  numbers: {
    heading: "Drop a PDF to number its pages",
    body: "Add page numbers, a header or footer, or Bates numbers to all its pages or to some, then download the result. You can also paste a file with ⌘V or Ctrl+V.",
  },
  redact: {
    heading: "Drop a PDF to redact",
    body: "Mark names, numbers, pictures or whole areas, look the marks over, and apply them: what is under a mark is taken out of the file, not covered. Then download the result. You can also paste a file with ⌘V or Ctrl+V.",
  },
  watermark: {
    heading: "Drop a PDF to watermark",
    body: "Lay words or a picture over its pages, as faint and as large as you like, then download the result. You can also paste a file with ⌘V or Ctrl+V.",
  },
}

/** What a page opened for one job says it is, with a way to the whole editor. */
const FOCUSED: Partial<Record<EditorMode, string>> = {
  ocr: ", opened for recognising the words of scanned pages. Its other tools (text, pictures, shapes, highlights, redaction) are behind “All tools”.",
  "create-form":
    ", opened for making fillable form fields. The other tools are behind “All tools”.",
  annotate:
    ", opened for marking up. Its other tools (text, pictures, shapes, stamps, signing) are behind “All tools”.",
  fill: ", opened for filling in forms. Its other tools (pictures, shapes, stamps, highlights and notes) are behind “All tools”.",
  sign: ", opened for signing and filling in. Its other tools (pictures, shapes, stamps, highlights and notes) are behind “All tools”.",
  crop: ", opened for cropping. Its other tools (text, pictures, shapes, highlights, signing) are behind “All tools”.",
  numbers:
    ", opened for numbering pages. Its other tools (text, pictures, shapes, highlights, signing) are behind “All tools”.",
  watermark:
    ", opened for watermarks. Its other tools (text, pictures, shapes, highlights, signing) are behind “All tools”.",
  redact:
    ", opened for taking things out for good. Its other tools (text, pictures, shapes, highlights, signing) are behind “All tools”.",
}

const ABILITIES = [
  {
    icon: IconTypography,
    title: "Change the words that are there",
    text: "Click a paragraph or a line and type. The old words are taken out of the file and the new ones are written in their own font, size and colour; a paragraph flows again within its width.",
  },
  {
    icon: IconPencil,
    title: "Add text, pictures and shapes",
    text: "Type anywhere on a page, place pictures, and draw boxes, ellipses, lines, arrows and freehand. Everything can be moved, resized, turned and undone. The pictures a page already has can be moved, resized, cut to a part, exchanged and taken out.",
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
  drafts,
  onDrafts,
}: {
  client: RefObject<PdfClient | null>
  doc: OpenFile
  opened: EditState
  reader: ReturnType<typeof usePdfReader>
  onClose: () => void
  mode: EditorMode
  /** The switch that keeps drafts is on. */
  drafts: boolean
  onDrafts: (on: boolean) => void
}) {
  const ids = useId()
  /** Every picture that was placed, for a draft to keep; those of the draft the file was opened from to begin with. */
  const [pictures] = useState(() => new Map(doc.draft?.pictures))
  const onPicture = useCallback(
    (name: string, picture: Blob) => void pictures.set(name, picture),
    [pictures]
  )
  /** Every font of one's own that was added, likewise. */
  const [ownFiles] = useState(() => new Map(doc.draft?.fonts))
  const [own] = useState(() => ({
    fonts: doc.draft?.fonts,
    onFont: (key: string, font: OwnFile) => void ownFiles.set(key, font),
  }))
  const editor = useEditor(
    client,
    doc.id,
    opened,
    onPicture,
    own,
    doc.file.name
  )
  const comments = useComments(editor, mode === "annotate" ? "highlight" : null)
  const retext = useRetext(editor, comments)
  const inpage = useInpage(editor, comments, retext)
  const links = useLinks(editor, comments, retext, inpage)
  /** A page opened for one job shows the tools of that job alone until the others are asked for. */
  const [allTools, setAllTools] = useState(false)
  /** The window a signature is made in is open. A page opened for signing begins with it. */
  const [signing, setSigning] = useState(mode === "sign")
  const commentCount = countComments(editor.comments)
  const [commentsHow, setCommentsHow] =
    useState<(typeof COMMENT_CHOICES)[number]["value"]>("keep")
  const [fieldsHow, setFieldsHow] =
    useState<(typeof FIELD_CHOICES)[number]["value"]>("keep")
  const fieldCount = opened.form.fields
  /** The file is signed, and its changes can be written after it. */
  const signed = Boolean(doc.facts?.signed) && opened.after
  const [signedHow, setSignedHow] =
    useState<(typeof SIGNED_CHOICES)[number]["value"]>("keep")
  const after = signed && signedHow === "keep"
  const formSays = formLine(editor.fields)
  const [missing] = unfilled(editor.fields)
  // The reader is sent to a page by the list of comments and by the form's
  // line alike; whichever asked last is what it is told.
  const [jump, setJump] = useState(comments.showPage)
  const [listJump, setListJump] = useState(comments.showPage)
  if (comments.showPage !== listJump) {
    setListJump(comments.showPage)
    setJump(comments.showPage)
  }
  /** Show a page of the file: where words were found. */
  const goToPage = useCallback(
    (page: number) => setJump({ page, turn: -performance.now() }),
    []
  )
  const find = useFind(editor, comments, retext, inpage, links, goToPage)
  const pageList = usePages(editor, comments)
  // A page opened for numbers or for watermarks begins with their panel.
  const repeat = useRepeat(
    editor,
    comments,
    pageList,
    mode === "watermark" ? "mark" : "numbers",
    mode === "numbers" || mode === "watermark"
  )
  const described = useDescribed(comments, pageList, repeat)
  /** Go to a field and put the keyboard in it, once its page is on the screen. */
  const goToField = (page: number, id: string) => {
    setJump({ page, turn: -performance.now() })
    let tries = 0
    const look = () => {
      const control = document.querySelector<HTMLElement>(
        `[data-testid=editor-field][data-id="${CSS.escape(id)}"] :is(input, select, textarea)`
      )
      if (control) control.focus()
      else if (++tries < 40) setTimeout(look, 50)
    }
    look()
  }
  const { history } = editor
  /** The page the window opens at; null while it is closed. */
  const [window_, setWindow] = useState<number | null>(0)
  const lastPage = useRef(0)
  /** The page that is being read; the page the frame for cutting is laid on. */
  const readingNow = useCallback(() => lastPage.current, [])
  const crop = useCrop(
    editor,
    comments,
    retext,
    inpage,
    links,
    find,
    pageList,
    readingNow,
    // A page opened for cropping begins with the frame.
    mode === "crop"
  )
  const redact = useRedact(
    editor,
    comments,
    retext,
    inpage,
    links,
    find,
    crop,
    readingNow,
    // A page opened for taking things out begins with that tool.
    mode === "redact"
  )
  const makeForm = useMakeForm(
    editor,
    comments,
    retext,
    inpage,
    links,
    find,
    crop,
    redact,
    pageList,
    repeat,
    described,
    mode === "create-form"
  )
  const ocr = useOcr(
    editor,
    comments,
    pageList,
    repeat,
    described,
    makeForm,
    // A page opened for reading scans begins with its panel.
    mode === "ocr"
  )
  /** The page shown on the card while the window is closed. */
  const [previewAt, setPreviewPage] = useState(0)
  const preview = useRef<HTMLCanvasElement>(null)
  const keepEditing = useRef<HTMLButtonElement>(null)
  const [keepEditable, setKeepEditable] = useState(false)
  /** What the file carries besides its pages that the result is to be without. */
  const [clean, setClean] = useState<Clean>(CLEAN_NOTHING)
  const [extras, setExtras] = useState<Extras>(defaultExtras)
  const [making, setMaking] = useState(false)
  const [failure, setFailure] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [leaving, setLeaving] = useState(false)
  const cancel = useRef<(() => void) | null>(null)
  const url = useRef<string | null>(null)
  const { name } = doc.file
  const pages = editor.sizes.length
  // The page that was last read may have been taken out since.
  const previewPage = Math.min(previewAt, pages - 1)

  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current)
    },
    []
  )

  const dirty = unsaved(history)
  const draft = useDraft({
    client,
    id: doc.id,
    file: doc.file,
    history,
    wanted: drafts,
    begun: Boolean(doc.draft),
    pictures,
    fonts: ownFiles,
  })
  // The browser asks before a page with unsaved changes is left, unless a
  // draft holds them.
  const atRisk = dirty && !draft.current
  useEffect(() => {
    if (!atRisk) return
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", ask)
    return () => window.removeEventListener("beforeunload", ask)
  }, [atRisk])

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
            entries: editor.sizes.map((size, page) => ({
              kind: "page",
              key: `${doc.id}/${page}`,
              file: doc.id,
              page,
              rotation: 0,
              size,
              label: `${name}, page ${page + 1}`,
              version: versions[page],
            })),
            bookmarks: { file: doc.id, items: editor.bookmarks },
          },
    [window_, name, doc.id, editor.sizes, editor.bookmarks, versions]
  )

  // Written after a signed file, nothing else is chosen: no lock to be wrong about.
  const problem = after ? "" : extrasProblem(extras)
  /** What a result is made from, at a number of changes; anything else makes it out of date. */
  const keyAt = (position: number) =>
    JSON.stringify([
      position,
      keepEditable,
      commentCount ? commentsHow : "keep",
      fieldCount ? fieldsHow : "keep",
      after,
      after ? null : clean,
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
    // A field of a form that is still being typed in is left first, so that
    // what was typed goes into the file: the window closing would take the
    // field away without a word.
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      active.closest("[data-testid=editor-field]")
    )
      active.blur()
    closeWindow()
    setMaking(true)
    setFailure("")
    try {
      // What was typed or drawn last has to be in the file first.
      await editor.settled()
      const lock = after ? null : lockOf(extras, () => crypto.randomUUID())
      const job = worker.editExport(doc.id, {
        keepEditable,
        comments: commentsHow,
        fields: fieldsHow,
        after,
        lock,
        clean: after ? CLEAN_NOTHING : clean,
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

  /**
   * Save some pages of the file as it stands as a file of their own, with
   * what is chosen for a download. The file in the editor is as it was.
   * @returns What was saved, with what the check found amiss, if anything.
   * @throws With words for the list of pages when nothing could be written.
   */
  async function savePart(only: number[]) {
    const worker = client.current
    if (!worker) throw new Error("The file could not be written. Try again.")
    if (problem && !after) throw new Error(problem)
    await editor.settled()
    const job = worker.editExport(doc.id, {
      keepEditable,
      comments: commentsHow,
      fields: fieldsHow,
      after: false,
      lock: after ? null : lockOf(extras, () => crypto.randomUUID()),
      clean: after ? CLEAN_NOTHING : clean,
      only,
    })
    const made = await job.promise
    if (!made) return null
    const blob = new Blob([made.bytes], { type: "application/pdf" })
    const href = URL.createObjectURL(blob)
    const saved = partName(name, only)
    const link = document.createElement("a")
    link.href = href
    link.download = saved
    link.click()
    // The browser has the file by then; the address is let go of.
    setTimeout(() => URL.revokeObjectURL(href), 60_000)
    return {
      name: saved,
      size: blob.size,
      warning: checkLines(made.report).find((line) => !line.good)?.text ?? "",
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
    if (plain && letter === "g") {
      setSigning(true)
      return used()
    }
    // E changes the words that are there; Escape puts that down again.
    if (plain && letter === "e") {
      retext.setOn(!retext.on)
      return used()
    }
    if (event.key === "Escape" && retext.on) {
      retext.setOn(false)
      return used()
    }
    // I changes the pictures the page already has; Escape lets go of one, then of the tool.
    if (plain && letter === "i") {
      inpage.setOn(!inpage.on)
      return used()
    }
    if (event.key === "Escape" && inpage.on) {
      if (inpage.chosen?.cut) inpage.setCutting(false)
      else if (inpage.chosen) inpage.deselect()
      else inpage.setOn(false)
      return used()
    }
    if (event.key === "Enter" && inpage.chosen?.cut) {
      inpage.finishCut()
      return used()
    }
    // F finds and replaces words; Escape puts that down.
    if (plain && letter === "f") {
      find.setOn(!find.on)
      return used()
    }
    if (event.key === "Escape" && find.on) {
      find.setOn(false)
      return used()
    }
    // M shows the list of pages, where they are moved, turned, copied and taken out.
    if (plain && letter === "m") {
      pageList.setOn(!pageList.on)
      return used()
    }
    // Z opens what is put on many pages: numbers, headers and watermarks.
    if (plain && letter === "z") {
      repeat.setOn(!repeat.on)
      return used()
    }
    // Y cuts pages to a part and makes them another size; Escape puts that down.
    if (plain && letter === "y") {
      crop.setOn(!crop.on)
      return used()
    }
    if (event.key === "Escape" && crop.on) {
      crop.setOn(false)
      return used()
    }
    if (plain && letter === "v" && makeForm.on) {
      makeForm.setOn(false)
      editor.setTool("select")
      return used()
    }
    if (event.key === "Escape" && makeForm.on) {
      if (makeForm.chosen) makeForm.setChosen(null)
      else makeForm.setOn(false)
      return used()
    }
    if (event.key === "Escape" && redact.on) {
      redact.setOn(false)
      return used()
    }
    // J adds and changes links; Escape lets go of one, then of the tool.
    if (plain && letter === "j") {
      links.setOn(!links.on)
      return used()
    }
    if (event.key === "Escape" && links.on) {
      if (links.chosen) links.deselect()
      else links.setOn(false)
      return used()
    }
    // Any other tool's key puts a comment tool down.
    if (plain && comments.tool && "vtboladckrqx".includes(letter))
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
    showPage: jump,
    panel:
      makeForm.on && makeForm.panel ? (
        <FormDesignPanel makeForm={makeForm} editor={editor} />
      ) : comments.listed ? (
        <CommentsPanel editor={editor} comments={comments} />
      ) : pageList.on ? (
        <PagesPanel
          editor={editor}
          pages={pageList}
          source={reader.source}
          file={doc.id}
          name={name}
          onGo={goToPage}
          onSavePart={savePart}
        />
      ) : repeat.on ? (
        <RepeatPanel repeat={repeat} />
      ) : ocr.on ? (
        <OcrPanel ocr={ocr} />
      ) : described.on ? (
        <DocumentPanel
          editor={editor}
          described={described}
          reading={readingNow}
          onGo={goToPage}
        />
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
          retext={retext}
          inpage={inpage}
          links={links}
          find={find}
          pages={pageList}
          crop={crop}
          repeat={repeat}
          described={described}
          redact={redact}
          makeForm={makeForm}
          ocr={ocr}
          first={mode === "annotate" ? "comments" : "things"}
          focus={
            allTools
              ? null
              : mode === "annotate"
                ? "comments"
                : mode === "sign" || mode === "fill"
                  ? "signing"
                  : PAGE_JOBS.includes(mode)
                    ? "pages"
                    : mode === "create-form"
                      ? "forms"
                      : mode === "redact"
                        ? "redact"
                        : mode === "ocr"
                          ? "ocr"
                          : null
          }
          onAllTools={() => setAllTools(true)}
          onSign={() => setSigning(true)}
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
        {/* Always there while things are marked, so that the pages do not jump when it has something to say. */}
        {redact.on && (
          <p
            role="status"
            data-testid="editor-hint"
            className={cn(
              "border-b px-3 py-2 text-sm",
              redact.warned
                ? "bg-destructive/5 text-destructive"
                : "text-muted-foreground"
            )}
          >
            {redact.note || REDACT_HINT}
          </p>
        )}
        {makeForm.on && (
          <p
            role="status"
            data-testid="editor-hint"
            className="border-b px-3 py-2 text-sm text-muted-foreground"
          >
            {makeForm.note || FORM_HINT}
          </p>
        )}
        {formSays && !makeForm.on && (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-sm text-muted-foreground"
            data-testid="editor-form"
          >
            <p role="status">{formSays}</p>
            {missing && (
              <Button
                variant="outline"
                onClick={() => goToField(missing.page, missing.id)}
              >
                Go to the next one
              </Button>
            )}
          </div>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {changeCount(history)}
        </p>
        {/* Inside the editor's window, so that it is a window of that window: one beside it would be out of reach of a screen reader. */}
        <SignatureDialog
          open={signing && open}
          onClose={() => setSigning(false)}
          onUse={(signature, slot, colour) =>
            void editor.addSignature(signature, slot, colour)
          }
          loadFont={editor.loadFont}
        />
      </>
    ),
    overlay: ({ entry, scale }) =>
      entry.kind === "page" ? (
        <PageLayer
          editor={editor}
          comments={comments}
          retext={retext}
          inpage={inpage}
          links={links}
          find={find}
          crop={crop}
          redact={redact}
          makeForm={makeForm}
          page={entry.page}
          size={entry.size}
          scale={scale}
        />
      ) : null,
  }

  const lines = current ? checkLines(current.report) : []
  const notes = [
    doc.draft &&
      "This is the draft that was kept on this device, with your changes as you left them.",
    doc.draftFailed &&
      "The draft of this file could not be taken up. The file is open as it was before your changes.",
    doc.facts?.repaired &&
      "This file was damaged and was repaired while it was opened.",
    doc.facts?.signed &&
      (opened.after
        ? "This file carries a digital signature. It still holds after your changes if they are written after the signed part, which is what Download does unless you choose otherwise."
        : "This file carries a digital signature, and it cannot be added to as it is. A changed copy no longer counts as signed."),
    doc.facts?.restricted &&
      "The author of this file asked that it not be changed. The limits are lifted in your copy.",
    opened.form.xfa &&
      (fieldCount
        ? "This form also has a second form inside it, of a kind (XFA) that only some programs show. What you fill in here goes into the ordinary one."
        : "This form is of a kind (XFA) that only Adobe's programs can fill in. Its fields are not shown here, but its pages can be typed on."),
    opened.form.scripts &&
      "This form works some of its fields out with scripts. Scripts are never run here, so check totals and dates yourself.",
    mode === "fill" &&
      !fieldCount &&
      !opened.form.xfa &&
      "This file has no fields to fill in. Use Text, Tick or cross and Sign to fill it in like paper.",
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
                aspectRatio: `${editor.sizes[previewPage].width} / ${editor.sizes[previewPage].height}`,
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
          <ToggleRow
            label="Keep a draft on this device"
            hint={DRAFT_HINT}
            checked={drafts}
            onCheckedChange={onDrafts}
          />
          {DRAFT_SAYS[draft.status] && (
            <p
              role="status"
              className="text-sm text-muted-foreground"
              data-testid="draft-status"
              data-status={draft.status}
            >
              {DRAFT_SAYS[draft.status]}
            </p>
          )}
          {leaving && (
            <div
              role="alertdialog"
              aria-labelledby={`${ids}-leaving`}
              className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
            >
              <p id={`${ids}-leaving`} className="text-sm">
                Your changes have not been downloaded. Closing the file throws
                them away{drafts ? ", and the draft with them" : ""}.
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
          {signed && (
            <ChoiceChips
              label="The signature in this file"
              value={signedHow}
              onValueChange={setSignedHow}
              options={SIGNED_CHOICES.map(({ value, label }) => ({
                value,
                label,
              }))}
              hint={
                SIGNED_CHOICES.find((choice) => choice.value === signedHow)!
                  .hint
              }
            />
          )}
          {!after && (
            <ToggleRow
              label="Keep what you added editable"
              hint="Off, the things you added become part of the page. On, they stay separate, so this editor can move and change them again later; other apps show them as stamps."
              checked={keepEditable}
              onCheckedChange={setKeepEditable}
            />
          )}
          {!after && commentCount > 0 && (
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
          {!after && fieldCount > 0 && (
            <ChoiceChips
              label="Form fields"
              value={fieldsHow}
              onValueChange={setFieldsHow}
              options={FIELD_CHOICES.map(({ value, label }) => ({
                value,
                label,
              }))}
              hint={
                FIELD_CHOICES.find((choice) => choice.value === fieldsHow)!.hint
              }
            />
          )}
          {!after && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Leave out of the result
              </legend>
              {CLEAN_CHOICES.map(({ key, label, hint }) => (
                <ToggleRow
                  key={key}
                  label={label}
                  hint={hint}
                  checked={clean[key]}
                  onCheckedChange={(on) =>
                    setClean((was) => ({ ...was, [key]: on }))
                  }
                />
              ))}
            </fieldset>
          )}
          {!after && (
            <LockFields
              settings={extras}
              update={(change) =>
                setExtras((before) => ({ ...before, ...change }))
              }
              label="Lock the result with a password"
            />
          )}
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
  /** The switch that keeps drafts, and the draft that is kept, when there is one. */
  const [drafts, setDrafts] = useState(false)
  const [kept, setKept] = useState<KeptDraft | null>(null)
  const [now, setNow] = useState(0)
  // What this device keeps is asked for once the page is on the screen.
  useEffect(() => {
    let stale = false
    void (async () => {
      const on = draftsWanted()
      const found = on ? await loadDraft().catch(() => null) : null
      if (stale) return
      setDrafts(on)
      setKept(found)
      setNow(Date.now())
    })()
    return () => {
      stale = true
    }
  }, [])
  const switchDrafts = useCallback((on: boolean) => {
    setDrafts(on)
    if (!on) setKept(null)
    void wantDrafts(on).catch(() => {})
  }, [])
  const dropDraft = useCallback(() => {
    setKept(null)
    void clearDraft().catch(() => {})
  }, [])

  useEffect(() => {
    const instance = new PdfClient((event) => {
      // A result opened only to be read is not the file being edited.
      if (claims(event)) return
      if (event.id !== live.current?.id) return
      if (event.type === "opened") {
        const { facts } = event
        const draft = live.current.draft
        void (async () => {
          // A file opened from a draft has the draft's steps made again first.
          const taken = draft
            ? await takeUpDraft(instance, event.id, draft)
            : null
          const opened = taken ?? (await instance.editState(event.id))
          setDoc((was) =>
            was?.id !== event.id
              ? was
              : opened
                ? {
                    ...was,
                    status: "ready",
                    facts,
                    opened,
                    draft: taken ? draft : undefined,
                    draftFailed: Boolean(draft) && !taken,
                  }
                : {
                    ...was,
                    status: "failed",
                    message:
                      "This file could not be opened for editing. Try another file.",
                  }
          )
        })()
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
    async (files: File[], draft?: KeptDraft) => {
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
        draft,
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
      const sample =
        mode === "fill" ? FORM_SAMPLE : mode === "ocr" ? SCAN_SAMPLE : SAMPLE
      const response = await fetch(`/samples/${sample}`)
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      await openFile([new File([blob], sample, { type: "application/pdf" })])
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
        onClose={() => {
          closeFile()
          // The file is closed for good: its draft goes with it.
          if (drafts) dropDraft()
        }}
        mode={mode}
        drafts={drafts}
        onDrafts={switchDrafts}
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
              heading: DOORS[mode].heading,
              dropping: "Drop to open this file",
              body: DOORS[mode].body,
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
        {!doc && kept && (
          <section
            className="space-y-3 rounded-xl border bg-card p-4"
            aria-labelledby={`${INPUT_ID}-draft`}
            data-testid="draft-card"
          >
            <div>
              <h2
                id={`${INPUT_ID}-draft`}
                className="font-heading text-base font-medium"
              >
                Unfinished on this device
              </h2>
              <p className="text-sm break-all text-muted-foreground">
                {kept.draft.name} · {draftLine(kept.draft, now)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void openFile(
                    [
                      new File([kept.file], kept.draft.name, {
                        type: "application/pdf",
                      }),
                    ],
                    kept
                  )
                }
              >
                Take it up
              </Button>
              <Button variant="outline" onClick={dropDraft}>
                Throw it away
              </Button>
            </div>
          </section>
        )}
        {!doc && (
          <div className="rounded-xl border bg-card p-4">
            <ToggleRow
              label="Keep a draft on this device"
              hint={DRAFT_HINT}
              checked={drafts}
              onCheckedChange={switchDrafts}
            />
          </div>
        )}
      </div>
      <div className="lg:col-span-2">
        <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="section-title">What you can do</h2>
          <ul className="space-y-3 text-sm">
            {(mode === "ocr"
              ? OCR_ABILITIES
              : mode === "create-form"
                ? CREATE_FORM_ABILITIES
                : mode === "redact"
                  ? REDACT_ABILITIES
                  : mode === "crop"
                    ? CROP_ABILITIES
                    : mode === "numbers"
                      ? NUMBER_ABILITIES
                      : mode === "watermark"
                        ? WATERMARK_ABILITIES
                        : mode === "fill"
                          ? FILL_ABILITIES
                          : mode === "sign"
                            ? SIGN_ABILITIES
                            : mode === "annotate"
                              ? ANNOTATE_ABILITIES
                              : ABILITIES
            ).map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-medium">{item.title}</span>
                  <span className="text-muted-foreground">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {FOCUSED[mode] ? (
              <>
                This is the{" "}
                <Link
                  href="/dashboard/pdf-editor/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  PDF editor
                </Link>
                {FOCUSED[mode]}
              </>
            ) : (
              <>
                Here for one job? The same editor opens focused as the{" "}
                <Link
                  href="/dashboard/pdf-annotator/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  PDF annotator
                </Link>{" "}
                for highlights and comments, and as{" "}
                <Link
                  href="/dashboard/sign-pdf/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Sign PDF
                </Link>{" "}
                for signing, and as{" "}
                <Link
                  href="/dashboard/fill-pdf-form/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Fill PDF form
                </Link>{" "}
                for forms. For the pages themselves there are{" "}
                <Link
                  href="/dashboard/crop-pdf/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Crop PDF
                </Link>
                ,{" "}
                <Link
                  href="/dashboard/add-page-numbers/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Add page numbers
                </Link>
                ,{" "}
                <Link
                  href="/dashboard/watermark-pdf/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Watermark PDF
                </Link>{" "}
                and, for taking things out for good,{" "}
                <Link
                  href="/dashboard/redact-pdf/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Redact PDF
                </Link>
                . Scans are made searchable in{" "}
                <Link
                  href="/dashboard/ocr-pdf/"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  OCR PDF
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
