/**
 * Opening and saving Markdown files on the device. Where the browser lets
 * a page write a file the person chose (Chrome and Edge), saving writes it
 * in place; elsewhere a file is read from a picker and saved as a download.
 */
import { MARKDOWN_EXTENSIONS } from "@/lib/markdown/document"

/** The parts of the File System Access API used here; not every browser has them. */
interface PickerWindow {
  showOpenFilePicker?: (options: object) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle>
  showDirectoryPicker?: (options: object) => Promise<FileSystemDirectoryHandle>
  launchQueue?: {
    setConsumer: (
      consumer: (params: { files: FileSystemFileHandle[] }) => void
    ) => void
  }
}

const TYPES = [
  {
    description: "Markdown",
    accept: { "text/markdown": [...MARKDOWN_EXTENSIONS] },
  },
]

const pickers = () => window as unknown as PickerWindow

/** Whether files can be written in place in this browser. */
export const canSaveInPlace = () =>
  typeof window !== "undefined" && "showSaveFilePicker" in window

/** A file the person picked, with its handle where it can be saved back. */
export interface Opened {
  file: File
  handle: FileSystemFileHandle | null
}

/** Asks for a file with the browser's own picker; null when it has none or the person closed it. */
export async function pickFile(): Promise<Opened | null | "no-picker"> {
  const show = pickers().showOpenFilePicker
  if (!show) return "no-picker"
  try {
    const [handle] = await show({ types: TYPES, multiple: false })
    return { file: await handle.getFile(), handle }
  } catch (error) {
    if ((error as DOMException).name === "AbortError") return null
    throw error
  }
}

/** Writes text into a file the person chose before. */
export async function writeTo(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Asks where to save, then writes there; null when the person closed the picker. */
export async function saveAs(
  suggestedName: string,
  text: string
): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await pickers().showSaveFilePicker!({
      suggestedName,
      types: TYPES,
    })
    await writeTo(handle, text)
    return handle
  } catch (error) {
    if ((error as DOMException).name === "AbortError") return null
    throw error
  }
}

/** Hands a file over as a download. The link is untyped, so the browser does not try to open it. */
export function download(name: string, content: string | Blob) {
  const blob =
    content instanceof Blob
      ? content
      : new Blob([content], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Prints a page of HTML from a frame of its own, so the browser's print
 * dialog (and its "Save as PDF") shows the document alone.
 */
export function printPage(html: string) {
  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.tabIndex = -1
  Object.assign(frame.style, {
    position: "fixed",
    width: "0",
    height: "0",
    border: "0",
    right: "0",
    bottom: "0",
  })
  frame.srcdoc = html
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    // The dialog holds the page until it closes; the frame goes afterwards.
    setTimeout(() => frame.remove(), 60_000)
  }
  document.body.append(frame)
}

/**
 * Puts the document on the clipboard as rich text for mail and documents,
 * and as Markdown for plain fields. Called during the press itself, with
 * the HTML still being made: Safari only lets a page write the clipboard
 * while handling a press, so the HTML is handed over as a promise.
 */
export function copyRich(html: Promise<string>, markdown: string) {
  return navigator.clipboard.write([
    new ClipboardItem({
      "text/html": html.then((made) => new Blob([made], { type: "text/html" })),
      "text/plain": new Blob([markdown], { type: "text/plain" }),
    }),
  ])
}

/** Puts text on the clipboard that is still being made, in the same way. */
export function copyText(text: Promise<string>) {
  return navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": text.then(
        (made) => new Blob([made], { type: "text/plain" })
      ),
    }),
  ])
}

/** Whether a folder can be opened and its files written in place in this browser. */
export const canOpenFolders = () =>
  typeof window !== "undefined" && "showDirectoryPicker" in window

/** A Markdown file of an open folder: where it is in the folder, and its handle. */
export interface FolderFile {
  path: string
  handle: FileSystemFileHandle
}

/** The most files listed from one folder, and how deep its folders are read. */
const MOST_FILES = 500
const DEEPEST = 4

/** Asks for a folder; null when the person closed the picker. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await pickers().showDirectoryPicker!({ mode: "readwrite" })
  } catch (error) {
    if ((error as DOMException).name === "AbortError") return null
    throw error
  }
}

type Entries = { entries: () => AsyncIterable<[string, FileSystemHandle]> }

/** Every file of a folder and the folders in it (hidden ones and node_modules left out), by its path. */
export async function filesOf(folder: FileSystemDirectoryHandle) {
  const all: FolderFile[] = []
  const walk = async (
    directory: FileSystemDirectoryHandle,
    prefix: string,
    depth: number
  ) => {
    for await (const [name, handle] of (
      directory as unknown as Entries
    ).entries()) {
      if (all.length >= MOST_FILES) return
      if (name.startsWith(".") || name === "node_modules") continue
      if (handle.kind === "file")
        all.push({
          path: prefix + name,
          handle: handle as FileSystemFileHandle,
        })
      else if (depth < DEEPEST)
        await walk(
          handle as FileSystemDirectoryHandle,
          `${prefix}${name}/`,
          depth + 1
        )
    }
  }
  await walk(folder, "", 0)
  return all.sort((a, b) => a.path.localeCompare(b.path))
}

/** Files the installed app was opened with (from the system's "Open with"), handed over as they come. */
export function onLaunchFiles(open: (handles: FileSystemFileHandle[]) => void) {
  const queue = pickers().launchQueue
  if (!queue) return
  queue.setConsumer((params) => {
    if (params.files.length) open(params.files)
  })
}
