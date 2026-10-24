"use client"

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import {
  IconChecklist,
  IconChevronDown,
  IconCode,
  IconColumns2,
  IconCopy,
  IconDeviceFloppy,
  IconDots,
  IconEye,
  IconFileExport,
  IconFileImport,
  IconFilePlus,
  IconFileTypeDocx,
  IconFileZip,
  IconFolderOpen,
  IconHelp,
  IconHistory,
  IconListTree,
  IconMarkdown,
  IconPencil,
  IconPrinter,
  IconPresentation,
  IconSparkles,
  IconWand,
  IconWorld,
  IconX,
} from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"
import {
  insertCodeBlock,
  insertLink,
  insertRule,
  insertTable,
  toggleLines,
  toggleMark,
  toggleTask,
  type Edit,
} from "@/lib/markdown/edits"
import {
  baseName,
  fileName,
  isMarkdownFile,
  LARGEST_FILE,
  MARKDOWN_ACCEPT,
} from "@/lib/markdown/document"
import {
  LARGEST_PICTURE,
  pictureMarkdown,
  pictureName,
} from "@/lib/markdown/pictures"
import {
  defaultRenderOptions,
  renderMarkdown,
  type RenderOptions,
} from "@/lib/markdown/render"
import { SAMPLE, SAMPLE_NAME } from "@/lib/markdown/sample"
import { lineForTop, ordered, topForLine } from "@/lib/markdown/scroll"
import { statsOf, statsSaid } from "@/lib/markdown/stats"
import { changeTable, type TableChange } from "@/lib/markdown/tables"
import { templates } from "@/lib/markdown/templates"
import { insertToc } from "@/lib/markdown/toc"
import { CheckPanel } from "./check-panel"
import { CheatSheet, TableMaker, TidyDialog } from "./dialogs"
import { DoorBanner, type MarkdownMode } from "./doors"
import { clipboardHtml, folderZip, webPage, wordFile } from "./export"
import {
  canOpenFolders,
  canSaveInPlace,
  copyRich,
  copyText,
  download,
  filesOf,
  onLaunchFiles,
  pickFile,
  pickFolder,
  printPage,
  saveAs,
  writeTo,
  type FolderFile,
} from "./files"
import { FolderPanel } from "./folder-panel"
import {
  MarkdownSource,
  type Arrivals,
  type SourceHandle,
} from "./markdown-source"
import { OutlinePanel } from "./outline-panel"
import { MarkdownPreview, type PreviewHandle } from "./preview"
import { Presenter } from "./slides"
import { MarkdownToolbar, type ToolbarCommand } from "./toolbar"
import { useDocuments, type Doc } from "./use-documents"
import { VersionsPanel } from "./versions-panel"

type View = "write" | "split" | "preview"
type Panel = "outline" | "check" | "versions" | "folder"

const VIEWS: { value: View; label: string; icon: typeof IconPencil }[] = [
  { value: "write", label: "Write", icon: IconPencil },
  { value: "split", label: "Split", icon: IconColumns2 },
  { value: "preview", label: "Preview", icon: IconEye },
]

const TABLE_CHANGES: Partial<Record<ToolbarCommand, TableChange>> = {
  "table-tidy": "tidy",
  "table-row": "row-below",
  "table-column": "column-right",
  "table-delete-row": "delete-row",
  "table-delete-column": "delete-column",
}

const WIDE = "(min-width: 1024px)"
const IMPORT_ACCEPT =
  ".docx,.html,.htm,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html"

/** Whether the screen is wide enough for the source and preview side by side. */
function useWide() {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(WIDE)
      query.addEventListener("change", changed)
      return () => query.removeEventListener("change", changed)
    },
    () => window.matchMedia(WIDE).matches,
    () => true
  )
}

const isWord = (name: string) => /\.docx$/i.test(name)
const isHtml = (name: string, type = "") =>
  /\.html?$/i.test(name) || type === "text/html"

/**
 * The Markdown editor: the text beside what it makes, in tabs, with files
 * and folders opened and saved on the device, exports to a web page, PDF,
 * Word and ZIP, a document check, versions, slides and the doors that open
 * it for one job.
 */
export function MarkdownEditor({ mode = "editor" }: { mode?: MarkdownMode }) {
  const documents = useDocuments()
  const { active, docs } = documents
  const [chosenView, setView] = useState<View>("split")
  const [options, setOptions] = useState<RenderOptions>(defaultRenderOptions)
  const [richPaste, setRichPaste] = useState(true)
  const [typewriter, setTypewriter] = useState(false)
  const [quietMarks, setQuietMarks] = useState(false)
  const [focus, setFocus] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [cheat, setCheat] = useState(false)
  const [maker, setMaker] = useState(false)
  const [tidy, setTidy] = useState(false)
  const [slides, setSlides] = useState(false)
  const [folder, setFolder] = useState<{
    name: string
    handle: FileSystemDirectoryHandle
    files: FolderFile[]
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [topLine, setTopLine] = useState(0)
  const source = useRef<SourceHandle>(null)
  const preview = useRef<PreviewHandle>(null)
  const markdownInput = useId()
  const importInput = useId()
  const pictureInput = useId()
  const wide = useWide()
  // Split needs room; on a narrow screen, or in focus, the source and preview take turns.
  const view: View = focus
    ? "write"
    : chosenView === "split" && !wide
      ? "write"
      : chosenView

  const pictureUrls = useMemo(
    () =>
      new Map(Array.from(active.pictures, ([name, kept]) => [name, kept.url])),
    [active.pictures]
  )
  // The preview follows the text without holding up typing.
  const shown = useDeferredValue(active.text)
  const rendered = useMemo(
    () => renderMarkdown(shown, { ...options, pictures: pictureUrls }),
    [shown, options, pictureUrls]
  )
  const stats = useMemo(() => statsOf(rendered.plain), [rendered.plain])
  const unsaved = active.text !== active.saved
  const title = rendered.headings[0]?.text
  const docName = active.name ?? fileName(null, title, "md")
  const anyUnsaved = docs.some((doc) => doc.text !== doc.saved && doc.text)

  // Leaving with unsaved changes asks first, unless they are kept as a draft.
  useEffect(() => {
    if (!anyUnsaved || documents.keeping) return
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", ask)
    return () => window.removeEventListener("beforeunload", ask)
  }, [anyUnsaved, documents.keeping])

  useEffect(() => {
    if (documents.restored)
      toast.info("Your draft is back", {
        description: "It was kept on this device.",
      })
  }, [documents.restored])

  const say = (message: string) => {
    setProblem(message)
    toast.error(message)
  }

  /** A file opened in a tab: Markdown as it is, Word and HTML made into Markdown. */
  const openFile = useCallback(
    async (
      file: File,
      handle: FileSystemFileHandle | null = null,
      path?: string
    ) => {
      setProblem(null)
      if (file.size > LARGEST_FILE)
        return say(`${file.name} is larger than 20 MB, too large to edit here.`)
      try {
        if (isWord(file.name)) {
          setBusy("Reading the Word file…")
          const { wordToMarkdown } = await import("@/lib/markdown/from-word")
          const read = await wordToMarkdown(await file.arrayBuffer())
          documents.open(read.markdown, `${baseName(file.name)}.md`, {
            pictures: read.pictures,
            saved: false,
          })
          toast.success(`${file.name} is now Markdown`, {
            description: read.notes.length
              ? `${read.notes.length} ${read.notes.length === 1 ? "thing" : "things"} in it had no place in Markdown and were left out.`
              : `${read.pictures.length} ${read.pictures.length === 1 ? "picture" : "pictures"} kept with it.`,
          })
        } else if (isHtml(file.name, file.type)) {
          const { htmlToMarkdown } = await import("@/lib/markdown/from-html")
          documents.open(
            htmlToMarkdown(await file.text()),
            `${baseName(file.name)}.md`,
            { saved: false }
          )
          toast.success(`${file.name} is now Markdown`)
        } else if (isMarkdownFile(file)) {
          documents.open(await file.text(), path ?? file.name, { handle })
          toast.success(`Opened ${path ?? file.name}`)
        } else say(`${file.name} is not a Markdown, Word or HTML file.`)
      } catch (error) {
        say(`${file.name} could not be read: ${(error as Error).message}`)
      } finally {
        setBusy(null)
      }
    },
    [documents]
  )

  const open = useCallback(async () => {
    try {
      const picked = await pickFile()
      if (picked === "no-picker")
        document.getElementById(markdownInput)?.click()
      else if (picked) await openFile(picked.file, picked.handle)
    } catch (error) {
      say(`The file could not be opened: ${(error as Error).message}`)
    }
  }, [markdownInput, openFile])

  // Files the installed app was asked to open.
  useEffect(() => {
    onLaunchFiles((handles) => {
      for (const handle of handles)
        void handle.getFile().then((file) => openFile(file, handle))
    })
  }, [openFile])

  /** A folder's pictures that a document names, kept with it so the preview and exports have them. */
  const folderPictures = async (
    doc: Doc,
    files: FolderFile[],
    path: string
  ) => {
    const base = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/") + 1)
      : ""
    for (const match of doc.text.matchAll(
      /!\[[^\]]*\]\((?!https?:|data:)([^)\s]+)/g
    )) {
      const written = decodeURIComponent(match[1]).replace(/^\.\//, "")
      const file = files.find((one) => one.path === base + written)
      if (!file || doc.pictures.has(written)) continue
      const blob = await file.handle.getFile()
      if (blob.type.startsWith("image/") && blob.size <= LARGEST_PICTURE)
        documents.addPicture(
          written,
          blob.type,
          new Uint8Array(await blob.arrayBuffer())
        )
    }
  }

  const save = useCallback(
    async (askWhere = false) => {
      const content = source.current?.read().doc ?? active.text
      setBusy("Saving…")
      try {
        if (active.handle && !askWhere) {
          await writeTo(active.handle, content)
          documents.markSaved(active.id, content)
          toast.success(`Saved ${active.name ?? active.handle.name}`)
        } else if (canSaveInPlace()) {
          const chosen = await saveAs(docName, content)
          if (chosen) {
            documents.markSaved(active.id, content, chosen, chosen.name)
            toast.success(`Saved ${chosen.name}`)
          }
        } else {
          download(docName, content)
          documents.markSaved(active.id, content, null, docName)
          toast.success("Download started", { description: docName })
        }
        if (active.pictures.size && !folder)
          toast.info("Pictures are not inside a .md file", {
            description:
              "Export as Markdown and pictures (.zip) to keep them with it.",
          })
      } catch (error) {
        say(`The file could not be saved: ${(error as Error).message}`)
      } finally {
        setBusy(null)
      }
    },
    [active, docName, documents, folder]
  )

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label)
    setProblem(null)
    try {
      await work()
    } catch (error) {
      say(
        `${label.replace(/…$/, "")} did not work: ${(error as Error).message}`
      )
    } finally {
      setBusy(null)
    }
  }

  const exportHtml = () =>
    run("Making the web page…", async () => {
      const file = fileName(active.name, title, "html")
      download(
        file,
        new Blob(
          [
            await webPage(
              active.text,
              title ?? docName,
              options,
              active.pictures
            ),
          ],
          { type: "text/html" }
        )
      )
      toast.success("Download started", { description: file })
    })

  const exportWord = () =>
    run("Making the Word file…", async () => {
      const file = fileName(active.name, title, "docx")
      download(
        file,
        await wordFile(active.text, title ?? docName, active.pictures)
      )
      toast.success("Download started", {
        description: rendered.needs.math
          ? `${file}. Maths is kept as its TeX in Word.`
          : file,
      })
    })

  const exportZip = () =>
    run("Making the ZIP…", async () => {
      const file = fileName(active.name, title, "zip")
      download(
        file,
        await folderZip(docName.split("/").pop()!, active.text, active.pictures)
      )
      toast.success("Download started", { description: file })
    })

  const print = () =>
    run("Making the page to print…", async () => {
      printPage(
        await webPage(active.text, title ?? docName, options, active.pictures)
      )
      toast.info("Opening the print dialog", {
        description: "Choose “Save as PDF” there to make a PDF.",
      })
    })

  const copy = (asHtml: boolean) => {
    const made = clipboardHtml(active.text, options, active.pictures)
    ;(asHtml ? copyText(made) : copyRich(made, active.text)).then(
      () =>
        toast.success(asHtml ? "HTML copied" : "Copied as rich text", {
          description: asHtml
            ? undefined
            : "Paste it into an email or a document.",
        }),
      () => say("This browser would not let the page copy that.")
    )
  }

  const openFolder = async () => {
    try {
      const handle = await pickFolder()
      if (!handle) return
      setBusy("Reading the folder…")
      setFolder({ name: handle.name, handle, files: await filesOf(handle) })
      setPanel("folder")
    } catch (error) {
      say(`The folder could not be opened: ${(error as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const openFromFolder = async (file: FolderFile) => {
    const already = docs.find((doc) => doc.handle && doc.name === file.path)
    if (already) return documents.select(already.id)
    await openFile(await file.handle.getFile(), file.handle, file.path)
  }

  // Once a folder's document is open, the pictures it names are read from the folder.
  useEffect(() => {
    if (!folder || !active.handle || !active.name) return
    void folderPictures(active, folder.files, active.name)
    // Read once for each document opened from the folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id, folder])

  const arrivals = useMemo<Arrivals>(
    () => ({
      pictures: async (files) => {
        const written: string[] = []
        const taken = new Set(active.pictures.keys())
        for (const file of files) {
          if (file.size > LARGEST_PICTURE) {
            say(
              `${file.name} is larger than 20 MB, too large to keep with the document.`
            )
            continue
          }
          const name = pictureName(
            taken,
            file.type,
            file.name.startsWith("image.") ? undefined : file.name
          )
          taken.add(name)
          documents.addPicture(
            name,
            file.type,
            new Uint8Array(await file.arrayBuffer())
          )
          written.push(
            pictureMarkdown(
              name,
              file.name.startsWith("image.") ? undefined : file.name
            )
          )
        }
        if (written.length)
          toast.success(
            written.length === 1
              ? "Picture added"
              : `${written.length} pictures added`,
            {
              description: "Kept with the document, on this device.",
            }
          )
        return written.join("\n\n")
      },
      formatted: async (html) => {
        if (!richPaste) return null
        const { hasFormatting, htmlToMarkdown } =
          await import("@/lib/markdown/from-html")
        if (!hasFormatting(html)) return null
        return htmlToMarkdown(html)
      },
    }),
    // A new picture set or switch makes new handlers; the source reads the latest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active.pictures, richPaste, documents.addPicture]
  )

  const command = useCallback(
    (which: ToolbarCommand) => {
      if (which === "save") return void save()
      if (which === "open") return void open()
      if (which === "find") return source.current?.find()
      if (which === "picture")
        return document.getElementById(pictureInput)?.click()
      if (which === "table") return setMaker(true)
      const editor = source.current
      if (!editor) return
      const { doc, from, to } = editor.read()
      const range = { from, to }
      const tableChange = TABLE_CHANGES[which]
      let edit: Edit | null
      if (tableChange) {
        edit = changeTable(doc, from, tableChange)
        if (!edit) return void toast.info("Put the cursor in a table first")
      } else
        switch (which) {
          case "bold":
          case "italic":
          case "code":
          case "strike":
            edit = toggleMark(doc, range, which)
            break
          case "link":
            edit = insertLink(doc, range)
            break
          case "codeBlock":
            edit = insertCodeBlock(doc, range)
            break
          case "rule":
            edit = insertRule(doc, range)
            break
          default:
            edit = toggleLines(
              doc,
              range,
              which as Parameters<typeof toggleLines>[2]
            )
        }
      // A button pressed while only the preview shows brings the source back.
      if (view === "preview") setView("write")
      editor.apply(edit)
    },
    [open, save, view, pictureInput]
  )

  const replace = (text: string, said: string) => {
    source.current?.replace(text)
    toast.success(said)
  }

  // Scrolling one side moves the other to the same place; each ignores the scroll it was given.
  const quietUntil = useRef({ source: 0, preview: 0 })
  const endOf = () => ({
    line: source.current!.lines(),
    top: preview.current!.height(),
  })
  const onSourceScroll = () => {
    const now = performance.now()
    if (now < quietUntil.current.source || !source.current) return
    const line = source.current.topLine()
    if (panel === "outline") setTopLine(line)
    if (view !== "split" || !preview.current) return
    quietUntil.current.preview = now + 120
    preview.current.setScrollTop(
      topForLine(ordered(preview.current.anchors()), line, endOf())
    )
  }
  const onPreviewScroll = () => {
    const now = performance.now()
    if (
      now < quietUntil.current.preview ||
      view !== "split" ||
      !preview.current ||
      !source.current
    )
      return
    quietUntil.current.source = now + 120
    source.current.scrollToLine(
      lineForTop(
        ordered(preview.current.anchors()),
        preview.current.scrollTop(),
        endOf()
      )
    )
  }

  const goTo = (line: number) => {
    if (view === "preview") setView(wide ? "split" : "write")
    requestAnimationFrame(() => source.current?.goToLine(line))
  }

  const newDocument = (text = "", name: string | null = null) => {
    documents.open(text, name, { saved: false })
    requestAnimationFrame(() => source.current?.focus())
  }

  const closeDocument = (doc: Doc) => {
    if (
      doc.text !== doc.saved &&
      doc.text &&
      !window.confirm(
        `Close ${doc.name ?? "this document"}? Changes not saved will be lost.`
      )
    )
      return
    documents.close(doc.id)
  }

  const doorAction = () => {
    if (mode === "to-html") void exportHtml()
    else if (mode === "to-pdf") void print()
    else if (mode === "to-word") void exportWord()
    else if (mode === "from-html" || mode === "from-word")
      document.getElementById(importInput)?.click()
    else if (mode === "table") setMaker(true)
  }

  const togglePanel = (which: Panel) =>
    setPanel((current) => (current === which ? null : which))
  const openPaths = new Set(
    docs.filter((doc) => doc.handle && doc.name).map((doc) => doc.name!)
  )
  const folderPaths = useMemo(() => {
    if (!folder || !active.name) return null
    const base = active.name.includes("/")
      ? active.name.slice(0, active.name.lastIndexOf("/") + 1)
      : ""
    // Paths as a link from this document writes them.
    return new Set(
      folder.files
        .filter((file) => file.path.startsWith(base))
        .map((file) => file.path.slice(base.length))
    )
  }, [folder, active.name])

  const empty = (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <IconMarkdown
        className="size-10 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="max-w-xs text-sm text-muted-foreground">
        What you write appears here, as it will be read.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => void open()}>
          <IconFolderOpen aria-hidden="true" />
          Open a file
        </Button>
        <Button
          variant="outline"
          onClick={() => documents.open(SAMPLE, SAMPLE_NAME)}
        >
          <IconSparkles aria-hidden="true" />
          Try a sample
        </Button>
      </div>
    </div>
  )

  const fileInputs = (
    <>
      <input
        id={markdownInput}
        type="file"
        accept={MARKDOWN_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a Markdown file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void openFile(file)
          event.target.value = ""
        }}
      />
      <input
        id={importInput}
        type="file"
        accept={IMPORT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a Word or HTML file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void openFile(file)
          event.target.value = ""
        }}
      />
      <input
        id={pictureInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose pictures"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          if (files.length)
            void arrivals
              .pictures(files)
              .then((text) => source.current?.insert(text))
        }}
      />
    </>
  )

  return (
    <div
      className="space-y-3"
      data-testid="markdown-editor"
      data-busy={busy !== null || undefined}
      onKeyDown={(event) => {
        if (event.key === "F1") {
          event.preventDefault()
          setCheat(true)
        } else if (event.key === "Escape" && focus) setFocus(false)
      }}
    >
      {fileInputs}
      {mode !== "editor" && (
        <DoorBanner mode={mode} onAction={doorAction} busy={busy !== null} />
      )}
      <div
        className={cn(
          "flex min-h-[30rem] flex-col overflow-hidden rounded-xl border bg-card transition-colors duration-150 motion-reduce:transition-none",
          focus
            ? "fixed inset-0 z-40 h-dvh rounded-none border-0"
            : "h-[calc(100dvh-12rem)]",
          over && "border-primary bg-primary/5"
        )}
        data-testid="markdown-frame"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          setOver(false)
          const file = event.dataTransfer.files[0]
          // Pictures dropped on the text are the source's; files dropped anywhere else open.
          if (!file || file.type.startsWith("image/")) return
          event.preventDefault()
          void openFile(file)
        }}
      >
        {docs.length > 1 && !focus && (
          <div
            className="flex items-center gap-1 overflow-x-auto border-b px-2 pt-1.5"
            aria-label="Open documents"
            role="navigation"
          >
            {docs.map((doc) => {
              // A document not saved yet is named from its first heading, as the bar names it.
              const name =
                doc.name ??
                fileName(null, /^#{1,6}\s+(.+)$/m.exec(doc.text)?.[1], "md")
              const current = doc.id === active.id
              return (
                <div
                  key={doc.id}
                  className={cn(
                    "flex shrink-0 items-center rounded-t-md border border-b-0",
                    current
                      ? "bg-background"
                      : "border-transparent text-muted-foreground"
                  )}
                >
                  <button
                    type="button"
                    aria-current={current ? "page" : undefined}
                    onClick={() => documents.select(doc.id)}
                    className="flex h-11 max-w-48 items-center gap-1.5 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9"
                  >
                    <span className="truncate">{name.split("/").pop()}</span>
                    {doc.text !== doc.saved && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                        aria-label="changes not saved"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${name}`}
                    onClick={() => closeDocument(doc)}
                    className="mr-1 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:size-7 [&_svg]:size-3.5"
                  >
                    <IconX aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <IconMarkdown
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p
                className="truncate text-sm font-medium"
                data-testid="markdown-name"
              >
                {docName}
              </p>
              <p
                className="text-xs text-muted-foreground"
                aria-live="polite"
                data-testid="markdown-saved"
              >
                {busy ??
                  (unsaved
                    ? documents.keeping
                      ? "Changes kept as a draft, not saved"
                      : "Changes not saved"
                    : active.name
                      ? "Saved"
                      : "Nothing written yet")}
              </p>
            </div>
          </div>
          {!focus && (
            <RadioGroup
              aria-label="View"
              value={view}
              onValueChange={(value) => setView(value as View)}
              className="flex rounded-lg border p-0.5"
            >
              {VIEWS.filter((one) => one.value !== "split" || wide).map(
                ({ value, label, icon: Icon }) => (
                  <Radio.Root
                    key={value}
                    value={value}
                    className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 data-checked:bg-secondary data-checked:text-secondary-foreground [&_svg]:size-4"
                  >
                    <Icon aria-hidden="true" />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sr-only sm:hidden">{label}</span>
                  </Radio.Root>
                )
              )}
            </RadioGroup>
          )}
          <div className="flex w-full items-center gap-1 sm:w-auto">
            {focus ? (
              <Button variant="outline" onClick={() => setFocus(false)}>
                <IconX aria-hidden="true" />
                Leave focus
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void open()}>
                  <IconFolderOpen aria-hidden="true" />
                  Open
                </Button>
                <Button onClick={() => void save()} disabled={busy !== null}>
                  <IconDeviceFloppy aria-hidden="true" />
                  Save
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" aria-label="Export" />}
                  >
                    <IconFileExport aria-hidden="true" />
                    <span className="hidden sm:inline">Export</span>
                    <IconChevronDown className="size-3.5" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        download(docName.split("/").pop()!, active.text)
                        toast.success("Download started", {
                          description: docName,
                        })
                      }}
                    >
                      <IconMarkdown aria-hidden="true" />
                      Markdown file (.md)
                    </DropdownMenuItem>
                    {active.pictures.size > 0 && (
                      <DropdownMenuItem onClick={() => void exportZip()}>
                        <IconFileZip aria-hidden="true" />
                        Markdown and pictures (.zip)
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => void exportHtml()}>
                      <IconWorld aria-hidden="true" />
                      Web page (.html)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void exportWord()}>
                      <IconFileTypeDocx aria-hidden="true" />
                      Word (.docx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void print()}>
                      <IconPrinter aria-hidden="true" />
                      Print or save as PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => copy(false)}>
                      <IconCopy aria-hidden="true" />
                      Copy as rich text
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copy(true)}>
                      <IconCode aria-hidden="true" />
                      Copy HTML
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="More"
                        title="More"
                      />
                    }
                  >
                    <IconDots aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuItem onClick={() => newDocument()}>
                      <IconFilePlus aria-hidden="true" />
                      New document
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <IconSparkles aria-hidden="true" />
                        New from a template
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {templates().map((template) => (
                          <DropdownMenuItem
                            key={template.id}
                            onClick={() =>
                              newDocument(template.text, template.file)
                            }
                          >
                            <span className="flex flex-col">
                              <span>{template.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {template.description}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      onClick={() =>
                        document.getElementById(importInput)?.click()
                      }
                    >
                      <IconFileImport aria-hidden="true" />
                      Open a Word or HTML file…
                    </DropdownMenuItem>
                    {canOpenFolders() && (
                      <DropdownMenuItem onClick={() => void openFolder()}>
                        <IconFolderOpen aria-hidden="true" />
                        Open a folder…
                      </DropdownMenuItem>
                    )}
                    {canSaveInPlace() && (
                      <DropdownMenuItem onClick={() => void save(true)}>
                        <IconDeviceFloppy aria-hidden="true" />
                        Save as…
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => togglePanel("outline")}>
                      <IconListTree aria-hidden="true" />
                      Outline
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => togglePanel("check")}>
                      <IconChecklist aria-hidden="true" />
                      Check the document
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => togglePanel("versions")}>
                      <IconHistory aria-hidden="true" />
                      Versions
                    </DropdownMenuItem>
                    {folder && (
                      <DropdownMenuItem onClick={() => togglePanel("folder")}>
                        <IconFolderOpen aria-hidden="true" />
                        The open folder
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setTidy(true)}>
                      <IconWand aria-hidden="true" />
                      Tidy with Prettier…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSlides(true)}>
                      <IconPresentation aria-hidden="true" />
                      Present as slides
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFocus(true)}>
                      <IconPencil aria-hidden="true" />
                      Focus on writing
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Preview</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={options.typographer}
                        onCheckedChange={(typographer) =>
                          setOptions((current) => ({ ...current, typographer }))
                        }
                      >
                        Curly quotes and dashes
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={options.remoteImages}
                        onCheckedChange={(remoteImages) =>
                          setOptions((current) => ({
                            ...current,
                            remoteImages,
                          }))
                        }
                      >
                        Show pictures from other sites
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Writing</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={richPaste}
                        onCheckedChange={setRichPaste}
                      >
                        Paste formatted text as Markdown
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={typewriter}
                        onCheckedChange={setTypewriter}
                      >
                        Keep the line being written in the middle
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={quietMarks}
                        onCheckedChange={setQuietMarks}
                      >
                        Hide marks away from the cursor
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={documents.keeping}
                        onCheckedChange={(on) => {
                          documents.keep(on)
                          toast.info(
                            on
                              ? "A draft is kept on this device"
                              : "The draft is deleted from this device"
                          )
                        }}
                      >
                        Keep a draft on this device
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setCheat(true)}>
                      <IconHelp aria-hidden="true" />
                      Markdown at a glance (F1)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
        {view !== "preview" && !focus && (
          <MarkdownToolbar onCommand={command} />
        )}
        <div className="relative flex min-h-0 flex-1">
          <div
            className={cn(
              "grid min-h-0 flex-1",
              view === "split" && "grid-cols-2 divide-x"
            )}
          >
            <div
              className={cn(
                "min-h-0",
                view === "preview" && "hidden",
                focus && "mx-auto w-full max-w-3xl"
              )}
            >
              <MarkdownSource
                ref={source}
                docId={active.id}
                value={active.text}
                onChange={documents.setText}
                onCommand={command}
                onScroll={onSourceScroll}
                arrivals={arrivals}
                typewriter={typewriter}
                quietMarks={quietMarks}
                label="Markdown source"
              />
            </div>
            {view !== "write" && (
              <MarkdownPreview
                ref={preview}
                rendered={rendered}
                empty={empty}
                onScroll={onPreviewScroll}
                onLocate={goTo}
                onToggleTask={(line) => {
                  const editor = source.current
                  const edit = editor && toggleTask(editor.read().doc, line)
                  if (edit) editor.apply(edit, false)
                }}
              />
            )}
          </div>
          {panel === "outline" && !focus && (
            <OutlinePanel
              headings={rendered.headings}
              current={topLine}
              onGo={goTo}
              onInsertToc={() => {
                const editor = source.current
                if (!editor) return
                const { doc, from, to } = editor.read()
                editor.apply(insertToc(doc, { from, to }, rendered.headings))
                toast.success("Table of contents written")
              }}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "check" && !focus && (
            <CheckPanel
              text={active.text}
              plain={rendered.plain}
              folder={folderPaths}
              onGo={goTo}
              onReplace={replace}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "versions" && !focus && (
            <VersionsPanel
              versions={active.versions}
              text={active.text}
              keeping={documents.keeping}
              onKeep={() => {
                documents.keepVersion("Kept by hand")
                toast.success("Version kept")
              }}
              onRestore={(version) => {
                documents.keepVersion("Before a version was put back")
                replace(version.text, "Version put back")
              }}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "folder" && folder && !focus && (
            <FolderPanel
              name={folder.name}
              files={folder.files}
              openPaths={openPaths}
              onOpen={(file) => void openFromFolder(file)}
              onChange={() => void openFolder()}
              onClose={() => setPanel(null)}
            />
          )}
        </div>
        {!focus && (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-xs text-muted-foreground"
            data-testid="markdown-stats"
          >
            <span>{statsSaid(stats)}</span>
            <span>{stats.characters.toLocaleString("en-GB")} characters</span>
            {rendered.blockedImages > 0 && (
              <span>
                {rendered.blockedImages}{" "}
                {rendered.blockedImages === 1 ? "picture" : "pictures"} from
                other sites not shown
              </span>
            )}
            {documents.draftProblem && (
              <span className="text-destructive">{documents.draftProblem}</span>
            )}
            <button
              type="button"
              onClick={() => togglePanel("check")}
              className="ml-auto hidden min-h-8 items-center gap-1 rounded-md px-1.5 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline-flex"
            >
              <IconChecklist className="size-3.5" aria-hidden="true" />
              Check
            </button>
            <button
              type="button"
              onClick={() => setCheat(true)}
              className="hidden min-h-8 items-center gap-1 rounded-md px-1.5 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline-flex"
            >
              <IconHelp className="size-3.5" aria-hidden="true" />
              Help
            </button>
          </div>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {!active.text && !focus && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <p>
            Drop a Markdown, Word or HTML file here to open it, or paste
            pictures and formatted text into the editor. Nothing is uploaded:
            files are read and written on this device.
          </p>
          {/* With no preview in sight, the sample is offered here. */}
          {view === "write" && (
            <Button
              variant="outline"
              onClick={() => documents.open(SAMPLE, SAMPLE_NAME)}
            >
              <IconSparkles aria-hidden="true" />
              Try a sample
            </Button>
          )}
        </div>
      )}
      <CheatSheet open={cheat} onOpenChange={setCheat} />
      <TableMaker
        open={maker}
        onOpenChange={setMaker}
        onInsert={(table) => {
          const editor = source.current
          if (!editor) return
          const { doc, from, to } = editor.read()
          const edit = insertTable(doc, { from, to })
          // The maker's table in place of the usual three columns.
          editor.apply({
            ...edit,
            insert: edit.insert.replace(/\|[^]*\|/, table),
            anchor: edit.from,
            head: edit.from,
          })
          toast.success("Table put in the document")
        }}
      />
      <TidyDialog
        open={tidy}
        text={active.text}
        onOpenChange={setTidy}
        onApply={(text) => replace(text, "Document tidied")}
      />
      <Presenter
        open={slides}
        text={active.text}
        options={{ ...options, pictures: pictureUrls }}
        onOpenChange={setSlides}
      />
    </div>
  )
}
