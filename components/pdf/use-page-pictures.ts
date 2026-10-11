"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import type { PdfClient } from "@/lib/pdf-merger/client"

/**
 * Small pictures of pages, drawn by the worker when they are asked for and
 * let go, oldest first, once there are more than `most`.
 */
export function usePagePictures(
  client: RefObject<PdfClient | null>,
  edge = 192,
  most = 300
) {
  const [pictures, setPictures] = useState<Record<string, ImageBitmap>>({})
  /** Pictures asked for, oldest first, by "file/page". */
  const asked = useRef<string[]>([])
  const held = useRef(pictures)
  useEffect(() => {
    held.current = pictures
  }, [pictures])
  useEffect(
    () => () => {
      for (const bitmap of Object.values(held.current)) bitmap.close()
    },
    []
  )

  /** Ask for the picture of a page, unless it is already there or on its way. */
  const need = useCallback(
    (file: string, page: number) => {
      const key = `${file}/${page}`
      if (asked.current.includes(key)) return
      asked.current.push(key)
      const evicted =
        asked.current.length > most ? asked.current.shift() : undefined
      if (evicted)
        setPictures((current) => {
          const { [evicted]: gone, ...rest } = current
          gone?.close()
          return rest
        })
      void client.current?.thumbnail(file, page, edge).then((bitmap) => {
        if (!bitmap) return
        // The file may have been removed, or the picture let go, meanwhile.
        if (!asked.current.includes(key)) {
          bitmap.close()
          return
        }
        setPictures((current) => {
          current[key]?.close()
          return { ...current, [key]: bitmap }
        })
      })
    },
    [client, edge, most]
  )

  /** Let go of a file's pictures; with no file, of all of them. */
  const forget = useCallback((file?: string) => {
    const mine = (key: string) =>
      file === undefined || key.startsWith(`${file}/`)
    asked.current = asked.current.filter((key) => !mine(key))
    setPictures((current) => {
      const rest: Record<string, ImageBitmap> = {}
      for (const [key, bitmap] of Object.entries(current))
        if (mine(key)) bitmap.close()
        else rest[key] = bitmap
      return rest
    })
  }, [])

  return { pictures, need, forget }
}
