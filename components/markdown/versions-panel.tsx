"use client"

import { useState } from "react"
import { IconHistory, IconRestore } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import type { VersionDraft } from "@/lib/markdown/draft"
import { DiffView } from "./diff-view"
import { SidePanel } from "./side-panel"

const when = (at: number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at)

/**
 * The versions kept of a document: one each time it is saved, and any kept
 * by hand. Each can be compared with the text as it is now and put back,
 * which is one step to undo. Kept on the device only with the draft.
 */
export function VersionsPanel({
  versions,
  text,
  keeping,
  onKeep,
  onRestore,
  onClose,
}: {
  versions: VersionDraft[]
  text: string
  /** Whether the draft (and so the versions) is kept on the device. */
  keeping: boolean
  onKeep: () => void
  onRestore: (version: VersionDraft) => void
  onClose: () => void
}) {
  const [comparing, setComparing] = useState<VersionDraft | null>(null)
  const newest = [...versions].reverse()
  return (
    <SidePanel
      title="Versions"
      count={versions.length}
      onClose={onClose}
      testId="markdown-versions"
    >
      <Button variant="outline" className="w-full" onClick={onKeep}>
        <IconHistory aria-hidden="true" />
        Keep a version now
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        A version is kept each time you save, too.{" "}
        {keeping
          ? "They are kept on this device with the draft."
          : "They last until the page is closed; turn on the draft to keep them."}
      </p>
      {newest.length ? (
        <ol className="mt-4 space-y-2" aria-label="Versions, newest first">
          {newest.map((version) => (
            <li key={version.at} className="rounded-lg border p-2.5">
              <p className="text-sm font-medium">{version.label}</p>
              <p className="text-xs text-muted-foreground">
                {when(version.at)} ·{" "}
                {version.text.length.toLocaleString("en-GB")} characters
                {version.text === text ? " · the same as now" : ""}
              </p>
              <div className="mt-2 flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 md:h-8"
                  onClick={() => setComparing(version)}
                >
                  Compare
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 md:h-8"
                  disabled={version.text === text}
                  onClick={() => onRestore(version)}
                >
                  <IconRestore aria-hidden="true" />
                  Put back
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No versions yet.</p>
      )}
      <Dialog
        open={comparing !== null}
        onOpenChange={(open) => !open && setComparing(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogTitle>
            Compare with the version from {comparing && when(comparing.at)}
          </DialogTitle>
          <DialogDescription>
            Lines taken out since then are on red, lines written since on teal.
          </DialogDescription>
          {comparing && (
            <DiffView
              before={comparing.text}
              after={text}
              label="Changes since the version"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setComparing(null)}>
              Close
            </Button>
            <Button
              disabled={!comparing || comparing.text === text}
              onClick={() => {
                onRestore(comparing!)
                setComparing(null)
              }}
            >
              <IconRestore aria-hidden="true" />
              Put this version back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidePanel>
  )
}
