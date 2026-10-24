"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  draftSize,
  LARGEST_DRAFT,
  MOST_DOCUMENTS,
  MOST_VERSIONS,
  type Draft,
  type VersionDraft,
} from "@/lib/markdown/draft"
import { picturesUsed } from "@/lib/markdown/pictures"
import { deleteDraft, loadDraft, saveDraft } from "./draft-store"

/** A picture kept with a document: its bytes and the address the page shows it from. */
export interface KeptPicture {
  type: string
  bytes: Uint8Array
  url: string
}

/** One open document. */
export interface Doc {
  id: string
  /** The file's name, or null for a document not saved yet. */
  name: string | null
  text: string
  /** The text as last saved or opened, to tell unsaved changes. */
  saved: string
  /** Where it can be saved back, where the browser allows. */
  handle: FileSystemFileHandle | null
  pictures: Map<string, KeptPicture>
  versions: VersionDraft[]
}

let made = 0
const newId = () => `doc-${Date.now().toString(36)}-${++made}`

function blank(text = "", name: string | null = null): Doc {
  return {
    id: newId(),
    name,
    text,
    saved: text,
    handle: null,
    pictures: new Map(),
    versions: [],
  }
}

const picture = (type: string, bytes: Uint8Array): KeptPicture => ({
  type,
  bytes,
  url: URL.createObjectURL(new Blob([bytes as BlobPart], { type })),
})

/**
 * The editor's documents: tabs, each with its text, name, saved text,
 * pictures and versions, and the draft kept of them while its switch is on.
 */
export function useDocuments() {
  const [docs, setDocs] = useState<Doc[]>(() => [blank()])
  const [activeId, setActiveId] = useState(() => docs[0].id)
  const [keeping, setKeeping] = useState(false)
  const [draftProblem, setDraftProblem] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const live = useRef(docs)
  useEffect(() => {
    live.current = docs
  }, [docs])
  const active = docs.find((doc) => doc.id === activeId) ?? docs[0]

  // A draft kept before is opened again, and keeping goes on.
  useEffect(() => {
    let current = true
    void loadDraft().then((draft) => {
      if (!current || !draft) return
      const restoredDocs = draft.documents.map<Doc>((one) => ({
        id: one.id,
        name: one.name,
        text: one.text,
        saved: one.saved,
        handle: null,
        pictures: new Map(
          one.pictures.map((kept) => [
            kept.name,
            picture(kept.type, new Uint8Array(kept.bytes)),
          ])
        ),
        versions: one.versions,
      }))
      setDocs(restoredDocs)
      setActiveId(draft.active)
      setKeeping(true)
      setRestored(true)
    })
    return () => {
      current = false
    }
  }, [])

  // While keeping, the draft follows the documents a moment after they change.
  useEffect(() => {
    if (!keeping) return
    const timer = setTimeout(() => {
      const draft: Draft = {
        version: 1,
        active: activeId,
        documents: docs.map((doc) => ({
          id: doc.id,
          name: doc.name,
          text: doc.text,
          saved: doc.saved,
          pictures: Array.from(doc.pictures, ([name, kept]) => ({
            name,
            type: kept.type,
            bytes: kept.bytes.slice().buffer as ArrayBuffer,
          })),
          versions: doc.versions,
        })),
      }
      if (draftSize(draft) > LARGEST_DRAFT) {
        setDraftProblem(
          "The draft is larger than 200 MB, so it is no longer kept. Save your documents."
        )
        return
      }
      saveDraft(draft).then(
        () => setDraftProblem(null),
        (error: Error) =>
          setDraftProblem(`The draft could not be kept: ${error.message}`)
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [docs, activeId, keeping])

  const keep = useCallback((on: boolean) => {
    setKeeping(on)
    setDraftProblem(null)
    if (!on) void deleteDraft()
  }, [])

  const change = useCallback((id: string, update: (doc: Doc) => Doc) => {
    setDocs((current) =>
      current.map((doc) => (doc.id === id ? update(doc) : doc))
    )
  }, [])

  const setText = useCallback(
    (text: string) => change(activeId, (doc) => ({ ...doc, text })),
    [activeId, change]
  )

  /** A new tab, made active; the blank first tab is used instead when it has nothing. */
  const add = useCallback((doc: Omit<Doc, "id">): string => {
    const current = live.current
    const empty = current.length === 1 && !current[0].text && !current[0].name
    const made: Doc = { ...doc, id: empty ? current[0].id : newId() }
    setDocs(empty ? [made] : [...current, made].slice(-MOST_DOCUMENTS))
    setActiveId(made.id)
    return made.id
  }, [])

  /** A document in a new tab: a file opened (saved as it is), or something new (not saved yet). */
  const open = useCallback(
    (
      text: string,
      name: string | null,
      {
        handle = null,
        pictures = [],
        saved = true,
      }: {
        handle?: FileSystemFileHandle | null
        pictures?: { name: string; type: string; bytes: Uint8Array }[]
        saved?: boolean
      } = {}
    ) =>
      add({
        ...blank(text, name),
        saved: saved ? text : "",
        handle,
        pictures: new Map(
          pictures.map((one) => [one.name, picture(one.type, one.bytes)])
        ),
      }),
    [add]
  )

  const close = useCallback(
    (id: string) => {
      const current = live.current
      const index = current.findIndex((doc) => doc.id === id)
      const closing = current[index]
      for (const kept of closing.pictures.values())
        URL.revokeObjectURL(kept.url)
      const rest = current.filter((doc) => doc.id !== id)
      const next = rest.length ? rest : [blank()]
      setDocs(next)
      if (id === activeId)
        setActiveId(next[Math.max(0, index - 1)]?.id ?? next[0].id)
    },
    [activeId]
  )

  const markSaved = useCallback(
    (
      id: string,
      text: string,
      handle?: FileSystemFileHandle | null,
      name?: string
    ) =>
      change(id, (doc) => ({
        ...doc,
        saved: text,
        handle: handle === undefined ? doc.handle : handle,
        name: name ?? doc.name,
        versions: [
          ...doc.versions,
          { at: Date.now(), label: "Saved", text },
        ].slice(-MOST_VERSIONS),
      })),
    [change]
  )

  const addPicture = useCallback(
    (name: string, type: string, bytes: Uint8Array) =>
      change(activeId, (doc) => {
        const pictures = new Map(doc.pictures)
        pictures.set(name, picture(type, bytes))
        return { ...doc, pictures }
      }),
    [activeId, change]
  )

  /** Pictures no longer named by the text are let go, so a draft does not keep them. */
  const tidyPictures = useCallback(
    () =>
      change(activeId, (doc) => {
        const used = picturesUsed(doc.text)
        if ([...doc.pictures.keys()].every((name) => used.has(name))) return doc
        const pictures = new Map(doc.pictures)
        for (const [name, kept] of doc.pictures)
          if (!used.has(name)) {
            URL.revokeObjectURL(kept.url)
            pictures.delete(name)
          }
        return { ...doc, pictures }
      }),
    [activeId, change]
  )

  const keepVersion = useCallback(
    (label: string) =>
      change(activeId, (doc) => ({
        ...doc,
        versions: [
          ...doc.versions,
          { at: Date.now(), label, text: doc.text },
        ].slice(-MOST_VERSIONS),
      })),
    [activeId, change]
  )

  const rename = useCallback(
    (name: string) => change(activeId, (doc) => ({ ...doc, name })),
    [activeId, change]
  )

  return {
    docs,
    active,
    activeId,
    select: setActiveId,
    setText,
    open,
    close,
    markSaved,
    addPicture,
    tidyPictures,
    keepVersion,
    rename,
    keeping,
    keep,
    draftProblem,
    restored,
  }
}
