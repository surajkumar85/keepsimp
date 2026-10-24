"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  IconArrowRight,
  IconArrowUpRight,
  IconBraces,
  IconFileTypeDocx,
  IconFileTypeHtml,
  IconFileTypePdf,
  IconFileUpload,
  IconGif,
  IconLock,
  IconMarkdown,
  IconMovie,
  IconMusic,
  IconPhoto,
  IconQuestionMark,
  IconRefresh,
} from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ToolIcon, categoryTone } from "@/components/tool-icon"
import { cn } from "cn"
import type { Category } from "@/lib/catalogue"
import {
  actionsFor,
  commonKind,
  fileKind,
  kindName,
  type FileKind,
} from "@/lib/file-actions"
import { handOver } from "@/lib/handoff"
import { sizeLabel } from "@/lib/image-tools"

const INPUT_ID = "landing-file"

const kindLook: Record<
  FileKind,
  { icon: typeof IconMovie; category: Exclude<Category, "all"> }
> = {
  video: { icon: IconMovie, category: "video" },
  audio: { icon: IconMusic, category: "audio" },
  image: { icon: IconPhoto, category: "image" },
  animation: { icon: IconGif, category: "image" },
  pdf: { icon: IconFileTypePdf, category: "document" },
  markdown: { icon: IconMarkdown, category: "document" },
  word: { icon: IconFileTypeDocx, category: "document" },
  html: { icon: IconFileTypeHtml, category: "document" },
  data: { icon: IconBraces, category: "developer" },
}

/** The kinds named under the button, each in its colour. */
const takes: { label: string; kind: FileKind }[] = [
  { label: "Video", kind: "video" },
  { label: "Sound", kind: "audio" },
  { label: "Pictures", kind: "image" },
  { label: "PDF", kind: "pdf" },
  { label: "Markdown", kind: "markdown" },
  { label: "Word", kind: "word" },
  { label: "JSON", kind: "data" },
]

/**
 * The home page's way in: drop or choose any file and see what can be done
 * with it. Nothing is read here but the file's name, size and type; the
 * file is handed to the tool page that opens, in this tab's memory.
 */
export function DropAnything() {
  const [files, setFiles] = useState<File[] | null>(null)
  const [over, setOver] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const moved = useRef(false)

  // A file dropped anywhere on the page lands here, never opened by the browser in place of the page.
  useEffect(() => {
    const carriesFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      setOver(true)
    }
    const onLeave = (event: DragEvent) => {
      if (!event.relatedTarget) setOver(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      setOver(false)
      const dropped = Array.from(event.dataTransfer?.files ?? [])
      if (!dropped.length) return
      moved.current = true
      setFiles(dropped)
    }
    window.addEventListener("dragover", onOver)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [])

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    if (files) heading.current?.focus()
    else input.current?.focus()
  }, [files])

  function choose(chosen: File[]) {
    moved.current = true
    setFiles(chosen)
  }
  function again() {
    moved.current = true
    setFiles(null)
  }

  const kind = files ? commonKind(files) : null
  const actions = kind && files ? actionsFor(kind, files.length) : []
  const size = files?.reduce((sum, file) => sum + file.size, 0) ?? 0
  const look = kind ? kindLook[kind] : null
  const KindIcon = look?.icon ?? IconQuestionMark

  return (
    <div
      data-testid="drop-anything"
      data-dragging={over || undefined}
      className={cn(
        "drop-anything relative mx-auto w-full max-w-2xl rounded-2xl border-2 bg-card text-left transition-[border-color,background-color,transform] duration-200 motion-reduce:transition-none",
        files ? "border-solid" : "border-dashed",
        over &&
          "scale-[1.01] border-primary bg-primary/5 motion-reduce:scale-100"
      )}
    >
      <input
        ref={input}
        id={INPUT_ID}
        type="file"
        multiple
        aria-label="Choose a file to see what you can do with it"
        className="peer sr-only"
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? [])
          event.target.value = ""
          if (chosen.length) choose(chosen)
        }}
      />
      <div aria-live="polite" className="sr-only">
        {files &&
          (actions.length
            ? `${actions.length} things you can do with ${files.length === 1 ? files[0].name : `${files.length} files`}.`
            : "There is no tool here for this kind of file yet.")}
      </div>
      {!files ? (
        <div className="flex flex-col items-center px-5 py-9 text-center sm:px-10 sm:py-12">
          <span
            className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <IconFileUpload className="size-7" stroke={1.6} />
          </span>
          <h2 className="font-heading text-2xl font-medium tracking-tight">
            {over ? "Let go to see what you can do" : "Drop in any file"}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            See every job you can do with it, then do it here. Your file stays
            on this device, from this page to the download.
          </p>
          <label
            htmlFor={INPUT_ID}
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-6 cursor-pointer gap-2 px-6 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
            )}
          >
            <IconFileUpload className="size-4" aria-hidden="true" /> Choose a
            file
          </label>
          <ul
            aria-label="Kinds of file the tools take"
            className="mt-6 flex max-w-lg flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
          >
            {takes.map(({ label, kind: one }) => {
              const Icon = kindLook[one].icon
              return (
                <li key={label} className="flex items-center gap-1.5">
                  <Icon
                    className={cn(
                      "size-4",
                      categoryTone[kindLook[one].category].text
                    )}
                    stroke={1.7}
                    aria-hidden="true"
                  />
                  {label}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                look ? categoryTone[look.category].tile : "bg-muted"
              )}
              aria-hidden="true"
            >
              <KindIcon className="size-5" stroke={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-medium"
                data-testid="drop-file-name"
              >
                {files.length === 1 ? files[0].name : `${files.length} files`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {kindLine(files, kind)} · {sizeLabel(size)}
              </p>
            </div>
            <Button variant="ghost" onClick={again} className="shrink-0">
              <IconRefresh aria-hidden="true" />
              <span className="hidden sm:inline">Choose another</span>
              <span className="sr-only sm:hidden">Choose another file</span>
            </Button>
          </div>
          <h2
            ref={heading}
            tabIndex={-1}
            className="mt-5 font-heading text-lg font-medium outline-none"
          >
            {actions.length
              ? "What would you like to do?"
              : "There is no tool for this kind of file yet"}
          </h2>
          {actions.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {actions.map((action) => (
                <li key={action.href}>
                  <Link
                    prefetch={false}
                    href={action.href}
                    onClick={() => handOver(action.href, files)}
                    className={cn(
                      "group flex min-h-14 items-center gap-3 rounded-xl border bg-background px-3 py-2 transition-colors",
                      categoryTone[action.tool.category].card
                    )}
                  >
                    <ToolIcon tool={action.tool} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {action.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {action.tool.name}
                      </span>
                    </span>
                    <IconArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The tools take video, sound, pictures, PDFs, Markdown, Word, HTML
              and JSON.{" "}
              <Link
                prefetch={false}
                href="/dashboard/"
                className="inline-flex items-center gap-1 font-medium text-primary"
              >
                See every tool
                <IconArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </p>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconLock className="size-3.5 shrink-0" aria-hidden="true" />
            {files.length === 1 ? "The file is" : "The files are"} handed to the
            tool in this tab, not uploaded.
          </p>
        </div>
      )}
    </div>
  )
}

const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

/** "Video", "PDFs", or "Mostly pictures" when the files are of several kinds. */
function kindLine(files: File[], kind: FileKind | null) {
  if (!kind) return "A kind no tool here takes"
  if (files.length === 1) return capitalised(kindName[kind])
  const plural = `${kindName[kind]}s`
  return files.every((file) => fileKind(file) === kind)
    ? capitalised(plural)
    : `Mostly ${plural}`
}
