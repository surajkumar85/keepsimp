"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/** A font the browser found on the device, as the Local Font Access API gives it. */
interface LocalFont {
  family: string
  fullName: string
  /** The name printers know it by, which tells it from the others in one file. */
  postscriptName: string
  blob(): Promise<Blob>
}

/** Whether this browser can list the fonts on the device at all. Chromium on a computer can, when asked. */
export const canListFonts = () =>
  typeof window !== "undefined" && "queryLocalFonts" in window

/**
 * The fonts on this device, to choose one from. The browser asks before it
 * shows them, and the list never leaves the page.
 */
export function LocalFontsDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /**
   * The font's file, to be added like one that was chosen from a folder,
   * and the names it goes by: a file can hold a whole family, and the one
   * that was chosen is found in it by name.
   */
  onPick: (font: Blob, names: string[]) => void
}) {
  const [fonts, setFonts] = useState<LocalFont[] | null>(null)
  const [problem, setProblem] = useState("")
  const [wanted, setWanted] = useState("")

  useEffect(() => {
    if (!open || fonts) return
    let stale = false
    void (window as unknown as { queryLocalFonts(): Promise<LocalFont[]> })
      .queryLocalFonts()
      .then(
        (found) => !stale && setFonts(found),
        () =>
          !stale &&
          setProblem(
            "The browser did not show its fonts. Allow it when it asks, or choose a font file instead."
          )
      )
    return () => {
      stale = true
    }
  }, [open, fonts])

  const words = wanted.trim().toLowerCase()
  const shown = (fonts ?? [])
    .filter((font) => !words || font.fullName.toLowerCase().includes(words))
    .slice(0, 200)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-md overflow-hidden"
        data-testid="local-fonts"
        // Part of the bar it was opened from: going into it does not end what is being typed.
        data-editor-bar
      >
        <DialogHeader>
          <DialogTitle>Fonts on this device</DialogTitle>
          <DialogDescription>
            The one you choose is read from this device and put into your file
            where you use it. The list stays on this page.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Find a font by its name"
          placeholder="Find a font"
          value={wanted}
          onChange={(event) => setWanted(event.target.value)}
        />
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : !fonts ? (
          <p role="status" className="text-sm text-muted-foreground">
            Asking the browser for its fonts…
          </p>
        ) : (
          <ul
            aria-label="Fonts"
            className="max-h-72 space-y-1 overflow-y-auto pr-1"
          >
            {shown.map((font) => (
              <li key={font.postscriptName}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full justify-start md:h-9"
                  onClick={() => {
                    void font.blob().then(
                      (file) => {
                        onPick(file, [font.postscriptName, font.fullName])
                        onClose()
                      },
                      () => setProblem("That font could not be read.")
                    )
                  }}
                >
                  {font.fullName}
                </Button>
              </li>
            ))}
            {!shown.length && (
              <li className="text-sm text-muted-foreground">
                No font with that name.
              </li>
            )}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
