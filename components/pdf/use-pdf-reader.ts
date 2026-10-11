"use client"

import { useCallback, useMemo, useRef, useState, type RefObject } from "react"
import type { Reading } from "@/components/pdf-reader/pdf-reader"
import type { ReaderEntry, ReaderSource } from "@/components/pdf-reader/types"
import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { FileEvent, FileLayout, PdfClient } from "@/lib/pdf-merger/client"

/** Ids of files opened only to be read begin with this, so a tool never takes them for its own. */
const READ_ID = "read-"

const CANNOT_SHOW = "This file could not be shown. Try adding it again."

/** A page to read that comes from an open file, or a blank one. */
export type PageToRead =
  | {
      key: string
      file: string
      page: number
      rotation: Rotation
      label: string
    }
  | { key: string; blank: Size }

/**
 * Everything a tool needs to show the PDF reader: what is being read, where
 * the reader gets its pages, and ways to open a file, a list of pages or a
 * finished result. Files are read in the worker the tool already uses.
 */
export function usePdfReader(client: RefObject<PdfClient | null>) {
  const [reading, setReading] = useState<Reading | null>(null)
  /** Page sizes and bookmarks of files that have been read, by file. */
  const layouts = useRef(new Map<string, FileLayout>())
  /** The control that opened the reader, which takes focus again when it closes. */
  const opener = useRef<HTMLElement | null>(null)
  /** Counts openings, so a slow one cannot overtake a later one. */
  const runs = useRef(0)
  const made = useRef(0)
  /** A result being opened to be read, and who waits for it. */
  const opening = useRef<{
    id: string
    done: (opened: boolean) => void
  } | null>(null)
  /** A result that is open in the worker only while it is read. */
  const borrowed = useRef<string | null>(null)

  const source = useMemo<ReaderSource>(
    () => ({
      draw: (file, page, edge, urgent) =>
        client.current?.draw(file, page, edge, urgent) ?? {
          request: 0,
          promise: Promise.resolve(null),
        },
      text: (file, page) =>
        client.current?.text(file, page) ?? {
          request: 0,
          promise: Promise.resolve(null),
        },
      search: (needle, pages, onNews) =>
        client.current?.search(needle, pages, onNews) ?? { stop() {} },
      forget: (requests) => client.current?.forget(requests),
    }),
    [client]
  )

  const layoutOf = useCallback(
    async (id: string) => {
      const known = layouts.current.get(id)
      if (known) return known
      const found = (await client.current?.layout(id)) ?? null
      if (found) layouts.current.set(id, found)
      return found
    },
    [client]
  )

  /**
   * Hand every file event to this first. It gives true for a file that was
   * opened only to be read, which is none of the tool's business.
   */
  const claims = useCallback((event: FileEvent) => {
    const waiting = opening.current
    if (waiting && event.id === waiting.id) {
      opening.current = null
      waiting.done(event.type === "opened")
      return true
    }
    return event.id.startsWith(READ_ID)
  }, [])

  /** Read one open file from its first page to its last. */
  const readFile = useCallback(
    async (
      file: {
        id: string
        name: string
        subtitle: string
        rotation?: Rotation
        /** A picture has one page and no bookmarks. */
        picture?: boolean
      },
      from: HTMLElement | null,
      start = 0
    ) => {
      opener.current = from
      const run = ++runs.current
      setReading({ state: "opening", title: file.name })
      const layout = await layoutOf(file.id)
      if (run !== runs.current) return
      if (!layout) {
        setReading({ state: "failed", title: file.name, message: CANNOT_SHOW })
        return
      }
      setReading({
        state: "ready",
        title: file.name,
        subtitle: file.subtitle,
        start,
        entries: layout.sizes.map((size, page) => ({
          kind: "page",
          key: `${file.id}/${page}`,
          file: file.id,
          page,
          rotation: file.rotation ?? 0,
          size,
          label: file.picture ? file.name : `${file.name}, page ${page + 1}`,
        })),
        bookmarks: file.picture
          ? null
          : { file: file.id, items: layout.bookmarks },
      })
    },
    [layoutOf]
  )

  /** Read pages of open files in a given order, starting at one of them. */
  const readPages = useCallback(
    async (
      title: string,
      pages: readonly PageToRead[],
      startKey: string,
      from: HTMLElement | null
    ) => {
      opener.current = from
      const run = ++runs.current
      setReading({ state: "opening", title })
      const ids = [
        ...new Set(
          pages.flatMap((page) => ("file" in page ? [page.file] : []))
        ),
      ]
      const found = await Promise.all(ids.map(layoutOf))
      if (run !== runs.current) return
      const byFile = new Map(ids.map((id, at) => [id, found[at]]))
      const entries: ReaderEntry[] = []
      for (const page of pages) {
        if ("blank" in page) {
          entries.push({
            kind: "blank",
            key: page.key,
            size: page.blank,
            label: "Blank page",
          })
          continue
        }
        const size = byFile.get(page.file)?.sizes[page.page]
        if (!size) {
          setReading({ state: "failed", title, message: CANNOT_SHOW })
          return
        }
        entries.push({ kind: "page", ...page, size })
      }
      setReading({
        state: "ready",
        title,
        start: Math.max(
          0,
          pages.findIndex((page) => page.key === startKey)
        ),
        entries,
        bookmarks: null,
      })
    },
    [layoutOf]
  )

  /** Read a finished file that is not one of the open files, such as a result before it is saved. */
  const readResult = useCallback(
    async (
      blob: Blob,
      about: {
        title: string
        subtitle: string
        password?: string
        /** What each page is called, by its number from 1. */
        label: (page: number) => string
        /** What to say when it cannot be shown. */
        failure: string
      },
      from: HTMLElement | null
    ) => {
      const instance = client.current
      if (!instance) return
      opener.current = from
      const run = ++runs.current
      setReading({ state: "opening", title: about.title })
      const id = `${READ_ID}${++made.current}`
      let layout: FileLayout | null = null
      const opened = await new Promise<boolean>((done) => {
        opening.current = { id, done }
        instance.open(id, blob, { password: about.password })
      })
      if (opened) layout = await instance.layout(id)
      if (!layout || run !== runs.current) {
        instance.close(id)
        if (run === runs.current)
          setReading({
            state: "failed",
            title: about.title,
            message: about.failure,
          })
        return
      }
      borrowed.current = id
      setReading({
        state: "ready",
        title: about.title,
        subtitle: about.subtitle,
        start: 0,
        entries: layout.sizes.map((size, page) => ({
          kind: "page",
          key: `${id}/${page}`,
          file: id,
          page,
          rotation: 0,
          size,
          label: about.label(page + 1),
        })),
        bookmarks: { file: id, items: layout.bookmarks },
      })
    },
    [client]
  )

  const close = useCallback(() => {
    runs.current++
    setReading(null)
    if (borrowed.current) client.current?.close(borrowed.current)
    borrowed.current = null
  }, [client])

  /** Forget what is known about a file that was removed or opened afresh; with no file, about all. */
  const forget = useCallback((file?: string) => {
    if (file === undefined) layouts.current.clear()
    else layouts.current.delete(file)
  }, [])

  return {
    reading,
    source,
    opener,
    claims,
    readFile,
    readPages,
    readResult,
    close,
    forget,
  }
}
