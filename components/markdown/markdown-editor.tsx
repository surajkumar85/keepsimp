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
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconColumns2,
  IconCopy,
  IconDeviceFloppy,
  IconEye,
  IconFileExport,
  IconFilePlus,
  IconFolderOpen,
  IconMarkdown,
  IconPencil,
  IconPrinter,
  IconSparkles,
  IconWorld,
} from "@tabler/icons-react"
import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  type Edit,
} from "@/lib/markdown/edits"
import {
  exportedBody,
  fileName,
  isMarkdownFile,
  LARGEST_FILE,
  MARKDOWN_ACCEPT,
  standaloneHtml,
} from "@/lib/markdown/document"
import {
  defaultRenderOptions,
  renderMarkdown,
  type RenderOptions,
} from "@/lib/markdown/render"
import { SAMPLE, SAMPLE_NAME } from "@/lib/markdown/sample"
import { statsOf, statsSaid } from "@/lib/markdown/stats"
import {
  canSaveInPlace,
  copyRich,
  download,
  pickFile,
  printPage,
  saveAs,
  writeTo,
} from "./files"
import { MarkdownSource, type SourceHandle } from "./markdown-source"
import { MarkdownToolbar, type ToolbarCommand } from "./toolbar"

type View = "write" | "split" | "preview"

const VIEWS: { value: View; label: string; icon: typeof IconPencil }[] = [
  { value: "write", label: "Write", icon: IconPencil },
  { value: "split", label: "Split", icon: IconColumns2 },
  { value: "preview", label: "Preview", icon: IconEye },
]

const WIDE = "(min-width: 1024px)"

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

/** The Markdown editor: the text on one side, what it makes on the other, files opened and saved on the device. */
export function MarkdownEditor() {
  const [text, setText] = useState("")
  const [name, setName] = useState<string | null>(null)
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null)
  const [saved, setSaved] = useState("")
  const [chosenView, setView] = useState<View>("split")
  const [options, setOptions] = useState<RenderOptions>(defaultRenderOptions)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const source = useRef<SourceHandle>(null)
  const preview = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const wide = useWide()
  // Split needs room; on a narrow screen the source and preview take turns.
  const view: View = chosenView === "split" && !wide ? "write" : chosenView

  // The preview follows the text without holding up typing.
  const shown = useDeferredValue(text)
  const rendered = useMemo(
    () => renderMarkdown(shown, options),
    [shown, options]
  )
  const stats = useMemo(() => statsOf(rendered.plain), [rendered.plain])
  const unsaved = text !== saved
  const title = rendered.headings[0]?.text
  const docName = name ?? fileName(null, title, "md")

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!unsaved) return
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", ask)
    return () => window.removeEventListener("beforeunload", ask)
  }, [unsaved])

  const load = useCallback(
    (content: string, file: string | null, at: FileSystemFileHandle | null) => {
      setText(content)
      setSaved(content)
      setName(file)
      setHandle(at)
      setProblem(null)
    },
    []
  )

  const openFile = useCallback(
    async (file: File, at: FileSystemFileHandle | null = null) => {
      if (!isMarkdownFile(file)) {
        setProblem(`${file.name} is not a Markdown or text file.`)
        return
      }
      if (file.size > LARGEST_FILE) {
        setProblem(`${file.name} is larger than 20 MB, too large to edit here.`)
        return
      }
      load(await file.text(), file.name, at)
      toast.success(`Opened ${file.name}`)
    },
    [load]
  )

  const open = useCallback(async () => {
    try {
      const picked = await pickFile()
      if (picked === "no-picker") document.getElementById(inputId)?.click()
      else if (picked) await openFile(picked.file, picked.handle)
    } catch (error) {
      setProblem(`The file could not be opened: ${(error as Error).message}`)
    }
  }, [inputId, openFile])

  const save = useCallback(
    async (askWhere = false) => {
      const content = source.current?.read().doc ?? text
      setSaving(true)
      try {
        if (handle && !askWhere) {
          await writeTo(handle, content)
          setSaved(content)
          toast.success(`Saved ${handle.name}`)
        } else if (canSaveInPlace()) {
          const chosen = await saveAs(docName, content)
          if (chosen) {
            setHandle(chosen)
            setName(chosen.name)
            setSaved(content)
            toast.success(`Saved ${chosen.name}`)
          }
        } else {
          download(docName, content)
          setSaved(content)
          toast.success("Download started", { description: docName })
        }
      } catch (error) {
        setProblem(`The file could not be saved: ${(error as Error).message}`)
      } finally {
        setSaving(false)
      }
    },
    [docName, handle, text]
  )

  const page = () =>
    standaloneHtml(title ?? docName, exportedBody(rendered.html))

  const exportHtml = () => {
    const file = fileName(name, title, "html")
    download(file, new Blob([page()], { type: "text/html" }))
    toast.success("Download started", { description: file })
  }

  const exportMarkdown = () => {
    download(docName, text)
    toast.success("Download started", { description: docName })
  }

  const print = () => {
    printPage(page())
    toast.info("Opening the print dialog", {
      description: "Choose “Save as PDF” there to make a PDF.",
    })
  }

  const copy = async () => {
    try {
      await copyRich(exportedBody(rendered.html), text)
      toast.success("Copied as rich text", {
        description: "Paste it into an email or a document.",
      })
    } catch {
      setProblem("This browser would not let the page copy rich text.")
    }
  }

  const newDocument = () => {
    if (
      unsaved &&
      !window.confirm("Start a new document? Changes not saved will be lost.")
    )
      return
    load("", null, null)
    source.current?.focus()
  }

  const sample = () => {
    load(SAMPLE, SAMPLE_NAME, null)
    toast.info("Opened a sample document")
  }

  const command = useCallback(
    (which: ToolbarCommand) => {
      if (which === "save") return void save()
      if (which === "open") return void open()
      if (which === "find") return source.current?.find()
      const editor = source.current
      if (!editor) return
      const { doc, from, to } = editor.read()
      const range = { from, to }
      let edit: Edit
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
        case "table":
          edit = insertTable(doc, range)
          break
        case "rule":
          edit = insertRule(doc, range)
          break
        default:
          edit = toggleLines(doc, range, which)
      }
      // A button pressed while only the preview shows brings the source back.
      if (view === "preview") setView("write")
      editor.apply(edit)
    },
    [open, save, view]
  )

  // Links to a heading move the preview there, not the page.
  const followLink = (event: React.MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest("a")
    const href = link?.getAttribute("href")
    if (!href?.startsWith("#")) return
    event.preventDefault()
    const target = preview.current?.querySelector(
      `#${CSS.escape(decodeURIComponent(href.slice(1)))}`
    )
    target?.scrollIntoView({ block: "start" })
  }

  return (
    <div className="space-y-3" data-testid="markdown-editor">
      <input
        id={inputId}
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
      <div
        className={cn(
          "flex h-[calc(100dvh-12rem)] min-h-[30rem] flex-col overflow-hidden rounded-xl border bg-card transition-colors duration-150 motion-reduce:transition-none",
          over && "border-primary bg-primary/5"
        )}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          const file = event.dataTransfer.files[0]
          if (!file) return
          event.preventDefault()
          setOver(false)
          void openFile(file)
        }}
      >
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
                {saving
                  ? "Saving…"
                  : unsaved
                    ? "Changes not saved"
                    : name
                      ? "Saved"
                      : "Nothing written yet"}
              </p>
            </div>
          </div>
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
                  {label}
                </Radio.Root>
              )
            )}
          </RadioGroup>
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={newDocument}
              aria-label="New document"
              title="New document"
            >
              <IconFilePlus aria-hidden="true" />
            </Button>
            <Button variant="outline" onClick={() => void open()}>
              <IconFolderOpen aria-hidden="true" />
              Open
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
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
                {canSaveInPlace() && (
                  <DropdownMenuItem onClick={() => void save(true)}>
                    <IconDeviceFloppy aria-hidden="true" />
                    Save as…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={exportMarkdown}>
                  <IconMarkdown aria-hidden="true" />
                  Markdown file (.md)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportHtml}>
                  <IconWorld aria-hidden="true" />
                  Web page (.html)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={print}>
                  <IconPrinter aria-hidden="true" />
                  Print or save as PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void copy()}>
                  <IconCopy aria-hidden="true" />
                  Copy as rich text
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Preview options"
                    title="Preview options"
                  />
                }
              >
                <IconAdjustmentsHorizontal aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
                    setOptions((current) => ({ ...current, remoteImages }))
                  }
                >
                  Show pictures from other sites
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {view !== "preview" && <MarkdownToolbar onCommand={command} />}
        <div
          className={cn(
            "grid min-h-0 flex-1",
            view === "split" && "grid-cols-2 divide-x"
          )}
        >
          <div className={cn("min-h-0", view === "preview" && "hidden")}>
            <MarkdownSource
              ref={source}
              value={text}
              onChange={setText}
              onCommand={command}
              label="Markdown source"
            />
          </div>
          {view !== "write" && (
            <div
              ref={preview}
              className="min-h-0 overflow-y-auto px-5 py-4 sm:px-8"
              data-testid="markdown-preview"
              role="region"
              aria-label="Preview"
              tabIndex={0}
              onClick={followLink}
            >
              {text.trim() ? (
                <article
                  className="markdown-body mx-auto max-w-3xl"
                  // Made by markdown-it and cleaned by DOMPurify (lib/markdown/clean.ts).
                  dangerouslySetInnerHTML={{ __html: rendered.html }}
                />
              ) : (
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
                    <Button variant="outline" onClick={sample}>
                      <IconSparkles aria-hidden="true" />
                      Try a sample
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-xs text-muted-foreground"
          data-testid="markdown-stats"
        >
          <span>{statsSaid(stats)}</span>
          <span>{stats.characters.toLocaleString("en-GB")} characters</span>
          {rendered.blockedImages > 0 && (
            <span>
              {rendered.blockedImages}{" "}
              {rendered.blockedImages === 1 ? "picture" : "pictures"} from other
              sites not shown
            </span>
          )}
          <span className="ml-auto hidden sm:inline">
            Markdown · GitHub flavour
          </span>
        </div>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {!text && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <p>
            Drop a Markdown file here to open it. Nothing is uploaded: files are
            read and written on this device.
          </p>
          {/* With no preview in sight, the sample is offered here. */}
          {view === "write" && (
            <Button variant="outline" onClick={sample}>
              <IconSparkles aria-hidden="true" />
              Try a sample
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
