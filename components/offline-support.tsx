"use client"

import { useEffect } from "react"

/**
 * Registers the service worker that keeps a copy of the site for offline use.
 * It lives in the workspace only: opening the tools is the sign someone wants
 * them, so marketing pages never start that download.
 */
export function OfflineSupport() {
  useEffect(() => {
    // The worker is written into the export by the build; `next dev` has none.
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        // Without a worker the site works as before, only not offline.
        .catch(() => undefined)
    }
    // Wait for the page to finish, so the tool in front loads first.
    if (document.readyState === "complete") register()
    else {
      window.addEventListener("load", register, { once: true })
      return () => window.removeEventListener("load", register)
    }
  }, [])
  return null
}
