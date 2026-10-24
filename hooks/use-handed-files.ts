"use client"

import { useEffect, useRef } from "react"
import { takeHandedFiles } from "@/lib/handoff"

/**
 * Gives a tool the files chosen for it on the home page, once it has
 * mounted. They are taken after every effect of the first render has run,
 * so the tool's workers and stores are ready for them.
 */
export function useHandedFiles(take: (files: File[]) => void) {
  const latest = useRef(take)
  useEffect(() => {
    latest.current = take
  })
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const files = takeHandedFiles(window.location.pathname)
      if (files.length) latest.current(files)
    })
    return () => window.clearTimeout(timer)
  }, [])
}
