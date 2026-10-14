"use client"

import { useId, useRef } from "react"
import {
  IconAlertCircle,
  IconCircleCheck,
  IconFileUpload,
  IconHelpCircle,
  IconX,
} from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import { Button } from "@/components/ui/button"
import {
  changesSaid,
  signerSaid,
  verdictSaid,
  type FoundSignature,
} from "@/lib/pdf-editor/signature-report"
import { cn } from "cn"
import type { Signatures } from "./use-signatures"
import type { Trusted } from "./use-trusted"

/** When a signature says it was made, as it is said. */
const whenSaid = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

function One({
  found,
  onGo,
}: {
  found: FoundSignature
  onGo: (page: number) => void
}) {
  const verdict = verdictSaid(found)
  const unchecked = !found.verdict.checked
  const who =
    found.verdict.checked && found.verdict.signer
      ? found.verdict.signer.name
      : found.name || found.field
  return (
    <li
      className="space-y-2 rounded-md border p-3 text-sm"
      data-testid="signature"
      data-good={verdict.good}
    >
      <p className="font-medium">{who}</p>
      <p
        className={cn(
          "flex items-start gap-2",
          !verdict.good && !unchecked && "text-destructive"
        )}
        data-testid="signature-verdict"
      >
        {verdict.good ? (
          <IconCircleCheck
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        ) : unchecked ? (
          <IconHelpCircle
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <IconAlertCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
        )}
        {verdict.text}
      </p>
      {signerSaid(found).map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
      {found.time && (
        <p className="text-muted-foreground">
          Signed {whenSaid(found.time)}, by the clock of the device it was
          signed on.
        </p>
      )}
      {(found.reason || found.location) && (
        <p className="text-muted-foreground">
          {[
            found.reason && `Reason: ${found.reason}`,
            found.location && `Place: ${found.location}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p data-testid="signature-changes">
        {found.whole
          ? "It covers the whole file."
          : found.changes
            ? changesSaid(found.changes)
            : "The file was added to after this signature; what changed could not be worked out."}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {found.field} · {found.kind || "no kind given"}
        </span>
        {found.page !== null && found.shown && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onGo(found.page!)}
          >
            Show on page {found.page + 1}
          </Button>
        )}
      </div>
    </li>
  )
}

/** A day, as it is said. */
const daySaid = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

/** A fingerprint as it is shown: its first eight bytes, in pairs. */
const fingerprintSaid = (fingerprint: string) =>
  fingerprint
    .slice(0, 16)
    .toUpperCase()
    .replace(/(..)(?!$)/g, "$1:")

/** The certificates the person trusts: added from files, removed, and remembered on this device when asked. */
function TrustedList({ trusted }: { trusted: Trusted }) {
  const ids = useId()
  const picker = useRef<HTMLInputElement>(null)
  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="space-y-3 border-t pt-3"
      data-testid="trusted-certificates"
    >
      <h3 id={`${ids}-title`} className="text-sm font-medium">
        Certificates you trust
      </h3>
      <p className="text-xs text-muted-foreground">
        Add the certificate of an issuer you trust, such as your company&apos;s
        or one an authority gave you, and each signature says whether it goes
        back to it. Add only a certificate you got from someone you trust, never
        one taken from the file you are checking.
      </p>
      {trusted.list.length ? (
        <ul className="space-y-2" aria-label="Certificates you trust">
          {trusted.list.map((one) => (
            <li
              key={one.fingerprint}
              className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm"
              data-testid="trusted-certificate"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">{one.name}</p>
                <p className="text-xs text-muted-foreground">
                  {one.issuer === one.name
                    ? "Signed by itself"
                    : `Issued by ${one.issuer}`}
                  {" · "}until {daySaid(one.validTo)}
                </p>
                <p className="font-mono text-xs break-all text-muted-foreground">
                  {fingerprintSaid(one.fingerprint)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Stop trusting ${one.name}`}
                title="Stop trusting it"
                onClick={() => trusted.remove(one.fingerprint)}
              >
                <IconX aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          You have added no certificates.
        </p>
      )}
      <input
        ref={picker}
        type="file"
        accept=".cer,.crt,.der,.pem,application/pkix-cert,application/x-x509-ca-cert"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="trusted-file"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          if (chosen) void trusted.add(chosen)
          event.target.value = ""
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={trusted.adding}
        onClick={() => picker.current?.click()}
      >
        <IconFileUpload aria-hidden="true" />
        Add a certificate you trust
      </Button>
      {trusted.problem && (
        <p role="alert" className="text-sm text-destructive">
          {trusted.problem}
        </p>
      )}
      <ToggleRow
        label="Remember them on this device"
        hint="Kept in this browser until you switch this off. Nothing is sent anywhere."
        checked={trusted.remember}
        onCheckedChange={trusted.setRemember}
      />
    </section>
  )
}

/** The panel that lists the signatures the file came with, each checked. */
export function SignaturesPanel({
  signatures,
  onGo,
}: {
  signatures: Signatures
  onGo: (page: number) => void
}) {
  const ids = useId()
  const { found } = signatures
  return (
    <aside
      aria-labelledby={`${ids}-title`}
      data-testid="editor-signatures"
      className="absolute inset-x-0 bottom-0 z-10 flex h-[70%] flex-col border-t bg-popover shadow-lg md:static md:h-auto md:w-80 md:shrink-0 md:border-t-0 md:border-l md:shadow-none"
    >
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <h2
          id={`${ids}-title`}
          className="px-1 font-heading text-sm font-medium"
        >
          Signatures
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close signatures"
          title="Close"
          onClick={() => signatures.setOn(false)}
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {found === undefined ? (
          <p role="status" className="text-sm text-muted-foreground">
            Reading the signatures…
          </p>
        ) : found === null ? (
          <p role="alert" className="text-sm text-destructive">
            The signatures of this file could not be read.
          </p>
        ) : found.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            This file has no digital signatures. A signature drawn or typed on a
            page is part of the page, and is not one.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Signatures">
            {found.map((one) => (
              <One key={`${one.field}-${one.time}`} found={one} onGo={onGo} />
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          This is the file as it was opened, checked on your device. KeepSimp
          has no list of trusted issuers of its own, as a program such as
          Acrobat has: it judges trust only by the certificates you add below.
          Changes you make now are written after the signatures, with “Keep it
          valid”.
        </p>
        <TrustedList trusted={signatures.trusted} />
      </div>
    </aside>
  )
}
